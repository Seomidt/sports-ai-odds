import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@workspace/db";
import { aiBettingTips, fixtures, prematchSyntheses, standings, newsArticles, predictionReviews } from "@workspace/db/schema";
import { getOrFetch, TTL } from "../lib/routeCache.js";
import { generateLeagueNews, getLiveAnalysis } from "../ai/analysisLayer.js";
import { filterPublishableTips } from "../ai/publishFilter.js";
import { getPlanForRequest, requirePlan } from "../middlewares/requirePlan.js";
import { TRACKED_LEAGUES } from "../ingestion/apiFootballClient.js";

const TRACKED_LEAGUE_IDS = TRACKED_LEAGUES.map((l) => l.id);

const router = Router();

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE", "SUSP"];
const UPCOMING_STATUSES = ["NS", "TBD"];

function badRequest(res: any, message: string) {
  return res.status(400).json({ error: message });
}

// Fase 2.1 — Free plan sees only low-confidence or non-primary-market tips,
// and only after a 24h delay. Pro sees everything.
const PRIMARY_MARKETS = new Set(["match_result", "over_under_2_5", "btts"]);
const FREE_DELAY_MS = 24 * 60 * 60 * 1000;

function applyFreePlanGate<T extends { confidence?: string | null; betType?: string | null; createdAt?: Date | string | null }>(
  tips: T[],
): T[] {
  const cutoff = Date.now() - FREE_DELAY_MS;
  return tips.filter((t) => {
    const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (created > cutoff) return false;
    const isPrimary = t.betType ? PRIMARY_MARKETS.has(t.betType) : false;
    if (!isPrimary) return true;
    return t.confidence === "low";
  });
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

router.get("/analysis/value-odds", async (req, res) => {
  try {
    const { plan } = await getPlanForRequest(req);
    const result = await getOrFetch("analysis:value-odds", TTL.MIN1, async () => {
      const now = new Date();
      const rawTips = await db
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
        .limit(200);

      const tips = filterPublishableTips(
        rawTips.map((t) => ({
          ...t,
          featureSnapshot: (t.featureSnapshot ?? null) as Record<string, unknown> | null,
        }))
      ).slice(0, 100);

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
    const filtered = plan === "pro" ? result.tips : applyFreePlanGate(result.tips);
    return res.json({ ...result, tips: filtered, plan });
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

      const [todayPicksRaw, yesterdayTipsRaw, yesterdayFixtures, allReviewedRaw] = await Promise.all([
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
          aiProbability: aiBettingTips.aiProbability,
          impliedProbability: aiBettingTips.impliedProbability,
          confidence: aiBettingTips.confidence,
          featureSnapshot: aiBettingTips.featureSnapshot,
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
          aiProbability: aiBettingTips.aiProbability,
          impliedProbability: aiBettingTips.impliedProbability,
          confidence: aiBettingTips.confidence,
          featureSnapshot: aiBettingTips.featureSnapshot,
          outcome: aiBettingTips.outcome,
          reviewHeadline: aiBettingTips.reviewHeadline,
        })
          .from(aiBettingTips)
          .where(and(gte(aiBettingTips.kickoff, yesterdayStart), lte(aiBettingTips.kickoff, yesterdayEnd)))
          .orderBy(desc(aiBettingTips.trustScore)),

        // Yesterday's fixtures without tips (uncovered) — only tracked leagues
        db.select({
          fixtureId: fixtures.fixtureId,
          homeTeam: fixtures.homeTeamName,
          awayTeam: fixtures.awayTeamName,
          kickoff: fixtures.kickoff,
          leagueName: fixtures.leagueName,
          statusShort: fixtures.statusShort,
        })
          .from(fixtures)
          .where(and(
            gte(fixtures.kickoff, yesterdayStart),
            lte(fixtures.kickoff, yesterdayEnd),
            inArray(fixtures.leagueId, TRACKED_LEAGUE_IDS),
          ))
          .limit(50),

        // All reviewed tips for streak/ROI
        db.select({
          outcome: aiBettingTips.outcome,
          marketOdds: aiBettingTips.marketOdds,
          reviewedAt: aiBettingTips.reviewedAt,
          betType: aiBettingTips.betType,
          edge: aiBettingTips.edge,
          confidence: aiBettingTips.confidence,
          featureSnapshot: aiBettingTips.featureSnapshot,
        })
          .from(aiBettingTips)
          .where(isNotNull(aiBettingTips.outcome))
          .orderBy(desc(aiBettingTips.reviewedAt))
          .limit(500),
      ]);

      // Today's picks: apply publish filter so only quality tips are shown.
      const toPublishable = <T extends { betType: string; edge: number | null; confidence: string | null; featureSnapshot: unknown }>(rows: T[]) =>
        filterPublishableTips(
          rows.map((r) => ({
            ...r,
            featureSnapshot: (r.featureSnapshot ?? null) as Record<string, unknown> | null,
          })),
        );
      const todayPicks = toPublishable(todayPicksRaw);

      // Yesterday + allReviewed: only count tips where we had genuine edge (value+).
      // This ensures hit rate and ROI reflect actual "played" picks, not all generated tips.
      const VALUE_RATINGS = new Set(["value", "strong_value"]);
      const mapSnapshot = <T extends { featureSnapshot: unknown }>(rows: T[]) =>
        rows.map((r) => ({ ...r, featureSnapshot: (r.featureSnapshot ?? null) as Record<string, unknown> | null }));
      const yesterdayTips = mapSnapshot(yesterdayTipsRaw).filter((t) =>
        VALUE_RATINGS.has((t as { valueRating: string }).valueRating) &&
        (t as { marketOdds: number | null }).marketOdds != null
      );
      const allReviewed = mapSnapshot(allReviewedRaw).filter((t) =>
        VALUE_RATINGS.has((t as { valueRating: string }).valueRating) &&
        (t as { marketOdds: number | null }).marketOdds != null
      ).slice(0, 200);

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

      // ROI (all reviewed) — total = percentage ROI on 1-unit stake per tip
      let netReturn = 0;
      let stakedBets = 0;
      for (const t of allReviewed) {
        if (t.outcome === "hit") {
          netReturn += (t.marketOdds ?? 2) - 1;
          stakedBets++;
        } else if (t.outcome === "miss") {
          netReturn -= 1;
          stakedBets++;
        }
      }
      const totalBets = allReviewed.length;
      const roiPct = stakedBets > 0 ? Math.round((netReturn / stakedBets) * 100) : 0;
      const roi = { total: roiPct, totalBets, netReturn: Math.round(netReturn * 100) / 100 };

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

// ── Prematch tips — all upcoming tips grouped by fixtureId ───────────────────

router.get("/analysis/prematch-tips", async (req, res) => {
  try {
    const { plan } = await getPlanForRequest(req);
    const result = await getOrFetch("analysis:prematch-tips", TTL.MIN5, async () => {
      const now = new Date();
      const rawTips = await db
        .select({
          id: aiBettingTips.id,
          fixtureId: aiBettingTips.fixtureId,
          betType: aiBettingTips.betType,
          betSide: aiBettingTips.betSide,
          recommendation: aiBettingTips.recommendation,
          trustScore: aiBettingTips.trustScore,
          aiProbability: aiBettingTips.aiProbability,
          impliedProbability: aiBettingTips.impliedProbability,
          confidence: aiBettingTips.confidence,
          edge: aiBettingTips.edge,
          marketOdds: aiBettingTips.marketOdds,
          valueRating: aiBettingTips.valueRating,
          featureSnapshot: aiBettingTips.featureSnapshot,
          createdAt: aiBettingTips.createdAt,
        })
        .from(aiBettingTips)
        .where(gte(aiBettingTips.kickoff, now))
        .orderBy(desc(aiBettingTips.trustScore));

      const tips = filterPublishableTips(
        rawTips.map((t) => ({
          ...t,
          featureSnapshot: (t.featureSnapshot ?? null) as Record<string, unknown> | null,
        }))
      );

      const grouped: Record<number, typeof tips> = {};
      for (const tip of tips) {
        if (!grouped[tip.fixtureId]) grouped[tip.fixtureId] = [];
        grouped[tip.fixtureId].push(tip);
      }

      return { tips: grouped, flat: tips };
    });
    if (plan === "pro") {
      return res.json({ tips: result.tips, plan });
    }
    const gated = applyFreePlanGate(result.flat);
    const grouped: Record<number, typeof gated> = {};
    for (const tip of gated) {
      if (!grouped[tip.fixtureId]) grouped[tip.fixtureId] = [];
      grouped[tip.fixtureId].push(tip);
    }
    return res.json({ tips: grouped, plan });
  } catch (error) {
    console.error("[routes:analysis.prematchTips]", error);
    return res.status(500).json({ error: "Failed to load prematch tips" });
  }
});

// ── Postmatch tips — resolved tips from the last 7 days grouped by fixtureId ──

router.get("/analysis/postmatch-tips", async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:postmatch-tips", TTL.MIN5, async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const rawTips = await db
        .select({
          id: aiBettingTips.id,
          fixtureId: aiBettingTips.fixtureId,
          betType: aiBettingTips.betType,
          recommendation: aiBettingTips.recommendation,
          trustScore: aiBettingTips.trustScore,
          marketOdds: aiBettingTips.marketOdds,
          outcome: aiBettingTips.outcome,
          reviewHeadline: aiBettingTips.reviewHeadline,
          confidence: aiBettingTips.confidence,
        })
        .from(aiBettingTips)
        .where(
          and(
            lt(aiBettingTips.kickoff, now),
            gte(aiBettingTips.kickoff, sevenDaysAgo),
          )
        )
        .orderBy(desc(aiBettingTips.trustScore));

      const grouped: Record<number, typeof rawTips> = {};
      for (const tip of rawTips) {
        if (!grouped[tip.fixtureId]) grouped[tip.fixtureId] = [];
        grouped[tip.fixtureId].push(tip);
      }
      return { tips: grouped };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.postmatchTips]", error);
    return res.status(500).json({ error: "Failed to load postmatch tips" });
  }
});

// ── Per-fixture live analysis ─────────────────────────────────────────────────

router.get("/analysis/:id/live", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ error: "Invalid fixture id" });
    }

    const result = await getOrFetch(`analysis:${fixtureId}:live`, TTL.S30, async () => {
      const row = await db.query.fixtures.findFirst({ where: eq(fixtures.fixtureId, fixtureId) });
      if (!row) return null;
      const analysis = buildFixtureAnalysis(row);
      // Only run the LLM when the fixture is actually live — otherwise return the stub
      if (!analysis.flags.isLive) {
        return {
          phase: analysis.summary.phase,
          headline: analysis.summary.title,
          narrative: analysis.summary.note,
          key_factors: [],
          momentum_verdict: null,
          alert_worthy: false,
        };
      }
      try {
        const ai = await getLiveAnalysis(fixtureId);
        return {
          phase: "live",
          headline: ai.headline || analysis.summary.title,
          narrative: ai.headline ? ai.narrative : "Live AI analysis is temporarily unavailable.",
          key_factors: ai.key_factors ?? [],
          momentum_verdict: ai.momentum_verdict ?? null,
          alert_worthy: ai.alert_worthy ?? false,
        };
      } catch (err) {
        console.error("[routes:analysis.liveById] AI failed, returning stub:", err);
        return {
          phase: "live",
          headline: analysis.summary.title,
          narrative: analysis.summary.note,
          key_factors: [],
          momentum_verdict: null,
          alert_worthy: false,
        };
      }
    });

    if (!result) return res.status(404).json({ error: "Fixture not found" });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.liveById]", error);
    return res.status(500).json({ error: "Failed to load live analysis" });
  }
});

