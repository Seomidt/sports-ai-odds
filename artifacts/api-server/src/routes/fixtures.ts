import { Router } from "express";
import { db, pool } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { fixtures, fixtureSignals, teamFeatures } from "@workspace/db/schema";
import { runPreMatchFeatures } from "../features/featureEngine.js";
import { runSignalEngine } from "../signals/signalEngine.js";

const router = Router();

// GET /api/fixtures/today — all fixtures across tracked leagues for today+tomorrow
router.get("/fixtures/today", async (req, res) => {
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

  // Group by league
  const byLeague: Record<string, { leagueId: number; leagueName: string; leagueLogo: string | null; fixtures: typeof rows }> = {};
  for (const f of rows) {
    const key = String(f.leagueId);
    if (!byLeague[key]) {
      byLeague[key] = { leagueId: f.leagueId, leagueName: f.leagueName ?? "", leagueLogo: f.leagueLogo, fixtures: [] };
    }
    byLeague[key]!.fixtures.push(f);
  }

  res.json({ leagues: Object.values(byLeague) });
});

// GET /api/fixtures/:id — fixture details with events, lineups, stats, signals
router.get("/fixtures/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, id),
  });

  if (!fixture) return res.status(404).json({ error: "Fixture not found" });

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

  return res.json({ fixture, events, stats, lineups });
});

// GET /api/fixtures/:id/features — computed features
router.get("/fixtures/:id/features", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const features = await db.query.teamFeatures.findMany({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, id),
    orderBy: (f, { asc }) => [asc(f.phase), asc(f.teamId), asc(f.featureKey)],
  });

  return res.json({ features });
});

// GET /api/fixtures/:id/signals — computed signals
router.get("/fixtures/:id/signals", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  const phase = req.query["phase"] as string | undefined;
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const signals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) =>
      phase
        ? andFn(eqFn(s.fixtureId, id), eqFn(s.phase, phase))
        : eqFn(s.fixtureId, id),
    orderBy: (s, { asc }) => [asc(s.phase), asc(s.signalKey)],
  });

  return res.json({ signals });
});

// GET /api/standings/:leagueId
router.get("/standings/:leagueId", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  if (!leagueId) return res.status(400).json({ error: "Invalid league id" });

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

  return res.json({ standings: rows });
});

// GET /api/teams/:id/injuries
router.get("/teams/:id/injuries", async (req, res) => {
  const teamId = parseInt(req.params.id ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const rows = await db.query.injuries.findMany({
    where: (i, { eq: eqFn }) => eqFn(i.teamId, teamId),
    orderBy: (i, { desc: descFn }) => [descFn(i.updatedAt)],
  });

  return res.json({ injuries: rows });
});

export default router;
