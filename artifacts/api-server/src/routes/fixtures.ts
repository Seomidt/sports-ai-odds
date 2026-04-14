import { Router } from "express";

const router = Router();

router.get("/fixtures/today", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/fixtures/top-picks", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/fixtures/:id", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/fixtures/:id/features", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/fixtures/:id/signals", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/standings/leagues", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/standings/:leagueId", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/teams/:id/injuries", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default router;
