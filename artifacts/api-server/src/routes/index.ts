import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import safeLimitRouter from "./safeLimit";
import transactionsRouter from "./transactions";
import categoriesRouter from "./categories";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(safeLimitRouter);
router.use(transactionsRouter);
router.use(categoriesRouter);

export default router;
