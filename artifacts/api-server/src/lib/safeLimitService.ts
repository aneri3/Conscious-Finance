import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";

const DEMO_USER_ID = 1;

export async function getSafeLimitStatus(userId = DEMO_USER_ID) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const monthlyIncome = parseFloat(user.monthlyIncome);
  const safeLimitPct = parseFloat(user.safeLimitPct);
  const safeLimitAmount = monthlyIncome * (safeLimitPct / 100);

  // Current calendar month bounds
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Sum all DEBIT transactions in current month (P2P included, CREDIT excluded)
  const [result] = await db
    .select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.txnType, "DEBIT"),
        gte(transactionsTable.txnTimestamp, monthStart),
        lt(transactionsTable.txnTimestamp, monthEnd),
      ),
    );

  const spentAmount = parseFloat(result?.total ?? "0");
  const remainingAmount = safeLimitAmount - spentAmount;
  const percentUsed = safeLimitAmount > 0 ? (spentAmount / safeLimitAmount) * 100 : 0;
  const isRedZone = spentAmount > safeLimitAmount;

  return {
    safeLimitAmount,
    spentAmount,
    remainingAmount,
    isRedZone,
    percentUsed,
    monthlyIncome,
    safeLimitPct,
  };
}
