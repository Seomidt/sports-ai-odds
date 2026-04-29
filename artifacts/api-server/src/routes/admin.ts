import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { db } from "@workspace/db";
import { allowedUsers, fixtures, teams, standings, fixtureSignals, aiBettingTips, oddsMarkets, h2hFixtures, h2hFixtureStats, predictions } from "@workspace/db/schema";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { getApiStats, kvSet } from "../ingestion/apiFootballClient.js";
import { getAiStats, getAdminInsight } from "../ai/analysisLayer.js";
import {
  forceFullSync,
  syncOddsForFixture,
  getSeedStatus,
  seedHistoricalData,
  bulkGenerateAiTips,
  sweepMissedPostMatchReviews,
  backfillH2HStats,
  getH2HBackfillStatus,
  backfillMissingConfidence,
  tipGenProgress,
  fullSyncProgress,
} from "../ingestion/poller.js";

const router = Router();

// ── In-memory state for force-full-sync polling ───────────────────────────────
let syncRunning = false;
let syncError: string | null = null;
let syncResult: { fixtures: number; oddsFetched: number; predictionsFetched: number; h2hFetched: number; injuriesFetched: number; tipsQueued: number } | null = null;
const syncProgress = {
  running: false,
  step: "",
  logs: [] as string[],
  startedAt: null as string | null,
  finishedAt: null as string | null,
  error: null as string | null,
  result: null as typeof syncResult,
};

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

// ── Daily algorithm insight ────────────────────────────────────────────────────
// Returns the latest AI-generated insight about algorithm performance.
// Generated once per day automatically; refreshed on next day's server run.

router.get("/admin/insight", requireAdmin, async (_req, res) => {
  try {
    const insight = await getAdminInsight();
    if (!insight) return res.json({ message: "No insight generated yet. Check back after the first full day of results." });
    return res.json(insight);
  } catch (err) {
    console.error("[admin/insight]", err);
    return res.status(500).json({ error: "Failed to fetch insight" });
  }
});

// ── Manual outcome review sweep ───────────────────────────────────────────────
// Triggers re-evaluation of all pending tips on finished fixtures (no date limit).
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

// ── Confidence backfill ───────────────────────────────────────────────────────
// Populates confidence for all tips that have NULL — runs in background.
router.post("/admin/backfill-confidence", requireAdmin, (_req, res) => {
  backfillMissingConfidence().catch((err) =>
    console.error("[admin] confidence-backfill error:", err)
  );
  return res.json({ ok: true, message: "Confidence backfill started in background" });
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
  syncProgress.running = true;
  syncProgress.step = "Starting...";
  syncProgress.logs = [];
  syncProgress.startedAt = new Date().toISOString();
  syncProgress.finishedAt = null;
  syncProgress.error = null;
  syncProgress.result = null;

  forceFullSync((msg) => {
    syncProgress.step = msg;
    syncProgress.logs.push(msg);
  })
    .then((result) => {
      syncResult = result;
      syncProgress.result = result;
    })
    .catch((err) => {
      console.error("[admin] force-full-sync error:", err);
      syncError = err instanceof Error ? err.message : "Unknown error";
      syncProgress.error = syncError;
    })
    .finally(() => {
      syncRunning = false;
      syncProgress.running = false;
      syncProgress.finishedAt = new Date().toISOString();
    });

  return res.json({ ok: true, message: "Force sync started" });
});

router.get("/admin/force-full-sync/status", requireAdmin, (_req, res) => {
  return res.json(syncProgress);
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
  if (tipGenProgress.running) {
    return res.json({ ok: false, message: "Already running", progress: tipGenProgress });
  }
  bulkGenerateAiTips(200)
    .then(() => sweepMissedPostMatchReviews())
    .catch(console.error);
  return res.json({ ok: true, message: "AI tip generation started for up to 200 upcoming fixtures" });
});

router.get("/admin/force-ai-tips/status", requireAdmin, (_req, res) => {
  return res.json(tipGenProgress);
});

