import { Router, type IRouter } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { parseBankCsv } from "../lib/csvIngestionPipeline";
import { parseBankPdf } from "../lib/pdfIngestionPipeline";
import { categorizeBatch, invalidateRuleCache } from "../lib/categorizationEngine";

const router: IRouter = Router();

const DEMO_USER_ID = 1;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (PDFs can be larger)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/csv" ||
      name.endsWith(".csv");
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/x-pdf" ||
      name.endsWith(".pdf");

    if (isCsv || isPdf) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV or PDF files are accepted"));
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

    const fileName = req.file.originalname.toLowerCase();
    const isPdf =
      req.file.mimetype === "application/pdf" ||
      req.file.mimetype === "application/x-pdf" ||
      fileName.endsWith(".pdf");

    // Parse the file
    let transactions: Awaited<ReturnType<typeof parseBankCsv>>["transactions"];
    let parseErrors: Array<{ rowIndex: number; reason: string }>;
    let totalRowsParsed: number;

    try {
      if (isPdf) {
        const result = await parseBankPdf(req.file.buffer);
        transactions = result.transactions;
        parseErrors = result.errors;
        totalRowsParsed = result.totalRowsParsed;
      } else {
        const result = parseBankCsv(req.file.buffer);
        transactions = result.transactions;
        parseErrors = result.errors;
        totalRowsParsed = result.totalRowsParsed;
      }
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "File parse failed" });
      return;
    }

    if (transactions.length === 0 && totalRowsParsed > 0) {
      res.status(400).json({
        error: "No valid transactions could be parsed from the file",
        details: parseErrors.slice(0, 10),
      });
      return;
    }

    if (transactions.length === 0) {
      res.status(400).json({
        error: isPdf
          ? "No transactions found in the PDF. Make sure it is a digital (not scanned) bank statement."
          : "No transactions found in the CSV file.",
      });
      return;
    }

    // Run the full shared categorization pipeline
    invalidateRuleCache();
    const allCategories = await db.select().from(categoriesTable);
    const categoryMap = new Map<string, number>(allCategories.map((c) => [c.code, c.id]));
    const uncategorizedId = categoryMap.get("UNCATEGORIZED")!;

    const categorized = await categorizeBatch(transactions);

    let totalRowsIngested = 0;
    let duplicatesSkipped = 0;
    const rowErrors: Array<{ rowIndex: number; reason: string }> = [...parseErrors];

    for (let i = 0; i < categorized.length; i++) {
      const { txn: raw, result: categorization } = categorized[i];
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
            clusterId: categorization.clusterId ?? undefined,
            metadata: categorization.metadata,
          })
          .onConflictDoNothing()
          .returning({ id: transactionsTable.id });

        if (result.length > 0) {
          totalRowsIngested++;
        } else {
          duplicatesSkipped++;
        }
      } catch (err) {
        req.log.error({ err, bankTxnRef: raw.bankTxnRef }, "Failed to insert transaction");
        rowErrors.push({ rowIndex: i + 1, reason: "Database insert failed" });
      }
    }

    req.log.info(
      { totalRowsParsed, totalRowsIngested, duplicatesSkipped, errors: rowErrors.length, isPdf },
      "Statement upload complete",
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
