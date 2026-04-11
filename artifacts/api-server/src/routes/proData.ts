import { Router } from "express";
import { db } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  transfers,
} from "@workspace/db/schema";
import { cacheGet, cacheSet, TTL } from "../lib/routeCache.js";

const router = Router();

router.get("/fixtures/:id/predictions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const ck = `fixture:${id}:predictions`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=1800, stale-while-revalidate=300").set("X-Cache", "HIT").json(hit); return; }

  const pred = await db.query.predictions.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.fixtureId, id),
  });

  const body = { prediction: pred ?? null };
  cacheSet(ck, body, TTL.MIN30);
  res.set("Cache-Control", "public, max-age=1800, stale-while-revalidate=300").set("X-Cache", "MISS").json(body);
});

router.get("/fixtures/:id/odds", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const ck = `fixture:${id}:odds`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=60").set("X-Cache", "HIT").json(hit); return; }

  const snap = await db.query.oddsSnapshots.findFirst({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, id),
    orderBy: (o, { desc: d }) => [d(o.snappedAt)],
  });

  const body = { odds: snap ?? null };
  cacheSet(ck, body, TTL.MIN2);
  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=60").set("X-Cache", "MISS").json(body);
});

router.get("/fixtures/:id/live-odds", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const ck = `fixture:${id}:live-odds`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=15").set("X-Cache", "HIT").json(hit); return; }

  const odds = await db.query.liveOddsSnapshots.findMany({
    where: (lo, { eq: eqFn }) => eqFn(lo.fixtureId, id),
    orderBy: (lo, { desc: d }) => [d(lo.snappedAt)],
    limit: 20,
  });

  const body = { liveOdds: odds };
  cacheSet(ck, body, TTL.S30);
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=15").set("X-Cache", "MISS").json(body);
});

router.get("/fixtures/:id/player-stats", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const ck = `fixture:${id}:player-stats`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60").set("X-Cache", "HIT").json(hit); return; }

  const stats = await db.query.playerStats.findMany({
    where: (ps, { eq: eqFn }) => eqFn(ps.fixtureId, id),
    orderBy: (ps, { desc: d }) => [d(ps.rating)],
  });

  const body = { playerStats: stats };
  cacheSet(ck, body, TTL.MIN5);
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60").set("X-Cache", "MISS").json(body);
});

router.get("/leagues/:leagueId/topscorers", async (req, res): Promise<void> => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");

  const ck = `league:${leagueId}:topscorers:${season}`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db.query.playerSeasonStats.findMany({
    where: (ps, { and, eq: eqFn, isNotNull }) =>
      and(eqFn(ps.leagueId, leagueId), eqFn(ps.seasonYear, season), isNotNull(ps.goals)),
    orderBy: (ps, { desc: d }) => [d(ps.goals)],
    limit: 20,
  });

  const body = { topscorers: rows };
  cacheSet(ck, body, TTL.MIN10);
  res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300").set("X-Cache", "MISS").json(body);
});

router.get("/leagues/:leagueId/topassists", async (req, res): Promise<void> => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");

  const ck = `league:${leagueId}:topassists:${season}`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db.query.playerSeasonStats.findMany({
    where: (ps, { and, eq: eqFn, isNotNull }) =>
      and(eqFn(ps.leagueId, leagueId), eqFn(ps.seasonYear, season), isNotNull(ps.assists)),
    orderBy: (ps, { desc: d }) => [d(ps.assists)],
    limit: 20,
  });

  const body = { topassists: rows };
  cacheSet(ck, body, TTL.MIN10);
  res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300").set("X-Cache", "MISS").json(body);
});

router.get("/teams/:teamId/coach", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const ck = `team:${teamId}:coach`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=3600").set("X-Cache", "HIT").json(hit); return; }

  const coach = await db.query.coaches.findFirst({
    where: (c, { eq: eqFn }) => eqFn(c.teamId, teamId),
  });

  const body = { coach: coach ?? null };
  cacheSet(ck, body, TTL.HOUR6);
  res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=3600").set("X-Cache", "MISS").json(body);
});

router.get("/teams/:teamId/sidelined", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const ck = `team:${teamId}:sidelined`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=120").set("X-Cache", "HIT").json(hit); return; }

  const players = await db.query.sidelinedPlayers.findMany({
    where: (sp, { eq: eqFn }) => eqFn(sp.teamId, teamId),
    orderBy: (sp, { desc: d }) => [d(sp.startDate)],
  });

  const body = { sidelined: players };
  cacheSet(ck, body, TTL.MIN5);
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=120").set("X-Cache", "MISS").json(body);
});

