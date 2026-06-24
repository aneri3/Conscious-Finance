import { createHash } from "crypto";
import type { RawCSVRow } from "../types/transaction";

/**
 * CSV bank statements don't carry a native transaction reference (no UTR),
 * unlike AA payloads. We need a deterministic, repeatable bank_txn_ref so
 * that re-uploading the same statement file doesn't create duplicate rows —
 * mirroring the same ON CONFLICT (bank_txn_ref) DO NOTHING protection the
 * AA mock path relies on.
 *
 * IMPORTANT EDGE CASE — read before changing this function:
 * Many Indian bank CSV exports only give a date (no time-of-day). If two
 * genuinely different transactions happen to share the same date, the same
 * narration, and the same amount — which is common for small repeat P2P
 * payments like a daily tea-stall UPI transfer — a hash of just
 * (timestamp + narration + amount) would collide, and the second
 * transaction would be silently dropped by ON CONFLICT DO NOTHING. That's
 * a real loss of data, not just a harmless dedup.
 *
 * To avoid this, we fold the row's position in the source file into the
 * hash. This keeps the hash deterministic for a given file (re-uploading
 * the exact same file produces the exact same refs, so true duplicate
 * uploads are still caught) while no longer collapsing two distinct rows
 * that happen to look identical within one statement.
 *
 * Trade-off to be aware of: if the user re-uploads a statement that has
 * been re-ordered or re-exported with different row positions, this will
 * NOT recognize previously-ingested rows as duplicates (since rowIndex
 * differs), and they'll be re-inserted. For an MVP this is an acceptable
 * trade-off — true accidental data loss (case above) is worse than an
 * occasional harmless duplicate, which the user can spot and ignore in the
 * transaction list. If this becomes a real problem later, the fix is to
 * dedup CSV uploads at the file level (hash the whole file) rather than
 * trying to make per-row hashing collision-proof.
 */
export function generateCSVTxnRef(row: {
  timestamp: string;
  narration: string;
  amount: number;
  rowIndex: number;
}): string {
  const normalizedNarration = row.narration.trim().toLowerCase();
  const composite = `${row.timestamp}|${normalizedNarration}|${row.amount.toFixed(2)}|${row.rowIndex}`;
  return createHash("sha256").update(composite).digest("hex");
}