// ── Post-match review — tips with outcomes for a completed fixture ─────────────

router.get("/analysis/:id/post-review", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ error: "Invalid fixture id" });
    }

    const result = await getOrFetch(`analysis:${fixtureId}:post-review`, TTL.MIN10, async () => {
      const reviews = await db
        .select()
        .from(aiBettingTips)
        .where(eq(aiBettingTips.fixtureId, fixtureId))
        .orderBy(desc(aiBettingTips.trustScore));
      return { reviews, review: reviews[0] ?? null };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.postReview]", error);
    return res.status(500).json({ error: "Failed to load post-review" });
  }
});

// ── Single fixture betting tip — used by Match page PRE-MATCH tab ─────────────

router.get("/analysis/:id/betting-tip", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ error: "Invalid fixture id" });
    }

    const result = await getOrFetch(`analysis:${fixtureId}:betting-tip`, TTL.MIN5, async () => {
      const tips = await db
        .select()
        .from(aiBettingTips)
        .where(eq(aiBettingTips.fixtureId, fixtureId))
        .orderBy(desc(aiBettingTips.trustScore));
      return { tips, tip: tips[0] ?? null };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.bettingTip]", error);
    return res.status(500).json({ error: "Failed to load betting tip" });
  }
});

// ── Pre-match synthesis — persisted AI match briefing ─────────────────────────

