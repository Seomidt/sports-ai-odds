import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { z } from "zod";

const client = new Anthropic({
  apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"],
  baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
});

// TTL cache
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const PRE_TTL = 30 * 60 * 1000;
const LIVE_TTL = 5 * 60 * 1000;
const POST_TTL = 365 * 24 * 60 * 60 * 1000;

// ─── Signal formatter ─────────────────────────────────────────────────────────

async function buildSignalContext(fixtureId: number, phase: string): Promise<Record<string, number | boolean | string>> {
  const signals = await db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, phase)),
  });

  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });

  const ctx: Record<string, number | boolean | string> = {
    match: `${fixture?.homeTeamName ?? "Home"} vs ${fixture?.awayTeamName ?? "Away"}`,
    phase,
    minute: fixture?.statusElapsed ?? 0,
    home_goals: fixture?.homeGoals ?? 0,
    away_goals: fixture?.awayGoals ?? 0,
    status: fixture?.statusShort ?? "NS",
  };

  for (const s of signals) {
    if (s.signalBool !== null && s.signalBool !== undefined) {
      ctx[s.signalKey] = s.signalBool;
    } else if (s.signalValue !== null && s.signalValue !== undefined) {
      ctx[s.signalKey] = Math.round(s.signalValue * 1000) / 1000;
    }
  }

  return ctx;
}

// ─── Zod schemas for AI responses ────────────────────────────────────────────

const PreAnalysisSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  key_factors: z.array(z.string()).max(3),
  favorite: z.enum(["home", "away", "even"]),
  confidence: z.number().min(0).max(1),
});

const LiveAnalysisSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  momentum_verdict: z.string(),
  key_factors: z.array(z.string()).max(3),
  alert_worthy: z.boolean(),
});

const PostAnalysisSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  key_factors: z.array(z.string()).max(3),
  deviation_note: z.string(),
  man_of_match: z.string().optional(),
});

type PreAnalysis = z.infer<typeof PreAnalysisSchema>;
type LiveAnalysis = z.infer<typeof LiveAnalysisSchema>;
type PostAnalysis = z.infer<typeof PostAnalysisSchema>;

const FALLBACK_PRE: PreAnalysis = {
  headline: "Analysis unavailable",
  narrative: "Signal data is still being computed.",
  key_factors: [],
  favorite: "even",
  confidence: 0,
};

const FALLBACK_LIVE: LiveAnalysis = {
  headline: "Analysis unavailable",
  narrative: "Live signal data is still being computed.",
  momentum_verdict: "Unknown",
  key_factors: [],
  alert_worthy: false,
};

const FALLBACK_POST: PostAnalysis = {
  headline: "Match complete",
  narrative: "Post-match analysis is being computed.",
  key_factors: [],
  deviation_note: "N/A",
};

// ─── Token usage tracking ────────────────────────────────────────────────────
// Claude Haiku pricing (per million tokens, USD)
const INPUT_COST_PER_M = 0.80;
const OUTPUT_COST_PER_M = 4.00;

interface AiUsageEntry {
  at: number;
  inputTokens: number;
  outputTokens: number;
}

let aiUsageLog: AiUsageEntry[] = [];
let totalInputTokens = 0;
let totalOutputTokens = 0;

export function getAiStats() {
  const totalCost =
    (totalInputTokens / 1_000_000) * INPUT_COST_PER_M +
    (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M;
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentEntries = aiUsageLog.filter((e) => e.at > last24h);
  const last24hInput = recentEntries.reduce((s, e) => s + e.inputTokens, 0);
  const last24hOutput = recentEntries.reduce((s, e) => s + e.outputTokens, 0);
  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
    last24hInputTokens: last24hInput,
    last24hOutputTokens: last24hOutput,
    callsTotal: aiUsageLog.length,
    model: "claude-haiku-4-5",
    pricingNote: `$${INPUT_COST_PER_M}/MTok in · $${OUTPUT_COST_PER_M}/MTok out`,
  };
}

