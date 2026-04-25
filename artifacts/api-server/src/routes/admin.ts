import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { db } from "@workspace/db";
import { allowedUsers, fixtures, teams, standings, fixtureSignals, aiBettingTips, oddsMarkets } from "@workspace/db/schema";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { getApiStats } from "../ingestion/apiFootballClient.js";
import { getAiStats } from "../ai/analysisLayer.js";
import {
  forceFullSync,
  syncOddsForFixture,
  getSeedStatus,
  seedHistoricalData,
  bulkGenerateAiTips,
  sweepMissedPostMatchReviews,
} from "../ingestion/poller.js";

const router = Router();

// ── In-memory state for force-full-sync polling ───────────────────────────────
let syncRunning = false;
let syncError: string | null = null;
let syncResult: { fixtures: number; oddsFetched: number; predictionsFetched: number; h2hFetched: number; injuriesFetched: number; tipsQueued: number } | null = null;

// ── Ping (no auth — for routing diagnostics) ──────────────────────────────────

router.get("/admin/ping", (_req, res) => {
  return res.json({ ok: true, time: new Date().toISOString() });
});

router.post("/admin/ping", (_req, res) => {
  return res.json({ ok: true, method: "POST", time: new Date().toISOString() });
});

// ── Bootstrap admin (no auth — upserts ADMIN_EMAIL as admin in DB) ────────────
// Safe to call multiple times; only ever promotes the configured admin email.

router.post("/admin/bootstrap", async (_req, res) => {
  const adminEmail = (process.env["ADMIN_EMAIL"] ?? "seomidt@gmail.com").toLowerCase().trim();
  try {
    const [user] = await db
      .insert(allowedUsers)
      .values({ email: adminEmail, role: "admin" })
      .onConflictDoUpdate({ target: allowedUsers.email, set: { role: "admin" } })
      .returning();
    return res.json({ ok: true, email: user?.email, role: user?.role });
  } catch (err) {
    console.error("[admin] bootstrap error:", err);
    return res.status(500).json({ error: "Bootstrap failed" });
  }
});

// ── API telemetry ──────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, (_req, res) => {
  return res.json(getApiStats());
});

// ── AI stats ──────────────────────────────────────────────────────────────────

router.get("/admin/ai-stats", requireAdmin, (_req, res) => {
  return res.json(getAiStats());
});

// ── Manual outcome review sweep ───────────────────────────────────────────────
// Triggers re-evaluation of all pending tips on finished fixtures (last 30 days).
// Use after bulk outcome resets to restore accurate statistics.
router.post("/admin/review-sweep", requireAdmin, async (_req, res) => {
  try {
    res.json({ ok: true, message: "Review sweep started in background" });
    sweepMissedPostMatchReviews().catch((err) =>
      console.error("[admin] review-sweep error:", err)
    );
  } catch (err) {
    console.error("[admin] review-sweep error:", err);
    return res.status(500).json({ error: "Sweep failed to start" });
  }
});

// ── DB stats ──────────────────────────────────────────────────────────────────

router.get("/admin/db-stats", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      [fixturesRow],
      [teamsRow],
      [standingsRow],
      [signalsRow],
      [tipsRow],
      [oddsRow],
      upcomingRows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(fixtures),
      db.select({ count: sql<number>`count(*)::int` }).from(teams),
      db.select({ count: sql<number>`count(*)::int` }).from(standings),
      db.select({ count: sql<number>`count(*)::int` }).from(fixtureSignals),
      db.select({ count: sql<number>`count(*)::int` }).from(aiBettingTips),
      db.select({ count: sql<number>`count(*)::int` }).from(oddsMarkets),
      db.select({ fixtureId: fixtures.fixtureId })
        .from(fixtures)
        .where(
          and(
            gte(fixtures.kickoff, now),
            lte(fixtures.kickoff, in7Days),
            inArray(fixtures.statusShort, ["NS", "TBD"]),
          ),
        ),
    ]);

    const upcomingIds = upcomingRows.map((r) => r.fixtureId);
    let upcomingWithTips = 0;

    if (upcomingIds.length > 0) {
      const tipsRows = await db
        .selectDistinct({ fixtureId: aiBettingTips.fixtureId })
        .from(aiBettingTips)
        .where(inArray(aiBettingTips.fixtureId, upcomingIds));
      upcomingWithTips = tipsRows.length;
    }

    return res.json({
      fixtures: fixturesRow?.count ?? 0,
      teams: teamsRow?.count ?? 0,
      standings: standingsRow?.count ?? 0,
      fixtureSignals: signalsRow?.count ?? 0,
      aiTips: tipsRow?.count ?? 0,
      oddsMarkets: oddsRow?.count ?? 0,
      upcomingFixtures: upcomingIds.length,
      upcomingWithTips,
      upcomingWithoutTips: upcomingIds.length - upcomingWithTips,
    });
  } catch (err) {
    console.error("[admin] db-stats error:", err);
    return res.status(500).json({ error: "Failed to fetch DB stats" });
  }
});

