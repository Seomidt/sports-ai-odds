import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";

import { db } from "@workspace/db";
import { aiBettingTips, fixtures } from "@workspace/db/schema";
import { getOrFetch, TTL } from "../lib/routeCache.js";

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

    const result = await getOrFetch(`analysis:${fixtureId}`, TTL.MIN1, async () => {
      const row = await db.query.fixtures.findFirst({
        where: eq(fixtures.fixtureId, fixtureId),
      });
      return row ? buildFixtureAnalysis(row) : null;
    });

    if (!result) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    return res.json({ ok: true, item: result });
  } catch (error) {
    console.error("[routes:analysis.byId]", error);
    return res.status(500).json({ error: "Failed to load fixture analysis" });
  }
});

router.get("/analysis/upcoming", async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:upcoming", TTL.MIN1, async () => {
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
      return { ok: true, count: rows.length, items: rows.map(buildFixtureAnalysis) };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.upcoming]", error);
    return res.status(500).json({ error: "Failed to load upcoming analysis" });
  }
});

router.get("/analysis/live", async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:live", TTL.S30, async () => {
      const rows = await db
        .select()
        .from(fixtures)
        .where(inArray(fixtures.statusShort, LIVE_STATUSES))
        .orderBy(desc(fixtures.kickoff))
        .limit(25);
      return { ok: true, count: rows.length, items: rows.map(buildFixtureAnalysis) };
    });
    return res.json(result);
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

// ── Value odds — upcoming AI tips sorted by edge/value ───────────────────────

router.get("/analysis/value-odds", async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:value-odds", TTL.MIN1, async () => {
      const now = new Date();
      const tips = await db
        .select()
        .from(aiBettingTips)
        .where(
          and(
            gte(aiBettingTips.kickoff, now),
            isNotNull(aiBettingTips.edge),
          ),
        )
        .orderBy(
          desc(aiBettingTips.edge),
          desc(aiBettingTips.trustScore),
        )
        .limit(100);

      // Add computed fields for frontend sorting/display
      const enriched = tips.map((t) => {
        const valueScore =
          t.valueRating === "strong_value" ? 4
          : t.valueRating === "value" ? 3
          : t.valueRating === "fair" ? 2
          : 1;
        const combinedScore = (t.edge ?? 0) * 10 + (t.trustScore ?? 0) / 10;
        return { ...t, valueScore, combinedScore };
      });

      return { tips: enriched };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.valueOdds]", error);
    return res.status(500).json({ error: "Failed to load value odds" });
  }
});

// ── AI accuracy — reviewed tips hit rate ─────────────────────────────────────

router.get("/analysis/accuracy", async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:accuracy", TTL.MIN10, async () => {
      const [row] = await db
        .select({
          reviewed: sql<number>`count(*) filter (where ${aiBettingTips.outcome} is not null)`,
          hits: sql<number>`count(*) filter (where ${aiBettingTips.outcome} = 'hit')`,
        })
        .from(aiBettingTips);

      const reviewed = Number(row?.reviewed ?? 0);
      const hits = Number(row?.hits ?? 0);
      const hitRate = reviewed > 0 ? Math.round((hits / reviewed) * 100) : null;

      return { hitRate, reviewed, hits };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.accuracy]", error);
    return res.status(500).json({ error: "Failed to load accuracy" });
  }
});

// ── Daily summary — today picks, yesterday results, streak, ROI ───────────────

