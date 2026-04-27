import Anthropic from "@anthropic-ai/sdk";
import { db, pool } from "@workspace/db";
import { aiBettingTips, alertLog, fixtures, oddsSnapshots, standings, teamFeatures, h2hFixtures, h2hFixtureStats, newsArticles, systemKv, predictions, sidelinedPlayers, coaches, teamSeasonStats, playerSeasonStats, oddsMarkets, prematchSyntheses, predictionReviews } from "@workspace/db/schema";
import { z } from "zod";
import { eq, and, gte, isNotNull, desc, sql } from "drizzle-orm";
import { calculateConfidence } from "./confidence.js";
import { emitSuperValueAlert } from "../alerts/alertEngine.js";
import { generateAlgorithmicTips } from "./tipEngine.js";
import { getCalibrationFactors } from "./calibrationEngine.js";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

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

const INPUT_COST_PER_M = 1.00;
const OUTPUT_COST_PER_M = 5.00;

interface AiUsageEntry { at: number; inputTokens: number; outputTokens: number; }
let aiUsageLog: AiUsageEntry[] = [];
let totalInputTokens = 0;
let totalOutputTokens = 0;
let lastAiError: string | null = null;
let lastAiRunAt: number | null = null;

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
  const now = Date.now();
  const totalCost =
    (totalInputTokens / 1_000_000) * INPUT_COST_PER_M +
    (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  const last24h = now - 24 * 60 * 60 * 1000;
  const last7d = now - 7 * 24 * 60 * 60 * 1000;
  const todayStart = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );

  const entries24h = aiUsageLog.filter((e) => e.at > last24h);
  const entries7d = aiUsageLog.filter((e) => e.at > last7d);
  const entriesToday = aiUsageLog.filter((e) => e.at >= todayStart);

  const sum = (arr: AiUsageEntry[], key: "inputTokens" | "outputTokens") =>
    arr.reduce((s, e) => s + e[key], 0);

  const last7dInput = sum(entries7d, "inputTokens");
  const last7dOutput = sum(entries7d, "outputTokens");
  const daysWithData = Math.max(1, new Set(entries7d.map((e) => new Date(e.at).toISOString().slice(0, 10))).size);

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
    todayInputTokens: sum(entriesToday, "inputTokens"),
    todayOutputTokens: sum(entriesToday, "outputTokens"),
    last24hInputTokens: sum(entries24h, "inputTokens"),
    last24hOutputTokens: sum(entries24h, "outputTokens"),
    last7dInputTokens: last7dInput,
    last7dOutputTokens: last7dOutput,
    last7dTokens: last7dInput + last7dOutput,
    avgDailyTokens: Math.round((last7dInput + last7dOutput) / daysWithData),
    callsTotal: aiUsageLog.length,
    model: "claude-haiku-4-5-20251001",
    pricingNote: `$${INPUT_COST_PER_M}/MTok in · $${OUTPUT_COST_PER_M}/MTok out`,
    lastError: lastAiError,
    lastRunAt: lastAiRunAt,
  };
}

const DAILY_SPEND_CAP_USD = 2.0; // Hard stop — change to raise the limit

function getTodaySpendUsd(): number {
  const todayStart = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const entriesToday = aiUsageLog.filter((e) => e.at >= todayStart);
  const inputTok = entriesToday.reduce((s, e) => s + e.inputTokens, 0);
  const outputTok = entriesToday.reduce((s, e) => s + e.outputTokens, 0);
  return (inputTok / 1_000_000) * INPUT_COST_PER_M + (outputTok / 1_000_000) * OUTPUT_COST_PER_M;
}

async function callClaude(userMessage: string, system?: string): Promise<string | null> {
  const todaySpend = getTodaySpendUsd();
  if (todaySpend >= DAILY_SPEND_CAP_USD) {
    console.warn(`[ai] Daily spend cap reached ($${todaySpend.toFixed(4)} >= $${DAILY_SPEND_CAP_USD}). Skipping call.`);
    return null;
  }
  try {
    const msg = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      ...(system ? {
        system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      } : {}),
      messages: [{ role: "user", content: userMessage }],
    });
    const inputTok = msg.usage?.input_tokens ?? 0;
    const outputTok = msg.usage?.output_tokens ?? 0;
    totalInputTokens += inputTok;
    totalOutputTokens += outputTok;
    scheduleAiFlush();
    aiUsageLog.push({ at: Date.now(), inputTokens: inputTok, outputTokens: outputTok });
    if (aiUsageLog.length > 500) aiUsageLog = aiUsageLog.slice(-500);
    lastAiRunAt = Date.now();
    lastAiError = null;
    const block = msg.content[0];
    if (block?.type === "text") return block.text;
    return null;
  } catch (err) {
    lastAiError = err instanceof Error ? err.message : String(err);
    console.error("[ai] Claude error:", err);
    return null;
  }
}

// Haiku 4.5 requires ≥4096 stable tokens for cache hits (~16 KB). This block is
// currently ~500 tokens — caching is silently skipped. Expand the static analysis
// guidance below (e.g. detailed market theory) to reach the threshold if call
// volume warrants paying the 1.25× cache-write premium.
const BETTING_SYSTEM = `You are a professional football betting analyst. Your task is to analyse all available betting markets for an upcoming football match and return your best tips in JSON format.

INSTRUCTIONS:
- Give exactly 5 tips covering different bet_types — do NOT repeat the same bet_type twice
- Required: match_result, over_under, btts — then pick 2 more from: correct_score, first_team_score, corners, asian_handicap, total_cards, double_chance, draw_no_bet, win_to_nil
- For over_under you may pick over15, over25 or over35 as bet_side — choose the line with best edge
- For double_chance: bet_side is "1X", "X2", or "12"
- For draw_no_bet / win_to_nil: bet_side is "home" or "away"
- For first_half_goals: bet_side is "over" (over 1.5 goals in 1st half) or "btts"
- For correct_score: recommendation = the most likely scoreline e.g. "1-1" or "2-1"; bet_side = same scoreline in format "H:A" e.g. "1:1". Pick the scoreline with best value from top 5 available. Only pick if trust_score >= 4.
- For first_team_score: bet_side = "home" or "away". Pick based on attacking pressure, home advantage, top scorer availability, and odds value.
- If odds are N/A for a market, set trust_score ≤ 3 but still include the tip
- edge = (estimated_probability × odds) - 1; higher is better
- Trust score: 1-4 = weak, 5-7 = moderate, 8-10 = strong conviction
- Reasoning: max 35 words per tip, cite the data
- No emojis. State facts only.
- Reasoning MUST NOT mention data sources, APIs, algorithms, providers, or internal section headings. Never write "API", "API-Football", "algorithm", "forecast from API", "baseline model says", "our model", or similar. Phrase insights as direct football analysis (team form, injuries, xG, odds value, H2H) — as if you are a human analyst watching the match.

EVIDENCE-BASED SIGNAL WEIGHTING (backtested on 23,000+ matches — apply these rules to every tip):

MATCH RESULT — primary signals in priority order:
1. League rank diff + goal difference diff: THE strongest predictors. If the home team is ranked ≥5 positions higher AND has a better GD by ≥5, hit rate for home win is ~60% (base 44%). Rank diff ≥10 + GD diff ≥10 → 64% home win rate. Weight this heavily. Away teams ranked ≥10 higher with GD ≥10 better win ~54% away (base 31%).
2. Table points diff: ≥10 point gap → 54% hit rate for the better team. Useful secondary signal.
3. Season win rate diff and recent form: use as confirming signals, not primary. They add ~2-3pp edge on top of rank+GD when aligned.
4. DRAW signal: when rank diff <3, points diff <3, and form is balanced — draw probability rises from 25% base to ~29%. Draws are hard to predict; only call a draw if multiple signals agree it's a balanced match.

GOALS / BTTS — primary signals in priority order:
1. Expected goals from last 10 games (sum of both teams) + H2H avg goals: THE strongest combo. Both ≥3.0 → 77% Over 2.5 and 81% BTTS. Both ≥2.5 → 69% BTTS, 67% Over 2.5. Weight this very heavily.
2. Season avg goals (both teams combined): ≥2.5 confirms the trend. Use as secondary signal.
3. Clean sheet rates: both teams with CS rate ≤25% → confirms BTTS. Both ≥40% → suppresses BTTS.
4. When expected goals are low (<2.0 combined last 10), lean Under 2.5 — base rate is already 46% and low-scoring signals push it higher.

CALIBRATION RULES:
- If rank diff ≥8 AND GD diff ≥5 for the same team: raise that team's match_result trust by +1-2
- If both teams' expected goals (last 10) ≥3.0 AND H2H avg ≥2.5: raise over_under and btts trust by +2
- If signals conflict (e.g. rank says home win but form says away): stay close to base rates, lower trust
- Never give trust_score ≥8 unless at least 2 primary signals strongly agree

Respond ONLY valid JSON:
{"tips":[{"recommendation":"Home Win","bet_type":"match_result","bet_side":"home","trust_score":7,"estimated_probability":0.60,"reasoning":"..."},{"recommendation":"Over 2.5 Goals","bet_type":"over_under","bet_side":"over25","trust_score":6,"estimated_probability":0.55,"reasoning":"..."},{"recommendation":"BTTS Yes","bet_type":"btts","bet_side":"yes","trust_score":5,"estimated_probability":0.52,"reasoning":"..."},{"recommendation":"1-1","bet_type":"correct_score","bet_side":"1:1","trust_score":5,"estimated_probability":0.12,"reasoning":"..."},{"recommendation":"Home Team Scores First","bet_type":"first_team_score","bet_side":"home","trust_score":6,"estimated_probability":0.55,"reasoning":"..."}]}

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
first_half_goals: "over","btts"
correct_score: scoreline in "H:A" format e.g. "1:0","1:1","2:1","0:0"
first_team_score: "home","away"`;

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