// ── H2H stats backfill ────────────────────────────────────────────────────────

router.get("/admin/h2h-backfill/status", requireAdmin, async (_req, res) => {
  const inMemory = getH2HBackfillStatus();
  // Always return DB-based counts so status survives Railway restarts
  const [totalRow] = await db.select({ count: sql<number>`count(distinct fixture_id)` }).from(h2hFixtures);
  const [doneRow]  = await db.select({ count: sql<number>`count(distinct fixture_id)` }).from(h2hFixtureStats);
  const dbTotal = Number(totalRow?.count ?? 0);
  const dbDone  = Number(doneRow?.count ?? 0);
  return res.json({
    running: inMemory.running,
    finished: inMemory.finished,
    // In-memory progress when running, DB counts otherwise
    done:  inMemory.running ? inMemory.done  : dbDone,
    total: inMemory.running ? inMemory.total : dbTotal,
    dbDone,
    dbTotal,
    remaining: dbTotal - dbDone,
  });
});

router.post("/admin/h2h-backfill", requireAdmin, (_req, res) => {
  backfillH2HStats().catch(console.error);
  return res.json({ ok: true, message: "H2H stats backfill started in background" });
});

// ── Reset API counter (fixes inflated counter from rate-limit bug) ────────────

router.post("/admin/reset-api-counter", requireAdmin, async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  await kvSet(`api:today:${today}`, "0");
  return res.json({ ok: true, message: "API counter reset to 0 — restart server to apply" });
});

// ── AI health check ───────────────────────────────────────────────────────────

