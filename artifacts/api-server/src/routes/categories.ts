import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder));
  res.json(categories);
});

router.get("/category-breakdown", async (_req, res): Promise<void> => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await db
    .select({
      categoryCode: categoriesTable.code,
      displayName: categoriesTable.displayName,
      totalAmount: sql<string>`COALESCE(SUM(${transactionsTable.amount}::numeric), 0)`,
      transactionCount: sql<number>`COUNT(${transactionsTable.id})::int`,
    })
    .from(transactionsTable)
    .innerJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(transactionsTable.txnType, "DEBIT"),
        gte(transactionsTable.txnTimestamp, monthStart),
        lt(transactionsTable.txnTimestamp, monthEnd),
      ),
    )
    .groupBy(categoriesTable.code, categoriesTable.displayName, categoriesTable.sortOrder)
    .orderBy(desc(sql`COALESCE(SUM(${transactionsTable.amount}::numeric), 0)`));

  res.json(
    rows.map((r) => ({
      ...r,
      totalAmount: parseFloat(r.totalAmount),
    })),
  );
});

export default router;
