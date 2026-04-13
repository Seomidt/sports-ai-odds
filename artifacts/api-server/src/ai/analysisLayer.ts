import Anthropic from "@anthropic-ai/sdk";
import { db, pool } from "@workspace/db";
import { aiBettingTips, alertLog, fixtures, oddsSnapshots, standings, teamFeatures, h2hFixtures, newsArticles, systemKv, predictions, sidelinedPlayers, coaches, teamSeasonStats, playerSeasonStats, oddsMarkets, prematchSyntheses } from "@workspace/db/schema";
import { z } from "zod";
import { eq, and, isNotNull, desc, sql } from "drizzle-orm";

const client = new Anthropic({
  apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"],
  baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
});

// ─── TTL in-memory cache (for live analysis only) ─────────────────────────────

interface CacheEntry<T> { value: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ─── KV persistence helpers ───────────────────────────────────────────────────

async function kvSet(key: string, value: string): Promise<void> {
  try {
    await db.insert(systemKv).values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } });
  } catch { /* best-effort */ }
}

async function kvGet(key: string): Promise<string | null> {
  try {
    const row = await db.query.systemKv.findFirst({ where: (t, { eq: eqFn }) => eqFn(t.key, key) });
    return row?.value ?? null;
  } catch { return null; }
}

// ─── Token tracking ───────────────────────────────────────────────────────────

const INPUT_COST_PER_M = 0.80;
const OUTPUT_COST_PER_M = 4.00;

interface AiUsageEntry { at: number; inputTokens: number; outputTokens: number; }
let aiUsageLog: AiUsageEntry[] = [];
let totalInputTokens = 0;
let totalOutputTokens = 0;

/** Load cumulative AI token usage from DB. Call once on startup. */
export async function initAiStats(): Promise<void> {
  const inputVal = await kvGet("ai:input_tokens");
  const outputVal = await kvGet("ai:output_tokens");
  if (inputVal) totalInputTokens = parseInt(inputVal, 10) || 0;
  if (outputVal) totalOutputTokens = parseInt(outputVal, 10) || 0;
  console.log(`[ai] Stats loaded from DB — ${totalInputTokens + totalOutputTokens} total tokens`);
}

let _aiFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAiFlush(): void {
  if (_aiFlushTimer) return;
  _aiFlushTimer = setTimeout(async () => {
    _aiFlushTimer = null;
    await kvSet("ai:input_tokens", String(totalInputTokens));
    await kvSet("ai:output_tokens", String(totalOutputTokens));
  }, 10_000); // flush 10s after last AI call
}

export function getAiStats() {
  const totalCost =
    (totalInputTokens / 1_000_000) * INPUT_COST_PER_M +
    (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M;
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentEntries = aiUsageLog.filter((e) => e.at > last24h);
  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
    last24hInputTokens: recentEntries.reduce((s, e) => s + e.inputTokens, 0),
    last24hOutputTokens: recentEntries.reduce((s, e) => s + e.outputTokens, 0),
    callsTotal: aiUsageLog.length,
    model: "claude-haiku-4-5",
    pricingNote: `$${INPUT_COST_PER_M}/MTok in · $${OUTPUT_COST_PER_M}/MTok out`,
  };
}

async function callClaude(prompt: string): Promise<string | null> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const inputTok = msg.usage?.input_tokens ?? 0;
    const outputTok = msg.usage?.output_tokens ?? 0;
    totalInputTokens += inputTok;
    totalOutputTokens += outputTok;
    scheduleAiFlush();
    aiUsageLog.push({ at: Date.now(), inputTokens: inputTok, outputTokens: outputTok });
    if (aiUsageLog.length > 500) aiUsageLog = aiUsageLog.slice(-500);
    const block = msg.content[0];
    if (block?.type === "text") return block.text;
    return null;
  } catch (err) {
    console.error("[ai] Claude error:", err);
    return null;
  }
}

function parseJson<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return schema.parse(JSON.parse(cleaned));
  } catch {
    return fallback;
  }
}

// ─── Accuracy history ─────────────────────────────────────────────────────────

async function getAccuracyHistory(): Promise<{ hitRate: number; totalReviewed: number; hits: number; summary: string }> {
  const reviewed = await db.query.aiBettingTips.findMany({
    where: (t, { isNotNull: notNull }) => notNull(t.outcome),
    orderBy: (t, { desc: d }) => [d(t.reviewedAt)],
    limit: 50,
  });

  if (reviewed.length === 0) {
    return { hitRate: 0, totalReviewed: 0, hits: 0, summary: "No review history yet." };
  }

  const hits = reviewed.filter((r) => r.outcome === "hit").length;
  const hitRate = Math.round((hits / reviewed.length) * 100);
  return {
    hitRate,
    totalReviewed: reviewed.length,
    hits,
    summary: `${hits}/${reviewed.length} tips correct (${hitRate}% hit rate, last ${reviewed.length} reviewed)`,
  };
}

// ─── Context builder ──────────────────────────────────────────────────────────

interface BettingContext {
  matchLabel: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
  leagueName: string | null;
  leagueId: number | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  statusShort: string | null;
  signals: Record<string, number | boolean | string>;
  odds: {
    home: number | null; draw: number | null; away: number | null;
    over25: number | null; over15: number | null; over35: number | null;
    btts: number | null;
    cornersOver: number | null;
    totalCardsOver: number | null;
    asianHandicapHome: number | null;
    doubleChance1X: number | null; doubleChanceX2: number | null; doubleChance12: number | null;
    drawNoBetHome: number | null; drawNoBetAway: number | null;
    winToNilHome: number | null; winToNilAway: number | null;
    firstHalfOver15: number | null; firstHalfBtts: number | null;
  };
  homeRank: number | null;
  awayRank: number | null;
  prediction: { homeWinPct: number | null; drawPct: number | null; awayWinPct: number | null; goalsHome: number | null; goalsAway: number | null; advice: string | null; winner: string | null } | null;
  homeSeasonStats: { form: string | null; goalsForAvg: number | null; goalsAgainstAvg: number | null; cleanSheets: number | null; winStreak: number | null; played: number | null } | null;
  awaySeasonStats: { form: string | null; goalsForAvg: number | null; goalsAgainstAvg: number | null; cleanSheets: number | null; winStreak: number | null; played: number | null } | null;
  homeTopScorers: Array<{ name: string; goals: number | null; assists: number | null }>;
  awayTopScorers: Array<{ name: string; goals: number | null; assists: number | null }>;
  homeSidelined: string[];
  awaySidelined: string[];
  homeCoach: string | null;
  awayCoach: string | null;
}

