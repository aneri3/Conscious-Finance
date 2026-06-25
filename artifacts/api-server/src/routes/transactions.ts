import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { transactionsTable, categoriesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListTransactionsQueryParams,
  TagTransactionCategoryBody,
  TagTransactionCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/transactions", async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { uncategorizedOnly } = parsed.data;

  const conditions = [];
  if (uncategorizedOnly) {
    const [uncatRow] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.code, "UNCATEGORIZED"));
    if (uncatRow) {
      conditions.push(eq(transactionsTable.categoryId, uncatRow.id));
    }
  }

  const rows = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      bankTxnRef: transactionsTable.bankTxnRef,
      amount: transactionsTable.amount,
      txnType: transactionsTable.txnType,
      txnTimestamp: transactionsTable.txnTimestamp,
      rawNarration: transactionsTable.rawNarration,
      counterpartyVpa: transactionsTable.counterpartyVpa,
      mccCode: transactionsTable.mccCode,
      categoryId: transactionsTable.categoryId,
      categorizationSource: transactionsTable.categorizationSource,
      categorizationConfidence: transactionsTable.categorizationConfidence,
      isP2p: transactionsTable.isP2p,
      clusterId: transactionsTable.clusterId,
      metadata: transactionsTable.metadata,
      categoryCode: categoriesTable.code,
      categoryDisplayName: categoriesTable.displayName,
    })
    .from(transactionsTable)
    .innerJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactionsTable.txnTimestamp));

  res.json(
    rows.map((r) => ({
      ...r,
      amount: parseFloat(r.amount),
      categorizationConfidence: r.categorizationConfidence
        ? parseFloat(r.categorizationConfidence)
        : null,
      txnTimestamp: r.txnTimestamp.toISOString(),
      metadata: r.metadata ?? {},
    })),
  );
});

router.patch("/transactions/:id/category", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsResult = TagTransactionCategoryParams.safeParse({ id: parseInt(rawId, 10) });
  if (!paramsResult.success) {
    res.status(400).json({ error: paramsResult.error.message });
    return;
  }

  const bodyResult = TagTransactionCategoryBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.message });
    return;
  }

  const { categoryCode } = bodyResult.data;

  const [category] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.code, categoryCode));

  if (!category) {
    res.status(400).json({ error: `Unknown category code: ${categoryCode}` });
    return;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set({
      categoryId: category.id,
      categorizationSource: "USER_TAGGED",
      categorizationConfidence: null,
    })
    .where(eq(transactionsTable.id, paramsResult.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json({
    ...updated,
    amount: parseFloat(updated.amount),
    categorizationConfidence: updated.categorizationConfidence
      ? parseFloat(updated.categorizationConfidence)
      : null,
    txnTimestamp: updated.txnTimestamp.toISOString(),
    categoryCode: category.code,
    categoryDisplayName: category.displayName,
    metadata: updated.metadata ?? {},
  });
});

export default router;
