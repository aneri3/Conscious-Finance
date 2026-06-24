import { Router, type IRouter } from "express";
import { getSafeLimitStatus } from "../lib/safeLimitService";

const router: IRouter = Router();

router.get("/safe-limit", async (req, res): Promise<void> => {
  const status = await getSafeLimitStatus();
  res.json(status);
});

export default router;
