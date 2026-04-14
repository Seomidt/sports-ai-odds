import { Router } from "express";

const router = Router();

router.get("/admin/users", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/admin/users/:id", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.post("/admin/users", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.patch("/admin/users/:id", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.delete("/admin/users/:id", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

router.get("/admin/fixtures/:id", async (_req, res) => {
  return res.status(501).json({ error: "Temporarily disabled during migration" });
});

export default router;
