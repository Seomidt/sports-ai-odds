import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fixturesRouter from "./fixtures.js";
import analysisRouter from "./analysis.js";
import alertsRouter from "./alerts.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fixturesRouter);
router.use(analysisRouter);
router.use(alertsRouter);

export default router;