// Fase 1.9 — Generel AI-kalibrering fra 90-dages track record.
// Aggregerer hit-rate, Brier og ROI per primary market + per confidence-tier så
// LLM'en kan selvkalibrere sine trust-scores på ALLE fremtidige kampe
// (ikke bare den aktuelle).
let _accuracyCache: { value: AccuracyHistory; expiresAt: number } | null = null;
const ACCURACY_TTL_MS = 10 * 60 * 1000;

interface AccuracyHistory {
  hitRate: number;
  totalReviewed: number;
  hits: number;
  summary: string;
}

async function getAccuracyHistory(): Promise<AccuracyHistory> {
  if (_accuracyCache && Date.now() < _accuracyCache.expiresAt) return _accuracyCache.value;

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      betType: aiBettingTips.betType,
      confidence: aiBettingTips.confidence,
      outcome: aiBettingTips.outcome,
      brierScore: predictionReviews.brierScore,
      roiImpact: predictionReviews.roiImpact,
    })
    .from(aiBettingTips)
    .leftJoin(predictionReviews, eq(aiBettingTips.id, predictionReviews.predictionId))
    .where(and(isNotNull(aiBettingTips.outcome), gte(aiBettingTips.reviewedAt, since)))
    .limit(2000);

  if (rows.length === 0) {
    const empty: AccuracyHistory = {
      hitRate: 0,
      totalReviewed: 0,
      hits: 0,
      summary: "No 90d review history yet — be conservative on trust scores (cap at 7) until track record builds.",
    };
    _accuracyCache = { value: empty, expiresAt: Date.now() + ACCURACY_TTL_MS };
    return empty;
  }

  const hits = rows.filter((r) => r.outcome === "hit").length;
  const hitRate = Math.round((hits / rows.length) * 100);

  const PRIMARY = ["match_result", "over_under_2_5", "btts"] as const;
  type MarketBucket = { total: number; hits: number; brierSum: number; brierN: number; roiSum: number; roiN: number };
  const byMarket = new Map<string, MarketBucket>();
  const bucket = (k: string) => {
    let b = byMarket.get(k);
    if (!b) { b = { total: 0, hits: 0, brierSum: 0, brierN: 0, roiSum: 0, roiN: 0 }; byMarket.set(k, b); }
    return b;
  };
  for (const r of rows) {
    const key = (PRIMARY as readonly string[]).includes(r.betType) ? r.betType : "other";
    const b = bucket(key);
    b.total++;
    if (r.outcome === "hit") b.hits++;
    if (r.brierScore != null) { b.brierSum += r.brierScore; b.brierN++; }
    if (r.roiImpact != null) { b.roiSum += r.roiImpact; b.roiN++; }
  }

  const byConf: Record<string, { total: number; hits: number }> = {
    high: { total: 0, hits: 0 },
    medium: { total: 0, hits: 0 },
    low: { total: 0, hits: 0 },
  };
  for (const r of rows) {
    const c = (r.confidence ?? "").toLowerCase();
    if (!byConf[c]) continue;
    byConf[c].total++;
    if (r.outcome === "hit") byConf[c].hits++;
  }

  const marketOrder = [...PRIMARY, "other"];
  const marketLines = marketOrder
    .filter((m) => byMarket.has(m))
    .map((m) => {
      const s = byMarket.get(m)!;
      const rate = Math.round((s.hits / s.total) * 100);
      const brier = s.brierN > 0 ? (s.brierSum / s.brierN).toFixed(3) : "n/a";
      const roi = s.roiN > 0 ? `${(s.roiSum / s.roiN >= 0 ? "+" : "")}${((s.roiSum / s.roiN) * 100).toFixed(1)}%` : "n/a";
      return `${m}=${rate}% (${s.hits}/${s.total}) brier=${brier} roi=${roi}`;
    })
    .join(" | ");

  const confLines = (["high", "medium", "low"] as const)
    .filter((c) => byConf[c].total > 0)
    .map((c) => `${c}=${Math.round((byConf[c].hits / byConf[c].total) * 100)}% (${byConf[c].hits}/${byConf[c].total})`)
    .join(" | ");

  const summary = `90d track record: ${hits}/${rows.length} correct (${hitRate}% overall). Per market: ${marketLines}.${confLines ? ` Per confidence: ${confLines}.` : ""}`;

  const result: AccuracyHistory = { hitRate, totalReviewed: rows.length, hits, summary };
  _accuracyCache = { value: result, expiresAt: Date.now() + ACCURACY_TTL_MS };
  return result;
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
    correctScoreTopOdds: Array<{ score: string; odd: number }> | null;
    firstTeamScoreHome: number | null; firstTeamScoreAway: number | null;
  };
  homeRank: number | null;
  awayRank: number | null;
  homePoints: number | null;
  awayPoints: number | null;
  homeGD: number | null;
  awayGD: number | null;
  prediction: { homeWinPct: number | null; drawPct: number | null; awayWinPct: number | null; goalsHome: number | null; goalsAway: number | null; advice: string | null; winner: string | null } | null;
  homeSeasonStats: { form: string | null; goalsForAvg: number | null; goalsAgainstAvg: number | null; cleanSheets: number | null; winStreak: number | null; played: number | null; goalsForAvgHome: number | null; goalsAgainstAvgHome: number | null; cleanSheetsHome: number | null; failedToScoreHome: number | null; winsHome: number | null; lossesHome: number | null } | null;
  awaySeasonStats: { form: string | null; goalsForAvg: number | null; goalsAgainstAvg: number | null; cleanSheets: number | null; winStreak: number | null; played: number | null; goalsForAvgAway: number | null; goalsAgainstAvgAway: number | null; cleanSheetsAway: number | null; failedToScoreAway: number | null; winsAway: number | null; lossesAway: number | null } | null;
  homeTopScorers: Array<{ name: string; goals: number | null; assists: number | null }>;
  awayTopScorers: Array<{ name: string; goals: number | null; assists: number | null }>;
  homeSidelined: string[];
  awaySidelined: string[];
  homeCoach: string | null;
  awayCoach: string | null;
  referee: string | null;
  homeRecentXg: number | null;
  awayRecentXg: number | null;
  homeRecentStats: { avgCorners: number | null; avgCards: number | null; avgShots: number | null; avgPossession: number | null; avgFouls: number | null } | null;
  awayRecentStats: { avgCorners: number | null; avgCards: number | null; avgShots: number | null; avgPossession: number | null; avgFouls: number | null } | null;
  h2hAiNotes: Array<{ kickoff: string; result: string; betType: string; outcome: string; note: string }>;
  oddsMovement: { homeOpen: number | null; homeNow: number | null; homeShift: number | null; awayOpen: number | null; awayNow: number | null; awayShift: number | null } | null;
  weather: { temp: number | null; desc: string | null; wind: number | null; humidity: number | null; isAdverse: boolean; adverseReason?: string } | null;
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
      signals: {}, odds: { home: null, draw: null, away: null, over25: null, over15: null, over35: null, btts: null, cornersOver: null, totalCardsOver: null, asianHandicapHome: null, doubleChance1X: null, doubleChanceX2: null, doubleChance12: null, drawNoBetHome: null, drawNoBetAway: null, winToNilHome: null, winToNilAway: null, firstHalfOver15: null, firstHalfBtts: null, correctScoreTopOdds: null, firstTeamScoreHome: null, firstTeamScoreAway: null },
      homeRank: null, awayRank: null, homePoints: null, awayPoints: null, homeGD: null, awayGD: null,
      prediction: null, homeSeasonStats: null, awaySeasonStats: null,
      homeTopScorers: [], awayTopScorers: [], homeSidelined: [], awaySidelined: [],
      homeCoach: null, awayCoach: null, referee: null, homeRecentXg: null, awayRecentXg: null, homeRecentStats: null, awayRecentStats: null, h2hAiNotes: [], oddsMovement: null, weather: null,
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
      limit: 10,
    });
    if (h2hRows.length > 0) {
      let homeWins = 0, draws = 0, awayWins = 0, totalGoals = 0;
      let bttsCount = 0, over25Count = 0, over15Count = 0;
      for (const h of h2hRows) {
        const hg = h.homeGoals ?? 0, ag = h.awayGoals ?? 0;
        totalGoals += hg + ag;
        const homeIsFixtureHome = h.homeTeamId === fixture.homeTeamId;
        if (hg > ag) { homeIsFixtureHome ? homeWins++ : awayWins++; }
        else if (ag > hg) { homeIsFixtureHome ? awayWins++ : homeWins++; }
        else draws++;
        if (hg > 0 && ag > 0) bttsCount++;
        if (hg + ag > 2.5) over25Count++;
        if (hg + ag > 1.5) over15Count++;
      }
      const n = h2hRows.length;
      signals["h2h_home_wins"]  = homeWins;
      signals["h2h_draws"]      = draws;
      signals["h2h_away_wins"]  = awayWins;
      signals["h2h_avg_goals"]  = Math.round((totalGoals / n) * 10) / 10;
      signals["h2h_btts_rate"]  = Math.round((bttsCount  / n) * 100) / 100;
      signals["h2h_over25_rate"] = Math.round((over25Count / n) * 100) / 100;
      signals["h2h_over15_rate"] = Math.round((over15Count / n) * 100) / 100;

      // Per-match stats: shots, corners, possession, xG from h2h_fixture_stats
      const fixtureIds = h2hRows.map((r) => r.fixtureId);
      if (fixtureIds.length > 0) {
        const statsRows = await db.query.h2hFixtureStats.findMany({
          where: (s, { inArray: inArr }) => inArr(s.fixtureId, fixtureIds),
        });
        if (statsRows.length > 0) {
          // Aggregate per match (sum both teams, then average across matches)
          const matchTotals = new Map<number, { shots: number; corners: number; xg: number; count: number }>();
          for (const row of statsRows) {
            const cur = matchTotals.get(row.fixtureId) ?? { shots: 0, corners: 0, xg: 0, count: 0 };
            cur.shots   += row.totalShots    ?? 0;
            cur.corners += row.cornerKicks   ?? 0;
            cur.xg      += row.expectedGoals ?? 0;
            cur.count++;
            matchTotals.set(row.fixtureId, cur);
          }
          const totals = [...matchTotals.values()];
          const avgShots   = totals.reduce((s, v) => s + v.shots,   0) / totals.length;
          const avgCorners = totals.reduce((s, v) => s + v.corners, 0) / totals.length;
          const avgXg      = totals.reduce((s, v) => s + v.xg,      0) / totals.length;
          signals["h2h_avg_shots"]   = Math.round(avgShots   * 10) / 10;
          signals["h2h_avg_corners"] = Math.round(avgCorners * 10) / 10;
          signals["h2h_avg_xg"]      = Math.round(avgXg      * 100) / 100;
        }
      }
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

  // Fetch recent xG, match stats (corners/cards/shots), and odds movement in parallel
  const [homeXgRows, awayXgRows, homeStatsRows, awayStatsRows, oldestOdds, newestOdds, h2hNotesRows] = await Promise.all([
    // Home team xG: avg from last 5 completed matches
    fixture.homeTeamId ? db.execute(sql`
      SELECT AVG(fs."expected_goals") as avg_xg
      FROM (
        SELECT fs2."expected_goals"
        FROM fixture_stats fs2
        JOIN fixtures f2 ON f2.fixture_id = fs2.fixture_id
        WHERE fs2.team_id = ${fixture.homeTeamId}
          AND f2.status_short IN ('FT','AET','PEN')
          AND f2.fixture_id != ${fixtureId}
        ORDER BY f2.kickoff DESC
        LIMIT 6
      ) fs
    `) : Promise.resolve({ rows: [] }),
    // Away team xG: avg from last 5 completed matches
    fixture.awayTeamId ? db.execute(sql`
      SELECT AVG(fs."expected_goals") as avg_xg
      FROM (
        SELECT fs2."expected_goals"
        FROM fixture_stats fs2
        JOIN fixtures f2 ON f2.fixture_id = fs2.fixture_id
        WHERE fs2.team_id = ${fixture.awayTeamId}
          AND f2.status_short IN ('FT','AET','PEN')
          AND f2.fixture_id != ${fixtureId}
        ORDER BY f2.kickoff DESC
        LIMIT 6
      ) fs
    `) : Promise.resolve({ rows: [] }),
    // Home team recent match stats: corners, cards, shots, possession, fouls (last 7 matches)
    fixture.homeTeamId ? db.execute(sql`
      SELECT
        AVG(s."corner_kicks") as avg_corners,
        AVG(COALESCE(s."yellow_cards",0) + COALESCE(s."red_cards",0)) as avg_cards,
        AVG(s."total_shots") as avg_shots,
        AVG(s."ball_possession") as avg_possession,
        AVG(s."fouls") as avg_fouls
      FROM (
        SELECT fs."corner_kicks", fs."yellow_cards", fs."red_cards", fs."total_shots", fs."ball_possession", fs."fouls"
        FROM fixture_stats fs
        JOIN fixtures f ON f.fixture_id = fs.fixture_id
        WHERE fs.team_id = ${fixture.homeTeamId}
          AND f.status_short IN ('FT','AET','PEN')
          AND f.fixture_id != ${fixtureId}
        ORDER BY f.kickoff DESC
        LIMIT 7
      ) s
    `) : Promise.resolve({ rows: [] }),
    // Away team recent match stats
    fixture.awayTeamId ? db.execute(sql`
      SELECT
        AVG(s."corner_kicks") as avg_corners,
        AVG(COALESCE(s."yellow_cards",0) + COALESCE(s."red_cards",0)) as avg_cards,
        AVG(s."total_shots") as avg_shots,
        AVG(s."ball_possession") as avg_possession,
        AVG(s."fouls") as avg_fouls
      FROM (
        SELECT fs."corner_kicks", fs."yellow_cards", fs."red_cards", fs."total_shots", fs."ball_possession", fs."fouls"
        FROM fixture_stats fs
        JOIN fixtures f ON f.fixture_id = fs.fixture_id
        WHERE fs.team_id = ${fixture.awayTeamId}
          AND f.status_short IN ('FT','AET','PEN')
          AND f.fixture_id != ${fixtureId}
        ORDER BY f.kickoff DESC
        LIMIT 7
      ) s
    `) : Promise.resolve({ rows: [] }),
    // Oldest odds snapshot for this fixture
    db.query.oddsSnapshots.findFirst({
      where: (o, { eq: eqFn }) => eqFn(o.fixtureId, fixtureId),
      orderBy: (o, { asc: a }) => [a(o.snappedAt)],
    }),
    // Newest odds snapshot for this fixture
    db.query.oddsSnapshots.findFirst({
      where: (o, { eq: eqFn }) => eqFn(o.fixtureId, fixtureId),
      orderBy: (o, { desc: d }) => [d(o.snappedAt)],
    }),
    // H2H AI notes: reviewed tips from previous matches between these two teams
    (fixture.homeTeamId && fixture.awayTeamId) ? db.execute(sql`
      SELECT
        t.bet_type,
        t.outcome,
        t.accuracy_note,
        t.review_headline,
        t.trust_score,
        f.kickoff,
        f.home_team_name,
        f.away_team_name,
        f.home_goals,
        f.away_goals
      FROM ai_betting_tips t
      JOIN fixtures f ON f.fixture_id = t.fixture_id
      WHERE
        t.outcome IS NOT NULL
        AND t.accuracy_note IS NOT NULL
        AND f.status_short IN ('FT','AET','PEN')
        AND f.fixture_id != ${fixtureId}
        AND (
          (f.home_team_id = ${fixture.homeTeamId} AND f.away_team_id = ${fixture.awayTeamId})
          OR
          (f.home_team_id = ${fixture.awayTeamId} AND f.away_team_id = ${fixture.homeTeamId})
        )
      ORDER BY f.kickoff DESC, t.trust_score DESC
      LIMIT 10
    `) : Promise.resolve({ rows: [] }),
  ]);

  const r2n = (v: unknown) => v != null && !isNaN(Number(v)) ? Math.round(Number(v) * 10) / 10 : null;

  const homeRecentXg = homeXgRows.rows[0]
    ? r2n((homeXgRows.rows[0] as Record<string, unknown>).avg_xg)
    : null;
  const awayRecentXg = awayXgRows.rows[0]
    ? r2n((awayXgRows.rows[0] as Record<string, unknown>).avg_xg)
    : null;

  const parseMatchStats = (rows: { rows: unknown[] }) => {
    const row = rows.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const avgCorners = r2n(row.avg_corners);
    const avgCards = r2n(row.avg_cards);
    const avgShots = r2n(row.avg_shots);
    const avgPossession = r2n(row.avg_possession);
    const avgFouls = r2n(row.avg_fouls);
    if (avgCorners == null && avgCards == null && avgShots == null) return null;
    return { avgCorners, avgCards, avgShots, avgPossession, avgFouls };
  };
  const homeRecentStats = parseMatchStats(homeStatsRows as { rows: unknown[] });
  const awayRecentStats = parseMatchStats(awayStatsRows as { rows: unknown[] });

  type H2HNoteRow = { bet_type: string; outcome: string; accuracy_note: string; review_headline: string | null; trust_score: number; kickoff: string | null; home_team_name: string | null; away_team_name: string | null; home_goals: number | null; away_goals: number | null };
  const h2hAiNotes = ((h2hNotesRows as { rows: unknown[] }).rows as H2HNoteRow[])
    .filter(r => r.accuracy_note && r.outcome)
    .map(r => ({
      kickoff: r.kickoff ? new Date(r.kickoff).toISOString().split("T")[0] : "unknown date",
      result: `${r.home_team_name ?? "?"} ${r.home_goals ?? "?"}-${r.away_goals ?? "?"} ${r.away_team_name ?? "?"}`,
      betType: r.bet_type,
      outcome: r.outcome,
      note: r.accuracy_note,
    }));

  let oddsMovement: BettingContext["oddsMovement"] = null;
  if (oldestOdds && newestOdds && oldestOdds.id !== newestOdds.id) {
    const homeOpen = oldestOdds.homeWin;
    const homeNow  = newestOdds.homeWin;
    const awayOpen = oldestOdds.awayWin;
    const awayNow  = newestOdds.awayWin;
    oddsMovement = {
      homeOpen, homeNow,
      homeShift: homeOpen && homeNow ? Math.round((homeNow - homeOpen) * 100) / 100 : null,
      awayOpen, awayNow,
      awayShift: awayOpen && awayNow ? Math.round((awayNow - awayOpen) * 100) / 100 : null,
    };
  }

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
  let correctScoreTopOdds: Array<{ score: string; odd: number }> | null = null;
  let firstTeamScoreHome: number | null = null;
  let firstTeamScoreAway: number | null = null;

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
      // Exact / Correct Score — top 5 most likely (lowest odds)
      if ((n === "exact score" || n === "correct score") && !correctScoreTopOdds) {
        const sorted = [...entries]
          .map(e => ({ score: e.value, odd: parseFloat(e.odd) }))
          .filter(e => !isNaN(e.odd) && e.odd > 1)
          .sort((a, b) => a.odd - b.odd);
        if (sorted.length > 0) correctScoreTopOdds = sorted.slice(0, 5);
      }
      // Team to Score First (Home / Away)
      if ((n === "team to score first" || n.includes("first team to score") || n.includes("team to score first")) && !firstTeamScoreHome) {
        const home = entries.find(e => e.value.toLowerCase() === "home");
        const away = entries.find(e => e.value.toLowerCase() === "away");
        if (home) firstTeamScoreHome = parseOdd(home);
        if (away) firstTeamScoreAway = parseOdd(away);
      }
    }
  }

  // Fallback: if odds_snapshots has no data, extract basic 1X2/BTTS/Over2.5 from odds_markets
  let finalHome = bestHome;
  let finalDraw = bestDraw;
  let finalAway = bestAway;
  let finalBtts = anyRow?.btts ?? null;
  let finalOver25 = anyRow?.overUnder25 ?? null;

  if (!finalHome && !finalDraw && !finalAway && marketsRow?.markets) {
    const mktFallback = marketsRow.markets as Record<string, Array<{ value: string; odd: string }>>;
    for (const [name, entries] of Object.entries(mktFallback)) {
      const n = name.toLowerCase();
      if ((n === "match winner" || n === "1x2") && !finalHome) {
        const h = entries.find(e => e.value === "Home");
        const d = entries.find(e => e.value === "Draw");
        const a = entries.find(e => e.value === "Away");
        if (h) finalHome = parseFloat(h.odd) || null;
        if (d) finalDraw = parseFloat(d.odd) || null;
        if (a) finalAway = parseFloat(a.odd) || null;
      }
      if (n === "both teams score" && !finalBtts) {
        const yes = entries.find(e => e.value.toLowerCase() === "yes");
        if (yes) finalBtts = parseFloat(yes.odd) || null;
      }
      if (n === "goals over/under" && !finalOver25) {
        const o25 = entries.find(e => e.value === "Over 2.5");
        if (o25) finalOver25 = parseFloat(o25.odd) || null;
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
      home: finalHome,
      draw: finalDraw,
      away: finalAway,
      over25: finalOver25,
      over15,
      over35,
      btts: finalBtts,
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
      correctScoreTopOdds,
      firstTeamScoreHome,
      firstTeamScoreAway,
    },
    homeRank,
    awayRank,
    homePoints: homeStanding?.points ?? null,
    awayPoints: awayStanding?.points ?? null,
    homeGD: homeStanding?.goalsDiff ?? null,
    awayGD: awayStanding?.goalsDiff ?? null,
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
      goalsForAvgHome: homeStats.goalsForAvgHome,
      goalsAgainstAvgHome: homeStats.goalsAgainstAvgHome,
      cleanSheetsHome: homeStats.cleanSheetsHome,
      failedToScoreHome: homeStats.failedToScoreHome,
      winsHome: homeStats.winsHome,
      lossesHome: homeStats.lossesHome,
    } : null,
    awaySeasonStats: awayStats ? {
      form: awayStats.form,
      goalsForAvg: awayStats.goalsForAvgTotal,
      goalsAgainstAvg: awayStats.goalsAgainstAvgTotal,
      cleanSheets: awayStats.cleanSheetsTotal,
      winStreak: awayStats.biggestWinStreak,
      played: awayStats.playedTotal,
      goalsForAvgAway: awayStats.goalsForAvgAway,
      goalsAgainstAvgAway: awayStats.goalsAgainstAvgAway,
      cleanSheetsAway: awayStats.cleanSheetsAway,
      failedToScoreAway: awayStats.failedToScoreAway,
      winsAway: awayStats.winsAway,
      lossesAway: awayStats.lossesAway,
    } : null,
    homeTopScorers,
    awayTopScorers,
    homeSidelined: homeSidelinedRows.map(sp => sp.playerName ?? "Unknown"),
    awaySidelined: awaySidelinedRows.map(sp => sp.playerName ?? "Unknown"),
    homeCoach: homeCoachRow?.name ?? null,
    awayCoach: awayCoachRow?.name ?? null,
    referee: fixture.referee ?? null,
    homeRecentXg: homeRecentXg && homeRecentXg > 0 ? homeRecentXg : null,
    awayRecentXg: awayRecentXg && awayRecentXg > 0 ? awayRecentXg : null,
    homeRecentStats,
    awayRecentStats,
    h2hAiNotes,
    oddsMovement,
    weather: fixture.weatherTemp != null ? (() => {
      const temp  = fixture.weatherTemp!;
      const wind  = fixture.weatherWind ?? 0;
      const desc  = fixture.weatherDesc ?? "";
      const humidity = fixture.weatherHumidity ?? null;
      const adverseWeatherWords = ["heavy rain", "snow", "thunderstorm", "hail", "blizzard", "fog"];
      const wmoAdverse = adverseWeatherWords.some(w => desc.toLowerCase().includes(w));
      let isAdverse = wmoAdverse;
      let adverseReason: string | undefined;
      if (wind > 14)  { isAdverse = true; adverseReason = `Storm (${Math.round(wind)} m/s vind)`; }
      else if (wind > 10) { isAdverse = true; adverseReason = `Hård vind (${Math.round(wind)} m/s)`; }
      else if (temp < -5) { isAdverse = true; adverseReason = `Ekstrem kulde (${Math.round(temp)}°C)`; }
      else if (temp > 36) { isAdverse = true; adverseReason = `Ekstrem varme (${Math.round(temp)}°C)`; }
      else if (wmoAdverse) adverseReason = desc;
      return { temp, desc, wind, humidity, isAdverse, adverseReason };
    })() : null,
  };
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const SingleTipSchema = z.object({
  recommendation: z.string(),
  bet_type: z.enum(["match_result", "over_under", "btts", "corners", "asian_handicap", "total_cards", "double_chance", "draw_no_bet", "win_to_nil", "first_half_goals", "correct_score", "first_team_score", "no_bet"]),
  bet_side: z.string().nullable().optional(),
  trust_score: z.number().min(1).max(10),
  estimated_probability: z.number().min(0.01).max(0.99).optional(),
  reasoning: z.string(),
});