router.get("/teams/:teamId/transfers", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const ck = `team:${teamId}:transfers`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=3600").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.teamInId, teamId))
    .orderBy(desc(transfers.transferDate))
    .limit(20);

  const body = { transfers: rows };
  cacheSet(ck, body, TTL.HOUR6);
  res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=3600").set("X-Cache", "MISS").json(body);
});

router.get("/fixtures/:id/h2h", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const ck = `fixture:${id}:h2h`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=1800").set("X-Cache", "HIT").json(hit); return; }

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

  const body = { h2h: rows };
  cacheSet(ck, body, TTL.HOUR2);
  res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=1800").set("X-Cache", "MISS").json(body);
});

router.get("/fixtures/:id/odds-markets", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Invalid fixture id" }); return; }

  const ck = `fixture:${id}:odds-markets`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=60").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db.query.oddsMarkets.findMany({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, id),
    orderBy: (o, { desc: d }) => [d(o.snappedAt)],
    limit: 10,
  });

  const body = { oddsMarkets: rows };
  cacheSet(ck, body, TTL.MIN2);
  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=60").set("X-Cache", "MISS").json(body);
});

router.get("/teams/:teamId/statistics", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const ck = `team:${teamId}:statistics:${season}`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=1800").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db.query.teamSeasonStats.findMany({
    where: (ts, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(ts.teamId, teamId), eqFn(ts.seasonYear, season)),
  });

  const body = { statistics: rows };
  cacheSet(ck, body, TTL.HOUR2);
  res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=1800").set("X-Cache", "MISS").json(body);
});

router.get("/teams/:teamId/venue", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const ck = `team:${teamId}:venue`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600").set("X-Cache", "HIT").json(hit); return; }

  const venue = await db.query.venues.findFirst({
    where: (v, { eq: eqFn }) => eqFn(v.teamId, teamId),
  });

  const body = { venue: venue ?? null };
  cacheSet(ck, body, TTL.HOUR24);
  res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600").set("X-Cache", "MISS").json(body);
});

router.get("/teams/:teamId/trophies", async (req, res): Promise<void> => {
  const teamId = parseInt(req.params.teamId ?? "0");
  if (!teamId) { res.status(400).json({ error: "Invalid team id" }); return; }

  const ck = `team:${teamId}:trophies`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db.query.trophies.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.teamId, teamId),
    orderBy: (t, { desc: d }) => [d(t.season)],
  });

  const body = { trophies: rows };
  cacheSet(ck, body, TTL.HOUR24);
  res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600").set("X-Cache", "MISS").json(body);
});

router.get("/players/:playerId", async (req, res): Promise<void> => {
  const playerId = parseInt(req.params.playerId ?? "0");
  if (!playerId) { res.status(400).json({ error: "Invalid player id" }); return; }

  const ck = `player:${playerId}`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=3600").set("X-Cache", "HIT").json(hit); return; }

  const profile = await db.query.playerProfiles.findFirst({
    where: (pp, { eq: eqFn }) => eqFn(pp.playerId, playerId),
  });

  if (!profile) { res.status(404).json({ error: "Player not found" }); return; }
  const body = { player: profile };
  cacheSet(ck, body, TTL.HOUR6);
  res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=3600").set("X-Cache", "MISS").json(body);
});

router.get("/leagues/:leagueId/topdiscipline", async (req, res): Promise<void> => {
  const leagueId = parseInt(req.params.leagueId ?? "0");
  const season = parseInt((req.query.season as string) ?? "2024");

  const ck = `league:${leagueId}:topdiscipline:${season}`;
  const hit = cacheGet(ck);
  if (hit) { res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300").set("X-Cache", "HIT").json(hit); return; }

  const rows = await db.query.playerSeasonStats.findMany({
    where: (ps, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(ps.leagueId, leagueId), eqFn(ps.seasonYear, season)),
    orderBy: (ps, { desc: d }) => [d(ps.appearances)],
    limit: 20,
  });

  const body = { players: rows };
  cacheSet(ck, body, TTL.MIN10);
  res.set("Cache-Control", "public, max-age=600, stale-while-revalidate=300").set("X-Cache", "MISS").json(body);
});

export default router;
