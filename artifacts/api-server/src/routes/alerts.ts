import { Router } from "express";

const router = Router();

router.get("/alerts", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.post("/alerts/follow", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.post("/alerts/unfollow", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default router;
