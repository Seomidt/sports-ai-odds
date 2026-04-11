import { Router } from "express";
import { db, pool } from "@workspace/db";
import { fixtures, fixtureSignals, teamFeatures } from "@workspace/db/schema";
import { runPreMatchFeatures } from "../features/featureEngine.js";
import { runSignalEngine } from "../signals/signalEngine.js";
import { cacheGet, cacheSet, TTL } from "../lib/routeCache.js";

const router = Router();

// GET /api/fixtures/today — all fixtures across tracked leagues for today+tomorrow
router.get("/fixtures/today", async (req, res) => {
  const cacheKey = "fixtures:today";
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + 3);
  end.setHours(23, 59, 59, 999);

  const rows = await db.query.fixtures.findMany({
    where: (f, { and: andFn, gte: gteFn, lte: lteFn }) =>
      andFn(gteFn(f.kickoff, start), lteFn(f.kickoff, end)),
    orderBy: (f, { asc }) => [asc(f.kickoff)],
  });

  const byLeague: Record<string, { leagueId: number; leagueName: string; leagueLogo: string | null; fixtures: typeof rows }> = {};
  for (const f of rows) {
    const key = String(f.leagueId);
    if (!byLeague[key]) {
      byLeague[key] = { leagueId: f.leagueId, leagueName: f.leagueName ?? "", leagueLogo: f.leagueLogo, fixtures: [] };
    }
    byLeague[key]!.fixtures.push(f);
  }

  const body = { leagues: Object.values(byLeague) };
  cacheSet(cacheKey, body, TTL.MIN1);
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
  res.set("X-Cache", "MISS");
  return res.json(body);
});

// GET /api/fixtures/top-picks — prematch fixtures ranked by pre-signal count
router.get("/fixtures/top-picks", async (req, res) => {
  const cacheKey = "fixtures:top-picks";
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=90, stale-while-revalidate=60");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 3);
  end.setHours(23, 59, 59, 999);

  const { rows } = await pool.query<{
    fixtureId: number; leagueId: number; leagueName: string; leagueLogo: string | null;
    homeTeamId: number; awayTeamId: number; homeTeamName: string; awayTeamName: string;
    homeTeamLogo: string | null; awayTeamLogo: string | null; kickoff: string | null;
    statusShort: string | null; homeGoals: number | null; awayGoals: number | null;
    venue: string | null; signalCount: number;
  }>(`
    SELECT
      f.fixture_id AS "fixtureId",
      f.league_id AS "leagueId",
      f.league_name AS "leagueName",
      f.league_logo AS "leagueLogo",
      f.home_team_id AS "homeTeamId",
      f.away_team_id AS "awayTeamId",
      f.home_team_name AS "homeTeamName",
      f.away_team_name AS "awayTeamName",
      f.home_team_logo AS "homeTeamLogo",
      f.away_team_logo AS "awayTeamLogo",
      f.kickoff,
      f.status_short AS "statusShort",
      f.home_goals AS "homeGoals",
      f.away_goals AS "awayGoals",
      f.venue,
      COUNT(s.id) AS "signalCount"
    FROM fixtures f
    LEFT JOIN fixture_signals s ON s.fixture_id = f.fixture_id AND s.phase = 'pre'
    WHERE f.kickoff >= $1
      AND f.kickoff <= $2
      AND (f.status_short IS NULL OR f.status_short NOT IN ('1H','HT','2H','ET','BT','P','INT','LIVE','FT','AET','PEN','ABD','CANC','AWD','WO'))
    GROUP BY f.fixture_id
    ORDER BY "signalCount" DESC, f.kickoff ASC
    LIMIT 50
  `, [now, end]);

  const body = { fixtures: rows.map((r) => ({ ...r, signalCount: Number(r.signalCount) })) };
  cacheSet(cacheKey, body, TTL.MIN2);
  res.set("Cache-Control", "public, max-age=90, stale-while-revalidate=60");
  res.set("X-Cache", "MISS");
  return res.json(body);
});

