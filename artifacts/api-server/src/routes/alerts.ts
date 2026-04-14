import { Router } from "express";
import { db, pool } from "@workspace/db";
import { followedFixtures, alertLog } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { cacheGet, cacheSet, cacheDel, TTL } from "../lib/routeCache.js";

const router = Router();

// POST /api/fixtures/:id/follow — requires auth, follows per Clerk userId
router.post("/fixtures/:id/follow", requireAuth, async (req, res) => {
  const fixtureId = parseInt(req.params.id ?? "0");
  const { userId } = getAuth(req);

  if (!fixtureId) return res.status(400).json({ error: "Invalid fixture id" });
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await db
    .insert(followedFixtures)
    .values({ userId, fixtureId, createdAt: new Date() })
    .onConflictDoNothing();

  return res.json({ followed: true, fixtureId });
});

// DELETE /api/fixtures/:id/follow — requires auth
router.delete("/fixtures/:id/follow", requireAuth, async (req, res) => {
  const fixtureId = parseInt(req.params.id ?? "0");
  const { userId } = getAuth(req);

  if (!fixtureId || !userId) return res.status(400).json({ error: "Invalid params" });

  await db
    .delete(followedFixtures)
    .where(
      and(
        eq(followedFixtures.fixtureId, fixtureId),
        eq(followedFixtures.userId, userId)
      )
    );

  return res.json({ unfollowed: true, fixtureId });
});

// GET /api/fixtures/followed — requires auth, returns only this user's followed fixtures
router.get("/fixtures/followed", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const rows = await db.query.followedFixtures.findMany({
    where: (f, { eq: eqFn }) => eqFn(f.userId, userId),
  });

  return res.json({ fixtureIds: rows.map((r) => r.fixtureId) });
});

// GET /api/alerts/unread — session alerts + broadcast alerts (sessionId IS NULL)
router.get("/alerts/unread", async (req, res): Promise<void> => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing x-session-id header" });
    return;
  }

  const cacheKey = `alerts:unread:${sessionId}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "private, max-age=15");
    res.set("X-Cache", "HIT");
    res.json(cached);
    return;
  }

  // Return: alerts for this session OR broadcast alerts (session_id IS NULL)
  // Broadcast alerts are global (high-value tips, odds drops) — shown to everyone.
  // We use created_at > 6h ago for broadcasts so stale ones don't resurface.
  const { rows } = await pool.query(
    `SELECT
       a.id,
       a.fixture_id    AS "fixtureId",
       a.session_id    AS "sessionId",
       a.signal_key    AS "signalKey",
       a.alert_text    AS "alertText",
       a.is_read       AS "isRead",
       a.created_at    AS "createdAt",
       f.home_team_name AS "homeTeamName",
       f.away_team_name AS "awayTeamName"
     FROM alert_log a
     LEFT JOIN fixtures f ON f.fixture_id = a.fixture_id
     WHERE (
       (a.session_id = $1 AND a.is_read = false)
       OR (a.session_id IS NULL AND a.created_at > NOW() - INTERVAL '6 hours')
     )
     ORDER BY a.created_at DESC
     LIMIT 20`,
    [sessionId],
  );

  const body = { alerts: rows };
  cacheSet(cacheKey, body, TTL.S15);
  res.set("Cache-Control", "private, max-age=15");
  res.set("X-Cache", "MISS");
  res.json(body);
});

// GET /api/alerts/recent — all broadcast signals from the last N hours (default 1h)
router.get("/alerts/recent", async (req, res): Promise<void> => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing x-session-id header" });
    return;
  }

  const hours = Math.min(parseInt((req.query.hours as string) ?? "1", 10) || 1, 24);
  const cacheKey = `alerts:recent:${hours}h`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=30");
    res.set("X-Cache", "HIT");
    res.json(cached);
    return;
  }

  const { rows } = await pool.query(
    `SELECT
       a.id,
       a.fixture_id    AS "fixtureId",
       a.session_id    AS "sessionId",
       a.signal_key    AS "signalKey",
       a.alert_text    AS "alertText",
       a.is_read       AS "isRead",
       a.created_at    AS "createdAt",
       f.home_team_name AS "homeTeamName",
       f.away_team_name AS "awayTeamName",
       f.status_short  AS "statusShort",
       f.league_name   AS "leagueName"
     FROM alert_log a
     LEFT JOIN fixtures f ON f.fixture_id = a.fixture_id
     WHERE a.session_id IS NULL
       AND a.created_at > NOW() - ($1 || ' hours')::INTERVAL
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [hours],
  );

  const body = { alerts: rows, hours };
  cacheSet(cacheKey, body, 30);
  res.set("Cache-Control", "public, max-age=30");
  res.set("X-Cache", "MISS");
  res.json(body);
});

// POST /api/alerts/:id/read
router.post("/alerts/:id/read", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!id) return res.status(400).json({ error: "Invalid alert id" });
  if (!sessionId) return res.status(400).json({ error: "Missing x-session-id header" });

  await db
    .update(alertLog)
    .set({ isRead: true })
    .where(and(eq(alertLog.id, id), eq(alertLog.sessionId, sessionId)));

  // Invalidate so next poll sees updated state immediately
  cacheDel(`alerts:unread:${sessionId}`);

  return res.json({ read: true });
});

export default router;