async function callClaude(prompt: string): Promise<string | null> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
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

// ─── Endpoints ────────────────────────────────────────────────────────────────

export async function getPreAnalysis(fixtureId: number): Promise<PreAnalysis> {
  const key = `pre:${fixtureId}`;
  const cached = getCached<PreAnalysis>(key);
  if (cached) return cached;

  const ctx = await buildSignalContext(fixtureId, "pre");

  if (Object.keys(ctx).length <= 6) return FALLBACK_PRE; // no signals yet

  const prompt = `You are a football analyst. Given these pre-match signals, write a concise analysis.

Match context: ${JSON.stringify(ctx)}

Respond with ONLY valid JSON in this exact format:
{
  "headline": "One sentence headline (max 12 words)",
  "narrative": "Two sentence analysis focused on key signals (max 50 words)",
  "key_factors": ["factor 1", "factor 2", "factor 3"],
  "favorite": "home" | "away" | "even",
  "confidence": 0.0-1.0
}`;

  const raw = await callClaude(prompt);
  const result = parseJson(raw, PreAnalysisSchema, FALLBACK_PRE);
  setCached(key, result, PRE_TTL);
  return result;
}

export async function getLiveAnalysis(fixtureId: number): Promise<LiveAnalysis> {
  const key = `live:${fixtureId}`;
  const cached = getCached<LiveAnalysis>(key);
  if (cached) return cached;

  const ctx = await buildSignalContext(fixtureId, "live");

  if (Object.keys(ctx).length <= 6) return FALLBACK_LIVE;

  const prompt = `You are a football analyst. Given these live match signals, write a concise live analysis.

Live context: ${JSON.stringify(ctx)}

Respond with ONLY valid JSON in this exact format:
{
  "headline": "One sentence live headline (max 12 words)",
  "narrative": "Two sentence live analysis based on signals only (max 50 words)",
  "momentum_verdict": "One phrase describing current momentum (max 8 words)",
  "key_factors": ["factor 1", "factor 2", "factor 3"],
  "alert_worthy": true | false
}`;

  const raw = await callClaude(prompt);
  const result = parseJson(raw, LiveAnalysisSchema, FALLBACK_LIVE);
  setCached(key, result, LIVE_TTL);
  return result;
}

export async function getPostAnalysis(fixtureId: number): Promise<PostAnalysis> {
  const key = `post:${fixtureId}`;
  const cached = getCached<PostAnalysis>(key);
  if (cached) return cached;

  const ctx = await buildSignalContext(fixtureId, "post");
  const preCt = await buildSignalContext(fixtureId, "pre");
  const merged = { ...preCt, ...ctx };

  if (Object.keys(ctx).length <= 6) return FALLBACK_POST;

  const prompt = `You are a football analyst. Given these post-match signals, write a concise match recap.

Match context: ${JSON.stringify(merged)}

Respond with ONLY valid JSON in this exact format:
{
  "headline": "One sentence match recap headline (max 12 words)",
  "narrative": "Two sentence match analysis based on signals (max 50 words)",
  "key_factors": ["factor 1", "factor 2", "factor 3"],
  "deviation_note": "One sentence: was result as expected or a surprise? (max 20 words)",
  "man_of_match": "optional - player name if clearly decisive"
}`;

  const raw = await callClaude(prompt);
  const result = parseJson(raw, PostAnalysisSchema, FALLBACK_POST);
  setCached(key, result, POST_TTL);
  return result;
}

export async function generateAlertText(signalKey: string, signalLabel: string, matchName: string): Promise<string> {
  const prompt = `Football alert: ${matchName} — Signal: "${signalLabel}". Write a 1-sentence alert in max 20 words. No emoji. Be direct and factual.`;
  const raw = await callClaude(prompt);
  return raw?.trim().replace(/^"|"$/g, "") ?? signalLabel;
}