router.get("/analysis/:id/prematch-synthesis", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ error: "Invalid fixture id" });
    }

    const result = await getOrFetch(`analysis:${fixtureId}:prematch-synthesis`, TTL.MIN10, async () => {
      const [row] = await db
        .select()
        .from(prematchSyntheses)
        .where(eq(prematchSyntheses.fixtureId, fixtureId))
        .limit(1);
      return { synthesis: row ?? null };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.prematchSynthesis]", error);
    return res.status(500).json({ error: "Failed to load prematch synthesis" });
  }
});

// ── Single fixture AI tips ────────────────────────────────────────────────────

router.get("/analysis/:id/tips", async (req, res) => {
  try {
    const fixtureId = Number(req.params.id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ error: "Invalid fixture id" });
    }

    const result = await getOrFetch(`analysis:${fixtureId}:tips`, TTL.MIN5, async () => {
      const tips = await db
        .select()
        .from(aiBettingTips)
        .where(eq(aiBettingTips.fixtureId, fixtureId))
        .orderBy(desc(aiBettingTips.trustScore));
      return { tips };
    });
    return res.json(result);
  } catch (error) {
    console.error("[routes:analysis.tipsByFixture]", error);
    return res.status(500).json({ error: "Failed to load fixture tips" });
  }
});

