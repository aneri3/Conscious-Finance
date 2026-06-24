import { Router, Request, Response } from "express";
import type { UserSetupRequest, UserProfile } from "../types/transaction";

const router = Router();

/**
 * In a real implementation, swap these for actual Postgres queries against
 * the `users` table. Kept as thin functions here so the route handlers
 * below read clearly — wire these to your DB client (pg, Drizzle, Prisma,
 * whichever the base build used).
 */
async function getUserProfile(userId: string): Promise<UserProfile> {
  // SELECT id, full_name, monthly_income, safe_limit_pct, data_source_mode
  // FROM users WHERE id = $1
  throw new Error("TODO: wire to real DB query");
}

async function saveUserSetup(userId: string, setup: UserSetupRequest): Promise<void> {
  // UPDATE users
  // SET monthly_income = $1, safe_limit_pct = $2, data_source_mode = $3
  // WHERE id = $4
  throw new Error("TODO: wire to real DB query");
}

/**
 * POST /api/user/setup
 *
 * Called once from the onboarding wizard. Validates the inputs before
 * persisting — a money app should never silently accept a negative income
 * or an out-of-range percentage, since both would corrupt every downstream
 * Safe Limit calculation.
 */
router.post("/api/user/setup", async (req: Request, res: Response) => {
  const { monthlyIncome, safeLimitPct, dataSourceMode } = req.body as UserSetupRequest;

  if (typeof monthlyIncome !== "number" || monthlyIncome <= 0) {
    return res.status(400).json({ error: "monthlyIncome must be a positive number" });
  }
  if (typeof safeLimitPct !== "number" || safeLimitPct <= 0 || safeLimitPct > 100) {
    return res.status(400).json({ error: "safeLimitPct must be between 0 and 100" });
  }
  if (dataSourceMode !== "AA_MOCK" && dataSourceMode !== "CSV_UPLOAD") {
    return res.status(400).json({ error: "dataSourceMode must be AA_MOCK or CSV_UPLOAD" });
  }

  const userId = req.body.userId ?? "demo-user"; // single hardcoded demo user for this MVP

  try {
    await saveUserSetup(userId, { monthlyIncome, safeLimitPct, dataSourceMode });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save user setup" });
  }
});

/**
 * GET /api/user/profile
 *
 * Used by the frontend on app load to decide whether to show the
 * onboarding block or the main dashboard, and which data-source toggle
 * state to render.
 */
router.get("/api/user/profile", async (req: Request, res: Response) => {
  const userId = (req.query.userId as string) ?? "demo-user";

  try {
    const profile = await getUserProfile(userId);
    const isOnboarded = profile.monthlyIncome !== null && profile.dataSourceMode !== null;
    res.status(200).json({ ...profile, isOnboarded });
  } catch (err) {
    res.status(500).json({ error: "Failed to load user profile" });
  }
});

export default router;
