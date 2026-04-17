import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@workspace/db";
import { fixtures, standings } from "@workspace/db/schema";
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

router.get("/fixtures/today", async (_req: Request, res: Response) => {
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    const result = await getOrFetch(`fixtures:today:${dateKey}`, TTL.MIN1, async () => {
      const from = startOfDayUtc();
      const to = endOfDayUtc();
      const rows = await db
        .select()
        .from(fixtures)
        .where(and(gte(fixtures.kickoff, from), lte(fixtures.kickoff, to)))
        .orderBy(asc(fixtures.kickoff))
        .limit(200);

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

router.get("/fixtures/:id", async (req: Request, res: Response) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const result = await getOrFetch(`fixture:${fixtureId}`, TTL.MIN1, async () => {
      const rows = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.fixtureId, fixtureId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!result) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    return res.json({ ok: true, item: result });
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

    const row = await getOrFetch(`fixture:${fixtureId}`, TTL.MIN1, async () => {
      const rows = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.fixtureId, fixtureId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    const now = Date.now();
    const kickoffTs = row.kickoff ? new Date(row.kickoff).getTime() : null;
    const minutesToKickoff =
      kickoffTs !== null ? Math.round((kickoffTs - now) / 60000) : null;

    return res.json({
      ok: true,
      item: {
        fixtureId: row.fixtureId,
        statusShort: row.statusShort,
        isUpcoming: row.statusShort === "NS" || row.statusShort === "TBD",
        isLive: ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE", "SUSP"].includes(
          row.statusShort ?? "",
        ),
        hasWeather: Boolean(row.weatherFetchedAt),
        hasReferee: Boolean(row.referee),
        minutesToKickoff,
        homeGoals: row.homeGoals,
        awayGoals: row.awayGoals,
        updatedAt: row.updatedAt,
      },
    });
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
          leagueName: fixtures.leagueName,
          leagueLogo: fixtures.leagueLogo,
          seasonYear: fixtures.seasonYear,
          fixtureCount: sql<number>`count(*)`,
        })
        .from(fixtures)
        .groupBy(
          fixtures.leagueId,
          fixtures.leagueName,
          fixtures.leagueLogo,
          fixtures.seasonYear,
        )
        .orderBy(desc(sql`count(*)`), asc(fixtures.leagueName))
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
