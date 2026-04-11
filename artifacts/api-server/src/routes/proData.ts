import { Router } from "express";
import { db } from "@workspace/db";
import { eq, desc, or, and } from "drizzle-orm";
import {
  predictions,
  liveOddsSnapshots,
  oddsSnapshots,
  oddsMarkets,
  playerStats,
  playerSeasonStats,
  playerProfiles,
  coaches,
  sidelinedPlayers,
  transfers,
  h2hFixtures,
  teamSeasonStats,
  venues,
  trophies,
} from "@workspace/db/schema";

const router = Router();

// GET /api/fixtures/:id/predictions
router.get("/fixtures/:id/predictions", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const pred = await db.query.predictions.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.fixtureId, id),
  });

  res.json({ prediction: pred ?? null });
});

// GET /api/fixtures/:id/odds — latest pre-match odds snapshot
router.get("/fixtures/:id/odds", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const snap = await db.query.oddsSnapshots.findFirst({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, id),
    orderBy: (o, { desc: d }) => [d(o.snappedAt)],
  });

  res.json({ odds: snap ?? null });
});

// GET /api/fixtures/:id/live-odds — last 10 snapshots
router.get("/fixtures/:id/live-odds", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const odds = await db.query.liveOddsSnapshots.findMany({
    where: (lo, { eq: eqFn }) => eqFn(lo.fixtureId, id),
    orderBy: (lo, { desc: d }) => [d(lo.snappedAt)],
    limit: 20,
  });

  res.json({ liveOdds: odds });
});

// GET /api/fixtures/:id/player-stats
router.get("/fixtures/:id/player-stats", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const stats = await db.query.playerStats.findMany({
    where: (ps, { eq: eqFn }) => eqFn(ps.fixtureId, id),
    orderBy: (ps, { desc: d }) => [d(ps.rating)],
  });

  res.json({ playerStats: stats });
});

// GET /api/leagues/:leagueId/topscorers?season=2024
router.get("/leagues/:leagueId/topscorers", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");

  const rows = await db.query.playerSeasonStats.findMany({
    where: (ps, { and, eq: eqFn, isNotNull }) =>
      and(eqFn(ps.leagueId, leagueId), eqFn(ps.seasonYear, season), isNotNull(ps.goals)),
    orderBy: (ps, { desc: d }) => [d(ps.goals)],
    limit: 20,
  });

  res.json({ topscorers: rows });
});

// GET /api/leagues/:leagueId/topassists?season=2024
router.get("/leagues/:leagueId/topassists", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");

  const rows = await db.query.playerSeasonStats.findMany({
    where: (ps, { and, eq: eqFn, isNotNull }) =>
      and(eqFn(ps.leagueId, leagueId), eqFn(ps.seasonYear, season), isNotNull(ps.assists)),
    orderBy: (ps, { desc: d }) => [d(ps.assists)],
    limit: 20,
  });

  res.json({ topassists: rows });
});

// GET /api/teams/:teamId/coach
router.get("/teams/:teamId/coach", async (req, res) => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const coach = await db.query.coaches.findFirst({
    where: (c, { eq: eqFn }) => eqFn(c.teamId, teamId),
  });

  res.json({ coach: coach ?? null });
});

// GET /api/teams/:teamId/sidelined
router.get("/teams/:teamId/sidelined", async (req, res) => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const players = await db.query.sidelinedPlayers.findMany({
    where: (sp, { eq: eqFn }) => eqFn(sp.teamId, teamId),
    orderBy: (sp, { desc: d }) => [d(sp.startDate)],
  });

  res.json({ sidelined: players });
});

// GET /api/teams/:teamId/transfers
router.get("/teams/:teamId/transfers", async (req, res) => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.teamInId, teamId))
    .orderBy(desc(transfers.transferDate))
    .limit(20);

  res.json({ transfers: rows });
});

// GET /api/fixtures/:id/h2h — head-to-head history for a fixture
router.get("/fixtures/:id/h2h", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, id),
    columns: { homeTeamId: true, awayTeamId: true },
  });

  if (!fixture) return res.status(404).json({ error: "Fixture not found" });

  const rows = await db.query.h2hFixtures.findMany({
    where: (h, { or: orFn, and: andFn, eq: eqFn }) =>
      orFn(
        andFn(eqFn(h.forTeam1Id, fixture.homeTeamId), eqFn(h.forTeam2Id, fixture.awayTeamId)),
        andFn(eqFn(h.forTeam1Id, fixture.awayTeamId), eqFn(h.forTeam2Id, fixture.homeTeamId))
      ),
    orderBy: (h, { desc: d }) => [d(h.kickoff)],
    limit: 10,
  });

  res.json({ h2h: rows });
});

// GET /api/fixtures/:id/odds-markets — all bookmakers + all market odds
router.get("/fixtures/:id/odds-markets", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  const rows = await db.query.oddsMarkets.findMany({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, id),
    orderBy: (o, { desc: d }) => [d(o.snappedAt)],
    limit: 10,
  });

  res.json({ oddsMarkets: rows });
});

// GET /api/teams/:teamId/statistics?season=2024
router.get("/teams/:teamId/statistics", async (req, res) => {
  const teamId = parseInt(req.params.teamId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const rows = await db.query.teamSeasonStats.findMany({
    where: (ts, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(ts.teamId, teamId), eqFn(ts.seasonYear, season)),
  });

  res.json({ statistics: rows });
});

// GET /api/teams/:teamId/venue
router.get("/teams/:teamId/venue", async (req, res) => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const venue = await db.query.venues.findFirst({
    where: (v, { eq: eqFn }) => eqFn(v.teamId, teamId),
  });

  res.json({ venue: venue ?? null });
});

// GET /api/teams/:teamId/trophies
router.get("/teams/:teamId/trophies", async (req, res) => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) return res.status(400).json({ error: "Invalid team id" });

  const rows = await db.query.trophies.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.teamId, teamId),
    orderBy: (t, { desc: d }) => [d(t.season)],
  });

  res.json({ trophies: rows });
});

// GET /api/players/:playerId
router.get("/players/:playerId", async (req, res) => {
  const playerId = parseInt(req.params.playerId ?? "0");
  if (!playerId) return res.status(400).json({ error: "Invalid player id" });

  const profile = await db.query.playerProfiles.findFirst({
    where: (pp, { eq: eqFn }) => eqFn(pp.playerId, playerId),
  });

  if (!profile) return res.status(404).json({ error: "Player not found" });
  res.json({ player: profile });
});

// GET /api/leagues/:leagueId/topdiscipline?type=yellow&season=2024
router.get("/leagues/:leagueId/topdiscipline", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");

  const rows = await db.query.playerSeasonStats.findMany({
    where: (ps, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(ps.leagueId, leagueId), eqFn(ps.seasonYear, season)),
    orderBy: (ps, { desc: d }) => [d(ps.appearances)],
    limit: 20,
  });

  res.json({ players: rows });
});

export default router;