// GET /api/fixtures/:id — fixture details with events, lineups, stats
router.get("/fixtures/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const cacheKey = `fixture:${id}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=15");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, id),
  });

  if (!fixture) return res.status(404).json({ error: "Fixture not found" });

  const isLive = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(fixture.statusShort ?? "");
  const isFinished = ["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"].includes(fixture.statusShort ?? "");

  const [events, stats, lineups] = await Promise.all([
    db.query.fixtureEvents.findMany({
      where: (e, { eq: eqFn }) => eqFn(e.fixtureId, id),
      orderBy: (e, { asc }) => [asc(e.minute)],
    }),
    db.query.fixtureStats.findMany({
      where: (s, { eq: eqFn }) => eqFn(s.fixtureId, id),
    }),
    db.query.fixtureLineups.findMany({
      where: (l, { eq: eqFn }) => eqFn(l.fixtureId, id),
    }),
  ]);

  const body = { fixture, events, stats, lineups };

  // TTL depends on fixture state
  const ttl = isLive ? TTL.S30 : isFinished ? TTL.HOUR24 : TTL.MIN5;
  const maxAge = isLive ? 30 : isFinished ? 86400 : 300;
  cacheSet(cacheKey, body, ttl);
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${Math.floor(maxAge / 2)}`);
  res.set("X-Cache", "MISS");
  return res.json(body);
});

// GET /api/fixtures/:id/features — computed features
router.get("/fixtures/:id/features", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const cacheKey = `fixture:${id}:features`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=60");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const features = await db.query.teamFeatures.findMany({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, id),
    orderBy: (f, { asc }) => [asc(f.phase), asc(f.teamId), asc(f.featureKey)],
  });

  const body = { features };
  cacheSet(cacheKey, body, TTL.MIN2);
  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=60");
  res.set("X-Cache", "MISS");
  return res.json(body);
});

// GET /api/fixtures/:id/signals — computed signals
router.get("/fixtures/:id/signals", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  const phase = req.query["phase"] as string | undefined;
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const cacheKey = `fixture:${id}:signals:${phase ?? "all"}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const signals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) =>
      phase
        ? andFn(eqFn(s.fixtureId, id), eqFn(s.phase, phase))
        : eqFn(s.fixtureId, id),
    orderBy: (s, { asc }) => [asc(s.phase), asc(s.signalKey)],
  });

  const body = { signals };
  const ttl = phase === "post" ? TTL.HOUR24 : phase === "live" ? TTL.S30 : TTL.MIN1;
  cacheSet(cacheKey, body, ttl);
  res.set("Cache-Control", `public, max-age=${Math.floor(ttl / 1000)}, stale-while-revalidate=${Math.floor(ttl / 2000)}`);
  res.set("X-Cache", "MISS");
  return res.json(body);
});

// GET /api/standings/:leagueId
router.get("/standings/:leagueId", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  if (!leagueId) return res.status(400).json({ error: "Invalid league id" });

  const cacheKey = `standings:${leagueId}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const { rows } = await pool.query(
    `SELECT
       s.id, s.league_id AS "leagueId", s.season_year AS "seasonYear",
       s.team_id AS "teamId", s.rank, s.points, s.played,
       s.won, s.drawn, s.lost,
       s.goals_for AS "goalsFor", s.goals_against AS "goalsAgainst",
       s.goals_diff AS "goalsDiff", s.form,
       COALESCE(s.team_name, t.name, s.team_id::text) AS "teamName",
       COALESCE(s.team_logo, t.logo) AS "teamLogo"
     FROM standings s
     LEFT JOIN teams t ON t.team_id = s.team_id
     WHERE s.league_id = $1
     ORDER BY s.rank ASC`,
    [leagueId]
  );

  const body = { standings: rows };
  cacheSet(cacheKey, body, TTL.MIN10);
  res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300");
  res.set("X-Cache", "MISS");
  return res.json(body);
});

// GET /api/teams/:id/injuries
router.get("/teams/:id/injuries", async (req, res) => {
  const teamId = parseInt(req.params.id ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const cacheKey = `team:${teamId}:injuries`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=120");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const rows = await db.query.injuries.findMany({
    where: (i, { eq: eqFn }) => eqFn(i.teamId, teamId),
    orderBy: (i, { desc: descFn }) => [descFn(i.updatedAt)],
  });

  const body = { injuries: rows };
  cacheSet(cacheKey, body, TTL.MIN5);
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=120");
  res.set("X-Cache", "MISS");
  return res.json(body);
});

export default router;
