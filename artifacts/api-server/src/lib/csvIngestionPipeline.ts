/**
 * CSV Ingestion Pipeline
 *
 * Parses a bank statement CSV, maps rows to RawAATransaction shape,
 * generates deterministic bank_txn_ref hashes, and returns transactions
 * ready to be run through the existing categorization engine.
 *
 * Handles common Indian bank export quirks:
 *   - Case-insensitive header name variants
 *   - DD/MM/YYYY and DD-MMM-YYYY date formats
 *   - Hyphen/dash placeholders in debit/credit columns (→ 0, never NaN)
 *   - Row-index folded into hash to prevent same-day duplicate collision
 */

import { createHash } from "crypto";
import { parse } from "csv-parse/sync";
import type { RawAATransaction } from "./mockAATransactions";

// ---- Header detection ----

const DATE_HEADERS = ["date", "transaction date", "txn date", "value date"];
const NARRATION_HEADERS = ["narration", "description", "particulars", "transaction details", "remarks"];
const DEBIT_HEADERS = ["debit", "debit amount", "withdrawal amount", "withdrawal amt"];
const CREDIT_HEADERS = ["credit", "credit amount", "deposit amount", "deposit amt"];

function findHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// ---- Amount parsing ----

/**
 * Parse an amount cell that may contain commas, spaces, hyphens, or be empty.
 * Never returns NaN — defaults to 0 for any non-numeric placeholder.
 */
function parseAmount(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "--" || trimmed === "0.00") return 0;
  // Strip thousands-separator commas and whitespace
  const cleaned = trimmed.replace(/,/g, "").replace(/\s/g, "");
  const value = parseFloat(cleaned);
  return isFinite(value) ? value : 0;
}

// ---- Date parsing ----

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a date string to a Date object (midnight local time → ISO 8601).
 * Handles:
 *   - DD/MM/YYYY
 *   - DD-MM-YYYY
 *   - DD-MMM-YYYY  (e.g. 24-Jun-2026)
 *   - DD/MMM/YYYY
 */
function parseDate(raw: string): Date | null {
  const s = raw.trim();

  // Try numeric: DD/MM/YYYY or DD-MM-YYYY
  const numericMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (numericMatch) {
    const [, d, m, y] = numericMatch;
    const date = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      0, 0, 0, 0,
    );
    return isNaN(date.getTime()) ? null : date;
  }

  // Try alphabetical month: DD-MMM-YYYY or DD/MMM/YYYY
  const alphaMatch = s.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{4})$/);
  if (alphaMatch) {
    const [, d, mon, y] = alphaMatch;
    const monthIndex = MONTH_MAP[mon.toLowerCase()];
    if (monthIndex == null) return null;
    const date = new Date(
      parseInt(y, 10),
      monthIndex,
      parseInt(d, 10),
      0, 0, 0, 0,
    );
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

// ---- Hash generation ----

/**
 * Deterministic bank_txn_ref for CSV rows.
 * Row index (1-based, header excluded) is folded in so same-day duplicate
 * rows produce distinct refs, but re-uploading the same file is idempotent.
 */
function generateBankTxnRef(isoTimestamp: string, narration: string, amount: number, rowIndex: number): string {
  const composite = `${isoTimestamp}|${narration.trim().toLowerCase()}|${amount.toFixed(2)}|${rowIndex}`;
  return "CSV_" + createHash("sha256").update(composite).digest("hex").slice(0, 32);
}

// ---- Public types ----

export interface CsvParseError {
  rowIndex: number;
  reason: string;
}

export interface CsvIngestionResult {
  transactions: RawAATransaction[];
  errors: CsvParseError[];
  totalRowsParsed: number;
}

// ---- Main parser ----

export function parseBankCsv(csvBuffer: Buffer): CsvIngestionResult {
  const errors: CsvParseError[] = [];
  const transactions: RawAATransaction[] = [];

  // Parse CSV to raw records (header row included)
  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(`CSV parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (records.length === 0) {
    return { transactions: [], errors: [], totalRowsParsed: 0 };
  }

  const headers = Object.keys(records[0]);

  const dateHeader = findHeader(headers, DATE_HEADERS);
  const narrationHeader = findHeader(headers, NARRATION_HEADERS);
  const debitHeader = findHeader(headers, DEBIT_HEADERS);
  const creditHeader = findHeader(headers, CREDIT_HEADERS);

  if (!dateHeader) {
    throw new Error(
      `Could not find a Date column. Supported header names: ${DATE_HEADERS.join(", ")}`,
    );
  }
  if (!narrationHeader) {
    throw new Error(
      `Could not find a Narration/Description column. Supported header names: ${NARRATION_HEADERS.join(", ")}`,
    );
  }

  for (let i = 0; i < records.length; i++) {
    const rowIndex = i + 1; // 1-based, header excluded
    const row = records[i];

    // Parse date
    const rawDate = row[dateHeader] ?? "";
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) {
      errors.push({ rowIndex, reason: `Unparseable date: "${rawDate}". Expected DD/MM/YYYY, DD-MM-YYYY, or DD-MMM-YYYY (e.g. 24-Jun-2026)` });
      continue;
    }

    const isoTimestamp = parsedDate.toISOString();

    // Parse narration
    const narration = (row[narrationHeader] ?? "").trim();
    if (!narration) {
      errors.push({ rowIndex, reason: "Empty narration/description" });
      continue;
    }

    // Parse amounts
    const debitAmount = parseAmount(debitHeader ? row[debitHeader] : null);
    const creditAmount = parseAmount(creditHeader ? row[creditHeader] : null);

    // Determine transaction type and canonical amount
    let txnType: "DEBIT" | "CREDIT";
    let amount: number;

    if (creditAmount > 0 && debitAmount === 0) {
      txnType = "CREDIT";
      amount = creditAmount;
    } else if (debitAmount > 0 && creditAmount === 0) {
      txnType = "DEBIT";
      amount = debitAmount;
    } else if (debitAmount > 0 && creditAmount > 0) {
      // Unusual but possible — treat as DEBIT (outflow dominates)
      txnType = "DEBIT";
      amount = debitAmount;
    } else {
      // Both zero — skip (e.g. opening balance rows)
      errors.push({ rowIndex, reason: "Both debit and credit amounts are zero — skipping" });
      continue;
    }

    const bankTxnRef = generateBankTxnRef(isoTimestamp, narration, amount, rowIndex);

    transactions.push({
      bankTxnRef,
      amount,
      txnType,
      txnTimestamp: parsedDate,
      rawNarration: narration,
      counterpartyVpa: null,
      mccCode: null,
      mode: "UNKNOWN",
      ingestionSource: "CSV_UPLOAD",
    });
  }

  return {
    transactions,
    errors,
    totalRowsParsed: records.length,
  };
}
