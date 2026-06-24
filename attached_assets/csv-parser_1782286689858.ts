import type { RawCSVRow, RawAATransaction, CSVUploadResult } from "../types/transaction";
import { generateCSVTxnRef } from "../utils/csv-hash";

/**
 * Indian bank CSV exports don't follow one standard header naming
 * convention. This is a deliberately small, explicit lookup rather than a
 * "smart" fuzzy matcher — for an MVP, being explicit about which headers
 * we recognize and failing loudly on the rest is safer than silently
 * guessing wrong on a money app.
 *
 * Extend this list as you encounter real exports from banks you want to
 * support (HDFC, ICICI, SBI, Axis, Kotak all differ slightly).
 */
const DATE_HEADERS = ["date", "transaction date", "txn date", "value date"];
const NARRATION_HEADERS = ["narration", "description", "particulars", "transaction details", "remarks"];
const DEBIT_HEADERS = ["debit", "debit amount", "withdrawal amount", "withdrawal amt"];
const CREDIT_HEADERS = ["credit", "credit amount", "deposit amount", "deposit amt"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parses a raw CSV buffer into RawCSVRow[]. Deliberately minimal — no
 * external CSV library dependency for the MVP, since bank statement CSVs
 * are simple comma-delimited text without embedded commas in practice for
 * the columns we care about. If you hit a bank export with quoted fields
 * containing commas, swap this for a proper CSV parser (e.g. `csv-parse`)
 * rather than hand-rolling quote handling.
 */
export function parseCSVBuffer(buffer: string): RawCSVRow[] {
  const lines = buffer.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",");
  const dateIdx = findColumnIndex(headers, DATE_HEADERS);
  const narrationIdx = findColumnIndex(headers, NARRATION_HEADERS);
  const debitIdx = findColumnIndex(headers, DEBIT_HEADERS);
  const creditIdx = findColumnIndex(headers, CREDIT_HEADERS);

  if (dateIdx === -1 || narrationIdx === -1) {
    throw new Error(
      "Could not find recognizable Date/Narration columns in this CSV. " +
        "Supported headers: " +
        [...DATE_HEADERS, ...NARRATION_HEADERS].join(", ")
    );
  }

  const rows: RawCSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    rows.push({
      date: cols[dateIdx]?.trim() ?? "",
      narration: cols[narrationIdx]?.trim() ?? "",
      debitAmount: debitIdx !== -1 ? cols[debitIdx]?.trim() : undefined,
      creditAmount: creditIdx !== -1 ? cols[creditIdx]?.trim() : undefined,
      rowIndex: i, // 1-based, since row 0 is the header — used as hash tiebreaker
    });
  }
  return rows;
}

const MONTH_ABBREVIATIONS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Converts a date string in common Indian bank formats into ISO 8601.
 * Defaults to midnight since CSV statements rarely include time-of-day —
 * this is precisely why the hash tiebreaker in csv-hash.ts matters,
 * multiple same-day transactions are common.
 *
 * Handles two distinct formats banks actually export, not just one:
 *   - Purely numeric: DD/MM/YYYY or DD-MM-YYYY (e.g. "24/06/2026")
 *   - Alphabetical month abbreviation: DD-MMM-YYYY (e.g. "24-Jun-2026")
 *     — this is the format several major banks (HDFC, ICICI among them)
 *     commonly use, and a numeric-only regex would silently reject every
 *     row in an otherwise perfectly valid statement from those banks.
 */
function parseIndianDate(raw: string): string {
  const numericMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (numericMatch) {
    const [, day, month, yearRaw] = numericMatch;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
  }

  const abbrevMatch = raw.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2,4})$/);
  if (abbrevMatch) {
    const [, day, monthAbbrevRaw, yearRaw] = abbrevMatch;
    const monthAbbrev = monthAbbrevRaw.toLowerCase();
    const month = MONTH_ABBREVIATIONS[monthAbbrev];
    if (!month) {
      throw new Error(`Unrecognized month abbreviation: "${monthAbbrevRaw}" in date "${raw}"`);
    }
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month}-${day.padStart(2, "0")}T00:00:00.000Z`;
  }

  throw new Error(`Unrecognized date format: "${raw}"`);
}

/**
 * Many Indian bank CSV exports use separate Debit/Credit columns, and
 * whichever column doesn't apply to a given row is often not left truly
 * empty — it commonly contains a placeholder like a bare hyphen "-", a
 * string of spaces, or occasionally "0.00". A plain `parseFloat` on those
 * either returns NaN (for "-") or a deceptively valid-looking 0 (for
 * "0.00", which is actually fine) — but letting NaN leak into amount math
 * anywhere downstream is exactly the kind of silent corruption a money app
 * can't afford. This helper normalizes every non-numeric or empty
 * placeholder to a clean 0 up front, so nothing downstream ever has to
 * defend against NaN.
 */
function safeParseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace(/,/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return 0;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Maps parsed CSV rows into the canonical RawAATransaction shape used by
 * the categorization engine. Rows that fail to parse (bad date, no amount
 * in either debit or credit column) are skipped and reported in `errors`
 * rather than throwing — one malformed row should never abort the whole
 * upload.
 *
 * Note: CSV rows have no UPI VPA or MCC data, so counterpartyVpa/mccCode
 * are left undefined. This means the P2P detector's VPA-pattern signal
 * won't fire for CSV-sourced rows — it will lean more on the narration
 * pattern signal instead. This is an expected, acceptable accuracy
 * trade-off of the CSV path versus the AA path, not a bug to fix here.
 */
export function mapRowsToTransactions(
  rows: RawCSVRow[],
  accountId: string
): { transactions: RawAATransaction[]; result: Omit<CSVUploadResult, "totalRowsIngested" | "duplicatesSkipped"> } {
  const transactions: RawAATransaction[] = [];
  const errors: CSVUploadResult["errors"] = [];

  for (const row of rows) {
    try {
      const timestamp = parseIndianDate(row.date);
      const debit = safeParseAmount(row.debitAmount);
      const credit = safeParseAmount(row.creditAmount);

      if ((!debit || debit <= 0) && (!credit || credit <= 0)) {
        errors.push({ rowIndex: row.rowIndex, reason: "No valid debit or credit amount found" });
        continue;
      }

      const amount = debit > 0 ? debit : credit;
      const type: "DEBIT" | "CREDIT" = debit > 0 ? "DEBIT" : "CREDIT";

      const txnRef = generateCSVTxnRef({
        timestamp,
        narration: row.narration,
        amount,
        rowIndex: row.rowIndex,
      });

      transactions.push({
        accountId,
        txnRef,
        amount,
        type,
        timestamp,
        narration: row.narration,
        mode: "UNKNOWN", // CSV statements don't reliably indicate UPI vs NEFT vs card
        ingestionSource: "CSV_UPLOAD",
      });
    } catch (err) {
      errors.push({
        rowIndex: row.rowIndex,
        reason: err instanceof Error ? err.message : "Unknown parsing error",
      });
    }
  }

  return {
    transactions,
    result: { totalRowsParsed: rows.length, errors },
  };
}
