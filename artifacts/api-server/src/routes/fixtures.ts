import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@workspace/db";
import { fixtures } from "@workspace/db/schema";

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
    const from = startOfDayUtc();
    const to = endOfDayUtc();

    const rows = await db
      .select()
      .from(fixtures)
      .where(and(gte(fixtures.kickoff, from), lte(fixtures.kickoff, to)))
      .orderBy(asc(fixtures.kickoff))
      .limit(200);

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
  } catch (error) {
    reqLogError("fixtures.today", error);
    return res
      .status(500)
      .json({ error: "Failed to load today's fixtures" } satisfies ApiError);
  }
});

router.get("/fixtures/top-picks", async (_req: Request, res: Response) => {
  try {
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

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
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

    const rows = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.fixtureId, fixtureId))
      .limit(1);

    const row = rows[0] ?? null;

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    return res.json({
      ok: true,
      item: row,
    });
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

    const rows = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.fixtureId, fixtureId))
      .limit(1);

    const row = rows[0] ?? null;

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    const features = {
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

    return res.json({
      ok: true,
      item: features,
    });
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

    const rows = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.fixtureId, fixtureId))
      .limit(1);

    const row = rows[0] ?? null;

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" } satisfies ApiError);
    }

    const now = Date.now();
    const kickoffTs = row.kickoff ? new Date(row.kickoff).getTime() : null;
    const minutesToKickoff =
      kickoffTs !== null ? Math.round((kickoffTs - now) / 60000) : null;

    const signals = {
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
    };

    return res.json({
      ok: true,
      item: signals,
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

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
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

    const rows = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.leagueId, leagueId))
      .orderBy(desc(fixtures.kickoff))
      .limit(100);

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
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
