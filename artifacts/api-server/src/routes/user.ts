import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SetupUserBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEMO_USER_ID = 1;

router.get("/user/profile", async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEMO_USER_ID));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isOnboarded = user.monthlyIncome != null && user.dataSourceMode != null;

  res.json({
    id: user.id,
    fullName: user.fullName,
    monthlyIncome: parseFloat(user.monthlyIncome),
    safeLimitPct: parseFloat(user.safeLimitPct),
    dataSourceMode: user.dataSourceMode ?? null,
    isOnboarded,
  });
});

router.post("/user/setup", async (req, res): Promise<void> => {
  const parsed = SetupUserBody.safeParse(req.body);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({ error: firstIssue?.message ?? "Invalid input" });
    return;
  }

  const { monthlyIncome, safeLimitPct, dataSourceMode } = parsed.data;

  if (monthlyIncome <= 0) {
    res.status(400).json({ error: "Monthly income must be greater than zero" });
    return;
  }
  if (safeLimitPct <= 0 || safeLimitPct > 100) {
    res.status(400).json({ error: "Safe limit % must be between 1 and 100" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      monthlyIncome: String(monthlyIncome),
      safeLimitPct: String(safeLimitPct),
      dataSourceMode,
    })
    .where(eq(usersTable.id, DEMO_USER_ID))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  req.log.info({ monthlyIncome, safeLimitPct, dataSourceMode }, "User setup completed");

  res.json({
    id: updated.id,
    fullName: updated.fullName,
    monthlyIncome: parseFloat(updated.monthlyIncome),
    safeLimitPct: parseFloat(updated.safeLimitPct),
    dataSourceMode: updated.dataSourceMode ?? null,
    isOnboarded: true,
  });
});

export default router;
