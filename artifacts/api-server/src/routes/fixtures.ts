import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@workspace/db/src";
import {
  fixtures,
} from "@workspace/db/src/schema";

const router = Router();

function startOfDayUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function badRequest(res: any, message: string) {
  return res.status(400).json({ error: message });
}

router.get("/fixtures/today", async (_req, res) => {
  try {
    const from = startOfDayUtc();
    const to = endOfDayUtc();

    const rows = await db
      .select()
      .from(fixtures)
      .where(
        and(
          gte(fixtures.kickoff, from),
          lte(fixtures.kickoff, to),
        ),
      )
      .orderBy(asc(fixtures.kickoff))
      .limit(200);

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
  } catch (error) {
    reqLogError("fixtures.today", error);
    return res.status(500).json({ error: "Failed to load today's fixtures" });
  }
});

router.get("/fixtures/top-picks", async (_req, res) => {
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
    return res.status(500).json({ error: "Failed to load top picks" });
  }
});

router.get("/fixtures/:id", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const row = await db.query.fixtures.findFirst({
      where: eq(fixtures.fixtureId, fixtureId),
    });

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    return res.json({
      ok: true,
      item: row,
    });
  } catch (error) {
    reqLogError("fixtures.byId", error);
    return res.status(500).json({ error: "Failed to load fixture" });
  }
});

router.get("/fixtures/:id/features", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const row = await db.query.fixtures.findFirst({
      where: eq(fixtures.fixtureId, fixtureId),
    });

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" });
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
    return res.status(500).json({ error: "Failed to load fixture features" });
  }
});

router.get("/fixtures/:id/signals", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);

    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return badRequest(res, "Invalid fixture id");
    }

    const row = await db.query.fixtures.findFirst({
      where: eq(fixtures.fixtureId, fixtureId),
    });

    if (!row) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const now = Date.now();
    const kickoffTs = row.kickoff ? new Date(row.kickoff).getTime() : null;
    const minutesToKickoff = kickoffTs ? Math.round((kickoffTs - now) / 60000) : null;

    const signals = {
      fixtureId: row.fixtureId,
      statusShort: row.statusShort,
      isUpcoming: row.statusShort === "NS" || row.statusShort === "TBD",
      isLive: ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE", "SUSP"].includes(row.statusShort ?? ""),
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
    return res.status(500).json({ error: "Failed to load fixture signals" });
  }
});

router.get("/standings/leagues", async (_req, res) => {
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
    return res.status(500).json({ error: "Failed to load leagues" });
  }
});

router.get("/standings/:leagueId", async (req, res) => {
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
    return res.status(500).json({ error: "Failed to load standings league data" });
  }
});

router.get("/teams/:id/injuries", async (req, res) => {
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
    return res.status(500).json({ error: "Failed to load team injuries" });
  }
});

function reqLogError(scope: string, error: unknown) {
  console.error(`[routes:${scope}]`, error);
}

export default router;
