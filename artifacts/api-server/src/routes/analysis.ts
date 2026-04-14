import { Router } from "express";

const router = Router();

router.get("/analysis/:fixtureId", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/analysis/:fixtureId/tips", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/analysis/:fixtureId/signals", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default router;