async function buildBettingContext(fixtureId: number): Promise<BettingContext> {
  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });

  if (!fixture) {
    return {
      matchLabel: "Unknown match",
      homeTeam: "Home", awayTeam: "Away",
      kickoff: null, leagueName: null, leagueId: null,
      homeTeamId: null, awayTeamId: null,
      homeGoals: null, awayGoals: null, statusShort: null,
      signals: {}, odds: { home: null, draw: null, away: null, over25: null, over15: null, over35: null, btts: null, cornersOver: null, totalCardsOver: null, asianHandicapHome: null, doubleChance1X: null, doubleChanceX2: null, doubleChance12: null, drawNoBetHome: null, drawNoBetAway: null, winToNilHome: null, winToNilAway: null, firstHalfOver15: null, firstHalfBtts: null },
      homeRank: null, awayRank: null,
      prediction: null, homeSeasonStats: null, awaySeasonStats: null,
      homeTopScorers: [], awayTopScorers: [], homeSidelined: [], awaySidelined: [],
      homeCoach: null, awayCoach: null,
    };
  }

  // Pre-match signals from teamFeatures (written by featureEngine.runPreMatchFeatures)
  const signals: Record<string, number | boolean | string> = {};

  if (fixture.homeTeamId && fixture.awayTeamId) {
    const homeFeats = await db.query.teamFeatures.findMany({
      where: (f, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(f.fixtureId, fixtureId), eqFn(f.teamId, fixture.homeTeamId!), eqFn(f.phase, "pre")),
    });
    const awayFeats = await db.query.teamFeatures.findMany({
      where: (f, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(f.fixtureId, fixtureId), eqFn(f.teamId, fixture.awayTeamId!), eqFn(f.phase, "pre")),
    });
    for (const feat of homeFeats) {
      if (feat.featureValue !== null) signals[`home_${feat.featureKey}`] = Math.round(feat.featureValue * 1000) / 1000;
    }
    for (const feat of awayFeats) {
      if (feat.featureValue !== null) signals[`away_${feat.featureKey}`] = Math.round(feat.featureValue * 1000) / 1000;
    }

    // H2H summary as signals
    const h2hRows = await db.query.h2hFixtures.findMany({
      where: (h, { or: orFn, and: andFn, eq: eqFn }) =>
        orFn(
          andFn(eqFn(h.forTeam1Id, fixture.homeTeamId!), eqFn(h.forTeam2Id, fixture.awayTeamId!)),
          andFn(eqFn(h.forTeam1Id, fixture.awayTeamId!), eqFn(h.forTeam2Id, fixture.homeTeamId!))
        ),
      orderBy: (h, { desc: d }) => [d(h.kickoff)],
      limit: 5,
    });
    if (h2hRows.length > 0) {
      let homeWins = 0, draws = 0, awayWins = 0, totalGoals = 0;
      for (const h of h2hRows) {
        const hg = h.homeGoals ?? 0, ag = h.awayGoals ?? 0;
        totalGoals += hg + ag;
        const homeIsFixtureHome = h.homeTeamId === fixture.homeTeamId;
        if (hg > ag) { homeIsFixtureHome ? homeWins++ : awayWins++; }
        else if (ag > hg) { homeIsFixtureHome ? awayWins++ : homeWins++; }
        else draws++;
      }
      signals["h2h_home_wins"] = homeWins;
      signals["h2h_draws"] = draws;
      signals["h2h_away_wins"] = awayWins;
      signals["h2h_avg_goals"] = Math.round((totalGoals / h2hRows.length) * 10) / 10;
    }
  }

  // Odds — use BEST available across all bookmakers for value analysis
  const { rows: oddsRows } = await pool.query<{
    bookmaker: string | null; homeWin: number | null; draw: number | null;
    awayWin: number | null; btts: number | null; overUnder25: number | null;
  }>(`
    SELECT DISTINCT ON (bookmaker)
      bookmaker, home_win AS "homeWin", draw, away_win AS "awayWin",
      btts, over_under_25 AS "overUnder25"
    FROM odds_snapshots WHERE fixture_id = $1
    ORDER BY bookmaker, snapped_at DESC
  `, [fixtureId]);

  const bestHome = oddsRows.reduce((best, r) => (!best || (r.homeWin ?? 0) > best) ? (r.homeWin ?? 0) : best, 0) || null;
  const bestDraw = oddsRows.reduce((best, r) => (!best || (r.draw ?? 0) > best) ? (r.draw ?? 0) : best, 0) || null;
  const bestAway = oddsRows.reduce((best, r) => (!best || (r.awayWin ?? 0) > best) ? (r.awayWin ?? 0) : best, 0) || null;
  const anyRow = oddsRows[0];

  // League standings + enriched data (run in parallel)
  let homeRank: number | null = null;
  let awayRank: number | null = null;

  const [homeStanding, awayStanding, pred, homeStats, awayStats, homeCoachRow, awayCoachRow, homeSidelinedRows, awaySidelinedRows, marketsRow] = await Promise.all([
    fixture.leagueId && fixture.homeTeamId
      ? db.query.standings.findFirst({ where: (s, { and: andFn, eq: eqFn }) => andFn(eqFn(s.leagueId, fixture.leagueId), eqFn(s.teamId, fixture.homeTeamId)) })
      : Promise.resolve(null),
    fixture.leagueId && fixture.awayTeamId
      ? db.query.standings.findFirst({ where: (s, { and: andFn, eq: eqFn }) => andFn(eqFn(s.leagueId, fixture.leagueId), eqFn(s.teamId, fixture.awayTeamId)) })
      : Promise.resolve(null),
    db.query.predictions.findFirst({ where: (p, { eq: eqFn }) => eqFn(p.fixtureId, fixtureId) }),
    fixture.homeTeamId && fixture.leagueId
      ? db.query.teamSeasonStats.findFirst({ where: (ts, { and: andFn, eq: eqFn }) => andFn(eqFn(ts.teamId, fixture.homeTeamId!), eqFn(ts.leagueId, fixture.leagueId!)) })
      : Promise.resolve(null),
    fixture.awayTeamId && fixture.leagueId
      ? db.query.teamSeasonStats.findFirst({ where: (ts, { and: andFn, eq: eqFn }) => andFn(eqFn(ts.teamId, fixture.awayTeamId!), eqFn(ts.leagueId, fixture.leagueId!)) })
      : Promise.resolve(null),
    fixture.homeTeamId
      ? db.query.coaches.findFirst({ where: (c, { eq: eqFn }) => eqFn(c.teamId, fixture.homeTeamId!) })
      : Promise.resolve(null),
    fixture.awayTeamId
      ? db.query.coaches.findFirst({ where: (c, { eq: eqFn }) => eqFn(c.teamId, fixture.awayTeamId!) })
      : Promise.resolve(null),
    fixture.homeTeamId
      ? db.query.sidelinedPlayers.findMany({ where: (sp, { eq: eqFn }) => eqFn(sp.teamId, fixture.homeTeamId!), limit: 8 })
      : Promise.resolve([]),
    fixture.awayTeamId
      ? db.query.sidelinedPlayers.findMany({ where: (sp, { eq: eqFn }) => eqFn(sp.teamId, fixture.awayTeamId!), limit: 8 })
      : Promise.resolve([]),
    db.query.oddsMarkets.findFirst({ where: (o, { eq: eqFn }) => eqFn(o.fixtureId, fixtureId), orderBy: (o, { desc: d }) => [d(o.snappedAt)] }),
  ]);

  homeRank = homeStanding?.rank ?? null;
  awayRank = awayStanding?.rank ?? null;

  // Extract top scorers from playerSeasonStats for both teams in this league
  let homeTopScorers: Array<{ name: string; goals: number | null; assists: number | null }> = [];
  let awayTopScorers: Array<{ name: string; goals: number | null; assists: number | null }> = [];
  if (fixture.leagueId) {
    const [homeScorers, awayScorers] = await Promise.all([
      fixture.homeTeamId
        ? db.query.playerSeasonStats.findMany({
            where: (ps, { and: andFn, eq: eqFn }) =>
              andFn(eqFn(ps.teamId, fixture.homeTeamId!), eqFn(ps.leagueId, fixture.leagueId!)),
            orderBy: (ps, { desc: d }) => [d(ps.goals)],
            limit: 5,
          })
        : Promise.resolve([]),
      fixture.awayTeamId
        ? db.query.playerSeasonStats.findMany({
            where: (ps, { and: andFn, eq: eqFn }) =>
              andFn(eqFn(ps.teamId, fixture.awayTeamId!), eqFn(ps.leagueId, fixture.leagueId!)),
            orderBy: (ps, { desc: d }) => [d(ps.goals)],
            limit: 5,
          })
        : Promise.resolve([]),
    ]);
    homeTopScorers = homeScorers.map(p => ({ name: p.playerName ?? "Unknown", goals: p.goals, assists: p.assists }));
    awayTopScorers = awayScorers.map(p => ({ name: p.playerName ?? "Unknown", goals: p.goals, assists: p.assists }));
  }

  // Extract all market odds from oddsMarkets JSON
  let cornersOver: number | null = null;
  let totalCardsOver: number | null = null;
  let asianHandicapHome: number | null = null;
  let doubleChance1X: number | null = null;
  let doubleChanceX2: number | null = null;
  let doubleChance12: number | null = null;
  let drawNoBetHome: number | null = null;
  let drawNoBetAway: number | null = null;
  let winToNilHome: number | null = null;
  let winToNilAway: number | null = null;
  let firstHalfOver15: number | null = null;
  let firstHalfBtts: number | null = null;
  let over15: number | null = null;
  let over35: number | null = null;

  if (marketsRow?.markets) {
    const mkt = marketsRow.markets as Record<string, Array<{ value: string; odd: string }>>;
    const parseOdd = (e: { value: string; odd: string }) => parseFloat(e.odd) || null;

    for (const [name, entries] of Object.entries(mkt)) {
      const n = name.toLowerCase();

      // Corners Over/Under
      if (n.includes("corner") && (n.includes("over") || n.includes("under")) && !cornersOver) {
        const over = entries.find(e => e.value.toLowerCase().includes("over"));
        if (over) cornersOver = parseOdd(over);
      }
      // Cards Over/Under
      if ((n.includes("card") || n.includes("booking")) && !totalCardsOver) {
        const over = entries.find(e => e.value.toLowerCase().includes("over"));
        if (over) totalCardsOver = parseOdd(over);
      }
      // Asian Handicap
      if (n.includes("handicap") && n.includes("asian") && !n.includes("corner") && !n.includes("card") && !asianHandicapHome) {
        const home = entries.find(e => e.value.toLowerCase().includes("home") || e.value === "-1" || e.value === "-0.5");
        if (home) asianHandicapHome = parseOdd(home);
      }
      // Double Chance
      if (n === "double chance" || n.startsWith("double chance")) {
        const dc1X = entries.find(e => e.value === "Home/Draw" || e.value === "1X");
        const dcX2 = entries.find(e => e.value === "Draw/Away" || e.value === "X2");
        const dc12 = entries.find(e => e.value === "Home/Away" || e.value === "12");
        if (dc1X && !doubleChance1X) doubleChance1X = parseOdd(dc1X);
        if (dcX2 && !doubleChanceX2) doubleChanceX2 = parseOdd(dcX2);
        if (dc12 && !doubleChance12) doubleChance12 = parseOdd(dc12);
      }
      // Draw No Bet / European Handicap (0)
      if ((n === "draw no bet" || (n.includes("european handicap") && !n.includes("corner") && !n.includes("card"))) && !drawNoBetHome) {
        const home = entries.find(e => e.value.toLowerCase() === "home" || e.value === "1" || e.value === "0");
        const away = entries.find(e => e.value.toLowerCase() === "away" || e.value === "2");
        if (home) drawNoBetHome = parseOdd(home);
        if (away && !drawNoBetAway) drawNoBetAway = parseOdd(away);
      }
      // Win to Nil (home team wins + clean sheet)
      if (n.includes("win to nil") || n.includes("win to nil - home") || n.includes("clean sheet")) {
        if (!winToNilHome && (n.includes("home") || n === "win to nil")) {
          const yes = entries.find(e => e.value.toLowerCase() === "yes" || e.value.toLowerCase() === "home");
          if (yes) winToNilHome = parseOdd(yes);
        }
        if (!winToNilAway && n.includes("away")) {
          const yes = entries.find(e => e.value.toLowerCase() === "yes" || e.value.toLowerCase() === "away");
          if (yes) winToNilAway = parseOdd(yes);
        }
      }
      // First Half Goals Over/Under
      if ((n.includes("first half") || n.includes("1st half") || n.includes("half time")) && (n.includes("goal") || n.includes("over/under")) && !firstHalfOver15) {
        const over = entries.find(e => e.value.toLowerCase().includes("over") && (e.value.includes("1.5") || e.value.includes("0.5")));
        if (over) firstHalfOver15 = parseOdd(over);
      }
      // First Half BTTS
      if ((n.includes("first half") || n.includes("1st half")) && n.includes("score") && !firstHalfBtts) {
        const yes = entries.find(e => e.value.toLowerCase() === "yes");
        if (yes) firstHalfBtts = parseOdd(yes);
      }
      // Goals Over/Under 1.5 and 3.5
      if ((n === "goals over/under" || n === "goals over/under (3 way)") && !over15) {
        const o15 = entries.find(e => e.value.includes("1.5") && e.value.toLowerCase().includes("over"));
        const o35 = entries.find(e => e.value.includes("3.5") && e.value.toLowerCase().includes("over"));
        if (o15 && !over15) over15 = parseOdd(o15);
        if (o35 && !over35) over35 = parseOdd(o35);
      }
    }
  }

  return {
    matchLabel: `${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
    homeTeam: fixture.homeTeamName ?? "Home",
    awayTeam: fixture.awayTeamName ?? "Away",
    kickoff: fixture.kickoff?.toISOString() ?? null,
    leagueName: fixture.leagueName,
    leagueId: fixture.leagueId,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    statusShort: fixture.statusShort,
    signals,
    odds: {
      home: bestHome,
      draw: bestDraw,
      away: bestAway,
      over25: anyRow?.overUnder25 ?? null,
      over15,
      over35,
      btts: anyRow?.btts ?? null,
      cornersOver,
      totalCardsOver,
      asianHandicapHome: anyRow?.handicapHome ?? asianHandicapHome,
      doubleChance1X,
      doubleChanceX2,
      doubleChance12,
      drawNoBetHome,
      drawNoBetAway,
      winToNilHome,
      winToNilAway,
      firstHalfOver15,
      firstHalfBtts,
    },
    homeRank,
    awayRank,
    prediction: pred ? {
      homeWinPct: pred.homeWinPercent,
      drawPct: pred.drawPercent,
      awayWinPct: pred.awayWinPercent,
      goalsHome: pred.goalsHome,
      goalsAway: pred.goalsAway,
      advice: pred.adviceText,
      winner: pred.winner,
    } : null,
    homeSeasonStats: homeStats ? {
      form: homeStats.form,
      goalsForAvg: homeStats.goalsForAvgTotal,
      goalsAgainstAvg: homeStats.goalsAgainstAvgTotal,
      cleanSheets: homeStats.cleanSheetsTotal,
      winStreak: homeStats.biggestWinStreak,
      played: homeStats.playedTotal,
    } : null,
    awaySeasonStats: awayStats ? {
      form: awayStats.form,
      goalsForAvg: awayStats.goalsForAvgTotal,
      goalsAgainstAvg: awayStats.goalsAgainstAvgTotal,
      cleanSheets: awayStats.cleanSheetsTotal,
      winStreak: awayStats.biggestWinStreak,
      played: awayStats.playedTotal,
    } : null,
    homeTopScorers,
    awayTopScorers,
    homeSidelined: homeSidelinedRows.map(sp => sp.playerName ?? "Unknown"),
    awaySidelined: awaySidelinedRows.map(sp => sp.playerName ?? "Unknown"),
    homeCoach: homeCoachRow?.name ?? null,
    awayCoach: awayCoachRow?.name ?? null,
  };
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const SingleTipSchema = z.object({
  recommendation: z.string(),
  bet_type: z.enum(["match_result", "over_under", "btts", "corners", "asian_handicap", "total_cards", "double_chance", "draw_no_bet", "win_to_nil", "first_half_goals", "no_bet"]),
  bet_side: z.string().nullable().optional(),
  trust_score: z.number().min(1).max(10),
  estimated_probability: z.number().min(0.01).max(0.99).optional(),
  reasoning: z.string(),
});

const MultiBettingTipSchema = z.object({
  tips: z.array(SingleTipSchema).min(1).max(8),
});

const PostReviewSchema = z.object({
  outcome: z.enum(["hit", "miss", "partial"]),
  review_headline: z.string(),
  review_summary: z.string(),
  accuracy_note: z.string(),
});

const LiveAnalysisSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  momentum_verdict: z.string(),
  key_factors: z.array(z.string()).max(3),
  alert_worthy: z.boolean(),
});

type LiveAnalysis = z.infer<typeof LiveAnalysisSchema>;

const FALLBACK_LIVE: LiveAnalysis = {
  headline: "",
  narrative: "Live signal data is still being computed.",
  momentum_verdict: "",
  key_factors: [],
  alert_worthy: false,
};

// ─── Value / Edge calculation ─────────────────────────────────────────────────

/**
 * edge = (ai_probability * market_odds) - 1
 * Positive = expected profit per unit staked; negative = expected loss.
 * e.g. 60% confidence × 2.10 odds = 1.26 - 1 = +0.26 (+26% edge)
 */
function calcEdge(aiProb: number, marketOdds: number | null): number | null {
  if (!marketOdds || marketOdds <= 1) return null;
  return Math.round(((aiProb * marketOdds) - 1) * 10000) / 10000; // 4dp
}

function calcValueRating(aiProb: number, marketOdds: number | null): string {
  const edge = calcEdge(aiProb, marketOdds);
  if (edge === null) return "neutral";
  if (edge >= 0.15) return "strong_value";
  if (edge >= 0.05) return "value";
  if (edge >= -0.05) return "fair";
  return "overpriced";
}

function getMarketOddsForTip(
  tip: { bet_type: string; bet_side?: string | null },
  odds: BettingContext["odds"],
): number | null {
  if (tip.bet_type === "match_result") {
    if (tip.bet_side === "home") return odds.home;
    if (tip.bet_side === "away") return odds.away;
    if (tip.bet_side === "draw") return odds.draw;
  } else if (tip.bet_type === "over_under") {
    if (tip.bet_side === "over15") return odds.over15;
    if (tip.bet_side === "over35") return odds.over35;
    return odds.over25 ?? null;
  } else if (tip.bet_type === "btts") {
    return odds.btts;
  } else if (tip.bet_type === "corners") {
    return odds.cornersOver;
  } else if (tip.bet_type === "asian_handicap") {
    return odds.asianHandicapHome;
  } else if (tip.bet_type === "total_cards") {
    return odds.totalCardsOver;
  } else if (tip.bet_type === "double_chance") {
    if (tip.bet_side === "1X" || tip.bet_side === "home_draw") return odds.doubleChance1X;
    if (tip.bet_side === "X2" || tip.bet_side === "draw_away") return odds.doubleChanceX2;
    if (tip.bet_side === "12" || tip.bet_side === "home_away") return odds.doubleChance12;
    return odds.doubleChance1X ?? odds.doubleChanceX2 ?? odds.doubleChance12;
  } else if (tip.bet_type === "draw_no_bet") {
    if (tip.bet_side === "home") return odds.drawNoBetHome;
    if (tip.bet_side === "away") return odds.drawNoBetAway;
    return odds.drawNoBetHome ?? odds.drawNoBetAway;
  } else if (tip.bet_type === "win_to_nil") {
    if (tip.bet_side === "home") return odds.winToNilHome;
    if (tip.bet_side === "away") return odds.winToNilAway;
    return odds.winToNilHome ?? odds.winToNilAway;
  } else if (tip.bet_type === "first_half_goals") {
    if (tip.bet_side === "btts") return odds.firstHalfBtts;
    return odds.firstHalfOver15;
  }
  return null;
}

// ─── Betting tips (multi-market) ─────────────────────────────────────────────

export async function getBettingTips(fixtureId: number) {
  const existing = await db.query.aiBettingTips.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
  });
  if (existing.length >= 8) return existing;

  const ctx = await buildBettingContext(fixtureId);

  if (!ctx.odds.home && !ctx.odds.draw && !ctx.odds.away) {
    return null;
  }

  const accuracy = await getAccuracyHistory();

  // Build rich context sections
  const predSection = ctx.prediction
    ? `API-Football algorithm forecast:
- ${ctx.homeTeam} win: ${ctx.prediction.homeWinPct?.toFixed(0) ?? "?"}%
- Draw: ${ctx.prediction.drawPct?.toFixed(0) ?? "?"}%
- ${ctx.awayTeam} win: ${ctx.prediction.awayWinPct?.toFixed(0) ?? "?"}%
- Predicted score: ${ctx.prediction.goalsHome?.toFixed(1) ?? "?"} - ${ctx.prediction.goalsAway?.toFixed(1) ?? "?"}
- Advice: ${ctx.prediction.advice ?? "None"}`
    : "No algorithmic forecast available.";

  const homeStatsSection = ctx.homeSeasonStats
    ? `${ctx.homeTeam} season (${ctx.homeSeasonStats.played ?? "?"} games): Form ${ctx.homeSeasonStats.form?.slice(-5) ?? "?"} | Goals/game: ${ctx.homeSeasonStats.goalsForAvg?.toFixed(2) ?? "?"} scored, ${ctx.homeSeasonStats.goalsAgainstAvg?.toFixed(2) ?? "?"} conceded | Clean sheets: ${ctx.homeSeasonStats.cleanSheets ?? "?"} | Win streak record: ${ctx.homeSeasonStats.winStreak ?? "?"}`
    : `${ctx.homeTeam}: No season stats`;

  const awayStatsSection = ctx.awaySeasonStats
    ? `${ctx.awayTeam} season (${ctx.awaySeasonStats.played ?? "?"} games): Form ${ctx.awaySeasonStats.form?.slice(-5) ?? "?"} | Goals/game: ${ctx.awaySeasonStats.goalsForAvg?.toFixed(2) ?? "?"} scored, ${ctx.awaySeasonStats.goalsAgainstAvg?.toFixed(2) ?? "?"} conceded | Clean sheets: ${ctx.awaySeasonStats.cleanSheets ?? "?"} | Win streak record: ${ctx.awaySeasonStats.winStreak ?? "?"}`
    : `${ctx.awayTeam}: No season stats`;

  const homeScorersSection = ctx.homeTopScorers.length > 0
    ? `${ctx.homeTeam} top scorers: ${ctx.homeTopScorers.map(p => `${p.name} (${p.goals ?? 0}G/${p.assists ?? 0}A)`).join(", ")}`
    : `${ctx.homeTeam}: No scorer data`;

  const awayScorersSection = ctx.awayTopScorers.length > 0
    ? `${ctx.awayTeam} top scorers: ${ctx.awayTopScorers.map(p => `${p.name} (${p.goals ?? 0}G/${p.assists ?? 0}A)`).join(", ")}`
    : `${ctx.awayTeam}: No scorer data`;

  const sidelinedSection = (ctx.homeSidelined.length > 0 || ctx.awaySidelined.length > 0)
    ? `Sidelined: ${ctx.homeTeam}: ${ctx.homeSidelined.join(", ") || "None"} | ${ctx.awayTeam}: ${ctx.awaySidelined.join(", ") || "None"}`
    : "Sidelined: No injury data";

  const coachSection = (ctx.homeCoach || ctx.awayCoach)
    ? `Coaches: ${ctx.homeTeam}: ${ctx.homeCoach ?? "Unknown"} | ${ctx.awayTeam}: ${ctx.awayCoach ?? "Unknown"}`
    : "";

  const prompt = `You are a professional football betting analyst. Analyse ALL 8 markets below for this upcoming match and return your best tips.

Match: ${ctx.matchLabel}
League: ${ctx.leagueName ?? "Unknown"} | Positions: ${ctx.homeTeam} #${ctx.homeRank ?? "?"} vs ${ctx.awayTeam} #${ctx.awayRank ?? "?"}
Kickoff: ${ctx.kickoff ?? "Unknown"}
${coachSection}

AVAILABLE ODDS:
- 1X2: Home ${ctx.odds.home ?? "N/A"} | Draw ${ctx.odds.draw ?? "N/A"} | Away ${ctx.odds.away ?? "N/A"}
- Over 1.5 goals: ${ctx.odds.over15 ?? "N/A"} | Over 2.5: ${ctx.odds.over25 ?? "N/A"} | Over 3.5: ${ctx.odds.over35 ?? "N/A"}
- BTTS Yes: ${ctx.odds.btts ?? "N/A"}
- Corners Over: ${ctx.odds.cornersOver ?? "N/A"}
- Asian Handicap Home: ${ctx.odds.asianHandicapHome ?? "N/A"}
- Cards Over: ${ctx.odds.totalCardsOver ?? "N/A"}
- Double Chance (1X): ${ctx.odds.doubleChance1X ?? "N/A"} | (X2): ${ctx.odds.doubleChanceX2 ?? "N/A"} | (12): ${ctx.odds.doubleChance12 ?? "N/A"}
- Draw No Bet Home: ${ctx.odds.drawNoBetHome ?? "N/A"} | Away: ${ctx.odds.drawNoBetAway ?? "N/A"}
- Win to Nil Home: ${ctx.odds.winToNilHome ?? "N/A"} | Away: ${ctx.odds.winToNilAway ?? "N/A"}
- First Half Over 1.5: ${ctx.odds.firstHalfOver15 ?? "N/A"} | First Half BTTS: ${ctx.odds.firstHalfBtts ?? "N/A"}

${predSection}

${homeStatsSection}
${awayStatsSection}

${homeScorersSection}
${awayScorersSection}

${sidelinedSection}

Signal data:
${JSON.stringify(ctx.signals, null, 2)}

Your accuracy history: ${accuracy.summary}
${accuracy.totalReviewed > 0 ? `Calibrate trust scores to your ${accuracy.hitRate}% hit rate.` : "First tip — be conservative."}

INSTRUCTIONS:
- Give 6-8 tips covering different bet_types — do NOT repeat the same bet_type twice
- Required: match_result, over_under, btts — then pick 3-5 more from: corners, asian_handicap, total_cards, double_chance, draw_no_bet, win_to_nil, first_half_goals
- For over_under you may pick over15, over25 or over35 as bet_side — choose the line with best edge
- For double_chance: bet_side is "1X", "X2", or "12"
- For draw_no_bet / win_to_nil: bet_side is "home" or "away"
- For first_half_goals: bet_side is "over" (over 1.5 goals in 1st half) or "btts"
- If odds are N/A for a market, set trust_score ≤ 3 but still include the tip
- edge = (estimated_probability × odds) - 1; higher is better
- Trust score: 1-4 = weak, 5-7 = moderate, 8-10 = strong conviction
- Reasoning: max 35 words per tip, cite the data
- No emojis. State facts only.

Respond ONLY valid JSON:
{"tips":[{"recommendation":"Home Win","bet_type":"match_result","bet_side":"home","trust_score":7,"estimated_probability":0.60,"reasoning":"..."},{"recommendation":"Over 2.5 Goals","bet_type":"over_under","bet_side":"over25","trust_score":6,"estimated_probability":0.55,"reasoning":"..."},{"recommendation":"BTTS Yes","bet_type":"btts","bet_side":"yes","trust_score":5,"estimated_probability":0.52,"reasoning":"..."},{"recommendation":"Double Chance 1X","bet_type":"double_chance","bet_side":"1X","trust_score":7,"estimated_probability":0.75,"reasoning":"..."},{"recommendation":"Draw No Bet Home","bet_type":"draw_no_bet","bet_side":"home","trust_score":6,"estimated_probability":0.60,"reasoning":"..."},{"recommendation":"Over 9.5 Corners","bet_type":"corners","bet_side":"over","trust_score":4,"estimated_probability":0.48,"reasoning":"..."}]}

bet_side reference:
match_result: "home","away","draw"
over_under: "over15","over25","over35","under15","under25","under35"
btts: "yes","no"
corners: "over","under"
asian_handicap: "home","away"
total_cards: "over","under"
double_chance: "1X","X2","12"
draw_no_bet: "home","away"
win_to_nil: "home","away"
first_half_goals: "over","btts"`;

  const raw = await callClaude(prompt);
  const parsed = parseJson(raw, MultiBettingTipSchema, null as unknown as z.infer<typeof MultiBettingTipSchema>);

  if (!parsed?.tips?.length) return null;

  const storedTips = [];
  for (const tip of parsed.tips) {
    if (tip.bet_type === "no_bet") continue;
    const marketOdds = getMarketOddsForTip(tip, ctx.odds);
    // Use AI's explicit probability estimate; fall back to trust score / 10
    const aiProb = tip.estimated_probability ?? (tip.trust_score / 10);
    const edge = calcEdge(aiProb, marketOdds);
    const valueRating = calcValueRating(aiProb, marketOdds);

    const [stored] = await db.insert(aiBettingTips).values({
      fixtureId,
      homeTeam: ctx.homeTeam,
      awayTeam: ctx.awayTeam,
      kickoff: ctx.kickoff ? new Date(ctx.kickoff) : null,
      leagueName: ctx.leagueName,
      recommendation: tip.recommendation,
      betType: tip.bet_type,
      betSide: tip.bet_side ?? null,
      trustScore: Math.round(tip.trust_score),
      aiProbability: aiProb,
      edge,
      reasoning: tip.reasoning,
      marketOdds,
      valueRating,
    }).onConflictDoUpdate({
      target: [aiBettingTips.fixtureId, aiBettingTips.betType],
      set: {
        recommendation: tip.recommendation,
        betSide: tip.bet_side ?? null,
        trustScore: Math.round(tip.trust_score),
        aiProbability: aiProb,
        edge,
        reasoning: tip.reasoning,
        marketOdds,
        valueRating,
      },
    }).returning();
    if (stored) {
      storedTips.push(stored);
      // Fire broadcast alert for high-value tips (visible to all users within 6h)
      if (stored.trustScore >= 8 && (stored.valueRating === "strong_value" || stored.valueRating === "value")) {
        const oddsStr = stored.marketOdds ? ` @ ${stored.marketOdds.toFixed(2)}` : "";
        const alertText = `High-value tip: ${stored.homeTeam} vs ${stored.awayTeam} — ${stored.recommendation}${oddsStr} (trust ${stored.trustScore}/10, ${stored.valueRating?.replace("_", " ")})`;
        db.insert(alertLog).values({
          fixtureId,
          sessionId: null,
          signalKey: "high_value_tip",
          alertText,
          isRead: false,
          createdAt: new Date(),
        }).catch((e: unknown) => console.error("[ai] alert insert error:", e));
      }
    }
  }

  console.log(`[ai] Generated ${storedTips.length} betting tips for fixture ${fixtureId}`);
  return storedTips;
}

export async function getBettingTip(fixtureId: number) {
  const tips = await getBettingTips(fixtureId);
  return tips && tips.length > 0 ? tips[0] : null;
}

// ─── Post-match review ────────────────────────────────────────────────────────

export async function triggerPostMatchReview(fixtureId: number): Promise<void> {
  const tips = await db.query.aiBettingTips.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
  });

  if (!tips.length) return;
  const unreviewedTips = tips.filter(t => !t.outcome);
  if (!unreviewedTips.length) return;

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });

  const FINISHED_STATUSES = ["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"];
  if (!fixture || !FINISHED_STATUSES.includes(fixture.statusShort ?? "")) {
    // Clear any tips that were incorrectly graded during a live match
    await db.update(aiBettingTips)
      .set({ outcome: null, reviewedAt: null, reviewHeadline: null, reviewSummary: null, accuracyNote: null })
      .where(and(eq(aiBettingTips.fixtureId, fixtureId), isNotNull(aiBettingTips.outcome)));
    return;
  }
  if (fixture.homeGoals == null || fixture.awayGoals == null) return;

  const hg = fixture.homeGoals;
  const ag = fixture.awayGoals;
  const totalGoals = hg + ag;
  const actualResult = hg > ag ? "home_win" : hg < ag ? "away_win" : "draw";
  const bttsResult = hg > 0 && ag > 0;
  const over25Result = totalGoals > 2;

  const postSignals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) => andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "post")),
  });
  const signalCtx: Record<string, unknown> = {};
  for (const s of postSignals) {
    if (s.signalBool !== null) signalCtx[s.signalKey] = s.signalBool;
    else if (s.signalValue !== null) signalCtx[s.signalKey] = Math.round(s.signalValue * 1000) / 1000;
  }

  const resultStr = `${fixture.homeTeamName} ${hg} - ${ag} ${fixture.awayTeamName} (FT)`;

  for (const tip of unreviewedTips) {
    let outcome: "hit" | "miss" | "partial" = "miss";

    if (tip.betType === "no_bet") {
      outcome = "hit";
    } else if (tip.betType === "match_result") {
      if (
        (tip.betSide === "home" && actualResult === "home_win") ||
        (tip.betSide === "away" && actualResult === "away_win") ||
        (tip.betSide === "draw" && actualResult === "draw")
      ) {
        outcome = "hit";
      }
    } else if (tip.betType === "over_under") {
      if (
        (tip.betSide === "over" && over25Result) ||
        (tip.betSide === "under" && !over25Result)
      ) {
        outcome = "hit";
      }
    } else if (tip.betType === "btts") {
      if (
        (tip.betSide === "yes" && bttsResult) ||
        (tip.betSide === "no" && !bttsResult)
      ) {
        outcome = "hit";
      }
    }

    const prompt = `You are reviewing your own football betting prediction.

Your original tip: "${tip.recommendation}" — ${tip.reasoning}
Trust score you assigned: ${tip.trustScore}/10
Outcome: ${outcome.toUpperCase()} (${resultStr})

Post-match signals:
${JSON.stringify(signalCtx, null, 2)}

Write a brief honest review. Was the reasoning sound? What signals were right or wrong?

Respond with ONLY valid JSON:
{
  "outcome": "${outcome}",
  "review_headline": "One sentence recap (max 12 words)",
  "review_summary": "Two sentences max 50 words.",
  "accuracy_note": "One sentence on what signal data was right or wrong. Max 25 words."
}`;

    const raw = await callClaude(prompt);
    const review = parseJson(raw, PostReviewSchema, {
      outcome,
      review_headline: resultStr,
      review_summary: `${fixture.homeTeamName} ${hg}-${ag} ${fixture.awayTeamName}. Tip was ${outcome}.`,
      accuracy_note: "Review generated from match result.",
    });

    await db.update(aiBettingTips)
      .set({
        outcome: review.outcome,
        reviewHeadline: review.review_headline,
        reviewSummary: review.review_summary,
        accuracyNote: review.accuracy_note,
        reviewedAt: new Date(),
      })
      .where(eq(aiBettingTips.id, tip.id));

    console.log(`[ai] Post-match review for fixture ${fixtureId} (${tip.betType}): ${review.outcome.toUpperCase()}`);
  }
}

// ─── Live analysis (kept for live tab) ───────────────────────────────────────

async function buildLiveSignalContext(fixtureId: number): Promise<Record<string, number | boolean | string> | null> {
  const [signals, fixture, { rows: liveOddsRows }] = await Promise.all([
    db.query.fixtureSignals.findMany({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "live")),
    }),
    db.query.fixtures.findFirst({
      where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
    }),
    pool.query<{ homeWin: number | null; draw: number | null; awayWin: number | null }>(`
      SELECT DISTINCT ON (bookmaker) home_win AS "homeWin", draw, away_win AS "awayWin"
      FROM odds_snapshots WHERE fixture_id = $1 ORDER BY bookmaker, snapped_at DESC
    `, [fixtureId]),
  ]);
  const latestOdds = liveOddsRows.length > 0 ? {
    homeWin: liveOddsRows.reduce((b, r) => Math.max(b, r.homeWin ?? 0), 0) || null,
    draw: liveOddsRows.reduce((b, r) => Math.max(b, r.draw ?? 0), 0) || null,
    awayWin: liveOddsRows.reduce((b, r) => Math.max(b, r.awayWin ?? 0), 0) || null,
  } : null;

  if (!fixture) return null;

  const ctx: Record<string, number | boolean | string> = {
    match: `${fixture.homeTeamName ?? "Home"} vs ${fixture.awayTeamName ?? "Away"}`,
    minute: fixture.statusElapsed ?? 0,
    home_goals: fixture.homeGoals ?? 0,
    away_goals: fixture.awayGoals ?? 0,
    status: fixture.statusShort ?? "NS",
  };

  if (latestOdds) {
    if (latestOdds.homeWin) ctx.home_odds = latestOdds.homeWin;
    if (latestOdds.draw) ctx.draw_odds = latestOdds.draw;
    if (latestOdds.awayWin) ctx.away_odds = latestOdds.awayWin;
    if (latestOdds.overUnder25) ctx.over_25_odds = latestOdds.overUnder25;
    if (latestOdds.btts) ctx.btts_odds = latestOdds.btts;
  }

  for (const s of signals) {
    if (s.signalBool !== null && s.signalBool !== undefined) ctx[s.signalKey] = s.signalBool;
    else if (s.signalValue !== null && s.signalValue !== undefined) ctx[s.signalKey] = Math.round(s.signalValue * 1000) / 1000;
  }
  return ctx;
}

export async function getLiveAnalysis(fixtureId: number): Promise<LiveAnalysis> {
  const key = `live:${fixtureId}`;
  const cached = getCached<LiveAnalysis>(key);
  if (cached) return cached;

  const ctx = await buildLiveSignalContext(fixtureId);
  if (!ctx) return FALLBACK_LIVE;

  const prompt = `You are a football analyst. Live match data:

${JSON.stringify(ctx)}

Respond with ONLY valid JSON:
{
  "headline": "Live headline max 12 words",
  "narrative": "Two sentences on current match state, max 50 words",
  "momentum_verdict": "Max 8 words describing momentum",
  "key_factors": ["factor 1", "factor 2"],
  "alert_worthy": true
}`;

  const raw = await callClaude(prompt);
  const result = parseJson(raw, LiveAnalysisSchema, FALLBACK_LIVE);
  setCached(key, result, 5 * 60 * 1000);
  return result;
}

// ─── Accuracy stats (for admin / display) ────────────────────────────────────

export async function getAiAccuracyStats() {
  const all = await db.query.aiBettingTips.findMany({
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
    limit: 100,
  });

  const reviewed = all.filter((t) => t.outcome !== null);
  const hits = reviewed.filter((t) => t.outcome === "hit").length;
  const misses = reviewed.filter((t) => t.outcome === "miss").length;
  const noBets = all.filter((t) => t.betType === "no_bet").length;
  const hitRate = reviewed.length > 0 ? Math.round((hits / reviewed.length) * 100) : null;

  const byBetType: Record<string, { total: number; hits: number }> = {};
  for (const t of reviewed) {
    const key = t.betType;
    if (!byBetType[key]) byBetType[key] = { total: 0, hits: 0 };
    byBetType[key]!.total++;
    if (t.outcome === "hit") byBetType[key]!.hits++;
  }

  const recentTips = all.slice(0, 10).map((t) => ({
    fixtureId: t.fixtureId,
    homeTeam: t.homeTeam,
    awayTeam: t.awayTeam,
    kickoff: t.kickoff,
    recommendation: t.recommendation,
    trustScore: t.trustScore,
    outcome: t.outcome,
    reviewHeadline: t.reviewHeadline,
  }));

  return {
    totalTips: all.length,
    reviewed: reviewed.length,
    hits,
    misses,
    noBets,
    hitRate,
    byBetType,
    recentTips,
  };
}

// ─── Alert text (unchanged) ───────────────────────────────────────────────────

export async function generateAlertText(signalKey: string, signalLabel: string, matchName: string): Promise<string> {
  const cacheKey = `alert:${signalKey}:${matchName}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;

  const prompt = `Football alert: ${matchName} — Signal: "${signalLabel}". Write a 1-sentence alert in max 20 words. No emoji. Be direct and factual.`;
  const raw = await callClaude(prompt);
  const text = raw?.replace(/```[^`]*```/g, "").trim() ?? `${matchName}: ${signalLabel}`;
  setCached(cacheKey, text, 60 * 60 * 1000); // 1 hour TTL
  return text;
}

export interface NewsArticle {
  id: string;
  teamId: number;
  teamName: string;
  teamLogo: string | null;
  rank: number;
  headline: string;
  body: string;
  fixtureLine: string;
  homeGoals: number | null;
  awayGoals: number | null;
  opponent: string;
  result: "win" | "draw" | "loss" | "upcoming";
  kickoff: string | null;
}

const NEWS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours before regenerating

export async function generateLeagueNews(
  leagueId: number,
  topTeams: Array<{ teamId: number; teamName: string; teamLogo: string | null; rank: number; points: number }>,
  recentMatches: Array<{
    teamId: number; teamName: string; opponentName: string; homeGoals: number | null;
    awayGoals: number | null; isHome: boolean; kickoff: string | null; statusShort: string | null;
  }>
): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  for (const team of topTeams) {
    const teamMatches = recentMatches
      .filter((m) => m.teamId === team.teamId)
      .slice(0, 3);

    if (teamMatches.length === 0) continue;

    const lastMatch = teamMatches[0]!;
    const isHome = lastMatch.isHome;
    const goals = isHome ? lastMatch.homeGoals : lastMatch.awayGoals;
    const oppGoals = isHome ? lastMatch.awayGoals : lastMatch.homeGoals;

    let result: NewsArticle["result"] = "upcoming";
    if (lastMatch.statusShort && ["FT","AET","PEN"].includes(lastMatch.statusShort)) {
      if (goals != null && oppGoals != null) {
        result = goals > oppGoals ? "win" : goals < oppGoals ? "loss" : "draw";
      }
    }

    const fixtureLine = `${lastMatch.isHome ? team.teamName : lastMatch.opponentName} ${lastMatch.homeGoals ?? "?"} - ${lastMatch.awayGoals ?? "?"} ${lastMatch.isHome ? lastMatch.opponentName : team.teamName}`;
    const headline = `#${team.rank} ${team.teamName}: ${result === "win" ? "Victory" : result === "draw" ? "Draw" : result === "loss" ? "Defeat" : "In Action"}`;

    // ── Check DB for cached article (< 24h old) ──────────────────────────────
    const existing = await db.query.newsArticles.findFirst({
      where: (n, { and: andFn, eq: eqFn }) => andFn(eqFn(n.leagueId, leagueId), eqFn(n.teamId, team.teamId)),
    });

    if (existing && (Date.now() - existing.generatedAt.getTime()) < NEWS_TTL_MS) {
      articles.push({
        id: `${leagueId}-${team.teamId}`,
        teamId: existing.teamId,
        teamName: existing.teamName,
        teamLogo: existing.teamLogo,
        rank: existing.rank,
        headline: existing.headline,
        body: existing.body,
        fixtureLine: existing.fixtureLine ?? fixtureLine,
        homeGoals: existing.homeGoals,
        awayGoals: existing.awayGoals,
        opponent: existing.opponent ?? lastMatch.opponentName,
        result: (existing.result as NewsArticle["result"]) ?? result,
        kickoff: existing.kickoff?.toISOString() ?? lastMatch.kickoff,
      });
      continue;
    }

    // ── Generate new article with Claude ──────────────────────────────────────
    const matchContext = teamMatches.map((m) => {
      const g = m.isHome ? m.homeGoals : m.awayGoals;
      const og = m.isHome ? m.awayGoals : m.homeGoals;
      const res = g != null && og != null ? `${g}-${og}` : "?-?";
      const side = m.isHome ? "H" : "A";
      return `${m.opponentName} (${side}) ${res}`;
    }).join(", ");

    const prompt = `You are a football journalist writing short news snippets. Write a 2-sentence news blurb about ${team.teamName} (currently ranked #${team.rank} in the league table). Their recent matches: ${matchContext}. Focus on their form and what it means for the title race. Be direct, punchy. No emoji. Max 60 words total.`;

    const raw = await callClaude(prompt);
    const body = raw?.trim() ?? `${team.teamName} continue their campaign.`;

    // ── Save to DB (upsert) ───────────────────────────────────────────────────
    await db.insert(newsArticles).values({
      leagueId,
      teamId: team.teamId,
      teamName: team.teamName,
      teamLogo: team.teamLogo,
      rank: team.rank,
      headline,
      body,
      fixtureLine,
      homeGoals: lastMatch.homeGoals,
      awayGoals: lastMatch.awayGoals,
      opponent: lastMatch.opponentName,
      result,
      kickoff: lastMatch.kickoff ? new Date(lastMatch.kickoff) : null,
      generatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [newsArticles.leagueId, newsArticles.teamId],
      set: { headline, body, fixtureLine, homeGoals: lastMatch.homeGoals, awayGoals: lastMatch.awayGoals, opponent: lastMatch.opponentName, result, kickoff: lastMatch.kickoff ? new Date(lastMatch.kickoff) : null, generatedAt: new Date() },
    });

    articles.push({
      id: `${leagueId}-${team.teamId}`,
      teamId: team.teamId,
      teamName: team.teamName,
      teamLogo: team.teamLogo,
      rank: team.rank,
      headline,
      body,
      fixtureLine,
      homeGoals: lastMatch.homeGoals,
      awayGoals: lastMatch.awayGoals,
      opponent: lastMatch.opponentName,
      result,
      kickoff: lastMatch.kickoff,
    });
  }

  return articles;
}

