import { Router } from "express";

const billingRouter = Router();

billingRouter.get("/billing/status", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

billingRouter.get("/billing/plans", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

billingRouter.post("/billing/checkout", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

billingRouter.post("/billing/portal", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default billingRouter;
