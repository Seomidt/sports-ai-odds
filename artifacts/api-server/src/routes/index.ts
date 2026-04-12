import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fixturesRouter from "./fixtures.js";
import analysisRouter from "./analysis.js";
import alertsRouter from "./alerts.js";
import adminRouter from "./admin.js";
import meRouter from "./me.js";
import billingRouter from "../billing/billingRoutes.js";
import widgetProxyRouter from "./widgetProxy.js";
import proDataRouter from "./proData.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(alertsRouter);
router.use(fixturesRouter);
router.use(analysisRouter);
router.use(adminRouter);
router.use(meRouter);
router.use(billingRouter);
router.use(widgetProxyRouter);
router.use(proDataRouter);

export default router;
