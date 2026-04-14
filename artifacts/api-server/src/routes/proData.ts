import { Router } from "express";

const router = Router();

router.get("/pro-data/:fixtureId", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/pro-data/:fixtureId/predictions", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/pro-data/:fixtureId/live-odds", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/pro-data/:fixtureId/player-stats", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/pro-data/:fixtureId/h2h", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/pro-data/:fixtureId/odds-markets", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default router;