// ─── Pre-match AI Synthesis ───────────────────────────────────────────────────

export interface PrematchSynthesis {
  headline: string;
  summary: string;
  keyFactors: string[];
  bestBet: string | null;
  bestBetOdds: number | null;
  generatedAt: string;
}

/**
 * Generates a short pre-match AI synthesis (headline + summary + key factors).
 * Cache hierarchy: 1) in-memory 2h, 2) DB 12h, 3) Claude (only on miss/stale).
 * Survives server restarts — no redundant Claude calls.
 */
// Synthesis TTL: regenerate after 12h so it stays fresh pre-match
const SYNTHESIS_TTL_MS = 12 * 60 * 60 * 1000;

export async function generatePrematchSynthesis(fixtureId: number): Promise<PrematchSynthesis | null> {
  const cacheKey = `prematch-synthesis:${fixtureId}`;

  // 1. Fast path — in-memory cache (2h)
  const cached = getCached<PrematchSynthesis>(cacheKey);
  if (cached) return cached;

  // 2. DB path — survives server restarts (12h TTL)
  const existing = await db.query.prematchSyntheses.findFirst({
    where: (s, { eq: eqFn }) => eqFn(s.fixtureId, fixtureId),
  });
  if (existing && (Date.now() - existing.generatedAt.getTime()) < SYNTHESIS_TTL_MS) {
    const fromDb: PrematchSynthesis = {
      headline: existing.headline,
      summary: existing.summary,
      keyFactors: (existing.keyFactors as string[]) ?? [],
      bestBet: existing.bestBet,
      bestBetOdds: existing.bestBetOdds,
      generatedAt: existing.generatedAt.toISOString(),
    };
    setCached(cacheKey, fromDb, 2 * 60 * 60 * 1000);
    return fromDb;
  }

  // 3. Check how many tips exist — don't regenerate if DB row is still fresh-enough
  //    and tip count hasn't changed (avoid redundant Claude calls)
  const tips = await db.query.aiBettingTips.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
    orderBy: (t, { desc: d }) => [d(t.trustScore)],
    limit: 8,
  });

  if (!tips.length) return null;

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
    columns: { homeTeamName: true, awayTeamName: true, leagueName: true, kickoff: true, homeTeamId: true, awayTeamId: true },
  });

  const pred = await db.query.predictions.findFirst({ where: (p, { eq: eqFn }) => eqFn(p.fixtureId, fixtureId) });
  const homeTeam = fixture?.homeTeamName ?? "Home";
  const awayTeam = fixture?.awayTeamName ?? "Away";
  const matchLabel = `${homeTeam} vs ${awayTeam}`;
  const leagueName = fixture?.leagueName ?? "";

  const tipLines = tips.map(t => {
    const edge = t.edge != null ? ` (edge: ${(Number(t.edge) * 100).toFixed(1)}%)` : "";
    return `- ${t.betType}: ${t.recommendation} @ ${t.marketOdds ?? "?"} | trust ${t.trustScore}/10${edge} | ${t.valueRating ?? "fair"} | ${t.reasoning?.slice(0, 120) ?? ""}`;
  }).join("\n");

  const predLine = pred
    ? `Algorithm prediction: ${homeTeam} ${pred.homeWinPct ?? "?"}% win / Draw ${pred.drawPct ?? "?"}% / ${awayTeam} ${pred.awayWinPct ?? "?"}% win. Predicted score: ${pred.goalsHome ?? "?"}–${pred.goalsAway ?? "?"}. Advice: ${pred.advice ?? "—"}`
    : "";

  const bestTip = tips[0];

  const prompt = `You are an expert football betting analyst. Write a concise pre-match briefing for ${matchLabel} (${leagueName}).

${predLine ? predLine + "\n\n" : ""}AI Betting Tips generated:
${tipLines}

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "headline": "One punchy sentence (max 15 words) capturing the key angle",
  "summary": "2-3 sentences synthesising the overall match picture and where the value lies",
  "keyFactors": ["factor 1", "factor 2", "factor 3"]
}

Rules: No emoji. Be direct and analytical. Focus on the bet with the most edge.`;

  const raw = await callClaude(prompt);
  if (!raw) return null;

  const schema = z.object({
    headline: z.string(),
    summary: z.string(),
    keyFactors: z.array(z.string()),
  });

  const parsed = parseJson(raw, schema, { headline: matchLabel, summary: "", keyFactors: [] });

  const result: PrematchSynthesis = {
    headline: parsed.headline,
    summary: parsed.summary,
    keyFactors: parsed.keyFactors,
    bestBet: bestTip ? `${bestTip.recommendation}` : null,
    bestBetOdds: bestTip?.marketOdds ? Number(bestTip.marketOdds) : null,
    generatedAt: new Date().toISOString(),
  };

  // 4. Save to DB — survives server restarts
  await db.insert(prematchSyntheses).values({
    fixtureId,
    headline: result.headline,
    summary: result.summary,
    keyFactors: result.keyFactors,
    bestBet: result.bestBet,
    bestBetOdds: result.bestBetOdds,
    generatedAt: new Date(),
  }).onConflictDoUpdate({
    target: prematchSyntheses.fixtureId,
    set: {
      headline: result.headline,
      summary: result.summary,
      keyFactors: result.keyFactors,
      bestBet: result.bestBet,
      bestBetOdds: result.bestBetOdds,
      generatedAt: new Date(),
    },
  });

  setCached(cacheKey, result, 2 * 60 * 60 * 1000); // 2h in-memory
  return result;
}
