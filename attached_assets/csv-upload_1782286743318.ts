import { Router, Request, Response } from "express";
import multer from "multer";
import { parseCSVBuffer, mapRowsToTransactions } from "../services/csv-parser";
import { createCategorizationService } from "../categorization/categorization-service";
import type { CSVUploadResult } from "../types/transaction";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Wire these to the same DB-backed dependencies the AA mock sync path uses
 * (see categorization-service.ts) — getRules from category_rules, callModel
 * to your LLM provider (mocked for now per the base build). Reusing the
 * exact same categorization service instance/config here is the whole
 * point: CSV and AA-mock transactions go through identical categorization
 * logic, they only differ in how they arrive.
 */
const categorizationService = createCategorizationService({
  getRules: async () => {
    // SELECT * FROM category_rules WHERE is_active = true ORDER BY priority
    throw new Error("TODO: wire to real DB query");
  },
  callModel: async (prompt: string) => {
    // TODO: wire to real Claude API call, or reuse the existing mocked
    // classifier stub from the base build for now
    throw new Error("TODO: wire to LLM call or mock stub");
  },
});

/**
 * Upserts a categorized transaction into Postgres. Mirrors the exact same
 * ON CONFLICT clause used by the AA mock sync path — this is what makes
 * re-uploading the same CSV file safe, and what protects any transaction
 * a user has already manually tagged from the quick-tag inbox.
 */
async function upsertTransaction(userId: string, txn: any, category: any): Promise<void> {
  // INSERT INTO transactions
  //   (user_id, bank_txn_ref, amount, txn_type, txn_timestamp, raw_narration,
  //    counterparty_vpa, mcc_code, category_id, categorization_source,
  //    categorization_confidence, is_p2p)
  // VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
  //         (SELECT id FROM categories WHERE code = $9), $10, $11, $12)
  // ON CONFLICT (bank_txn_ref) DO NOTHING
  throw new Error("TODO: wire to real DB query");
}

/**
 * POST /api/upload-csv
 *
 * Accepts a single CSV file (multipart/form-data, field name "statement").
 * Runs every parsed row through the exact same 3-tier categorization
 * pipeline used by the AA mock path, then upserts with the same
 * ON CONFLICT DO NOTHING protection.
 *
 * Response includes a per-row error list rather than failing the whole
 * request on a single bad row — bank CSV exports are messy in practice,
 * and a partial successful import is far more useful to the user than an
 * all-or-nothing failure.
 */
router.post("/api/upload-csv", upload.single("statement"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Expected field name 'statement'." });
  }

  const userId = (req.body.userId as string) ?? "demo-user";
  const accountId = `csv-upload-${userId}`; // CSV uploads have no real linked_account row in this MVP

  let rows;
  try {
    rows = parseCSVBuffer(req.file.buffer.toString("utf-8"));
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to parse CSV",
    });
  }

  const { transactions, result: parseResult } = mapRowsToTransactions(rows, accountId);

  let ingestedCount = 0;
  let duplicateCount = 0;

  for (const txn of transactions) {
    try {
      const category = await categorizationService.categorize(txn);
      await upsertTransaction(userId, txn, category);
      ingestedCount++;
    } catch (err) {
      // A DB-level unique violation here would mean ON CONFLICT didn't
      // catch it for some reason — in practice ON CONFLICT DO NOTHING
      // resolves silently, so this catch is mainly for genuine DB errors,
      // not expected duplicates.
      parseResult.errors.push({
        rowIndex: -1,
        reason: `Failed to ingest transaction ${txn.txnRef}: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  }

  const response: CSVUploadResult = {
    totalRowsParsed: parseResult.totalRowsParsed,
    totalRowsIngested: ingestedCount,
    duplicatesSkipped: transactions.length - ingestedCount,
    errors: parseResult.errors,
  };

  res.status(200).json(response);
});

export default router;
