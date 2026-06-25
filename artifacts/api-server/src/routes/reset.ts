/**
 * POST /api/user/reset — Testing utility for cleanly switching between AA-mock
 * and CSV-upload ingestion modes without old data interfering.
 *
 * ⚠️  SECURITY NOTE: This endpoint deletes ALL of the demo user's transaction
 * data and resets their profile to un-onboarded. This is only safe because
 * the app currently has a single hardcoded demo user with no authentication.
 *
 * WHEN real multi-user auth is added: this endpoint MUST resolve userId from
 * the authenticated session — never accept a client-supplied user ID for a
 * destructive operation like this. Delete this comment once that work is done.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const DEMO_USER_ID = 1;

router.post("/user/reset", async (req, res): Promise<void> => {
  // Full transaction wipe — partial deletes risk orphaned cluster_id groups
  await db.delete(transactionsTable).where(eq(transactionsTable.userId, DEMO_USER_ID));

  // Reset profile to un-onboarded state so onboarding wizard re-appears
  await db
    .update(usersTable)
    .set({
      monthlyIncome: "0",
      safeLimitPct: "40.00",
      dataSourceMode: null,
    })
    .where(eq(usersTable.id, DEMO_USER_ID));

  req.log.info({ userId: DEMO_USER_ID }, "User reset complete — all transactions deleted, profile cleared");

  res.json({ ok: true });
});

export default router;
