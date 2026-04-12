import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { aiBettingTips, fixtures, oddsSnapshots, standings, teamFeatures, h2hFixtures, newsArticles } from "@workspace/db/schema";
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

const SingleTipSchema = z.object({
  recommendation: z.string(),
  bet_type: z.enum(["match_result", "over_under", "btts", "no_bet"]),
  bet_side: z.string().nullable().optional(),
  trust_score: z.number().min(1).max(10),
  reasoning: z.string(),
});

const MultiBettingTipSchema = z.object({
  tips: z.array(SingleTipSchema).min(1).max(3),
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

// ─── Value calculation ────────────────────────────────────────────────────────

function calcValueRating(trustScore: number, marketOdds: number | null): string {
  if (!marketOdds || marketOdds <= 1) return "neutral";
  const impliedProb = 1 / marketOdds;
  const aiProb = trustScore / 10;
  const edge = aiProb - impliedProb;
  if (edge >= 0.15) return "strong_value";
  if (edge >= 0.05) return "value";
  if (edge >= -0.05) return "fair";
  return "overpriced";
}

function getMarketOddsForTip(
  tip: { bet_type: string; bet_side?: string | null },
  odds: { home: number | null; draw: number | null; away: number | null; over25: number | null; btts: number | null },
): number | null {
  if (tip.bet_type === "match_result") {
    if (tip.bet_side === "home") return odds.home;
    if (tip.bet_side === "away") return odds.away;
    if (tip.bet_side === "draw") return odds.draw;
  } else if (tip.bet_type === "over_under") {
    return odds.over25 ?? null;
  } else if (tip.bet_type === "btts") {
    return odds.btts;
  }
  return null;
}

// ─── Betting tips (multi-market) ─────────────────────────────────────────────

export async function getBettingTips(fixtureId: number) {
  const existing = await db.query.aiBettingTips.findMany({
    where: (t, { eq: eqFn }) => eqFn(t.fixtureId, fixtureId),
  });
  if (existing.length >= 3) return existing;

  const ctx = await buildBettingContext(fixtureId);

  if (!ctx.odds.home && !ctx.odds.draw && !ctx.odds.away) {
    return null;
  }

  const accuracy = await getAccuracyHistory();

  const prompt = `You are a professional football betting analyst. Analyse ALL THREE markets for this upcoming match and give a verdict on each.

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
- Give exactly 3 tips: one for match_result, one for over_under, one for btts
- For each, pick the side with the best edge
- Trust score 1-4 = weak edge, 5-7 = reasonable edge, 8-10 = strong edge
- Compare your confidence against the market odds — if you think home win probability is 60% but market odds imply 50%, that's value
- Reasoning: max 50 words per tip, mention the odds and specific signals

Respond with ONLY valid JSON:
{
  "tips": [
    {
      "recommendation": "Home Win",
      "bet_type": "match_result",
      "bet_side": "home",
      "trust_score": 7,
      "reasoning": "Strong home form (W4 in last 5) and H2H dominance. Odds of 2.14 imply 47% probability but signals suggest ~60% — clear value."
    },
    {
      "recommendation": "Over 2.5 Goals",
      "bet_type": "over_under",
      "bet_side": "over",
      "trust_score": 6,
      "reasoning": "H2H avg 3.2 goals, both teams attack-minded. Odds of 1.90 represent fair price for this matchup."
    },
    {
      "recommendation": "BTTS Yes",
      "bet_type": "btts",
      "bet_side": "yes",
      "trust_score": 5,
      "reasoning": "Both teams score in 70% of recent matches. Odds of 1.83 slightly overpriced given defensive records."
    }
  ]
}

bet_side for match_result: "home", "away", "draw"
bet_side for over_under: "over", "under"
bet_side for btts: "yes", "no"`;

  const raw = await callClaude(prompt);
  const parsed = parseJson(raw, MultiBettingTipSchema, null as unknown as z.infer<typeof MultiBettingTipSchema>);

  if (!parsed?.tips?.length) return null;

  const storedTips = [];
  for (const tip of parsed.tips) {
    if (tip.bet_type === "no_bet") continue;
    const marketOdds = getMarketOddsForTip(tip, ctx.odds);
    const valueRating = calcValueRating(tip.trust_score, marketOdds);

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
      reasoning: tip.reasoning,
      marketOdds,
      valueRating,
    }).onConflictDoUpdate({
      target: [aiBettingTips.fixtureId, aiBettingTips.betType],
      set: {
        recommendation: tip.recommendation,
        betSide: tip.bet_side ?? null,
        trustScore: Math.round(tip.trust_score),
        reasoning: tip.reasoning,
        marketOdds,
        valueRating,
      },
    }).returning();
    if (stored) storedTips.push(stored);
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
