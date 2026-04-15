import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@workspace/db/src";
import { fixtures } from "@workspace/db/src/schema";

const router = Router();

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE", "SUSP"];
const UPCOMING_STATUSES = ["NS", "TBD"];

function badRequest(res: any, message: string) {
  return res.status(400).json({ error: message });
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildFixtureAnalysis(row: typeof fixtures.$inferSelect) {
  const kickoff = row.kickoff ? new Date(row.kickoff) : null;
  const now = new Date();

  const minutesToKickoff =
    kickoff && row.statusShort && UPCOMING_STATUSES.includes(row.statusShort)
      ? Math.round((kickoff.getTime() - now.getTime()) / 60000)
      : null;

  const isLive = Boolean(row.statusShort && LIVE_STATUSES.includes(row.statusShort));
  const isUpcoming = Boolean(row.statusShort && UPCOMING_STATUSES.includes(row.statusShort));

  const weatherRisk =
    row.weatherWind && safeNumber(row.weatherWind) !== null && safeNumber(row.weatherWind)! >= 10
      ? "medium"
      : row.weatherHumidity && safeNumber(row.weatherHumidity) !== null && safeNumber(row.weatherHumidity)! >= 85
        ? "medium"
        : "low";

  const analysisFlags = {
    hasWeather: Boolean(row.weatherFetchedAt),
    hasReferee: Boolean(row.referee),
    isLive,
    isUpcoming,
    weatherRisk,
    minutesToKickoff,
  };

  const context = {
    fixtureId: row.fixtureId,
    leagueId: row.leagueId,
    leagueName: row.leagueName,
    seasonYear: row.seasonYear,
    kickoff: row.kickoff,
    statusShort: row.statusShort,
    homeTeamId: row.homeTeamId,
    homeTeamName: row.homeTeamName,
    awayTeamId: row.awayTeamId,
    awayTeamName: row.awayTeamName,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    venue: row.venue,
    venueCity: row.venueCity,
    referee: row.referee,
    weatherTemp: row.weatherTemp,
    weatherDesc: row.weatherDesc,
    weatherWind: row.weatherWind,
    weatherHumidity: row.weatherHumidity,
    updatedAt: row.updatedAt,
  };

  const summary = {
    title: `${row.homeTeamName} vs ${row.awayTeamName}`,
    phase: isLive ? "live" : isUpcoming ? "prematch" : "postmatch_or_unknown",
    note:
      isLive
        ? "Fixture is currently live. Treat any derived betting or model outputs as time-sensitive."
        : isUpcoming
          ? "Fixture is upcoming. Prematch signals can be refreshed closer to kickoff."
          : "Fixture is not upcoming/live. Use with care for prematch experiences.",
  };

  return {
    summary,
    flags: analysisFlags,
    context,
  };
}

router.get("/analysis/:id", async (req, res) => {
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
      item: buildFixtureAnalysis(row),
    });
  } catch (error) {
    console.error("[routes:analysis.byId]", error);
    return res.status(500).json({ error: "Failed to load fixture analysis" });
  }
});

router.get("/analysis/upcoming", async (_req, res) => {
  try {
    const now = new Date();

    const rows = await db
      .select()
      .from(fixtures)
      .where(
        and(
          gte(fixtures.kickoff, now),
          inArray(fixtures.statusShort, UPCOMING_STATUSES),
        ),
      )
      .orderBy(asc(fixtures.kickoff))
      .limit(25);

    return res.json({
      ok: true,
      count: rows.length,
      items: rows.map(buildFixtureAnalysis),
    });
  } catch (error) {
    console.error("[routes:analysis.upcoming]", error);
    return res.status(500).json({ error: "Failed to load upcoming analysis" });
  }
});

router.get("/analysis/live", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(fixtures)
      .where(inArray(fixtures.statusShort, LIVE_STATUSES))
      .orderBy(desc(fixtures.kickoff))
      .limit(25);

    return res.json({
      ok: true,
      count: rows.length,
      items: rows.map(buildFixtureAnalysis),
    });
  } catch (error) {
    console.error("[routes:analysis.live]", error);
    return res.status(500).json({ error: "Failed to load live analysis" });
  }
});

router.get("/analysis/window", async (req, res) => {
  try {
    const fromRaw = String(req.query.from ?? "");
    const toRaw = String(req.query.to ?? "");

    if (!fromRaw || !toRaw) {
      return badRequest(res, "Query params 'from' and 'to' are required");
    }

    const from = new Date(fromRaw);
    const to = new Date(toRaw);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return badRequest(res, "Invalid date range");
    }

    if (from > to) {
      return badRequest(res, "'from' must be before 'to'");
    }

    const rows = await db
      .select()
      .from(fixtures)
      .where(and(gte(fixtures.kickoff, from), lte(fixtures.kickoff, to)))
      .orderBy(asc(fixtures.kickoff))
      .limit(200);

    return res.json({
      ok: true,
      count: rows.length,
      items: rows.map(buildFixtureAnalysis),
    });
  } catch (error) {
    console.error("[routes:analysis.window]", error);
    return res.status(500).json({ error: "Failed to load analysis window" });
  }
});

export default router;
