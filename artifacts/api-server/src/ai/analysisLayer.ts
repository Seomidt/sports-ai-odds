import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { aiBettingTips, fixtureSignals, fixtures, oddsSnapshots, standings } from "@workspace/db/schema";
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

// ─── Token tracking ───────────────────────────────────────────────────────────

const INPUT_COST_PER_M = 0.80;
const OUTPUT_COST_PER_M = 4.00;

interface AiUsageEntry { at: number; inputTokens: number; outputTokens: number; }
let aiUsageLog: AiUsageEntry[] = [];
let totalInputTokens = 0;
let totalOutputTokens = 0;

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
      max_tokens: 450,
      messages: [{ role: "user", content: prompt }],
    });
    const inputTok = msg.usage?.input_tokens ?? 0;
    const outputTok = msg.usage?.output_tokens ?? 0;
    totalInputTokens += inputTok;
    totalOutputTokens += outputTok;
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

async function buildBettingContext(fixtureId: number): Promise<{
  matchLabel: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
  leagueName: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  statusShort: string | null;
  signals: Record<string, number | boolean | string>;
  odds: { home: number | null; draw: number | null; away: number | null; over25: number | null; btts: number | null };
  homeRank: number | null;
  awayRank: number | null;
}> {
  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });

  if (!fixture) {
    return {
      matchLabel: "Unknown match",
      homeTeam: "Home", awayTeam: "Away",
      kickoff: null, leagueName: null,
      homeGoals: null, awayGoals: null, statusShort: null,
      signals: {}, odds: { home: null, draw: null, away: null, over25: null, btts: null },
      homeRank: null, awayRank: null,
    };
  }

  // Signals
  const rawSignals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) => andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "pre")),
  });

  const signals: Record<string, number | boolean | string> = {};
  for (const s of rawSignals) {
    if (s.signalBool !== null && s.signalBool !== undefined) signals[s.signalKey] = s.signalBool;
    else if (s.signalValue !== null && s.signalValue !== undefined) signals[s.signalKey] = Math.round(s.signalValue * 1000) / 1000;
  }

  // Odds
  const snap = await db.query.oddsSnapshots.findFirst({
    where: (o, { eq: eqFn }) => eqFn(o.fixtureId, fixtureId),
  });

  // League standings
  let homeRank: number | null = null;
  let awayRank: number | null = null;

  if (fixture.leagueId && fixture.homeTeamId && fixture.awayTeamId) {
    const homeStanding = await db.query.standings.findFirst({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.leagueId, fixture.leagueId), eqFn(s.teamId, fixture.homeTeamId)),
    });
    const awayStanding = await db.query.standings.findFirst({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.leagueId, fixture.leagueId), eqFn(s.teamId, fixture.awayTeamId)),
    });
    homeRank = homeStanding?.rank ?? null;
    awayRank = awayStanding?.rank ?? null;
  }

  return {
    matchLabel: `${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
    homeTeam: fixture.homeTeamName ?? "Home",
    awayTeam: fixture.awayTeamName ?? "Away",
    kickoff: fixture.kickoff?.toISOString() ?? null,
    leagueName: fixture.leagueName,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    statusShort: fixture.statusShort,
    signals,
    odds: {
      home: snap?.homeWin ?? null,
      draw: snap?.draw ?? null,
      away: snap?.awayWin ?? null,
      over25: snap?.overUnder25 ?? null,
      btts: snap?.btts ?? null,
    },
    homeRank,
    awayRank,
  };
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const BettingTipSchema = z.object({
  recommendation: z.string(),
  bet_type: z.enum(["match_result", "over_under", "btts", "no_bet"]),
  bet_side: z.string().nullable().optional(),
  trust_score: z.number().min(1).max(10),
  reasoning: z.string(),
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
  headline: "Analysis unavailable",
  narrative: "Live signal data is still being computed.",
  momentum_verdict: "Unknown",
  key_factors: [],
  alert_worthy: false,
};

// ─── Betting tip ──────────────────────────────────────────────────────────────

export async function getBettingTip(fixtureId: number) {
  // Return from DB if already generated (tips are permanent once created)
  const existing = await db.query.aiBettingTips.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
  });
  if (existing) return existing;

  const ctx = await buildBettingContext(fixtureId);

  if (Object.keys(ctx.signals).length < 3) {
    return null; // Not enough data yet
  }

  const accuracy = await getAccuracyHistory();

  const prompt = `You are a professional football betting analyst. Your job is to find the single best betting edge for the upcoming match.

Match: ${ctx.matchLabel}
League: ${ctx.leagueName ?? "Unknown"}
Kickoff: ${ctx.kickoff ?? "Unknown"}
League positions: ${ctx.homeTeam} ranked #${ctx.homeRank ?? "?"}, ${ctx.awayTeam} ranked #${ctx.awayRank ?? "?"}

Current market odds:
- Home win: ${ctx.odds.home ?? "N/A"}
- Draw: ${ctx.odds.draw ?? "N/A"}
- Away win: ${ctx.odds.away ?? "N/A"}
- Over 2.5 goals: ${ctx.odds.over25 ?? "N/A"}
- BTTS Yes: ${ctx.odds.btts ?? "N/A"}

Signal data from our analysis engine:
${JSON.stringify(ctx.signals, null, 2)}

Your accuracy history: ${accuracy.summary}
${accuracy.totalReviewed > 0 ? `Calibrate your trust scores to reflect your ${accuracy.hitRate}% hit rate — do not be overconfident.` : "This is your first tip — be conservative with trust scores."}

INSTRUCTIONS:
- Pick the market with the clearest edge based on the signals and odds
- If no clear edge exists, choose "No Bet"
- Trust score 1-4 = weak edge, 5-7 = reasonable edge, 8-10 = strong edge
- Reason in plain English, max 60 words, mention specific signals that support this

Respond with ONLY valid JSON:
{
  "recommendation": "Home Win",
  "bet_type": "match_result",
  "bet_side": "home",
  "trust_score": 7,
  "reasoning": "Arsenal have strong home form (last 5 wins) and their H2H record vs Chelsea shows 3 home wins in last 4 meetings. Away side missing key striker. Odds of 1.95 offer value."
}

bet_type must be one of: "match_result", "over_under", "btts", "no_bet"
bet_side for match_result: "home", "away", "draw"
bet_side for over_under: "over", "under"
bet_side for btts: "yes", "no"
bet_side for no_bet: null`;

  const raw = await callClaude(prompt);
  const parsed = parseJson(raw, BettingTipSchema, null as unknown as z.infer<typeof BettingTipSchema>);

  if (!parsed?.recommendation) return null;

  // Find relevant market odds
  let marketOdds: number | null = null;
  if (parsed.bet_type === "match_result") {
    if (parsed.bet_side === "home") marketOdds = ctx.odds.home;
    else if (parsed.bet_side === "away") marketOdds = ctx.odds.away;
    else if (parsed.bet_side === "draw") marketOdds = ctx.odds.draw;
  } else if (parsed.bet_type === "over_under" && parsed.bet_side === "over") {
    marketOdds = ctx.odds.over25;
  } else if (parsed.bet_type === "btts") {
    marketOdds = ctx.odds.btts;
  }

  // Store in DB permanently
  const [stored] = await db.insert(aiBettingTips).values({
    fixtureId,
    homeTeam: ctx.homeTeam,
    awayTeam: ctx.awayTeam,
    kickoff: ctx.kickoff ? new Date(ctx.kickoff) : null,
    leagueName: ctx.leagueName,
    recommendation: parsed.recommendation,
    betType: parsed.bet_type,
    betSide: parsed.bet_side ?? null,
    trustScore: Math.round(parsed.trust_score),
    reasoning: parsed.reasoning,
    marketOdds,
  }).onConflictDoUpdate({
    target: aiBettingTips.fixtureId,
    set: {
      recommendation: parsed.recommendation,
      betType: parsed.bet_type,
      betSide: parsed.bet_side ?? null,
      trustScore: Math.round(parsed.trust_score),
      reasoning: parsed.reasoning,
      marketOdds,
    },
  }).returning();

  console.log(`[ai] Betting tip for fixture ${fixtureId}: ${parsed.recommendation} (trust ${parsed.trust_score}/10)`);
  return stored ?? null;
}

// ─── Post-match review ────────────────────────────────────────────────────────

/** Called after a match reaches FT status. Grades the original tip. */
export async function triggerPostMatchReview(fixtureId: number): Promise<void> {
  const tip = await db.query.aiBettingTips.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
  });

  if (!tip) return; // No tip was made for this fixture
  if (tip.outcome) return; // Already reviewed

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });

  if (!fixture || fixture.homeGoals == null || fixture.awayGoals == null) return;

  // Determine actual result
  const hg = fixture.homeGoals;
  const ag = fixture.awayGoals;
  const totalGoals = hg + ag;
  const actualResult = hg > ag ? "home_win" : hg < ag ? "away_win" : "draw";
  const bttsResult = hg > 0 && ag > 0;
  const over25Result = totalGoals > 2;

  // Mathematically determine outcome (no AI needed for this)
  let outcome: "hit" | "miss" | "partial" = "miss";

  if (tip.betType === "no_bet") {
    outcome = "hit"; // No-bet is always correct (avoid signal)
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

  // Get post-match signals for context
  const postSignals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) => andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "post")),
  });
  const signalCtx: Record<string, unknown> = {};
  for (const s of postSignals) {
    if (s.signalBool !== null) signalCtx[s.signalKey] = s.signalBool;
    else if (s.signalValue !== null) signalCtx[s.signalKey] = Math.round(s.signalValue * 1000) / 1000;
  }

  const resultStr = `${fixture.homeTeamName} ${hg} - ${ag} ${fixture.awayTeamName} (FT)`;

  const prompt = `You are reviewing your own football betting prediction.

Your original tip: "${tip.recommendation}" — ${tip.reasoning}
Trust score you assigned: ${tip.trustScore}/10
Outcome: ${outcome.toUpperCase()} (${resultStr})

Post-match signals:
${JSON.stringify(signalCtx, null, 2)}

Write a brief honest review of what happened. Was the reasoning sound even if the bet lost? What signals proved accurate? What was misleading?

Respond with ONLY valid JSON:
{
  "outcome": "${outcome}",
  "review_headline": "One sentence recap (max 12 words)",
  "review_summary": "Two sentences: what happened in the match and whether it was expected. Max 50 words.",
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
    .where(eq(aiBettingTips.fixtureId, fixtureId));

  console.log(`[ai] Post-match review for fixture ${fixtureId}: ${review.outcome.toUpperCase()}`);
}

// ─── Live analysis (kept for live tab) ───────────────────────────────────────

async function buildLiveSignalContext(fixtureId: number): Promise<Record<string, number | boolean | string>> {
  const signals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "live")),
  });
  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });

  const ctx: Record<string, number | boolean | string> = {
    match: `${fixture?.homeTeamName ?? "Home"} vs ${fixture?.awayTeamName ?? "Away"}`,
    minute: fixture?.statusElapsed ?? 0,
    home_goals: fixture?.homeGoals ?? 0,
    away_goals: fixture?.awayGoals ?? 0,
    status: fixture?.statusShort ?? "NS",
  };

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
  if (Object.keys(ctx).length <= 5) return FALLBACK_LIVE;

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
  const prompt = `Football alert: ${matchName} — Signal: "${signalLabel}". Write a 1-sentence alert in max 20 words. No emoji. Be direct and factual.`;
  const raw = await callClaude(prompt);
  return raw?.replace(/```[^`]*```/g, "").trim() ?? `${matchName}: ${signalLabel}`;
}
