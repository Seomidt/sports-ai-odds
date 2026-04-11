import { Router } from "express";
import { db, pool } from "@workspace/db";
import { followedFixtures, alertLog } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// POST /api/fixtures/:id/follow
router.post("/fixtures/:id/follow", async (req, res) => {
  const fixtureId = parseInt(req.params.id ?? "0");
  const sessionId = req.headers["x-session-id"] as string | undefined;

  if (!fixtureId) return res.status(400).json({ error: "Invalid fixture id" });
  if (!sessionId) return res.status(400).json({ error: "Missing x-session-id header" });

  await db
    .insert(followedFixtures)
    .values({ sessionId, fixtureId, createdAt: new Date() })
    .onConflictDoNothing();

  return res.json({ followed: true, fixtureId });
});

// DELETE /api/fixtures/:id/follow
router.delete("/fixtures/:id/follow", async (req, res) => {
  const fixtureId = parseInt(req.params.id ?? "0");
  const sessionId = req.headers["x-session-id"] as string | undefined;

  if (!fixtureId || !sessionId) return res.status(400).json({ error: "Invalid params" });

  await db
    .delete(followedFixtures)
    .where(
      and(
        eq(followedFixtures.fixtureId, fixtureId),
        eq(followedFixtures.sessionId, sessionId)
      )
    );

  return res.json({ unfollowed: true, fixtureId });
});

// GET /api/fixtures/followed
router.get("/fixtures/followed", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) return res.status(400).json({ error: "Missing x-session-id header" });

  const rows = await db.query.followedFixtures.findMany({
    where: (f, { eq: eqFn }) => eqFn(f.sessionId, sessionId),
  });

  return res.json({ fixtureIds: rows.map((r) => r.fixtureId) });
});

// GET /api/alerts/unread — poll for new alerts (enriched with fixture team names)
router.get("/alerts/unread", async (req, res): Promise<void> => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing x-session-id header" });
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
       f.away_team_name AS "awayTeamName"
     FROM alert_log a
     LEFT JOIN fixtures f ON f.fixture_id = a.fixture_id
     WHERE a.session_id = $1
       AND a.is_read = false
     ORDER BY a.created_at DESC
     LIMIT 20`,
    [sessionId],
  );

  res.json({ alerts: rows });
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

  return res.json({ read: true });
});

export default router;