const MultiBettingTipSchema = z.object({
  tips: z.array(SingleTipSchema).min(1).max(10),
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
  } else if (tip.bet_type === "correct_score") {
    // bet_side = the chosen scoreline e.g. "1-1" or "2-1"
    const sideNorm = (tip.bet_side ?? "").replace("-", ":");
    const match = odds.correctScoreTopOdds?.find(s => s.score === sideNorm || s.score === tip.bet_side);
    if (match) return match.odd;
    return odds.correctScoreTopOdds?.[0]?.odd ?? null;
  } else if (tip.bet_type === "first_team_score") {
    if (tip.bet_side === "home") return odds.firstTeamScoreHome;
    if (tip.bet_side === "away") return odds.firstTeamScoreAway;
    return odds.firstTeamScoreHome ?? odds.firstTeamScoreAway;
  }
  return null;
}

// ─── Betting tips (multi-market) ─────────────────────────────────────────────

export async function getBettingTips(fixtureId: number) {
  const existing = await db.query.aiBettingTips.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
  });
  if (existing.length >= 5) return existing;

  const ctx = await buildBettingContext(fixtureId);

  const hasOdds = !!(ctx.odds.home || ctx.odds.draw || ctx.odds.away);
  const hasSignals = Object.keys(ctx.signals ?? {}).length > 0;
  const hasPrediction = !!ctx.prediction;
  const hasStats = !!(ctx.homeSeasonStats || ctx.awaySeasonStats || ctx.homeRank || ctx.awayRank);
  if (!hasOdds && !hasSignals && !hasPrediction && !hasStats) {
    return null;
  }

  const accuracy = await getAccuracyHistory();

  // Build rich context sections
  const predSection = ctx.prediction
    ? `Baseline statistical forecast:
- ${ctx.homeTeam} win: ${ctx.prediction.homeWinPct?.toFixed(0) ?? "?"}%
- Draw: ${ctx.prediction.drawPct?.toFixed(0) ?? "?"}%
- ${ctx.awayTeam} win: ${ctx.prediction.awayWinPct?.toFixed(0) ?? "?"}%
- Predicted score: ${ctx.prediction.goalsHome?.toFixed(1) ?? "?"} - ${ctx.prediction.goalsAway?.toFixed(1) ?? "?"}
- Baseline lean: ${ctx.prediction.advice ?? "None"}`
    : "No baseline forecast available.";

  const homeStatsSection = ctx.homeSeasonStats
    ? `${ctx.homeTeam} season (${ctx.homeSeasonStats.played ?? "?"} games): Form ${ctx.homeSeasonStats.form?.slice(-5) ?? "?"} | Overall goals/game: ${ctx.homeSeasonStats.goalsForAvg?.toFixed(2) ?? "?"} scored, ${ctx.homeSeasonStats.goalsAgainstAvg?.toFixed(2) ?? "?"} conceded | Clean sheets: ${ctx.homeSeasonStats.cleanSheets ?? "?"} | Win streak record: ${ctx.homeSeasonStats.winStreak ?? "?"}\n  AT HOME: W${ctx.homeSeasonStats.winsHome ?? "?"}/${ctx.homeSeasonStats.lossesHome ?? "?"}L | Avg scored: ${ctx.homeSeasonStats.goalsForAvgHome?.toFixed(2) ?? "?"} | Avg conceded: ${ctx.homeSeasonStats.goalsAgainstAvgHome?.toFixed(2) ?? "?"} | Clean sheets home: ${ctx.homeSeasonStats.cleanSheetsHome ?? "?"} | Failed to score home: ${ctx.homeSeasonStats.failedToScoreHome ?? "?"}${ctx.homeRecentXg != null ? ` | Recent avg xG: ${ctx.homeRecentXg}` : ""}`
    : `${ctx.homeTeam}: No season stats`;

  const awayStatsSection = ctx.awaySeasonStats
    ? `${ctx.awayTeam} season (${ctx.awaySeasonStats.played ?? "?"} games): Form ${ctx.awaySeasonStats.form?.slice(-5) ?? "?"} | Overall goals/game: ${ctx.awaySeasonStats.goalsForAvg?.toFixed(2) ?? "?"} scored, ${ctx.awaySeasonStats.goalsAgainstAvg?.toFixed(2) ?? "?"} conceded | Clean sheets: ${ctx.awaySeasonStats.cleanSheets ?? "?"} | Win streak record: ${ctx.awaySeasonStats.winStreak ?? "?"}\n  AWAY: W${ctx.awaySeasonStats.winsAway ?? "?"}/${ctx.awaySeasonStats.lossesAway ?? "?"}L | Avg scored: ${ctx.awaySeasonStats.goalsForAvgAway?.toFixed(2) ?? "?"} | Avg conceded: ${ctx.awaySeasonStats.goalsAgainstAvgAway?.toFixed(2) ?? "?"} | Clean sheets away: ${ctx.awaySeasonStats.cleanSheetsAway ?? "?"} | Failed to score away: ${ctx.awaySeasonStats.failedToScoreAway ?? "?"}${ctx.awayRecentXg != null ? ` | Recent avg xG: ${ctx.awayRecentXg}` : ""}`
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

  const refereeSection = ctx.referee
    ? `Referee: ${ctx.referee} — consider referee tendencies when assessing cards market.`
    : "";

  const fmtStat = (v: number | null, suffix = "") => v != null ? `${v}${suffix}` : "N/A";

  const h2hAiNotesSection = ctx.h2hAiNotes.length > 0
    ? `Previous AI analysis of matches between these teams (learn from these):\n` +
      ctx.h2hAiNotes.map(n =>
        `  [${n.kickoff}] ${n.result} | ${n.betType} → ${n.outcome.toUpperCase()} | ${n.note}`
      ).join("\n")
    : "";

  const recentMatchStatsSection = (ctx.homeRecentStats || ctx.awayRecentStats) ? `Recent match stats (last 7 games avg per team):
${ctx.homeTeam}: corners ${fmtStat(ctx.homeRecentStats?.avgCorners)}/game | cards ${fmtStat(ctx.homeRecentStats?.avgCards)}/game | shots ${fmtStat(ctx.homeRecentStats?.avgShots)}/game | possession ${fmtStat(ctx.homeRecentStats?.avgPossession, "%")} | fouls ${fmtStat(ctx.homeRecentStats?.avgFouls)}/game
${ctx.awayTeam}: corners ${fmtStat(ctx.awayRecentStats?.avgCorners)}/game | cards ${fmtStat(ctx.awayRecentStats?.avgCards)}/game | shots ${fmtStat(ctx.awayRecentStats?.avgShots)}/game | possession ${fmtStat(ctx.awayRecentStats?.avgPossession, "%")} | fouls ${fmtStat(ctx.awayRecentStats?.avgFouls)}/game
Combined avg corners/game: ${ctx.homeRecentStats?.avgCorners != null && ctx.awayRecentStats?.avgCorners != null ? Math.round((ctx.homeRecentStats.avgCorners + ctx.awayRecentStats.avgCorners) * 10) / 10 : "N/A"} | Combined avg cards/game: ${ctx.homeRecentStats?.avgCards != null && ctx.awayRecentStats?.avgCards != null ? Math.round((ctx.homeRecentStats.avgCards + ctx.awayRecentStats.avgCards) * 10) / 10 : "N/A"}
Use these to calibrate corners and total_cards tips even when odds are N/A.` : "";

  const oddsMovementSection = ctx.oddsMovement
    ? (() => {
        const hShift = ctx.oddsMovement.homeShift;
        const aShift = ctx.oddsMovement.awayShift;
        const lines: string[] = [];
        if (ctx.oddsMovement.homeOpen && ctx.oddsMovement.homeNow)
          lines.push(`Home: ${ctx.oddsMovement.homeOpen} → ${ctx.oddsMovement.homeNow} (${hShift && hShift > 0 ? "+" : ""}${hShift ?? 0})`);
        if (ctx.oddsMovement.awayOpen && ctx.oddsMovement.awayNow)
          lines.push(`Away: ${ctx.oddsMovement.awayOpen} → ${ctx.oddsMovement.awayNow} (${aShift && aShift > 0 ? "+" : ""}${aShift ?? 0})`);
        if (!lines.length) return "";
        const steamNote = (hShift && hShift < -0.2)
          ? " — STEAM on home side (market moving home)"
          : (aShift && aShift < -0.2)
          ? " — STEAM on away side (market moving away)"
          : "";
        return `Odds movement since opening${steamNote}:\n${lines.join("\n")}\nNote: Significant shortening means sharp money; lengthing means public backing the other side.`;
      })()
    : "";

  const weatherSection = ctx.weather
    ? `Match conditions: ${Math.round(ctx.weather.temp ?? 0)}°C, ${ctx.weather.desc}, wind ${Math.round(ctx.weather.wind ?? 0)} m/s${ctx.weather.humidity != null ? `, humidity ${ctx.weather.humidity}%` : ""}${ctx.weather.isAdverse ? ` — ADVERSE CONDITIONS (${ctx.weather.adverseReason})` : ""}\nNote: Adverse weather suppresses goals and corners; adjust Over/Under and BTTS trust accordingly. Strong winds reduce accurate passing and set pieces.`
    : "";

  // Compute rank/GD/points diffs for signal summary (positive = home advantage)
  const rankDiff  = ctx.awayRank != null && ctx.homeRank != null ? ctx.awayRank - ctx.homeRank : null;
  const gdDiff    = ctx.homeGD != null && ctx.awayGD != null ? ctx.homeGD - ctx.awayGD : null;
  const ptsDiff   = ctx.homePoints != null && ctx.awayPoints != null ? ctx.homePoints - ctx.awayPoints : null;
  const signalSummary = (() => {
    const parts: string[] = [];
    if (rankDiff != null) parts.push(`Rank diff: ${rankDiff > 0 ? "+" : ""}${rankDiff} (${rankDiff > 0 ? "home higher" : rankDiff < 0 ? "away higher" : "equal"})`);
    if (gdDiff != null)   parts.push(`GD diff: ${gdDiff > 0 ? "+" : ""}${gdDiff} (${gdDiff > 0 ? "home better" : gdDiff < 0 ? "away better" : "equal"})`);
    if (ptsDiff != null)  parts.push(`Points diff: ${ptsDiff > 0 ? "+" : ""}${ptsDiff} (${ptsDiff > 0 ? "home better" : ptsDiff < 0 ? "away better" : "equal"})`);
    return parts.length ? `Key table signals: ${parts.join(" | ")}` : "";
  })();

  const userMessage = `Analyse ALL 10 markets for this upcoming match:

Match: ${ctx.matchLabel}
League: ${ctx.leagueName ?? "Unknown"} | Positions: ${ctx.homeTeam} #${ctx.homeRank ?? "?"} (GD ${ctx.homeGD != null ? (ctx.homeGD > 0 ? "+" : "") + ctx.homeGD : "?"}, ${ctx.homePoints ?? "?"}pts) vs ${ctx.awayTeam} #${ctx.awayRank ?? "?"} (GD ${ctx.awayGD != null ? (ctx.awayGD > 0 ? "+" : "") + ctx.awayGD : "?"}, ${ctx.awayPoints ?? "?"}pts)
${signalSummary ? signalSummary + "\n" : ""}Kickoff: ${ctx.kickoff ?? "Unknown"}
${coachSection}${refereeSection ? "\n" + refereeSection : ""}

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
- Correct Score (top 5 most likely): ${ctx.odds.correctScoreTopOdds ? ctx.odds.correctScoreTopOdds.map(s => `${s.score} @ ${s.odd}`).join(" | ") : "N/A"}
- Team to Score First: Home ${ctx.odds.firstTeamScoreHome ?? "N/A"} | Away ${ctx.odds.firstTeamScoreAway ?? "N/A"}

${predSection}

${homeStatsSection}
${awayStatsSection}

${homeScorersSection}
${awayScorersSection}

${recentMatchStatsSection ? recentMatchStatsSection + "\n" : ""}${sidelinedSection}
${oddsMovementSection ? "\n" + oddsMovementSection : ""}${weatherSection ? "\n" + weatherSection : ""}
${h2hAiNotesSection ? "\n" + h2hAiNotesSection : ""}
Signal data:
${JSON.stringify(ctx.signals, null, 2)}

GENERAL MODEL CALIBRATION (applies to ALL tips, not just this match):
${accuracy.summary}
${accuracy.totalReviewed > 0 ? `Use this track record to calibrate trust scores system-wide. If a market underperforms (hit rate below implied probability or negative ROI), lower trust and edge for that market. If a confidence tier is miscalibrated (e.g. "high" tips hitting below 60%), tighten your bar for calling something "high". This is feedback on your own past predictions — adjust accordingly.` : "No track record yet — cap trust scores at 7 until results accumulate."}`;

  // Algorithmic tip generation — no AI cost per fixture.
  // AI (callClaude) is kept for daily admin insights only.
  void userMessage; // context still built above for future admin digest use
  const calibration = await getCalibrationFactors().catch(() => null);
  const parsed = generateAlgorithmicTips(ctx, calibration);

  if (!parsed?.tips?.length) return null;

  // Fase 1.1/1.3/1.4 — build featureSnapshot once per fixture (shared across tips)
  const featureSnapshot = {
    form: {
      homeRecentStats: ctx.homeRecentStats ?? null,
      awayRecentStats: ctx.awayRecentStats ?? null,
      homeRecentXg: ctx.homeRecentXg ?? null,
      awayRecentXg: ctx.awayRecentXg ?? null,
    },
    injuries: {
      home: ctx.homeSidelined ?? [],
      away: ctx.awaySidelined ?? [],
    },
    weather: ctx.weather ?? null,
    h2h: ctx.h2hAiNotes ?? [],
  };
  const MODEL_VERSION = "v2.0-algo";

  const storedTips = [];
  for (const tip of parsed.tips) {
    if (tip.bet_type === "no_bet") continue;
    const marketOdds = getMarketOddsForTip(tip, ctx.odds);
    // Use AI's explicit probability estimate; fall back to trust score / 10
    const aiProb = tip.estimated_probability ?? (tip.trust_score / 10);
    const edge = calcEdge(aiProb, marketOdds);
    const valueRating = calcValueRating(aiProb, marketOdds);

    const impliedProbability = marketOdds && marketOdds > 1 ? 1 / marketOdds : null;
    let confidence: "high" | "medium" | "low" | null = null;
    try {
      const conf = await calculateConfidence({
        modelProbability: aiProb,
        impliedProbability: impliedProbability ?? aiProb,
        featureSnapshot,
        fixtureId,
        betType: tip.bet_type,
        leagueName: ctx.leagueName ?? null,
      });
      confidence = conf.confidence;
    } catch (e) {
      console.error("[ai] confidence calc failed:", e);
    }

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
      modelVersion: MODEL_VERSION,
      impliedProbability,
      featureSnapshot,
      confidence,
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
        modelVersion: MODEL_VERSION,
        impliedProbability,
        featureSnapshot,
        confidence,
      },
    }).returning();
    if (stored) {
      storedTips.push(stored);
      // Fire a critical-tier alert for value tips (edge ≥5pp + primary market).
      if (stored.marketOdds && stored.edge != null) {
        emitSuperValueAlert({
          fixtureId,
          betType: stored.betType,
          betSide: stored.betSide ?? "",
          marketOdds: stored.marketOdds,
          edge: stored.edge,
          matchName: `${stored.homeTeam} vs ${stored.awayTeam}`,
        }).catch((e: unknown) => console.error("[ai] alert error:", e));
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

// ─── Prediction review metrics (Fase 1.5) ────────────────────────────────────
// Computes auditable post-match metrics and writes to predictionReviews.
// Structured rules only — NO LLM involvement.

function calibrationBucketFor(probability: number | null | undefined): string | null {
  if (probability == null || !isFinite(probability)) return null;
  const pct = probability * 100;
  if (pct < 0 || pct > 100) return null;
  const floor = Math.min(90, Math.floor(pct / 10) * 10);
  return `${floor}-${floor + 10}%`;
}

function deriveErrorTags(args: {
  outcome: "hit" | "miss" | "partial";
  aiProbability: number | null;
  marketOdds: number | null;
  closingOdds: number | null;
  closingLineValue: number | null;
  dataCompleteness: number | null;
}): string[] {
  const tags: string[] = [];
  if (args.closingOdds == null) tags.push("no_closing_line");
  if (args.dataCompleteness !== null && args.dataCompleteness < 0.5) tags.push("low_data");
  if (args.closingLineValue != null && args.closingLineValue < -0.05) tags.push("odds_moved_against");
  if (args.closingLineValue != null && args.closingLineValue > 0.05) tags.push("positive_clv");
  if (args.outcome === "hit") tags.push("correct_edge");
  if (args.outcome === "miss" && (args.aiProbability ?? 0) >= 0.7) tags.push("high_confidence_miss");
  return tags;
}

function snapshotCompleteness(snap: unknown): number | null {
  if (!snap || typeof snap !== "object") return null;
  const keys = ["form", "injuries", "weather", "h2h"];
  let present = 0;
  for (const k of keys) {
    const v = (snap as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    present++;
  }
  return present / keys.length;
}

async function writePredictionReview(args: {
  predictionId: number;
  outcome: "hit" | "miss" | "partial";
  aiProbability: number | null;
  marketOdds: number | null;
  closingOdds: number | null;
  featureSnapshot: unknown;
}): Promise<void> {
  const outcomeNumeric = args.outcome === "hit" ? 1 : 0;
  const brierScore =
    args.aiProbability != null && isFinite(args.aiProbability)
      ? (args.aiProbability - outcomeNumeric) ** 2
      : null;

  // Stake = 1 unit. Hit → (odds - 1), Miss → -1. Partial treated as break-even.
  let roiImpact: number | null = null;
  if (args.marketOdds != null && args.marketOdds > 1) {
    if (args.outcome === "hit") roiImpact = args.marketOdds - 1;
    else if (args.outcome === "miss") roiImpact = -1;
    else roiImpact = 0;
  }

  const closingLineValue =
    args.closingOdds != null && args.marketOdds != null && args.marketOdds > 0
      ? (args.closingOdds - args.marketOdds) / args.marketOdds
      : null;

  const calibrationBucket = calibrationBucketFor(args.aiProbability);
  const dataCompleteness = snapshotCompleteness(args.featureSnapshot);
  const errorTags = deriveErrorTags({
    outcome: args.outcome,
    aiProbability: args.aiProbability,
    marketOdds: args.marketOdds,
    closingOdds: args.closingOdds,
    closingLineValue,
    dataCompleteness,
  });

  await db
    .insert(predictionReviews)
    .values({
      predictionId: args.predictionId,
      brierScore,
      roiImpact,
      calibrationBucket,
      errorTags,
      closingLineValue,
    })
    .onConflictDoUpdate({
      target: predictionReviews.predictionId,
      set: {
        brierScore,
        roiImpact,
        calibrationBucket,
        errorTags,
        closingLineValue,
      },
    });
}

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

  // Fetch stats for corners + cards evaluation
  const statsRows = await db.query.fixtureStats.findMany({
    where: (s, { eq: eqFn }) => eqFn(s.fixtureId, fixtureId),
  });
  const homeStats = statsRows.find(s => s.teamId === fixture.homeTeamId);
  const awayStats = statsRows.find(s => s.teamId === fixture.awayTeamId);
  const totalCorners = (homeStats?.cornerKicks ?? 0) + (awayStats?.cornerKicks ?? 0);
  const totalCards   = (homeStats?.yellowCards ?? 0) + (awayStats?.yellowCards ?? 0)
                     + (homeStats?.redCards ?? 0)   + (awayStats?.redCards ?? 0);

  // Fetch first goal event to evaluate first_team_score
  const goalEvents = await db.query.fixtureEvents.findMany({
    where: (e, { and: andFn, eq: eqFn }) => andFn(eqFn(e.fixtureId, fixtureId), eqFn(e.type, "Goal")),
    orderBy: (e, { asc }) => [asc(e.minute)],
  });
  const firstGoalTeamId = goalEvents[0]?.teamId ?? null;

  const postSignals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) => andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "post")),
  });
  const signalCtx: Record<string, unknown> = {};
  for (const s of postSignals) {
    if (s.signalBool !== null) signalCtx[s.signalKey] = s.signalBool;
    else if (s.signalValue !== null) signalCtx[s.signalKey] = Math.round(s.signalValue * 1000) / 1000;
  }
  // Include match-day weather so AI can assess if conditions affected outcomes
  if (fixture.weatherTemp != null) {
    signalCtx["weather_temp_c"] = Math.round(fixture.weatherTemp);
    signalCtx["weather_desc"] = fixture.weatherDesc ?? "";
    signalCtx["weather_wind_ms"] = Math.round(fixture.weatherWind ?? 0);
    const adverseWords = ["heavy rain", "snow", "thunderstorm", "hail", "blizzard"];
    const isAdverse = adverseWords.some(w => (fixture.weatherDesc ?? "").toLowerCase().includes(w)) ||
      (fixture.weatherWind ?? 0) > 10 || (fixture.weatherTemp ?? 15) < -5 || (fixture.weatherTemp ?? 15) > 36;
    signalCtx["weather_adverse"] = isAdverse;
  }

  const resultStr = `${fixture.homeTeamName} ${hg} - ${ag} ${fixture.awayTeamName} (FT)`;

  for (const tip of unreviewedTips) {
    let outcome: "hit" | "miss" | "partial" = "miss";

    const side = tip.betSide ?? "";

    if (tip.betType === "no_bet") {
      outcome = "hit";

    } else if (tip.betType === "match_result") {
      if (
        (side === "home" && actualResult === "home_win") ||
        (side === "away" && actualResult === "away_win") ||
        (side === "draw" && actualResult === "draw")
      ) outcome = "hit";

    } else if (tip.betType === "over_under") {
      if      (side === "over15")  outcome = totalGoals >  1 ? "hit" : "miss";
      else if (side === "under15") outcome = totalGoals <= 1 ? "hit" : "miss";
      else if (side === "over25")  outcome = totalGoals >  2 ? "hit" : "miss";
      else if (side === "under25") outcome = totalGoals <= 2 ? "hit" : "miss";
      else if (side === "over35")  outcome = totalGoals >  3 ? "hit" : "miss";
      else if (side === "under35") outcome = totalGoals <= 3 ? "hit" : "miss";
      else if (side === "over")    outcome = over25Result ? "hit" : "miss";
      else if (side === "under")   outcome = !over25Result ? "hit" : "miss";

    } else if (tip.betType === "btts") {
      if (
        (side === "yes" && bttsResult) ||
        (side === "no" && !bttsResult)
      ) outcome = "hit";

    } else if (tip.betType === "double_chance") {
      if      (side === "1X") outcome = actualResult !== "away_win"  ? "hit" : "miss";
      else if (side === "X2") outcome = actualResult !== "home_win"  ? "hit" : "miss";
      else if (side === "12") outcome = actualResult !== "draw"       ? "hit" : "miss";

    } else if (tip.betType === "draw_no_bet") {
      if      (side === "home" && actualResult === "home_win") outcome = "hit";
      else if (side === "away" && actualResult === "away_win") outcome = "hit";
      else if (actualResult === "draw")                        outcome = "partial";

    } else if (tip.betType === "win_to_nil") {
      if      (side === "home") outcome = (actualResult === "home_win" && ag === 0) ? "hit" : "miss";
      else if (side === "away") outcome = (actualResult === "away_win" && hg === 0) ? "hit" : "miss";

    } else if (tip.betType === "correct_score") {
      const normalized = side.replace("-", ":");
      const actual = `${hg}:${ag}`;
      outcome = normalized === actual ? "hit" : "miss";

    } else if (tip.betType === "first_team_score") {
      if (firstGoalTeamId === null) {
        outcome = "miss";
      } else if (side === "home") {
        outcome = firstGoalTeamId === fixture.homeTeamId ? "hit" : "miss";
      } else if (side === "away") {
        outcome = firstGoalTeamId === fixture.awayTeamId ? "hit" : "miss";
      }

    } else if (tip.betType === "corners") {
      if (totalCorners > 0) {
        if      (side === "over")  outcome = totalCorners > 9  ? "hit" : "miss";
        else if (side === "under") outcome = totalCorners <= 9 ? "hit" : "miss";
      }

    } else if (tip.betType === "total_cards") {
      if (totalCards > 0) {
        if      (side === "over")  outcome = totalCards > 3  ? "hit" : "miss";
        else if (side === "under") outcome = totalCards <= 3 ? "hit" : "miss";
      }

    } else if (tip.betType === "asian_handicap") {
      if      (side === "home") outcome = actualResult === "home_win" ? "hit" : actualResult === "draw" ? "partial" : "miss";
      else if (side === "away") outcome = actualResult === "away_win" ? "hit" : actualResult === "draw" ? "partial" : "miss";
    }

    // Outcome is determined algorithmically above — no AI call needed (free).
    const review = {
      outcome,
      review_headline: resultStr,
      review_summary: `${fixture.homeTeamName} ${hg}-${ag} ${fixture.awayTeamName}. Tip was ${outcome}.`,
      accuracy_note: "Review generated from match result.",
    };

    await db.update(aiBettingTips)
      .set({
        outcome: review.outcome,
        reviewHeadline: review.review_headline,
        reviewSummary: review.review_summary,
        accuracyNote: review.accuracy_note,
        reviewedAt: new Date(),
      })
      .where(eq(aiBettingTips.id, tip.id));

    if (tip.betType !== "no_bet") {
      try {
        await writePredictionReview({
          predictionId: tip.id,
          outcome: review.outcome,
          aiProbability: tip.aiProbability ?? null,
          marketOdds: tip.marketOdds ?? null,
          closingOdds: tip.closingOdds ?? null,
          featureSnapshot: tip.featureSnapshot,
        });
      } catch (err) {
        console.error(`[ai] Failed to write predictionReviews for tip ${tip.id}:`, err);
      }
    }

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

function buildLiveAnalysis(ctx: Record<string, number | boolean | string>): LiveAnalysis {
  const matchStr = String(ctx.match ?? "Home vs Away");
  const [homeTeam = "Home", awayTeam = "Away"] = matchStr.split(" vs ");
  const minute = Number(ctx.minute ?? 0);
  const homeGoals = Number(ctx.home_goals ?? 0);
  const awayGoals = Number(ctx.away_goals ?? 0);
  const status = String(ctx.status ?? "1H");
  const diff = homeGoals - awayGoals;

  const isHT = status === "HT";
  const isFT = ["FT", "AET", "PEN"].includes(status);
  const phase = isHT ? "at half time" : isFT ? "at full time" : `(${minute}')`;

  // Leading team labels
  const leader: string | null = diff > 0 ? homeTeam : diff < 0 ? awayTeam : null;
  const trailer: string | null = diff > 0 ? awayTeam : diff < 0 ? homeTeam : null;
  const scoreStr = `${homeGoals}-${awayGoals}`;
  const absDiff = Math.abs(diff);

  // ── Headline ──────────────────────────────────────────────────────────────
  let headline = "";
  if (diff === 0) {
    if (homeGoals === 0) {
      headline = `Goalless so far — ${homeTeam} vs ${awayTeam} ${phase}`;
    } else {
      headline = `${homeTeam} and ${awayTeam} level at ${scoreStr} ${phase}`;
    }
  } else if (absDiff >= 3) {
    headline = `${leader} cruising — ${scoreStr} ${phase}`;
  } else if (absDiff === 2) {
    headline = `${leader} in control — ${scoreStr} ${phase}`;
  } else {
    headline = `${leader} edge ahead — ${scoreStr} ${phase}`;
  }

  // ── Narrative ─────────────────────────────────────────────────────────────
  let s1 = "";
  if (diff === 0 && homeGoals === 0) {
    s1 = `${homeTeam} and ${awayTeam} are goalless ${phase}.`;
  } else if (diff === 0) {
    s1 = `The score stands level at ${scoreStr} ${phase}.`;
  } else {
    const gapWord = absDiff === 1 ? "one goal" : absDiff === 2 ? "two goals" : `${absDiff} goals`;
    s1 = `${leader} lead ${trailer} by ${gapWord} — ${scoreStr} ${phase}.`;
  }

  let s2 = "";
  const minutesLeft = Math.max(0, 90 - minute);
  const homeOdds = ctx.home_odds ? Number(ctx.home_odds) : null;
  const awayOdds = ctx.away_odds ? Number(ctx.away_odds) : null;
  const momentumShift = ctx.momentum_shift === true;
  const homePressure = ctx.home_pressure_rising === true;
  const awayTempo = ctx.away_over_expected_tempo === true;

  if (isFT) {
    s2 = diff === 0
      ? `The match ends all square — ${homeTeam} and ${awayTeam} share the points.`
      : `${leader} hold on for the win as the final whistle blows.`;
  } else if (isHT) {
    s2 = diff === 0
      ? "The second half is yet to begin — either side can still take this."
      : `${trailer} need a second-half response to get back into this.`;
  } else if (minutesLeft <= 10 && diff !== 0) {
    s2 = `With ${minutesLeft} minutes left, ${trailer} are running out of time.`;
  } else if (momentumShift) {
    const shiftSide = homePressure ? homeTeam : awayTempo ? awayTeam : leader ?? homeTeam;
    s2 = `Momentum has shifted — ${shiftSide} are growing into the match.`;
  } else if (homePressure) {
    s2 = `${homeTeam} are pushing forward and building pressure in attack.`;
  } else if (awayTempo) {
    s2 = `${awayTeam} are performing above expected tempo — dangerous on the break.`;
  } else if (homeOdds && awayOdds && diff !== 0) {
    const comebackOdds = diff > 0 ? awayOdds : homeOdds;
    s2 = comebackOdds > 5
      ? `Live odds of ${comebackOdds.toFixed(2)} suggest a comeback looks unlikely.`
      : `At ${comebackOdds.toFixed(2)}, ${trailer} still have a chance to level.`;
  } else {
    s2 = diff === 0
      ? "Both sides are looking for the breakthrough goal."
      : `${leader} are looking to extend their advantage.`;
  }

  const narrative = `${s1} ${s2}`.trim();

  // ── Momentum verdict ──────────────────────────────────────────────────────
  let momentum_verdict = "";
  if (momentumShift && homePressure) {
    momentum_verdict = `${homeTeam} momentum building`;
  } else if (momentumShift && awayTempo) {
    momentum_verdict = `${awayTeam} picking up pace`;
  } else if (momentumShift) {
    momentum_verdict = leader ? `${leader} in control` : "momentum shifting";
  } else if (diff === 0 && homeGoals >= 2) {
    momentum_verdict = "end-to-end action";
  } else if (absDiff >= 2) {
    momentum_verdict = `${leader} dominant`;
  } else if (diff === 0) {
    momentum_verdict = "evenly matched";
  } else {
    momentum_verdict = `${leader} ahead — ${trailer} pushing`;
  }

  // ── Key factors ───────────────────────────────────────────────────────────
  const key_factors: string[] = [];

  if (homeGoals + awayGoals >= 3) key_factors.push(`${homeGoals + awayGoals} goals scored — high-scoring affair`);
  if (homeGoals + awayGoals === 0 && minute >= 60) key_factors.push("Goalless with under 30 mins left");
  if (homePressure) key_factors.push(`${homeTeam} pressure rising`);
  if (awayTempo) key_factors.push(`${awayTeam} above expected tempo`);
  if (momentumShift) key_factors.push("Momentum shift detected");
  if (minutesLeft <= 15 && diff !== 0) key_factors.push(`${minutesLeft} minutes left — ${trailer} need a goal`);
  if (homeOdds && diff > 0 && homeOdds < 1.3) key_factors.push(`${homeTeam} massive favourites at ${homeOdds.toFixed(2)}`);
  if (awayOdds && diff < 0 && awayOdds < 1.3) key_factors.push(`${awayTeam} massive favourites at ${awayOdds.toFixed(2)}`);

  // ── Alert worthy ──────────────────────────────────────────────────────────
  const alert_worthy =
    momentumShift ||
    (diff !== 0 && minutesLeft <= 15) ||
    (diff === 0 && minute >= 75) ||
    (homeGoals + awayGoals >= 4);

  return {
    headline,
    narrative,
    momentum_verdict,
    key_factors: key_factors.slice(0, 3),
    alert_worthy,
  };
}

export async function getLiveAnalysis(fixtureId: number): Promise<LiveAnalysis> {
  const key = `live:${fixtureId}`;
  const cached = getCached<LiveAnalysis>(key);
  if (cached) return cached;

  const ctx = await buildLiveSignalContext(fixtureId);
  if (!ctx) return FALLBACK_LIVE;

  const result = buildLiveAnalysis(ctx);
  if (result.headline) setCached(key, result, 5 * 60 * 1000);
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

// ─── Algorithmic news body builder ───────────────────────────────────────────

type TeamMatch = {
  teamId: number; teamName: string; opponentName: string;
  homeGoals: number | null; awayGoals: number | null;
  isHome: boolean; kickoff: string | null; statusShort: string | null;
};

function buildNewsBody(teamName: string, rank: number, matches: TeamMatch[]): string {
  const finished = matches.filter((m) =>
    m.statusShort && ["FT", "AET", "PEN"].includes(m.statusShort) &&
    m.homeGoals != null && m.awayGoals != null
  );

  if (finished.length === 0) {
    return `${teamName} are ranked #${rank} and have upcoming fixtures to look forward to. Recent data is still being processed.`;
  }

  // Last match
  const last = finished[0]!;
  const scored = last.isHome ? last.homeGoals! : last.awayGoals!;
  const conceded = last.isHome ? last.awayGoals! : last.homeGoals!;
  const lastResult = scored > conceded ? "win" : scored < conceded ? "loss" : "draw";
  const venue = last.isHome ? "at home" : "away";
  const lastLine = `${scored}–${conceded} ${lastResult === "win" ? "victory" : lastResult === "loss" ? "defeat" : "draw"} against ${last.opponentName} (${venue})`;

  // Form across all finished
  const formParts = finished.map((m) => {
    const gs = m.isHome ? m.homeGoals! : m.awayGoals!;
    const gc = m.isHome ? m.awayGoals! : m.homeGoals!;
    return gs > gc ? "W" : gs < gc ? "L" : "D";
  });
  const formStr = formParts.join("-");
  const wins = formParts.filter((r) => r === "W").length;
  const draws = formParts.filter((r) => r === "D").length;
  const losses = formParts.filter((r) => r === "L").length;

  // Goal stats
  const totalScored = finished.reduce((s, m) => s + (m.isHome ? m.homeGoals! : m.awayGoals!), 0);
  const totalConceded = finished.reduce((s, m) => s + (m.isHome ? m.awayGoals! : m.homeGoals!), 0);
  const avgScored = (totalScored / finished.length).toFixed(1);
  const avgConceded = (totalConceded / finished.length).toFixed(1);

  // Sentence 1 — last result
  const rankLabel = rank === 1 ? "table leaders" : rank <= 3 ? `#${rank} in the table` : `ranked #${rank}`;
  const s1 = `${teamName}, currently ${rankLabel}, recorded a ${lastLine}.`;

  // Sentence 2 — recent form
  let s2 = "";
  if (finished.length >= 2) {
    const n = finished.length;
    if (wins === n) {
      s2 = `They are in excellent form, winning all ${n} of their last ${n} matches.`;
    } else if (losses === n) {
      s2 = `It has been a difficult run — they have lost all ${n} of their last ${n} matches (${formStr}).`;
    } else if (wins > losses) {
      s2 = `Across their last ${n} matches they show ${wins}W-${draws}D-${losses}L (${formStr}), pointing to a solid run of form.`;
    } else if (losses > wins) {
      s2 = `Form over their last ${n} matches reads ${wins}W-${draws}D-${losses}L (${formStr}), a run that will need to improve.`;
    } else {
      s2 = `Over ${n} recent matches their form stands at ${wins}W-${draws}D-${losses}L (${formStr}).`;
    }
  }

  // Sentence 3 — goals
  const attackNote =
    parseFloat(avgScored) >= 2.0
      ? `averaging ${avgScored} goals scored per game`
      : parseFloat(avgScored) >= 1.0
      ? `scoring ${avgScored} goals per game on average`
      : `managing just ${avgScored} goals per game`;
  const defenceNote =
    parseFloat(avgConceded) <= 0.5
      ? `while keeping a near-clean-sheet record (${avgConceded} conceded per game)`
      : parseFloat(avgConceded) <= 1.2
      ? `conceding ${avgConceded} goals per game`
      : `but conceding ${avgConceded} per game, which will be a concern`;
  const s3 = `In that stretch they are ${attackNote} ${defenceNote}.`;

  return [s1, s2, s3].filter(Boolean).join(" ").trim();
}

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

    // ── Generate article algorithmically (no AI cost) ─────────────────────────
    const body = buildNewsBody(team.teamName, team.rank, teamMatches);

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

// ─── Daily admin insight ──────────────────────────────────────────────────────

export async function generateDailyAdminInsight(): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const kvKey = `admin:daily_insight`;

  const existing = await kvGet(kvKey);
  if (existing) {
    try {
      const p = JSON.parse(existing);
      if (p.date === todayKey) { console.log("[admin-insight] Already generated today."); return; }
    } catch { /* regenerate */ }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const tips = await db.query.aiBettingTips.findMany({
    where: (t, { and: a, gte: g, isNotNull: inn }) => a(inn(t.outcome), g(t.createdAt, cutoff)),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
    limit: 500,
  });

  if (tips.length < 10) { console.log(`[admin-insight] Not enough reviewed tips (${tips.length}).`); return; }

  const byMarket: Record<string, { total: number; hits: number; totalEdge: number }> = {};
  const byLeague: Record<string, { total: number; hits: number }> = {};
  const byConfidence: Record<string, { total: number; hits: number }> = {};

  for (const tip of tips) {
    const market = tip.betType;
    const league = tip.leagueName ?? "Unknown";
    const conf = tip.confidence ?? "unknown";
    const isHit = tip.outcome === "hit" ? 1 : 0;
    const edge = tip.edge ?? 0;
    if (!byMarket[market]) byMarket[market] = { total: 0, hits: 0, totalEdge: 0 };
    byMarket[market]!.total++; byMarket[market]!.hits += isHit; byMarket[market]!.totalEdge += edge;
    if (!byLeague[league]) byLeague[league] = { total: 0, hits: 0 };
    byLeague[league]!.total++; byLeague[league]!.hits += isHit;
    if (!byConfidence[conf]) byConfidence[conf] = { total: 0, hits: 0 };
    byConfidence[conf]!.total++; byConfidence[conf]!.hits += isHit;
  }

  const fmt = (obj: Record<string, { total: number; hits: number; totalEdge?: number }>) =>
    Object.entries(obj).sort((a, b) => b[1].total - a[1].total)
      .map(([k, v]) => {
        const hr = Math.round((v.hits / v.total) * 100);
        const edgePart = v.totalEdge != null ? ` avg edge ${(v.totalEdge / v.total * 100).toFixed(1)}%` : "";
        return `  ${k}: ${v.hits}/${v.total} (${hr}%${edgePart})`;
      }).join("\n");

  const prompt = `You are a sports betting algorithm analyst. Review 30-day performance data for an algorithmic football betting tip generator and give specific improvement suggestions.

PERFORMANCE (${tips.length} reviewed tips):

By market:\n${fmt(byMarket)}\n\nBy league:\n${fmt(byLeague)}\n\nBy confidence:\n${fmt(byConfidence)}

Return JSON:
{
  "summary": "1-2 sentence overall assessment",
  "insights": ["observation 1", "observation 2", "observation 3"],
  "suggestions": ["concrete algorithm change 1", "concrete algorithm change 2"],
  "underperforming": ["market/league below expected"],
  "overperforming": ["market/league above expected"]
}
Be specific and data-driven. Reference actual numbers.`;

  const raw = await callClaude(prompt);
  if (!raw) { console.warn("[admin-insight] Claude returned null."); return; }

  const schema = z.object({
    summary: z.string(),
    insights: z.array(z.string()),
    suggestions: z.array(z.string()),
    underperforming: z.array(z.string()).optional(),
    overperforming: z.array(z.string()).optional(),
  });

  const parsed = parseJson(raw, schema, { summary: "Performance data collected.", insights: [], suggestions: [] });

  await kvSet(kvKey, JSON.stringify({ date: todayKey, generatedAt: new Date().toISOString(), tipsAnalysed: tips.length, ...parsed }));
  console.log(`[admin-insight] Stored daily insight for ${todayKey}.`);
}

export async function getAdminInsight(): Promise<Record<string, unknown> | null> {
  const raw = await kvGet("admin:daily_insight");
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}
