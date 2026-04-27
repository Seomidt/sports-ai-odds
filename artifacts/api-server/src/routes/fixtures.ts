import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { getUserFromRequest } from "../middlewares/requireAuth.js";

import { db } from "@workspace/db";
import {
  fixtures, standings, fixtureEvents, fixtureStats, fixtureLineups,
  oddsSnapshots, h2hFixtures, oddsMarkets, liveOddsSnapshots,
  predictions, coaches, sidelinedPlayers, playerSeasonStats, teamSeasonStats,
  fixtureSignals, trophies, playerStats as playerStatsTable, followedFixtures,
} from "@workspace/db/schema";
import { getOrFetch, TTL } from "../lib/routeCache.js";

const router = Router();

type ApiError = {
  error: string;
};

function startOfDayUtc(date = new Date()): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

function endOfDayUtc(date = new Date()): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function badRequest(res: Response, message: string) {
  return res.status(400).json({ error: message } satisfies ApiError);
}

function reqLogError(scope: string, error: unknown) {
  console.error(`[routes:${scope}]`, error);
}

const POST_STATUSES = ["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"];

router.get("/fixtures/recent", async (_req: Request, res: Response) => {
  try {
    const dateKey = new Date().toISOString().slice(0, 13);
    const result = await getOrFetch(`fixtures:recent:${dateKey}`, TTL.HOUR2, async () => {
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const to = new Date();
      const rows = await db
        .select()
        .from(fixtures)
        .where(
          and(
            gte(fixtures.kickoff, from),
            lte(fixtures.kickoff, to),
            inArray(fixtures.statusShort, POST_STATUSES),
          )
        )
        .orderBy(desc(fixtures.kickoff))
        .limit(600);

      const leagueMap = new Map<number, { leagueId: number; leagueName: string | null; leagueLogo: string | null; fixtures: typeof rows }>();
      for (const row of rows) {
        if (!leagueMap.has(row.leagueId)) {
          leagueMap.set(row.leagueId, { leagueId: row.leagueId, leagueName: row.leagueName ?? null, leagueLogo: row.leagueLogo ?? null, fixtures: [] });
        }
        leagueMap.get(row.leagueId)!.fixtures.push(row);
      }
      return { leagues: Array.from(leagueMap.values()) };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.recent", error);
    return res.status(500).json({ error: "Failed to load recent fixtures" } satisfies ApiError);
  }
});

router.get("/fixtures/today", async (_req: Request, res: Response) => {
  try {
    const dateKey = new Date().toISOString().slice(0, 13); // cache per hour
    const result = await getOrFetch(`fixtures:upcoming:${dateKey}`, TTL.MIN1, async () => {
      const from = startOfDayUtc();
      const to = endOfDayUtc(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
      const rows = await db
        .select()
        .from(fixtures)
        .where(and(gte(fixtures.kickoff, from), lte(fixtures.kickoff, to)))
        .orderBy(asc(fixtures.kickoff))
        .limit(600);

      // Group by league
      const leagueMap = new Map<number, { leagueId: number; leagueName: string | null; leagueLogo: string | null; fixtures: typeof rows }>();
      for (const row of rows) {
        if (!leagueMap.has(row.leagueId)) {
          leagueMap.set(row.leagueId, { leagueId: row.leagueId, leagueName: row.leagueName ?? null, leagueLogo: row.leagueLogo ?? null, fixtures: [] });
        }
        leagueMap.get(row.leagueId)!.fixtures.push(row);
      }
      return { leagues: Array.from(leagueMap.values()) };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.today", error);
    return res
      .status(500)
      .json({ error: "Failed to load today's fixtures" } satisfies ApiError);
  }
});

router.get("/fixtures/top-picks", async (_req: Request, res: Response) => {
  try {
    const result = await getOrFetch("fixtures:top-picks", TTL.MIN1, async () => {
      const now = new Date();
      const rows = await db
        .select()
        .from(fixtures)
        .where(
          and(
            gte(fixtures.kickoff, now),
            inArray(fixtures.statusShort, ["NS", "TBD"]),
          ),
        )
        .orderBy(asc(fixtures.kickoff))
        .limit(20);
      return { ok: true, count: rows.length, items: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.topPicks", error);
    return res
      .status(500)
      .json({ error: "Failed to load top picks" } satisfies ApiError);
  }
});

router.get("/fixtures/followed", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.json({ fixtureIds: [] });
    const rows = await db
      .select({ fixtureId: followedFixtures.fixtureId })
      .from(followedFixtures)
      .where(eq(followedFixtures.userId, user.id));
    return res.json({ fixtureIds: rows.map(r => r.fixtureId) });
  } catch (err) {
    reqLogError("fixtures.followed", err);
    return res.json({ fixtureIds: [] });
  }
});

router.post("/fixtures/:id/follow", async (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

router.delete("/fixtures/:id/follow", async (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

router.get("/fixtures/:id", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const result = await getOrFetch(`fixture:${fixtureId}`, TTL.MIN1, async () => {
      const [fixtureRows, events, stats, lineups] = await Promise.all([
        db.select().from(fixtures).where(eq(fixtures.fixtureId, fixtureId)).limit(1),
        db.select().from(fixtureEvents).where(eq(fixtureEvents.fixtureId, fixtureId)),
        db.select().from(fixtureStats).where(eq(fixtureStats.fixtureId, fixtureId)),
        db.select().from(fixtureLineups).where(eq(fixtureLineups.fixtureId, fixtureId)),
      ]);
      const row = fixtureRows[0] ?? null;
      if (!row) return null;
      return { fixture: row, events, stats, lineups };
    });

    if (!result) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.byId", error);
    return res
      .status(500)
      .json({ error: "Failed to load fixture" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/features", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const result = await getOrFetch(`fixture:${fixtureId}:features`, TTL.MIN2, async () => {
      const rows = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.fixtureId, fixtureId))
        .limit(1);
      const row = rows[0] ?? null;
      if (!row) return null;
      return {
        fixtureId: row.fixtureId,
        kickoff: row.kickoff,
        statusShort: row.statusShort,
        leagueId: row.leagueId,
        leagueName: row.leagueName,
        seasonYear: row.seasonYear,
        homeTeamId: row.homeTeamId,
        homeTeamName: row.homeTeamName,
        awayTeamId: row.awayTeamId,
        awayTeamName: row.awayTeamName,
        venue: row.venue,
        venueCity: row.venueCity,
        referee: row.referee,
        weatherTemp: row.weatherTemp,
        weatherDesc: row.weatherDesc,
        weatherIcon: row.weatherIcon,
        weatherWind: row.weatherWind,
        weatherHumidity: row.weatherHumidity,
        weatherFetchedAt: row.weatherFetchedAt,
        updatedAt: row.updatedAt,
      };
    });

    if (!result) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    return res.json({ ok: true, item: result });
  } catch (error) {
    reqLogError("fixtures.features", error);
    return res
      .status(500)
      .json({ error: "Failed to load fixture features" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/signals", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const phase = typeof req.query.phase === "string" ? req.query.phase : null;
    const cacheKey = `fixture:${fixtureId}:signals:${phase ?? "all"}`;

    const result = await getOrFetch(cacheKey, TTL.MIN2, async () => {
      const conditions = [eq(fixtureSignals.fixtureId, fixtureId)];
      if (phase) conditions.push(eq(fixtureSignals.phase, phase));
      const rows = await db
        .select()
        .from(fixtureSignals)
        .where(and(...conditions))
        .orderBy(asc(fixtureSignals.triggeredAt));
      return { signals: rows };
    });

    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.signals", error);
    return res
      .status(500)
      .json({ error: "Failed to load fixture signals" } satisfies ApiError);
  }
});

router.get("/standings/leagues", async (_req: Request, res: Response) => {
  try {
    const result = await getOrFetch("standings:leagues", TTL.MIN10, async () => {
      const rows = await db
        .select({
          leagueId: fixtures.leagueId,
          leagueName: sql<string>`max(${fixtures.leagueName})`,
          leagueLogo: sql<string>`max(${fixtures.leagueLogo})`,
          fixtureCount: sql<number>`count(*)`,
        })
        .from(fixtures)
        .groupBy(fixtures.leagueId)
        .orderBy(desc(sql`count(*)`))
        .limit(100);
      return { leagues: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("standings.leagues", error);
    return res
      .status(500)
      .json({ error: "Failed to load leagues" } satisfies ApiError);
  }
});

router.get("/standings/:leagueId", async (req: Request, res: Response) => {
  try {
    const leagueId = Number(req.params.leagueId);

    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      return badRequest(res, "Invalid league id");
    }

    const result = await getOrFetch(`standings:league:${leagueId}`, TTL.MIN10, async () => {
      const rows = await db
        .select()
        .from(standings)
        .where(eq(standings.leagueId, leagueId))
        .orderBy(asc(standings.rank))
        .limit(25);
      return { standings: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("standings.byLeague", error);
    return res
      .status(500)
      .json({ error: "Failed to load standings league data" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/odds", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return badRequest(res, "Invalid fixture id");

    const result = await getOrFetch(`fixture:${fixtureId}:odds`, TTL.MIN2, async () => {
      const rows = await db
        .select()
        .from(oddsSnapshots)
        .where(eq(oddsSnapshots.fixtureId, fixtureId))
        .orderBy(desc(oddsSnapshots.snappedAt))
        .limit(1);
      return { odds: rows[0] ?? null };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.odds", error);
    return res.status(500).json({ error: "Failed to load fixture odds" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/live-odds", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return badRequest(res, "Invalid fixture id");

    const result = await getOrFetch(`fixture:${fixtureId}:live-odds`, TTL.S30, async () => {
      const rows = await db
        .select()
        .from(liveOddsSnapshots)
        .where(eq(liveOddsSnapshots.fixtureId, fixtureId))
        .orderBy(desc(liveOddsSnapshots.snappedAt))
        .limit(20);
      return { liveOdds: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.liveOdds", error);
    return res.status(500).json({ error: "Failed to load live odds" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/odds-markets", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return badRequest(res, "Invalid fixture id");

    const result = await getOrFetch(`fixture:${fixtureId}:odds-markets`, TTL.MIN2, async () => {
      const rows = await db
        .select()
        .from(oddsMarkets)
        .where(eq(oddsMarkets.fixtureId, fixtureId))
        .orderBy(desc(oddsMarkets.snappedAt))
        .limit(5);
      return { oddsMarkets: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.oddsMarkets", error);
    return res.status(500).json({ error: "Failed to load odds markets" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/h2h", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return badRequest(res, "Invalid fixture id");

    const result = await getOrFetch(`fixture:${fixtureId}:h2h`, TTL.MIN10, async () => {
      const [fix] = await db
        .select({ homeTeamId: fixtures.homeTeamId, awayTeamId: fixtures.awayTeamId })
        .from(fixtures)
        .where(eq(fixtures.fixtureId, fixtureId))
        .limit(1);
      if (!fix) return { h2h: [] };

      const rows = await db
        .select()
        .from(h2hFixtures)
        .where(
          or(
            and(eq(h2hFixtures.forTeam1Id, fix.homeTeamId), eq(h2hFixtures.forTeam2Id, fix.awayTeamId)),
            and(eq(h2hFixtures.forTeam1Id, fix.awayTeamId), eq(h2hFixtures.forTeam2Id, fix.homeTeamId)),
          ),
        )
        .orderBy(desc(h2hFixtures.kickoff))
        .limit(20);
      return { h2h: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.h2h", error);
    return res.status(500).json({ error: "Failed to load H2H data" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/intel", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return badRequest(res, "Invalid fixture id");

    const result = await getOrFetch(`fixture:${fixtureId}:intel`, TTL.MIN10, async () => {
      const [fix] = await db
        .select({ homeTeamId: fixtures.homeTeamId, awayTeamId: fixtures.awayTeamId })
        .from(fixtures).where(eq(fixtures.fixtureId, fixtureId)).limit(1);
      if (!fix) return null;

      const [predRows, homeCoachRows, awayCoachRows, homeSidelinedRows, awaySidelinedRows, scorers, assists, homeTrophyRows, awayTrophyRows] = await Promise.all([
        db.select().from(predictions).where(eq(predictions.fixtureId, fixtureId)).limit(1),
        db.select({ name: coaches.name, nationality: coaches.nationality, age: coaches.age }).from(coaches).where(eq(coaches.teamId, fix.homeTeamId)).limit(1),
        db.select({ name: coaches.name, nationality: coaches.nationality, age: coaches.age }).from(coaches).where(eq(coaches.teamId, fix.awayTeamId)).limit(1),
        db.select({ playerName: sidelinedPlayers.playerName, type: sidelinedPlayers.type, startDate: sidelinedPlayers.startDate, endDate: sidelinedPlayers.endDate })
          .from(sidelinedPlayers).where(eq(sidelinedPlayers.teamId, fix.homeTeamId)).limit(10),
        db.select({ playerName: sidelinedPlayers.playerName, type: sidelinedPlayers.type, startDate: sidelinedPlayers.startDate, endDate: sidelinedPlayers.endDate })
          .from(sidelinedPlayers).where(eq(sidelinedPlayers.teamId, fix.awayTeamId)).limit(10),
        db.select({ playerName: playerSeasonStats.playerName, teamId: playerSeasonStats.teamId, goals: playerSeasonStats.goals, assists: playerSeasonStats.assists, appearances: playerSeasonStats.appearances, rating: playerSeasonStats.rating })
          .from(playerSeasonStats).where(inArray(playerSeasonStats.teamId, [fix.homeTeamId, fix.awayTeamId])).orderBy(desc(playerSeasonStats.goals)).limit(10),
        db.select({ playerName: playerSeasonStats.playerName, teamId: playerSeasonStats.teamId, goals: playerSeasonStats.goals, assists: playerSeasonStats.assists, appearances: playerSeasonStats.appearances })
          .from(playerSeasonStats).where(inArray(playerSeasonStats.teamId, [fix.homeTeamId, fix.awayTeamId])).orderBy(desc(playerSeasonStats.assists)).limit(10),
        db.select({ leagueName: trophies.leagueName, place: trophies.place, season: trophies.season }).from(trophies).where(eq(trophies.teamId, fix.homeTeamId)).limit(10),
        db.select({ leagueName: trophies.leagueName, place: trophies.place, season: trophies.season }).from(trophies).where(eq(trophies.teamId, fix.awayTeamId)).limit(10),
      ]);

      const pred = predRows[0] ?? null;
      return {
        // All prediction fields (both naming conventions for different UI components)
        prediction: pred ? {
          homeWinPercent: pred.homeWinPercent, drawPercent: pred.drawPercent, awayWinPercent: pred.awayWinPercent,
          homeWinPct: pred.homeWinPercent, drawPct: pred.drawPercent, awayWinPct: pred.awayWinPercent,
          goalsHome: pred.goalsHome, goalsAway: pred.goalsAway,
          adviceText: pred.adviceText, advice: pred.adviceText, winner: pred.winner,
        } : null,
        homeCoach: homeCoachRows[0] ?? null,
        awayCoach: awayCoachRows[0] ?? null,
        homeSidelined: homeSidelinedRows.map(r => ({ ...r, reason: r.type })),
        awaySidelined: awaySidelinedRows.map(r => ({ ...r, reason: r.type })),
        topScorers: scorers,
        topAssists: assists,
        homeTrophies: homeTrophyRows,
        awayTrophies: awayTrophyRows,
      };
    });

    if (!result) return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.intel", error);
    return res.status(500).json({ error: "Failed to load fixture intel" } satisfies ApiError);
  }
});

router.get("/fixtures/:id/player-stats", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return badRequest(res, "Invalid fixture id");

    const result = await getOrFetch(`fixture:${fixtureId}:player-stats`, TTL.MIN10, async () => {
      const rows = await db.select().from(playerStatsTable).where(eq(playerStatsTable.fixtureId, fixtureId));
      return { playerStats: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("fixtures.playerStats", error);
    return res.status(500).json({ error: "Failed to load player stats" } satisfies ApiError);
  }
});

router.get("/teams/:id/statistics", async (req: Request, res: Response) => {
  try {
    const teamId = Number(req.params.id);
    if (!Number.isFinite(teamId) || teamId <= 0) return badRequest(res, "Invalid team id");
    const season = req.query.season ? Number(req.query.season) : null;

    const cacheKey = `team:${teamId}:statistics:${season ?? "all"}`;
    const result = await getOrFetch(cacheKey, TTL.MIN10, async () => {
      const conditions = [eq(teamSeasonStats.teamId, teamId)];
      if (season && Number.isFinite(season)) conditions.push(eq(teamSeasonStats.seasonYear, season));
      const rows = await db.select().from(teamSeasonStats).where(and(...conditions)).orderBy(desc(teamSeasonStats.seasonYear)).limit(5);
      return { statistics: rows };
    });
    return res.json(result);
  } catch (error) {
    reqLogError("teams.statistics", error);
    return res.status(500).json({ error: "Failed to load team statistics" } satisfies ApiError);
  }
});

router.get("/teams/:id/injuries", async (req: Request, res: Response) => {
  try {
    const teamId = Number(req.params.id);

    if (!Number.isFinite(teamId) || teamId <= 0) {
      return badRequest(res, "Invalid team id");
    }

    const rows = await db
      .select()
      .from(fixtures)
      .where(
        sql`${fixtures.homeTeamId} = ${teamId} OR ${fixtures.awayTeamId} = ${teamId}`,
      )
      .orderBy(desc(fixtures.kickoff))
      .limit(20);

    return res.json({
      ok: true,
      teamId,
      count: rows.length,
      items: rows,
      note: "Injury source table not yet wired. Returning recent fixtures for team as temporary fallback.",
    });
  } catch (error) {
    reqLogError("teams.injuries", error);
    return res
      .status(500)
      .json({ error: "Failed to load team injuries" } satisfies ApiError);
  }
});

export default router;