// ── Single fixture analysis — must be last to avoid catching named routes ────

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

router.get("/news", async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId) || leagueId <= 0) {
    return res.status(400).json({ error: "leagueId required" });
  }

  try {
    const now = Date.now();
    const NEWS_TTL_MS = 24 * 60 * 60 * 1000;

    const existing = await db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.leagueId, leagueId))
      .orderBy(asc(newsArticles.rank))
      .limit(15);

    const freshArticles = existing.filter(a => (now - a.generatedAt.getTime()) < NEWS_TTL_MS);

    if (freshArticles.length >= 3) {
      return res.json({
        articles: freshArticles.map(a => ({
          id: `${a.leagueId}-${a.teamId}`,
          teamId: a.teamId,
          teamName: a.teamName,
          teamLogo: a.teamLogo,
          rank: a.rank,
          headline: a.headline,
          body: a.body,
          fixtureLine: a.fixtureLine ?? "",
          homeGoals: a.homeGoals,
          awayGoals: a.awayGoals,
          opponent: a.opponent ?? "",
          result: (a.result as "win" | "draw" | "loss" | "upcoming") ?? "upcoming",
          kickoff: a.kickoff?.toISOString() ?? null,
        })),
        generatedAt: freshArticles[0]!.generatedAt.toISOString(),
      });
    }

    const topTeamsRows = await db
      .select({
        teamId: standings.teamId,
        teamName: standings.teamName,
        teamLogo: standings.teamLogo,
        rank: standings.rank,
        points: standings.points,
      })
      .from(standings)
      .where(eq(standings.leagueId, leagueId))
      .orderBy(asc(standings.rank))
      .limit(10);

    if (topTeamsRows.length === 0) {
      return res.status(404).json({ error: "No standings data for this league", articles: [] });
    }

    const teamIds = topTeamsRows.map(t => t.teamId);

    const recentFixtures = await db
      .select()
      .from(fixtures)
      .where(
        and(
          inArray(fixtures.statusShort, ["FT", "AET", "PEN"]),
          or(inArray(fixtures.homeTeamId, teamIds), inArray(fixtures.awayTeamId, teamIds)),
        )
      )
      .orderBy(desc(fixtures.kickoff))
      .limit(100);

    const recentMatches: Array<{
      teamId: number; teamName: string; opponentName: string;
      homeGoals: number | null; awayGoals: number | null;
      isHome: boolean; kickoff: string | null; statusShort: string | null;
    }> = [];

    for (const f of recentFixtures) {
      if (f.homeTeamId && teamIds.includes(f.homeTeamId)) {
        recentMatches.push({
          teamId: f.homeTeamId,
          teamName: f.homeTeamName ?? "",
          opponentName: f.awayTeamName ?? "",
          homeGoals: f.homeGoals,
          awayGoals: f.awayGoals,
          isHome: true,
          kickoff: f.kickoff?.toISOString() ?? null,
          statusShort: f.statusShort,
        });
      }
      if (f.awayTeamId && teamIds.includes(f.awayTeamId)) {
        recentMatches.push({
          teamId: f.awayTeamId,
          teamName: f.awayTeamName ?? "",
          opponentName: f.homeTeamName ?? "",
          homeGoals: f.homeGoals,
          awayGoals: f.awayGoals,
          isHome: false,
          kickoff: f.kickoff?.toISOString() ?? null,
          statusShort: f.statusShort,
        });
      }
    }

    const articles = await generateLeagueNews(leagueId, topTeamsRows, recentMatches);

    return res.json({ articles, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[routes:news]", err);
    return res.status(500).json({ error: "Failed to load news" });
  }
});

