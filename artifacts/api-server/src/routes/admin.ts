import { Router } from "express";
import { db } from "@workspace/db";
import { allowedUsers, fixtures, teams, standings, fixtureSignals, aiBettingTips, oddsMarkets } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getApiStats } from "../ingestion/apiFootballClient.js";
import { getAiStats, getBettingTips } from "../ai/analysisLayer.js";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { getSeedStatus, seedHistoricalData, syncOddsForFixture, forceFullSync } from "../ingestion/poller.js";
import { clerkClient } from "@clerk/express";

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
router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.query.allowedUsers.findMany({
    orderBy: (u, { asc }) => [asc(u.createdAt)],
  });
  res.json({ users });
});

// POST /api/admin/users — add a user to the allowed list
router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email) {
    res.status(400).json({ error: "Missing email" });
    return;
  }

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
router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(allowedUsers).where(eq(allowedUsers.id, id));
  res.json({ deleted: true });
});

// PATCH /api/admin/users/:id — update role
router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  const { role } = req.body as { role?: string };
  if (!id || !role) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const safeRole = role === "admin" ? "admin" : "user";
  await db.update(allowedUsers).set({ role: safeRole }).where(eq(allowedUsers.id, id));
  const user = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.id, id),
  });
  res.json({ user });
});

// GET /api/admin/clerk-users — list all Clerk registered users
router.get("/admin/clerk-users", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const response = await clerkClient.users.getUserList({ limit: 100, orderBy: "-created_at" });
    const users = response.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses[0]?.emailAddress ?? "",
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: u.imageUrl,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
    }));
    res.json({ users, total: response.totalCount });
  } catch (err) {
    console.error("[admin] clerk-users error:", err);
    res.status(500).json({ error: "Failed to fetch Clerk users" });
  }
});

// GET /api/admin/db-stats — real record counts straight from the DB
router.get("/admin/db-stats", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const [[fix], [tm], [std], [sig], [tips], [odds]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(fixtures),
      db.select({ count: sql<number>`count(*)::int` }).from(teams),
      db.select({ count: sql<number>`count(*)::int` }).from(standings),
      db.select({ count: sql<number>`count(*)::int` }).from(fixtureSignals),
      db.select({ count: sql<number>`count(*)::int` }).from(aiBettingTips),
      db.select({ count: sql<number>`count(*)::int` }).from(oddsMarkets),
    ]);
    res.json({
      fixtures: fix?.count ?? 0,
      teams: tm?.count ?? 0,
      standings: std?.count ?? 0,
      fixtureSignals: sig?.count ?? 0,
      aiTips: tips?.count ?? 0,
      oddsMarkets: odds?.count ?? 0,
    });
  } catch (err) {
    console.error("[admin] db-stats error:", err);
    res.status(500).json({ error: "Failed to fetch DB stats" });
  }
});

// GET /api/admin/seed-history/status — current seed job progress
router.get("/admin/seed-history/status", requireAdmin, (_req, res) => {
  res.json(getSeedStatus());
});

// POST /api/admin/seed-history — kick off (or re-run) the historical seed
router.post("/admin/seed-history", requireAdmin, (req, res): void => {
  const seasons = Math.min(5, Math.max(1, parseInt(String(req.query["seasons"] ?? "2"), 10)));
  const status = getSeedStatus();
  if (status.running) {
    res.status(409).json({ error: "Seed already running", status });
    return;
  }
  seedHistoricalData(seasons).catch(console.error);
  res.json({ started: true, seasons, message: `Historical seed started for last ${seasons} season(s)` });
});

// POST /api/admin/force-full-sync — re-sync everything for all upcoming fixtures, ignore all caches
let fullSyncRunning = false;
router.post("/admin/force-full-sync", requireAdmin, async (_req, res): Promise<void> => {
  if (fullSyncRunning) {
    res.status(409).json({ error: "A full sync is already running. Check server logs for progress." });
    return;
  }
  fullSyncRunning = true;
  res.json({ started: true, message: "Full sync started — fixtures, odds, predictions, H2H, injuries + AI tips are being refreshed. Check server logs or come back in a few minutes." });
  forceFullSync().catch(console.error).finally(() => { fullSyncRunning = false; });
});

// POST /api/admin/force-sync/:fixtureId — force-refresh odds + regenerate AI tips for one fixture
router.post("/admin/force-sync/:fixtureId", requireAdmin, async (req, res): Promise<void> => {
  const fixtureId = parseInt(req.params["fixtureId"] ?? "0", 10);
  if (!fixtureId) {
    res.status(400).json({ error: "Invalid fixtureId" });
    return;
  }

  // Verify fixture exists
  const fix = await db.query.fixtures.findFirst({ where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId) });
  if (!fix) {
    res.status(404).json({ error: "Fixture not found" });
    return;
  }

  // Step 1: Force-sync odds from API-Football
  const oddsWritten = await syncOddsForFixture(fixtureId).catch((e) => { console.error("[admin] odds sync error:", e); return false; });

  // Step 2: Delete existing tips so AI can regenerate fresh
  await db.delete(aiBettingTips).where(eq(aiBettingTips.fixtureId, fixtureId));

  // Step 3: Generate new AI tips (non-blocking, returns immediately)
  const tipsPromise = getBettingTips(fixtureId).catch((e) => { console.error("[admin] tip gen error:", e); return null; });

  res.json({
    fixtureId,
    oddsRefreshed: oddsWritten,
    tipsRegenStarted: true,
    message: `Odds synced (${oddsWritten ? "data found" : "no odds from API"}). AI tips regenerating — refresh the match page in ~30s.`,
  });

  // Await in background so errors are logged
  tipsPromise.catch(console.error);
});

export default router;
