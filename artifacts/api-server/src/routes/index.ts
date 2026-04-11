import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fixturesRouter from "./fixtures.js";
import analysisRouter from "./analysis.js";
import alertsRouter from "./alerts.js";
import adminRouter from "./admin.js";
import meRouter from "./me.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fixturesRouter);
router.use(analysisRouter);
router.use(alertsRouter);
router.use(adminRouter);
router.use(meRouter);

export default router;
