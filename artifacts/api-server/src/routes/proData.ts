import { Router } from "express";
import { db } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  predictions,
  liveOddsSnapshots,
  oddsSnapshots,
  playerStats,
  playerSeasonStats,
  coaches,
  sidelinedPlayers,
  transfers,
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

export default router;
