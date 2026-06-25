import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import safeLimitRouter from "./safeLimit";
import transactionsRouter from "./transactions";
import categoriesRouter from "./categories";
import userRouter from "./user";
import uploadCsvRouter from "./uploadCsv";
import resetRouter from "./reset";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(safeLimitRouter);
router.use(transactionsRouter);
router.use(categoriesRouter);
router.use(userRouter);
router.use(uploadCsvRouter);
router.use(resetRouter);

export default router;
