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
import { cacheGet, cacheSet, getOrFetch, TTL } from "../lib/routeCache.js";

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
  try {
    const body = await getOrFetch("analysis:value-odds", TTL.MIN5, async () => {
      // Only show upcoming fixtures (kickoff in the future).
      // Allow a 2-hour grace window so in-progress matches stay visible.
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const { rows } = await pool.query(`
        SELECT t.*
        FROM ai_betting_tips t
        INNER JOIN fixtures f ON f.fixture_id = t.fixture_id
        WHERE t.outcome IS NULL
          AND t.bet_type != 'no_bet'
          AND (t.kickoff IS NULL OR t.kickoff >= $1)
          AND f.status_short IN ('NS','TBD','1H','HT','2H','ET','BT','P','SUSP','INT','LIVE')
        ORDER BY t.trust_score DESC
      `, [cutoff]);

      const ranked = rows.map((t: Record<string, unknown>) => {
        const valueRating = t["value_rating"] as string | null;
        const valueScore = valueRating === 'strong_value' ? 4 : valueRating === 'value' ? 3 : valueRating === 'fair' ? 2 : 1;
        return {
          id: t["id"],
          fixtureId: t["fixture_id"],
          homeTeam: t["home_team"],
          awayTeam: t["away_team"],
          kickoff: t["kickoff"],
          leagueName: t["league_name"],
          recommendation: t["recommendation"],
          betType: t["bet_type"],
          betSide: t["bet_side"],
          trustScore: t["trust_score"],
          reasoning: t["reasoning"],
          marketOdds: t["market_odds"],
          valueRating,
          createdAt: t["created_at"],
          valueScore,
          combinedScore: valueScore * 10 + (t["trust_score"] as number),
        };
      }).sort((a, b) => b.combinedScore - a.combinedScore);

      return { tips: ranked };
    });
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(body);
  } catch (err) {
    console.error("[analysis] value-odds error:", err);
    return res.status(500).json({ error: "Failed to fetch value odds" });
  }
});

router.get("/analysis/accuracy", async (_req, res) => {
  try {
    const stats = await getOrFetch("analysis:accuracy", TTL.MIN5, getAiAccuracyStats);
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(stats);
  } catch (err) {
    console.error("[analysis] accuracy error:", err);
    return res.status(500).json({ error: "Failed to fetch accuracy stats" });
  }
});

