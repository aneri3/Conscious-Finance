/**
 * PDF Ingestion Pipeline
 *
 * Extracts text from a bank statement PDF and parses it into RawAATransaction records.
 * Works by:
 *   1. Running pdf-parse to extract raw text from all pages
 *   2. Splitting into lines and finding rows that start with a recognisable date
 *   3. Extracting amounts from the end of each row using common Indian bank layouts
 *
 * Handles common Indian bank PDF layouts:
 *   - HDFC Net Banking PDF export
 *   - ICICI / SBI / Axis PDFs (tabular text)
 *   - Any PDF where each transaction row starts with DD/MM/YYYY or DD-MMM-YYYY
 *
 * Limitations:
 *   - Scanned/image PDFs (no text layer) will yield zero rows; callers receive an error.
 *   - Multi-column layouts where columns interleave may mis-parse amounts.
 */

// Import from the internal lib path to bypass pdf-parse's module-level self-test
// which tries to open ./test/data/05-versions-space.pdf at startup (known bug in v1.1.1).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no types for the internal path; same signature as the default export
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createHash } from "crypto";
import type { RawAATransaction } from "./mockAATransactions";

// ---- Date patterns ----

const DATE_PATTERNS = [
  // DD/MM/YYYY or DD-MM-YYYY
  /^(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/,
  // DD-MMM-YYYY  (e.g. 24-Jun-2026)
  /^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{4})/,
  // DD MMM YYYY  (e.g. 24 Jun 2026) — some HDFC variants
  /^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})/,
];

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseLineDate(line: string): Date | null {
  for (const pattern of DATE_PATTERNS) {
    const m = line.match(pattern);
    if (!m) continue;

    const [, rawD, rawM, rawY] = m;
    const year = parseInt(rawY, 10);
    const day = parseInt(rawD, 10);

    // Numeric month
    const numericMonth = parseInt(rawM, 10);
    if (!isNaN(numericMonth)) {
      const d = new Date(year, numericMonth - 1, day, 0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }

    // Alphabetic month
    const monthIdx = MONTH_MAP[rawM.toLowerCase()];
    if (monthIdx != null) {
      const d = new Date(year, monthIdx, day, 0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// ---- Amount extraction ----

/**
 * Find all numeric tokens at the end of a line (after stripping the date prefix).
 * Typical layout for Indian bank PDFs (right-to-left):
 *   ... <narration> <debit|-> <credit|-> <balance>
 * We collect up to the last 3 numeric tokens and heuristically assign them.
 */
function extractAmounts(tail: string): { debit: number; credit: number } {
  // Match numbers like 1,23,456.78 or 12345.67 or 1234
  const numTokens = [...tail.matchAll(/[\d,]+(?:\.\d{1,2})?/g)]
    .map((m) => parseFloat(m[0].replace(/,/g, "")))
    .filter((n) => isFinite(n) && n > 0);

  if (numTokens.length === 0) return { debit: 0, credit: 0 };

  // If only one amount, try to determine direction from keywords
  if (numTokens.length === 1) {
    const lower = tail.toLowerCase();
    if (/credit|cr\b|deposit/.test(lower)) return { debit: 0, credit: numTokens[0] };
    if (/debit|dr\b|withdrawal/.test(lower)) return { debit: numTokens[0], credit: 0 };
    // Default: assume debit (outflow) for ambiguous single amounts
    return { debit: numTokens[0], credit: 0 };
  }

  // With 2 amounts: [debit/credit, balance] — look for Cr/Dr markers
  // or keyword in tail to determine which is credit vs debit
  const lower = tail.toLowerCase();
  const lastTwo = numTokens.slice(-2);

  // If tail ends with "Cr" token, last non-balance amount is credit
  if (/\bcr\b/.test(lower)) return { debit: 0, credit: lastTwo[0] };
  if (/\bdr\b/.test(lower)) return { debit: lastTwo[0], credit: 0 };

  // With 3+ amounts: likely [debit_col, credit_col, balance]
  if (numTokens.length >= 3) {
    const [debit, credit] = numTokens.slice(-3);
    // One of them will be 0 or absent (represented as "-" and already stripped)
    if (credit > 0 && debit === 0) return { debit: 0, credit };
    if (debit > 0 && credit === 0) return { debit, credit: 0 };
    // Both non-zero (unusual) — treat as debit (outflow)
    return { debit, credit: 0 };
  }

  // Fallback: last 2 tokens → treat first as debit candidate
  return { debit: lastTwo[0], credit: 0 };
}

// ---- Narration extraction ----

/**
 * Extract the narration from a transaction line.
 * Strip the leading date, then strip trailing amount tokens and balance.
 */
function extractNarration(line: string, dateMatch: string): string {
  let tail = line.slice(dateMatch.length).trim();
  // Remove trailing clusters of numbers/commas/dots (amounts and balance)
  // We strip from the right greedily until no more numeric token at the end
  tail = tail.replace(/([\d,]+(?:\.\d{1,2})?\s*(?:Cr|Dr)?\s*)+$/i, "").trim();
  // Collapse internal whitespace
  return tail.replace(/\s{2,}/g, " ").trim();
}

// ---- Hash ----

function generateBankTxnRef(iso: string, narration: string, amount: number, rowIndex: number): string {
  const composite = `${iso}|${narration.trim().toLowerCase()}|${amount.toFixed(2)}|${rowIndex}`;
  return "PDF_" + createHash("sha256").update(composite).digest("hex").slice(0, 32);
}

// ---- Public types ----

export interface PdfParseError {
  rowIndex: number;
  reason: string;
}

export interface PdfIngestionResult {
  transactions: RawAATransaction[];
  errors: PdfParseError[];
  totalRowsParsed: number;
}

// ---- Main parser ----

export async function parseBankPdf(pdfBuffer: Buffer): Promise<PdfIngestionResult> {
  const errors: PdfParseError[] = [];
  const transactions: RawAATransaction[] = [];

  // Extract text
  let rawText: string;
  try {
    const result = await pdfParse(pdfBuffer);
    rawText = result.text;
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!rawText || rawText.trim().length < 10) {
    throw new Error("No readable text found in the PDF. Scanned/image-based PDFs are not supported — please export a digital bank statement.");
  }

  const lines = rawText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  let rowIndex = 0;
  let transactionRowIndex = 0;

  for (const line of lines) {
    rowIndex++;

    // Does this line start with a date?
    const dateParsed = parseLineDate(line);
    if (!dateParsed) continue;

    transactionRowIndex++;

    // Find the matched date string length for narration extraction
    let dateMatchStr = "";
    for (const pat of DATE_PATTERNS) {
      const m = line.match(pat);
      if (m) { dateMatchStr = m[0]; break; }
    }

    const isoTimestamp = dateParsed.toISOString();
    const narration = extractNarration(line, dateMatchStr);

    if (!narration) {
      errors.push({ rowIndex: transactionRowIndex, reason: `Empty narration on line: "${line.slice(0, 60)}"` });
      continue;
    }

    const tail = line.slice(dateMatchStr.length);
    const { debit, credit } = extractAmounts(tail);

    let txnType: "DEBIT" | "CREDIT";
    let amount: number;

    if (credit > 0 && debit === 0) {
      txnType = "CREDIT";
      amount = credit;
    } else if (debit > 0 && credit === 0) {
      txnType = "DEBIT";
      amount = debit;
    } else if (debit > 0 && credit > 0) {
      txnType = "DEBIT";
      amount = debit;
    } else {
      errors.push({ rowIndex: transactionRowIndex, reason: `Could not determine amount from: "${line.slice(0, 80)}"` });
      continue;
    }

    const bankTxnRef = generateBankTxnRef(isoTimestamp, narration, amount, transactionRowIndex);

    transactions.push({
      bankTxnRef,
      amount,
      txnType,
      txnTimestamp: dateParsed,
      rawNarration: narration,
      counterpartyVpa: null,
      mccCode: null,
      mode: "UNKNOWN",
      ingestionSource: "CSV_UPLOAD", // reuse existing enum value — PDF shares the upload flow
    });
  }

  return {
    transactions,
    errors,
    totalRowsParsed: transactionRowIndex,
  };
}