router.get("/analysis/daily-summary", async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:daily-summary", TTL.MIN5, async () => {
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const yesterdayStart = new Date(todayStart.getTime() - 86400_000);
      const yesterdayEnd = new Date(todayStart.getTime() - 1);

      const [todayPicks, yesterdayTips, yesterdayFixtures, allReviewed] = await Promise.all([
        // Today's tips
        db.select({
          id: aiBettingTips.id,
          fixtureId: aiBettingTips.fixtureId,
          homeTeam: aiBettingTips.homeTeam,
          awayTeam: aiBettingTips.awayTeam,
          kickoff: aiBettingTips.kickoff,
          leagueName: aiBettingTips.leagueName,
          recommendation: aiBettingTips.recommendation,
          betType: aiBettingTips.betType,
          trustScore: aiBettingTips.trustScore,
          marketOdds: aiBettingTips.marketOdds,
          valueRating: aiBettingTips.valueRating,
          edge: aiBettingTips.edge,
        })
          .from(aiBettingTips)
          .where(and(gte(aiBettingTips.kickoff, todayStart), lte(aiBettingTips.kickoff, todayEnd)))
          .orderBy(desc(aiBettingTips.edge)),

        // Yesterday's tips with outcome
        db.select({
          id: aiBettingTips.id,
          fixtureId: aiBettingTips.fixtureId,
          homeTeam: aiBettingTips.homeTeam,
          awayTeam: aiBettingTips.awayTeam,
          kickoff: aiBettingTips.kickoff,
          leagueName: aiBettingTips.leagueName,
          recommendation: aiBettingTips.recommendation,
          betType: aiBettingTips.betType,
          trustScore: aiBettingTips.trustScore,
          marketOdds: aiBettingTips.marketOdds,
          valueRating: aiBettingTips.valueRating,
          edge: aiBettingTips.edge,
          outcome: aiBettingTips.outcome,
          reviewHeadline: aiBettingTips.reviewHeadline,
        })
          .from(aiBettingTips)
          .where(and(gte(aiBettingTips.kickoff, yesterdayStart), lte(aiBettingTips.kickoff, yesterdayEnd)))
          .orderBy(desc(aiBettingTips.trustScore)),

        // Yesterday's fixtures without tips (uncovered)
        db.select({
          fixtureId: fixtures.fixtureId,
          homeTeam: fixtures.homeTeamName,
          awayTeam: fixtures.awayTeamName,
          kickoff: fixtures.kickoff,
          leagueName: fixtures.leagueName,
          statusShort: fixtures.statusShort,
        })
          .from(fixtures)
          .where(and(gte(fixtures.kickoff, yesterdayStart), lte(fixtures.kickoff, yesterdayEnd)))
          .limit(50),

        // All reviewed tips for streak/ROI
        db.select({
          outcome: aiBettingTips.outcome,
          marketOdds: aiBettingTips.marketOdds,
          reviewedAt: aiBettingTips.reviewedAt,
        })
          .from(aiBettingTips)
          .where(isNotNull(aiBettingTips.outcome))
          .orderBy(desc(aiBettingTips.reviewedAt))
          .limit(200),
      ]);

      // Uncovered = fixtures yesterday with no tip
      const coveredIds = new Set(yesterdayTips.map((t) => t.fixtureId));
      const yesterdayUncovered = yesterdayFixtures
        .filter((f) => !coveredIds.has(f.fixtureId))
        .map((f) => ({
          fixtureId: f.fixtureId,
          homeTeam: f.homeTeam ?? "",
          awayTeam: f.awayTeam ?? "",
          kickoff: f.kickoff?.toISOString() ?? "",
          leagueName: f.leagueName,
          statusShort: f.statusShort,
        }));

      // Yesterday results
      const wins = yesterdayTips.filter((t) => t.outcome === "hit").length;
      const losses = yesterdayTips.filter((t) => t.outcome === "miss").length;
      const pushes = yesterdayTips.filter((t) => t.outcome === "partial").length;
      const pending = yesterdayTips.filter((t) => !t.outcome).length;

      // Win streak (from most recent reviewed tips)
      let streakCount = 0;
      let streakType: "win" | "loss" | "none" = "none";
      for (const t of allReviewed) {
        if (streakCount === 0) {
          streakType = t.outcome === "hit" ? "win" : "loss";
          streakCount = 1;
        } else if ((streakType === "win" && t.outcome === "hit") || (streakType === "loss" && t.outcome === "miss")) {
          streakCount++;
        } else {
          break;
        }
      }
      const badge =
        streakType === "win" && streakCount >= 10 ? "elite"
        : streakType === "win" && streakCount >= 7 ? "hot"
        : streakType === "win" && streakCount >= 3 ? "warming"
        : null;

      // ROI (all reviewed)
      let netReturn = 0;
      for (const t of allReviewed) {
        if (t.outcome === "hit") netReturn += (t.marketOdds ?? 2) - 1;
        else if (t.outcome === "miss") netReturn -= 1;
      }
      const totalBets = allReviewed.length;
      const roi = { total: totalBets, totalBets, netReturn: Math.round(netReturn * 100) / 100 };

      return {
        todayPicks,
        yesterdayTips,
        yesterdayUncovered,
        yesterdayResults: { wins, losses, pushes, total: yesterdayTips.length, pending },
        streak: { current: streakCount, type: streakType, badge },
        roi,
      };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.dailySummary]", error);
    return res.status(500).json({ error: "Failed to load daily summary" });
  }
});

export default router;
