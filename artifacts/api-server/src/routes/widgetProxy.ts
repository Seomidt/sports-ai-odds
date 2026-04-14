import { Router } from "express";

const router = Router();

router.get("/widget-proxy", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default router;