router.get("/admin/ai-health", requireAdmin, (_req, res) => {
  const hasKey = !!(process.env["ANTHROPIC_API_KEY"] ?? process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"]);
  return res.json({
    apiKeyConfigured: hasKey,
    keyEnvVar: process.env["ANTHROPIC_API_KEY"] ? "ANTHROPIC_API_KEY" : process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ? "AI_INTEGRATIONS_ANTHROPIC_API_KEY" : "MISSING",
  });
});

// ── Algorithm benchmark vs API-Football predictions ───────────────────────────
// Compares our algorithm's hit rate against API-Football's built-in predictions
// on the same resolved fixtures (FT, goals known, both sources present).

router.get("/admin/benchmark", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT
        f.fixture_id,
        DATE_TRUNC('week', f.kickoff) AS week,
        CASE
          WHEN f.home_goals > f.away_goals THEN 'home_win'
          WHEN f.home_goals = f.away_goals THEN 'draw'
          ELSE 'away_win'
        END AS actual_outcome,
        CASE
          WHEN COALESCE(p.home_win_percent,0) >= COALESCE(p.draw_percent,0)
           AND COALESCE(p.home_win_percent,0) >= COALESCE(p.away_win_percent,0)
          THEN 'home_win'
          WHEN COALESCE(p.draw_percent,0) >= COALESCE(p.home_win_percent,0)
           AND COALESCE(p.draw_percent,0) >= COALESCE(p.away_win_percent,0)
          THEN 'draw'
          ELSE 'away_win'
        END AS api_predicted,
        t.bet_type,
        t.outcome,
        t.market_odds
      FROM fixtures f
      INNER JOIN predictions p ON p.fixture_id = f.fixture_id
      INNER JOIN ai_betting_tips t ON t.fixture_id = f.fixture_id
      WHERE f.status_short = 'FT'
        AND f.home_goals IS NOT NULL
        AND f.away_goals IS NOT NULL
        AND t.outcome IN ('win', 'loss')
        AND t.bet_type IN ('home_win', 'draw', 'away_win')
        AND f.kickoff > NOW() - INTERVAL '90 days'
      ORDER BY f.kickoff ASC
    `);

    const allRows = rows as Array<{
      fixture_id: number; week: string; actual_outcome: string;
      api_predicted: string; bet_type: string; outcome: string; market_odds: number | null;
    }>;

    // ── Our algorithm ──────────────────────────────────────────────────────────
    const ourWins = allRows.filter(r => r.outcome === "win").length;
    const ourLosses = allRows.filter(r => r.outcome === "loss").length;
    const ourTotal = ourWins + ourLosses;
    const ourProfit = allRows.reduce((sum, r) => {
      if (r.outcome === "win") return sum + ((r.market_odds ?? 2) - 1);
      if (r.outcome === "loss") return sum - 1;
      return sum;
    }, 0);

    // ── API-Football (one prediction per fixture, deduplicated) ────────────────
    const apiSeen = new Set<number>();
    let apiTotal = 0, apiCorrect = 0;
    for (const r of allRows) {
      if (!apiSeen.has(r.fixture_id)) {
        apiSeen.add(r.fixture_id);
        apiTotal++;
        if (r.api_predicted === r.actual_outcome) apiCorrect++;
      }
    }

    // ── Weekly breakdown ───────────────────────────────────────────────────────
    type WeekBucket = { ourWins: number; ourTotal: number; apiCorrect: number; apiTotal: number };
    const weekMap = new Map<string, WeekBucket>();
    const apiSeenWeek = new Set<number>();

    for (const r of allRows) {
      const week = new Date(r.week).toISOString().slice(0, 10);
      if (!weekMap.has(week)) weekMap.set(week, { ourWins: 0, ourTotal: 0, apiCorrect: 0, apiTotal: 0 });
      const w = weekMap.get(week)!;
      if (r.outcome === "win") { w.ourWins++; w.ourTotal++; }
      else if (r.outcome === "loss") { w.ourTotal++; }
      if (!apiSeenWeek.has(r.fixture_id)) {
        apiSeenWeek.add(r.fixture_id);
        w.apiTotal++;
        if (r.api_predicted === r.actual_outcome) w.apiCorrect++;
      }
    }

    const timeline = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10) // last 10 weeks
      .map(([week, w]) => ({
        week,
        ourHitRate: w.ourTotal > 0 ? Math.round(w.ourWins / w.ourTotal * 1000) / 10 : null,
        ourTotal: w.ourTotal,
        apiHitRate: w.apiTotal > 0 ? Math.round(w.apiCorrect / w.apiTotal * 1000) / 10 : null,
        apiTotal: w.apiTotal,
      }));

    return res.json({
      ours: {
        total: ourTotal,
        wins: ourWins,
        losses: ourLosses,
        hitRate: ourTotal > 0 ? Math.round(ourWins / ourTotal * 1000) / 10 : 0,
        profitUnits: Math.round(ourProfit * 10) / 10,
      },
      apiFootball: {
        total: apiTotal,
        correct: apiCorrect,
        hitRate: apiTotal > 0 ? Math.round(apiCorrect / apiTotal * 1000) / 10 : 0,
      },
      timeline,
    });
  } catch (err) {
    console.error("[admin/benchmark]", err);
    return res.status(500).json({ error: "Failed to compute benchmark" });
  }
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

// ── Supabase users ────────────────────────────────────────────────────────────

router.get("/admin/supabase-users", requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
    if (error) throw error;
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      firstName: null,
      lastName: null,
      createdAt: u.created_at ? new Date(u.created_at).getTime() : null,
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null,
      banned: !!(u as any).banned_until && (u as any).banned_until !== "none",
    }));
    return res.json({ users, total: users.length });
  } catch (err) {
    console.error("[admin] supabase-users error:", err);
    return res.status(500).json({ error: "Failed to fetch Supabase users" });
  }
});

// ── Ban / unban / delete Supabase user ───────────────────────────────────────

router.patch("/admin/supabase-users/:id/ban", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "User ID required" });
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: "87600h", // ~10 years = effectively permanent
    } as any);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] ban user error:", err);
    return res.status(500).json({ error: "Failed to ban user" });
  }
});

router.patch("/admin/supabase-users/:id/unban", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "User ID required" });
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: "none",
    } as any);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] unban user error:", err);
    return res.status(500).json({ error: "Failed to unban user" });
  }
});

router.delete("/admin/supabase-users/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "User ID required" });
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin] delete supabase user error:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
