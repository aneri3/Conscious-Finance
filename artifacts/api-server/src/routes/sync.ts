import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchAATransactions } from "../lib/mockAATransactions";
import { categorizeTransaction, invalidateRuleCache } from "../lib/categorizationEngine";

const router: IRouter = Router();

const DEMO_USER_ID = 1;

router.post("/sync", async (req, res): Promise<void> => {
  req.log.info("Starting transaction sync");
  invalidateRuleCache();

  const rawTransactions = await fetchAATransactions(DEMO_USER_ID);

  // Load category map: code → id
  const allCategories = await db.select().from(categoriesTable);
  const categoryMap = new Map<string, number>(
    allCategories.map((c) => [c.code, c.id]),
  );

  const uncategorizedId = categoryMap.get("UNCATEGORIZED")!;

  let inserted = 0;
  let skipped = 0;
  const breakdown = { ruleMatched: 0, p2pDetected: 0, llmClassified: 0, pending: 0 };

  for (const raw of rawTransactions) {
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
            categorization.confidence != null
              ? String(categorization.confidence)
              : undefined,
          isP2p: categorization.isP2p,
        })
        .onConflictDoNothing()
        .returning({ id: transactionsTable.id });

      if (result.length > 0) {
        inserted++;
        if (categorization.source === "RULE_EXACT" || categorization.source === "RULE_REGEX") {
          breakdown.ruleMatched++;
        } else if (categorization.source === "P2P_UNCATEGORIZED") {
          breakdown.p2pDetected++;
        } else if (categorization.source === "LLM") {
          breakdown.llmClassified++;
        } else {
          breakdown.pending++;
        }
      } else {
        skipped++;
      }
    } catch (err) {
      req.log.error({ err, bankTxnRef: raw.bankTxnRef }, "Failed to insert transaction");
      skipped++;
    }
  }

  req.log.info({ inserted, skipped, breakdown }, "Sync complete");
  res.json({ inserted, skipped, total: rawTransactions.length, breakdown });
});

export default router;
