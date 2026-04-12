import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  getBettingTip,
  getBettingTips,
  getLiveAnalysis,
  triggerPostMatchReview,
  getAiAccuracyStats,
  generateAlertText,
  generateLeagueNews,
} from "../ai/analysisLayer.js";
import { cacheGet, cacheSet, TTL } from "../lib/routeCache.js";

const router = Router();

router.get("/analysis/:fixtureId/betting-tip", async (req, res) => {
  const id = parseInt(req.params["fixtureId"] ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const tips = await getBettingTips(id);
    if (!tips || tips.length === 0) {
      return res.json({ tips: [], tip: null, message: "Insufficient signal data — tip not yet available." });
    }
    res.set("Cache-Control", "public, max-age=900, stale-while-revalidate=300");
    return res.json({ tips, tip: tips[0] });
  } catch (err) {
    console.error("[analysis] betting-tip error:", err);
    return res.status(500).json({ error: "Tip generation failed" });
  }
});

// GET /api/analysis/:fixtureId/post-review — post-match review (outcome + summary)
router.get("/analysis/:fixtureId/post-review", async (req, res) => {
  const id = parseInt(req.params["fixtureId"] ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    // Trigger review if not done yet (idempotent)
    await triggerPostMatchReview(id);

    const tips = await db.query.aiBettingTips.findMany({
      where: (t, { eq: eqFn }) => eqFn(t.fixtureId, id),
    });

    if (!tips.length) {
      return res.json({ reviews: [], review: null, message: "No prediction was made for this fixture." });
    }

    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    return res.json({ reviews: tips, review: tips[0] });
  } catch (err) {
    console.error("[analysis] post-review error:", err);
    return res.status(500).json({ error: "Review generation failed" });
  }
});

// GET /api/analysis/:fixtureId/live — live in-play analysis (5 min TTL)
router.get("/analysis/:fixtureId/live", async (req, res) => {
  const id = parseInt(req.params["fixtureId"] ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getLiveAnalysis(id);
    const signals = await db.query.fixtureSignals.findMany({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, id), eqFn(s.phase, "live")),
    });
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    return res.json({
      phase: "live",
      headline: result.headline,
      narrative: result.narrative,
      key_factors: result.key_factors,
      momentum_verdict: result.momentum_verdict,
      alert_worthy: result.alert_worthy,
      cachedAt: new Date().toISOString(),
      signals,
    });
  } catch (err) {
    console.error("[analysis] live error:", err);
    return res.status(500).json({ error: "Analysis failed" });
  }
});

router.get("/analysis/value-odds", async (_req, res) => {
  const cacheKey = "analysis:value-odds";
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const tips = await db.query.aiBettingTips.findMany({
      where: (t, { isNull }) => isNull(t.outcome),
    });

    const ranked = tips
      .filter(t => t.betType !== 'no_bet')
      .map(t => {
        const valueScore = t.valueRating === 'strong_value' ? 4 : t.valueRating === 'value' ? 3 : t.valueRating === 'fair' ? 2 : 1;
        return { ...t, valueScore, combinedScore: valueScore * 10 + t.trustScore };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore);

    const body = { tips: ranked };
    cacheSet(cacheKey, body, TTL.MIN5);
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(body);
  } catch (err) {
    console.error("[analysis] value-odds error:", err);
    return res.status(500).json({ error: "Failed to fetch value odds" });
  }
});

router.get("/analysis/accuracy", async (_req, res) => {
  const cacheKey = "analysis:accuracy";
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const stats = await getAiAccuracyStats();
    cacheSet(cacheKey, stats, TTL.MIN5);
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(stats);
  } catch (err) {
    console.error("[analysis] accuracy error:", err);
    return res.status(500).json({ error: "Failed to fetch accuracy stats" });
  }
});

// GET /api/analysis/prematch-tips — all stored tips for upcoming fixtures (no AI generation)
router.get("/analysis/prematch-tips", async (_req, res) => {
  const cacheKey = "analysis:prematch-tips";
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const tips = await db.query.aiBettingTips.findMany({
      where: (t, { isNull }) => isNull(t.outcome),
    });

    const byFixture: Record<number, typeof tips> = {};
    for (const tip of tips) {
      if (!byFixture[tip.fixtureId]) byFixture[tip.fixtureId] = [];
      byFixture[tip.fixtureId]!.push(tip);
    }

    const body = { tips: byFixture };
    cacheSet(cacheKey, body, TTL.MIN5);
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(body);
  } catch (err) {
    console.error("[analysis] prematch-tips error:", err);
    return res.status(500).json({ error: "Failed to fetch tips" });
  }
});

