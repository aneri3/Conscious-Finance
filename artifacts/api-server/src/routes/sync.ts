import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { fetchAATransactions } from "../lib/mockAATransactions";
import { categorizeBatch, invalidateRuleCache } from "../lib/categorizationEngine";

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

  // Run the full shared categorization pipeline (rules → P2P → heuristics #1/#2/#4 → LLM → clustering #3)
  const categorized = await categorizeBatch(rawTransactions);

  let inserted = 0;
  let skipped = 0;
  const breakdown = {
    ruleMatched: 0,
    p2pDetected: 0,
    llmClassified: 0,
    pending: 0,
    heuristicOddAmount: 0,
    heuristicVelocityCluster: 0,
  };

  for (const { txn: raw, result: categorization } of categorized) {
    const categoryId = categoryMap.get(categorization.categoryCode) ?? uncategorizedId;

    try {
      const dbResult = await db
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

      if (dbResult.length > 0) {
        inserted++;
        if (categorization.source === "RULE_EXACT" || categorization.source === "RULE_REGEX") {
          breakdown.ruleMatched++;
        } else if (categorization.source === "P2P_UNCATEGORIZED") {
          breakdown.p2pDetected++;
        } else if (categorization.source === "LLM") {
          breakdown.llmClassified++;
        } else if (categorization.source === "HEURISTIC_ODD_AMOUNT") {
          breakdown.heuristicOddAmount++;
        } else if (categorization.source === "HEURISTIC_VELOCITY_CLUSTER") {
          breakdown.heuristicVelocityCluster++;
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
