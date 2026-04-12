import { Router } from "express";
import { db, pool } from "@workspace/db";
import { fixtures, fixtureSignals, teamFeatures } from "@workspace/db/schema";
import { runPreMatchFeatures } from "../features/featureEngine.js";
import { runSignalEngine } from "../signals/signalEngine.js";
import { cacheGet, cacheSet, getOrFetch, TTL } from "../lib/routeCache.js";

const router = Router();

const LEAGUE_NAMES: Record<number, string> = {
  39: "Premier League", 140: "La Liga", 135: "Serie A", 78: "Bundesliga", 61: "Ligue 1",
  2: "UEFA Champions League", 3: "UEFA Europa League", 848: "UEFA Conference League",
  40: "Championship", 79: "2. Bundesliga", 88: "Eredivisie", 94: "Primeira Liga",
  107: "Belgian Pro League", 113: "Allsvenskan", 119: "Superliga", 120: "1. Division",
  179: "Scottish Premiership", 203: "Süper Lig", 218: "Bundesliga (Austria)",
  235: "Eliteserien", 244: "Veikkausliiga", 271: "Ekstraklasa",
  98: "J1 League", 188: "A-League Men", 253: "MLS", 262: "Liga MX", 292: "K League 1",
};

// GET /api/fixtures/today — all fixtures across tracked leagues for today+tomorrow
router.get("/fixtures/today", async (_req, res) => {
  try {
    const body = await getOrFetch("fixtures:today", TTL.MIN1, async () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 3);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
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
      return { leagues: Object.values(byLeague) };
    });

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    return res.json(body);
  } catch (err) {
    console.error("[fixtures/today] error:", err);
    return res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

// GET /api/fixtures/top-picks — prematch + live fixtures from tracked leagues ranked by signal count
router.get("/fixtures/top-picks", async (_req, res) => {
  const TRACKED_LEAGUES = [39, 140, 135, 78, 2];
  const LIVE_STATUSES = `('1H','HT','2H','ET','BT','P','INT','LIVE')`;
  const FINISHED_STATUSES = `('FT','AET','PEN','ABD','CANC','AWD','WO')`;

  type FixtureRow = {
    fixtureId: number; leagueId: number; leagueName: string; leagueLogo: string | null;
    homeTeamId: number; awayTeamId: number; homeTeamName: string; awayTeamName: string;
    homeTeamLogo: string | null; awayTeamLogo: string | null; kickoff: string | null;
    statusShort: string | null; homeGoals: number | null; awayGoals: number | null;
    venue: string | null; signalCount: number; isLive: boolean;
  };

  try {
    const body = await getOrFetch("fixtures:top-picks", TTL.MIN1, async () => {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 3);
      end.setHours(23, 59, 59, 999);

      const { rows } = await pool.query<FixtureRow>(`
        WITH signals_agg AS (
          SELECT fixture_id, COUNT(*) AS cnt
          FROM fixture_signals
          WHERE phase IN ('pre','live')
          GROUP BY fixture_id
        )
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
          COALESCE(sa.cnt, 0) AS "signalCount",
          (f.status_short IN ${LIVE_STATUSES}) AS "isLive"
        FROM fixtures f
        LEFT JOIN signals_agg sa ON sa.fixture_id = f.fixture_id
        WHERE
          (f.kickoff >= $1 AND f.kickoff <= $2
            AND (f.status_short IS NULL OR f.status_short NOT IN ${LIVE_STATUSES})
            AND f.status_short NOT IN ${FINISHED_STATUSES})
          OR
          (f.league_id = ANY($3) AND f.status_short IN ${LIVE_STATUSES})
        ORDER BY "isLive" DESC, "signalCount" DESC, f.kickoff ASC
        LIMIT 50
      `, [now, end, TRACKED_LEAGUES]);

      return { fixtures: rows.map((r) => ({ ...r, signalCount: Number(r.signalCount) })) };
    });

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    return res.json(body);
  } catch (err) {
    console.error("[fixtures/top-picks] error:", err);
    return res.status(500).json({ error: "Failed to fetch top picks" });
  }
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
  const ttl = isLive ? TTL.S15 : isFinished ? TTL.HOUR24 : TTL.MIN5;
  const maxAge = isLive ? 15 : isFinished ? 86400 : 300;
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

// GET /api/standings/leagues — all leagues that have standings data in DB
router.get("/standings/leagues", async (_req, res) => {
  try {
    const body = await getOrFetch("standings:leagues", TTL.MIN5, async () => {
      const { rows: rawRows } = await pool.query(`
        SELECT
          league_id AS "leagueId",
          MAX(season_year) AS season,
          COUNT(DISTINCT team_id) AS teams
        FROM standings
        GROUP BY league_id
        HAVING COUNT(DISTINCT team_id) >= 6
        ORDER BY COUNT(DISTINCT team_id) DESC, league_id
      `);

      const rows = rawRows.map((r: Record<string, unknown>) => ({
        leagueId: r["leagueId"],
        leagueName: LEAGUE_NAMES[Number(r["leagueId"])] ?? `League ${r["leagueId"]}`,
        season: r["season"],
        teams: r["teams"],
      }));

      return { leagues: rows };
    });

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(body);
  } catch (err) {
    console.error("[standings/leagues] error:", err);
    return res.status(500).json({ error: "Failed to fetch leagues" });
  }
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
    `WITH latest_season AS (
       SELECT MAX(season_year) AS sy FROM standings WHERE league_id = $1
     ),
     deduped AS (
       SELECT DISTINCT ON (s.team_id)
         s.id, s.league_id AS "leagueId", s.season_year AS "seasonYear",
         s.team_id AS "teamId", s.rank, s.points, s.played,
         s.won, s.drawn, s.lost,
         s.goals_for AS "goalsFor", s.goals_against AS "goalsAgainst",
         s.goals_diff AS "goalsDiff", s.form,
         COALESCE(s.team_name, t.name, s.team_id::text) AS "teamName",
         COALESCE(s.team_logo, t.logo) AS "teamLogo"
       FROM standings s
       LEFT JOIN teams t ON t.team_id = s.team_id
       CROSS JOIN latest_season ls
       WHERE s.league_id = $1 AND s.season_year = ls.sy
       ORDER BY s.team_id, s.points DESC
     )
     SELECT *, ROW_NUMBER() OVER (ORDER BY points DESC, "goalsDiff" DESC) AS rank
     FROM deduped
     ORDER BY points DESC, "goalsDiff" DESC`,
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
