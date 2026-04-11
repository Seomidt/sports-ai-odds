import { Router } from "express";
import { db } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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

router.get("/fixtures/:id/predictions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const pred = await db.query.predictions.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.fixtureId, id),
  });

  res.json({ prediction: pred ?? null });
});

router.get("/fixtures/:id/odds", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const snap = await db.query.oddsSnapshots.findFirst({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, id),
    orderBy: (o, { desc: d }) => [d(o.snappedAt)],
  });

  res.json({ odds: snap ?? null });
});

router.get("/fixtures/:id/live-odds", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const odds = await db.query.liveOddsSnapshots.findMany({
    where: (lo, { eq: eqFn }) => eqFn(lo.fixtureId, id),
    orderBy: (lo, { desc: d }) => [d(lo.snappedAt)],
    limit: 20,
  });

  res.json({ liveOdds: odds });
});

router.get("/fixtures/:id/player-stats", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const stats = await db.query.playerStats.findMany({
    where: (ps, { eq: eqFn }) => eqFn(ps.fixtureId, id),
    orderBy: (ps, { desc: d }) => [d(ps.rating)],
  });

  res.json({ playerStats: stats });
});

router.get("/leagues/:leagueId/topscorers", async (req, res): Promise<void> => {
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

router.get("/leagues/:leagueId/topassists", async (req, res): Promise<void> => {
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

router.get("/teams/:teamId/coach", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const coach = await db.query.coaches.findFirst({
    where: (c, { eq: eqFn }) => eqFn(c.teamId, teamId),
  });

  res.json({ coach: coach ?? null });
});

router.get("/teams/:teamId/sidelined", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const players = await db.query.sidelinedPlayers.findMany({
    where: (sp, { eq: eqFn }) => eqFn(sp.teamId, teamId),
    orderBy: (sp, { desc: d }) => [d(sp.startDate)],
  });

  res.json({ sidelined: players });
});

router.get("/teams/:teamId/transfers", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.teamInId, teamId))
    .orderBy(desc(transfers.transferDate))
    .limit(20);

  res.json({ transfers: rows });
});

router.get("/fixtures/:id/h2h", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, id),
    columns: { homeTeamId: true, awayTeamId: true },
  });

  if (!fixture) { res.status(404).json({ error: "Fixture not found" }); return; }

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

router.get("/fixtures/:id/odds-markets", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const rows = await db.query.oddsMarkets.findMany({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, id),
    orderBy: (o, { desc: d }) => [d(o.snappedAt)],
    limit: 10,
  });

  res.json({ oddsMarkets: rows });
});

router.get("/teams/:teamId/statistics", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const rows = await db.query.teamSeasonStats.findMany({
    where: (ts, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(ts.teamId, teamId), eqFn(ts.seasonYear, season)),
  });

  res.json({ statistics: rows });
});

router.get("/teams/:teamId/venue", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const venue = await db.query.venues.findFirst({
    where: (v, { eq: eqFn }) => eqFn(v.teamId, teamId),
  });

  res.json({ venue: venue ?? null });
});

router.get("/teams/:teamId/trophies", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const rows = await db.query.trophies.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.teamId, teamId),
    orderBy: (t, { desc: d }) => [d(t.season)],
  });

  res.json({ trophies: rows });
});

router.get("/players/:playerId", async (req, res): Promise<void> => {
  const playerId = parseInt(req.params.playerId ?? "0");
  if (!playerId) { res.status(400).json({ error: "Invalid player id" }); return; }

  const profile = await db.query.playerProfiles.findFirst({
    where: (pp, { eq: eqFn }) => eqFn(pp.playerId, playerId),
  });

  if (!profile) { res.status(404).json({ error: "Player not found" }); return; }
  res.json({ player: profile });
});

router.get("/leagues/:leagueId/topdiscipline", async (req, res): Promise<void> => {
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