// ── Seed history ──────────────────────────────────────────────────────────────

router.get("/admin/seed-history/status", requireAdmin, (_req, res) => {
  return res.json(getSeedStatus());
});

router.post("/admin/seed-history", requireAdmin, async (req, res) => {
  const status = getSeedStatus();
  if (status.running) {
    return res.status(409).json({ error: "Seed already running" });
  }
  const seasons = Math.max(1, Math.min(5, parseInt(String(req.query["seasons"] ?? "2"), 10) || 2));
  seedHistoricalData(seasons).catch(console.error);
  return res.json({ ok: true, message: `Historical seed started for ${seasons} season(s)` });
});

// ── Force sync ────────────────────────────────────────────────────────────────

router.get("/admin/sync-status", requireAdmin, (_req, res) => {
  return res.json({ running: syncRunning, error: syncError, result: syncResult });
});

router.post("/admin/force-full-sync", requireAdmin, async (_req, res) => {
  if (syncRunning) {
    return res.status(409).json({ error: "Sync already running" });
  }
  syncRunning = true;
  syncError = null;
  syncResult = null;

  forceFullSync()
    .then((result) => {
      syncResult = result;
    })
    .catch((err) => {
      console.error("[admin] force-full-sync error:", err);
      syncError = err instanceof Error ? err.message : "Unknown error";
    })
    .finally(() => {
      syncRunning = false;
    });

  return res.json({ ok: true, message: "Force sync started" });
});

router.post("/admin/force-sync/:id", requireAdmin, async (req, res) => {
  const fixtureId = parseInt(String(req.params.id ?? ""), 10);
  if (!fixtureId) {
    return res.status(400).json({ error: "Invalid fixture ID" });
  }
  syncOddsForFixture(fixtureId).catch(console.error);
  return res.json({ ok: true, message: `Sync started for fixture ${fixtureId}` });
});

// ── Force AI tip generation ───────────────────────────────────────────────────

router.post("/admin/force-ai-tips", requireAdmin, (_req, res) => {
  bulkGenerateAiTips(200).catch(console.error);
  return res.json({ ok: true, message: "AI tip generation started for up to 200 upcoming fixtures" });
});

// ── AI health check ───────────────────────────────────────────────────────────

router.get("/admin/ai-health", requireAdmin, (_req, res) => {
  const hasKey = !!(process.env["ANTHROPIC_API_KEY"] ?? process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"]);
  return res.json({
    apiKeyConfigured: hasKey,
    keyEnvVar: process.env["ANTHROPIC_API_KEY"] ? "ANTHROPIC_API_KEY" : process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ? "AI_INTEGRATIONS_ANTHROPIC_API_KEY" : "MISSING",
  });
});

// ── User management ───────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (_req, res) => {
  try {
    const users = await db.select().from(allowedUsers).orderBy(allowedUsers.createdAt);
    return res.json({ users });
  } catch (err) {
    console.error("[admin] users error:", err);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/admin/users", requireAdmin, async (req, res) => {
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email) return res.status(400).json({ error: "email required" });
  const normalised = email.toLowerCase().trim();
  const validRole = role === "admin" ? "admin" : "user";
  try {
    const [user] = await db
      .insert(allowedUsers)
      .values({ email: normalised, role: validRole })
      .onConflictDoUpdate({ target: allowedUsers.email, set: { role: validRole } })
      .returning();
    return res.json(user);
  } catch (err) {
    console.error("[admin] add user error:", err);
    return res.status(500).json({ error: "Failed to add user" });
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!id) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(allowedUsers).where(eq(allowedUsers.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] delete user error:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

router.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (!id) return res.status(400).json({ error: "Invalid ID" });
  const { role } = req.body as { role?: string };
  if (role !== "admin" && role !== "user") return res.status(400).json({ error: "role must be admin or user" });
  try {
    const [user] = await db
      .update(allowedUsers)
      .set({ role })
      .where(eq(allowedUsers.id, id))
      .returning();
    return res.json(user);
  } catch (err) {
    console.error("[admin] update user error:", err);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

// ── Supabase users ──────────────────────────────────────────────