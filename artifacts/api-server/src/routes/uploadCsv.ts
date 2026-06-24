import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseBankCsv } from "../lib/csvIngestionPipeline";
import { categorizeTransaction, invalidateRuleCache } from "../lib/categorizationEngine";

const router: IRouter = Router();

const DEMO_USER_ID = 1;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  },
});

router.post(
  "/upload-csv",
  upload.single("statement"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Use field name 'statement'." });
      return;
    }

    // Parse CSV
    let parseResult: ReturnType<typeof parseBankCsv>;
    try {
      parseResult = parseBankCsv(req.file.buffer);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "CSV parse failed" });
      return;
    }

    const { transactions, errors: parseErrors, totalRowsParsed } = parseResult;

    if (transactions.length === 0 && totalRowsParsed > 0) {
      res.status(400).json({
        error: "No valid transactions could be parsed from the file",
        details: parseErrors.slice(0, 10),
      });
      return;
    }

    // Load category map
    invalidateRuleCache();
    const allCategories = await db.select().from(categoriesTable);
    const categoryMap = new Map<string, number>(allCategories.map((c) => [c.code, c.id]));
    const uncategorizedId = categoryMap.get("UNCATEGORIZED")!;

    let totalRowsIngested = 0;
    let duplicatesSkipped = 0;
    const rowErrors: Array<{ rowIndex: number; reason: string }> = [...parseErrors];

    for (let i = 0; i < transactions.length; i++) {
      const raw = transactions[i];

      const categorization = await categorizeTransaction(raw);
      const categoryId = categoryMap.get(categorization.categoryCode) ?? uncategorizedId;

      try {
        const result = await db
          .insert(transactionsTable)
          .values({
            userId: DEMO_USER_ID,
            bankTxnRef: raw.bankTxnRef,
            amount: String(raw.amount),
            txnType: raw.txnType,
            txnTimestamp: raw.txnTimestamp,
            rawNarration: raw.rawNarration,
            counterpartyVpa: raw.counterpartyVpa ?? undefined,
            mccCode: raw.mccCode ?? undefined,
            categoryId,
            categorizationSource: categorization.source,
            categorizationConfidence:
              categorization.confidence != null ? String(categorization.confidence) : undefined,
            isP2p: categorization.isP2p,
          })
          .onConflictDoNothing()
          .returning({ id: transactionsTable.id });

        if (result.length > 0) {
          totalRowsIngested++;
        } else {
          duplicatesSkipped++;
        }
      } catch (err) {
        req.log.error({ err, bankTxnRef: raw.bankTxnRef }, "Failed to insert CSV transaction");
        rowErrors.push({ rowIndex: i + 1, reason: "Database insert failed" });
      }
    }

    req.log.info(
      { totalRowsParsed, totalRowsIngested, duplicatesSkipped, errors: rowErrors.length },
      "CSV upload complete",
    );

    res.json({
      totalRowsParsed,
      totalRowsIngested,
      duplicatesSkipped,
      errors: rowErrors,
    });
  },
);

export default router;
