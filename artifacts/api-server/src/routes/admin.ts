import { Router } from "express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getApiStats } from "../ingestion/apiFootballClient.js";
import { getAiStats } from "../ai/analysisLayer.js";
import { requireAdmin } from "../middlewares/requireAuth.js";

const router = Router();

// GET /api/admin/stats — API-Football usage metrics
router.get("/admin/stats", requireAdmin, (_req, res) => {
  const stats = getApiStats();
  res.json(stats);
});

// GET /api/admin/ai-stats — AI token usage and cost
router.get("/admin/ai-stats", requireAdmin, (_req, res) => {
  res.json(getAiStats());
});

// GET /api/admin/users — list all allowed users
router.get("/admin/users", requireAdmin, async (_req, res) => {
  const users = await db.query.allowedUsers.findMany({
    orderBy: (u, { asc }) => [asc(u.createdAt)],
  });
  res.json({ users });
});

// POST /api/admin/users — add a user to the allowed list
router.post("/admin/users", requireAdmin, async (req, res) => {
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email) return res.status(400).json({ error: "Missing email" });

  const safeRole = role === "admin" ? "admin" : "user";

  await db
    .insert(allowedUsers)
    .values({ email: email.toLowerCase().trim(), role: safeRole })
    .onConflictDoNothing();

  const user = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.email, email.toLowerCase().trim()),
  });

  res.json({ user });
});

// DELETE /api/admin/users/:id — remove a user
router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid id" });

  await db.delete(allowedUsers).where(eq(allowedUsers.id, id));
  res.json({ deleted: true });
});

// PATCH /api/admin/users/:id — update role
router.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  const { role } = req.body as { role?: string };
  if (!id || !role) return res.status(400).json({ error: "Invalid params" });

  const safeRole = role === "admin" ? "admin" : "user";
  await db.update(allowedUsers).set({ role: safeRole }).where(eq(allowedUsers.id, id));
  const user = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.id, id),
  });
  res.json({ user });
});

export default router;