// GET /api/news?leagueId=39 — AI-generated news for top 3 teams in a league
router.get("/news", async (req, res) => {
  const leagueId = parseInt(req.query["leagueId"] as string ?? "39");
  const cacheKey = `news:${leagueId}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=600");
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { rows: standingRows } = await pool.query(
      `WITH latest_season AS (
         SELECT MAX(season_year) AS sy FROM standings WHERE league_id = $1
       )
       SELECT DISTINCT ON (s.team_id)
         s.team_id AS "teamId", s.points,
         COALESCE(s.team_name, t.name, s.team_id::text) AS "teamName",
         COALESCE(s.team_logo, t.logo) AS "teamLogo",
         ROW_NUMBER() OVER (ORDER BY s.points DESC, s.goals_diff DESC) AS rank
       FROM standings s
       LEFT JOIN teams t ON t.team_id = s.team_id
       CROSS JOIN latest_season ls
       WHERE s.league_id = $1 AND s.season_year = ls.sy
       ORDER BY s.team_id, s.points DESC
       LIMIT 3`,
      [leagueId]
    );

    if (!standingRows.length) {
      return res.json({ articles: [], message: "No standings data available" });
    }

    const teamIds = standingRows.map((r: { teamId: number }) => r.teamId);
    const POST_STATUSES = ["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"];

    const { rows: matchRows } = await pool.query(
      `SELECT
         CASE WHEN f.home_team_id = ANY($1::int[]) THEN f.home_team_id ELSE f.away_team_id END AS "teamId",
         CASE WHEN f.home_team_id = ANY($1::int[]) THEN COALESCE(f.home_team_name, f.home_team_id::text) ELSE COALESCE(f.away_team_name, f.away_team_id::text) END AS "teamName",
         CASE WHEN f.home_team_id = ANY($1::int[]) THEN COALESCE(f.away_team_name, f.away_team_id::text) ELSE COALESCE(f.home_team_name, f.home_team_id::text) END AS "opponentName",
         f.home_goals AS "homeGoals", f.away_goals AS "awayGoals",
         f.home_team_id = ANY($1::int[]) AS "isHome",
         f.kickoff, f.status_short AS "statusShort"
       FROM fixtures f
       WHERE (f.home_team_id = ANY($1::int[]) OR f.away_team_id = ANY($1::int[]))
         AND f.league_id = $2
         AND f.status_short = ANY($3::text[])
       ORDER BY f.kickoff DESC
       LIMIT 15`,
      [teamIds, leagueId, POST_STATUSES]
    );

    const topTeams = standingRows.map((r: { teamId: number; teamName: string; teamLogo: string | null; rank: number; points: number }, i: number) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      teamLogo: r.teamLogo,
      rank: i + 1,
      points: r.points,
    }));

    const articles = await generateLeagueNews(leagueId, topTeams, matchRows);

    const body = { articles, generatedAt: new Date().toISOString() };
    cacheSet(cacheKey, body, 3600_000);
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=600");
    return res.json(body);
  } catch (err) {
    console.error("[news] error:", err);
    return res.status(500).json({ error: "News generation failed" });
  }
});

// POST /api/alerts/explain
router.post("/alerts/explain", async (req, res) => {
  const { signalKey, signalLabel, matchName } = req.body as {
    signalKey?: string;
    signalLabel?: string;
    matchName?: string;
  };

  if (!signalKey || !signalLabel || !matchName) {
    return res.status(400).json({ error: "Missing signalKey, signalLabel or matchName" });
  }

  try {
    const text = await generateAlertText(signalKey, signalLabel, matchName);
    return res.json({ alertText: text });
  } catch (err) {
    console.error("[analysis] alert explain error:", err);
    return res.status(500).json({ error: "Alert generation failed" });
  }
});

export default router;