// ── Performance endpoints (Fase 1.6) ─────────────────────────────────────────
// Auditable global + per-market + per-league stats sourced from predictionReviews.
// Equity curve = cumulative ROI impact per day over the last 90 days.

async function buildPerformanceSummary(groupBy: null | "betType" | "leagueName") {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const groupCol =
    groupBy === "betType" ? aiBettingTips.betType
    : groupBy === "leagueName" ? aiBettingTips.leagueName
    : sql<string>`'global'`;

  const rows = await db
    .select({
      groupKey: sql<string>`${groupCol}`,
      totalTips: sql<number>`count(*)::int`,
      hits: sql<number>`count(*) filter (where ${aiBettingTips.outcome} = 'hit')::int`,
      finalized: sql<number>`count(*) filter (where ${aiBettingTips.outcome} in ('hit','miss'))::int`,
      roiSum: sql<number>`coalesce(sum(${predictionReviews.roiImpact}), 0)::float`,
      roiCount: sql<number>`count(*) filter (where ${predictionReviews.roiImpact} is not null)::int`,
      clvSum: sql<number>`coalesce(sum(${predictionReviews.closingLineValue}), 0)::float`,
      clvCount: sql<number>`count(*) filter (where ${predictionReviews.closingLineValue} is not null)::int`,
      brierSum: sql<number>`coalesce(sum(${predictionReviews.brierScore}), 0)::float`,
      brierCount: sql<number>`count(*) filter (where ${predictionReviews.brierScore} is not null)::int`,
    })
    .from(predictionReviews)
    .innerJoin(aiBettingTips, eq(aiBettingTips.id, predictionReviews.predictionId))
    .where(gte(predictionReviews.createdAt, ninetyDaysAgo))
    .groupBy(groupBy ? groupCol : sql`1`);

  return rows.map((r) => ({
    group: r.groupKey,
    totalTips: Number(r.totalTips) || 0,
    winRate: r.finalized > 0 ? r.hits / r.finalized : null,
    roiPct: r.roiCount > 0 ? (r.roiSum / r.roiCount) * 100 : null,
    avgClv: r.clvCount > 0 ? r.clvSum / r.clvCount : null,
    brierAvg: r.brierCount > 0 ? r.brierSum / r.brierCount : null,
  }));
}

async function buildEquityCurve(days = 90): Promise<Array<{ date: string; cumRoi: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(${predictionReviews.createdAt}::date, 'YYYY-MM-DD')`,
      dailyRoi: sql<number>`coalesce(sum(${predictionReviews.roiImpact}), 0)::float`,
    })
    .from(predictionReviews)
    .where(gte(predictionReviews.createdAt, since))
    .groupBy(sql`${predictionReviews.createdAt}::date`)
    .orderBy(sql`${predictionReviews.createdAt}::date`);

  let cum = 0;
  return rows.map((r) => {
    cum += Number(r.dailyRoi) || 0;
    return { date: r.day, cumRoi: cum };
  });
}

router.get("/analysis/performance", requirePlan("pro"), async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:performance", TTL.MIN5, async () => {
      const [[global], equityCurve] = await Promise.all([
        buildPerformanceSummary(null),
        buildEquityCurve(90),
      ]);
      return {
        totalTips: global?.totalTips ?? 0,
        winRate: global?.winRate ?? null,
        roiPct: global?.roiPct ?? null,
        avgClv: global?.avgClv ?? null,
        brierAvg: global?.brierAvg ?? null,
        equityCurve,
      };
    });
    return res.json(result);
  } catch (err) {
    console.error("[routes:analysis.performance]", err);
    return res.status(500).json({ error: "Failed to load performance" });
  }
});

router.get("/analysis/performance/by-market", requirePlan("pro"), async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:performance:by-market", TTL.MIN5, async () => {
      const rows = await buildPerformanceSummary("betType");
      return { byMarket: rows };
    });
    return res.json(result);
  } catch (err) {
    console.error("[routes:analysis.performance.byMarket]", err);
    return res.status(500).json({ error: "Failed to load performance by market" });
  }
});

router.get("/analysis/performance/by-league", requirePlan("pro"), async (_req, res) => {
  try {
    const result = await getOrFetch("analysis:performance:by-league", TTL.MIN5, async () => {
      const rows = await buildPerformanceSummary("leagueName");
      return { byLeague: rows };
    });
    return res.json(result);
  } catch (err) {
    console.error("[routes:analysis.performance.byLeague]", err);
    return res.status(500).json({ error: "Failed to load performance by league" });
  }
});

export default router;