// GET /api/analysis/daily-summary — today's picks, yesterday's results, streak, ROI
router.get("/analysis/daily-summary", async (_req, res) => {
  try {
    const body = await getOrFetch("analysis:daily-summary", TTL.MIN5, async () => {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      const [todayRows, yesterdayRow, yesterdayTipsRow, dailyRows, roiRow] = await Promise.all([
        // Today's top picks (upcoming, not yet resolved)
        pool.query(`
          SELECT id, fixture_id AS "fixtureId", home_team AS "homeTeam", away_team AS "awayTeam",
                 kickoff, league_name AS "leagueName", recommendation, bet_type AS "betType",
                 bet_side AS "betSide", trust_score AS "trustScore", reasoning,
                 market_odds AS "marketOdds", value_rating AS "valueRating"
          FROM ai_betting_tips
          WHERE kickoff >= $1 AND outcome IS NULL AND bet_type != 'no_bet' AND trust_score >= 6
          ORDER BY trust_score DESC, CASE value_rating
            WHEN 'strong_value' THEN 4 WHEN 'value' THEN 3 WHEN 'fair' THEN 2 ELSE 1
          END DESC
          LIMIT 5
        `, [todayStart]),

        // Yesterday's results summary (outcomes: 'hit', 'miss', 'partial')
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE outcome = 'hit')                                   AS wins,
            COUNT(*) FILTER (WHERE outcome = 'miss')                                  AS losses,
            COUNT(*) FILTER (WHERE outcome = 'partial')                               AS pushes,
            COUNT(*) FILTER (WHERE outcome IS NOT NULL AND bet_type != 'no_bet') AS total
          FROM ai_betting_tips
          WHERE kickoff >= $1 AND kickoff < $2
        `, [yesterdayStart, todayStart]),

        // Yesterday's individual tips (for expandable panel)
        pool.query(`
          SELECT id, fixture_id AS "fixtureId", home_team AS "homeTeam", away_team AS "awayTeam",
                 kickoff, league_name AS "leagueName", recommendation, bet_type AS "betType",
                 trust_score AS "trustScore", market_odds AS "marketOdds", value_rating AS "valueRating",
                 outcome, review_headline AS "reviewHeadline"
          FROM ai_betting_tips
          WHERE kickoff >= $1 AND kickoff < $2
            AND bet_type != 'no_bet'
          ORDER BY kickoff ASC, trust_score DESC
        `, [yesterdayStart, todayStart]),

        // Daily hit/miss per day for streak calculation (most recent 60 days)
        pool.query(`
          SELECT
            DATE(kickoff) AS day,
            COUNT(*) FILTER (WHERE outcome = 'hit')                                   AS wins,
            COUNT(*) FILTER (WHERE outcome IS NOT NULL AND bet_type != 'no_bet') AS total
          FROM ai_betting_tips
          WHERE kickoff >= NOW() - INTERVAL '60 days' AND outcome IS NOT NULL AND bet_type != 'no_bet'
          GROUP BY DATE(kickoff)
          ORDER BY day DESC
        `),

        // All-time ROI (1 unit stake; hit returns odds-1, miss costs 1 unit)
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE outcome IS NOT NULL AND bet_type != 'no_bet') AS total_bets,
            COALESCE(SUM(CASE WHEN outcome = 'hit'  THEN COALESCE(market_odds, 2.0) - 1 ELSE 0 END), 0) AS gross_return,
            COUNT(*) FILTER (WHERE outcome = 'miss') AS losses
          FROM ai_betting_tips
          WHERE outcome IS NOT NULL AND bet_type != 'no_bet'
        `),
      ]);

      // Calculate streak from daily rows
      let streak = 0;
      let streakType: "win" | "loss" | "none" = "none";
      for (const row of dailyRows.rows) {
        const isWin = Number(row.total) > 0 && Number(row.wins) / Number(row.total) >= 0.5;
        if (streak === 0) {
          streakType = isWin ? "win" : "loss";
          streak = 1;
        } else if ((isWin && streakType === "win") || (!isWin && streakType === "loss")) {
          streak++;
        } else {
          break;
        }
      }

      const badge =
        streakType === "win" && streak >= 14 ? "elite" :
        streakType === "win" && streak >= 7  ? "hot" :
        streakType === "win" && streak >= 3  ? "warming" : null;

      const r = roiRow.rows[0] ?? {};
      const totalBets    = Number(r.total_bets ?? 0);
      const grossReturn  = Number(r.gross_return ?? 0);
      const lossCount    = Number(r.losses ?? 0);
      const netReturn    = Math.round((grossReturn - lossCount) * 10) / 10;
      const roi          = totalBets > 0 ? Math.round((netReturn / totalBets) * 1000) / 10 : 0;

      const yr = yesterdayRow.rows[0] ?? {};

      return {
        todayPicks: todayRows.rows,
        yesterdayTips: yesterdayTipsRow.rows,
        yesterdayResults: {
          wins:   Number(yr.wins   ?? 0),
          losses: Number(yr.losses ?? 0),
          pushes: Number(yr.pushes ?? 0),
          total:  Number(yr.total  ?? 0),
        },
        streak: { current: streak, type: streakType, badge },
        roi: { total: roi, totalBets, netReturn },
      };
    });

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(body);
  } catch (err) {
    console.error("[analysis] daily-summary error:", err);
    return res.status(500).json({ error: "Failed to fetch daily summary" });
  }
});

// GET /api/analysis/prematch-tips — stored tips for upcoming fixtures only (no AI generation)
router.get("/analysis/prematch-tips", async (_req, res) => {
  try {
    const body = await getOrFetch("analysis:prematch-tips", TTL.MIN5, async () => {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const { rows } = await pool.query(`
        SELECT t.*
        FROM ai_betting_tips t
        INNER JOIN fixtures f ON f.fixture_id = t.fixture_id
        WHERE t.outcome IS NULL
          AND (t.kickoff IS NULL OR t.kickoff >= $1)
          AND f.status_short IN ('NS','TBD','1H','HT','2H','ET','BT','P','SUSP','INT','LIVE')
      `, [cutoff]);

      const byFixture: Record<number, typeof rows> = {};
      for (const tip of rows) {
        const fid = tip.fixture_id as number;
        if (!byFixture[fid]) byFixture[fid] = [];
        byFixture[fid]!.push(tip);
      }
      return { tips: byFixture };
    });
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

  try {
    const body = await getOrFetch(`news:${leagueId}`, TTL.HOUR2, async () => {
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

      if (!standingRows.length) return { articles: [], message: "No standings data available" };

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
        teamId: r.teamId, teamName: r.teamName, teamLogo: r.teamLogo, rank: i + 1, points: r.points,
      }));

      const articles = await generateLeagueNews(leagueId, topTeams, matchRows);
      return { articles, generatedAt: new Date().toISOString() };
    });

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
