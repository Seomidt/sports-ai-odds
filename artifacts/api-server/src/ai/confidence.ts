import { db } from "@workspace/db";
import { aiBettingTips, oddsSnapshots, predictionReviews } from "@workspace/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/**
 * Confidence calculation (Fase 1.3).
 *
 * Moves confidence derivation OUT of the LLM and into deterministic code so
 * it is explainable, auditable, and stable across model versions.
 *
 * Output: { confidence: "high" | "medium" | "low", score, components }
 *
 * Score = weighted sum of four components in [0, 1]:
 *   - edgeRealism        (0.4)  — penalty for implausibly large model-vs-implied gap
 *   - dataCompleteness   (0.3)  — fraction of key features present in the snapshot
 *   - oddsStability      (0.2)  — 1 - normalized variance of last 5 odds snapshots
 *   - leagueAccuracy     (0.1)  — historical hit rate for this league+market over 90 days
 */

const FEATURE_KEYS = ["form", "injuries", "weather", "h2h"] as const;

export interface ConfidenceInputs {
  modelProbability: number; // 0..1
  impliedProbability: number; // 0..1
  featureSnapshot: Record<string, unknown> | null | undefined;
  fixtureId: number;
  betType: string;
  leagueName?: string | null;
}

export interface ConfidenceResult {
  confidence: "high" | "medium" | "low";
  score: number;
  dataCompleteness: number;
  components: {
    edgeRealism: number;
    dataCompleteness: number;
    oddsStability: number;
    leagueAccuracy: number;
  };
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function computeDataCompleteness(snapshot: Record<string, unknown> | null | undefined): number {
  if (!snapshot) return 0;
  let present = 0;
  for (const key of FEATURE_KEYS) {
    const v = snapshot[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      if (Array.isArray(v) && v.length === 0) continue;
      if (!Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    }
    present++;
  }
  return present / FEATURE_KEYS.length;
}

async function computeOddsStability(fixtureId: number, betType: string): Promise<number> {
  const snaps = await db
    .select({
      homeWin: oddsSnapshots.homeWin,
      draw: oddsSnapshots.draw,
      awayWin: oddsSnapshots.awayWin,
      btts: oddsSnapshots.btts,
      overUnder25: oddsSnapshots.overUnder25,
    })
    .from(oddsSnapshots)
    .where(eq(oddsSnapshots.fixtureId, fixtureId))
    .orderBy(desc(oddsSnapshots.snappedAt))
    .limit(5);

  if (snaps.length < 2) return 0.5;

  const pickSeries = (): number[] => {
    const t = betType.toLowerCase();
    if (t === "match_result") {
      return snaps
        .map((s) => [s.homeWin, s.draw, s.awayWin].filter((v): v is number => typeof v === "number" && v > 1))
        .flat();
    }
    if (t === "over_under" || t === "over_under_2_5") {
      return snaps.map((s) => s.overUnder25).filter((v): v is number => typeof v === "number" && v > 1);
    }
    if (t === "btts") {
      return snaps.map((s) => s.btts).filter((v): v is number => typeof v === "number" && v > 1);
    }
    return [];
  };

  const series = pickSeries();
  if (series.length < 2) return 0.5;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  if (mean === 0) return 0.5;
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation

  // CV of 0 → perfectly stable → 1.0. CV of 0.20+ → very unstable → 0.
  return clamp01(1 - cv / 0.2);
}

async function computeLeagueAccuracy(leagueName: string | null | undefined, betType: string): Promise<number> {
  if (!leagueName) return 0.5;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      hits: sql<number>`count(*) filter (where ${aiBettingTips.outcome} = 'hit')::int`,
      total: sql<number>`count(*) filter (where ${aiBettingTips.outcome} in ('hit','miss'))::int`,
    })
    .from(predictionReviews)
    .innerJoin(aiBettingTips, eq(aiBettingTips.id, predictionReviews.predictionId))
    .where(
      and(
        eq(aiBettingTips.leagueName, leagueName),
        eq(aiBettingTips.betType, betType),
        gte(predictionReviews.createdAt, ninetyDaysAgo)
      )
    );

  const row = rows[0];
  if (!row || !row.total || row.total < 10) return 0.5; // not enough signal
  return clamp01(row.hits / row.total);
}

/**
 * Pure scoring — given all four components, returns final confidence score
 * and tier. Exposed for testing and for callers that already have components.
 */
export function scoreConfidence(components: ConfidenceResult["components"]): Pick<ConfidenceResult, "confidence" | "score"> {
  const score =
    0.4 * components.edgeRealism +
    0.3 * components.dataCompleteness +
    0.2 * components.oddsStability +
    0.1 * components.leagueAccuracy;

  let confidence: "high" | "medium" | "low";
  if (score >= 0.7) confidence = "high";
  else if (score >= 0.45) confidence = "medium";
  else confidence = "low";

  return { confidence, score };
}

export async function calculateConfidence(inputs: ConfidenceInputs): Promise<ConfidenceResult> {
  const gap = Math.abs(inputs.modelProbability - inputs.impliedProbability);
  const edgeRealism = clamp01(1 - gap / 0.5);

  const dataCompleteness = computeDataCompleteness(inputs.featureSnapshot);

  const [oddsStability, leagueAccuracy] = await Promise.all([
    computeOddsStability(inputs.fixtureId, inputs.betType),
    computeLeagueAccuracy(inputs.leagueName, inputs.betType),
  ]);

  const components = { edgeRealism, dataCompleteness, oddsStability, leagueAccuracy };
  const { confidence, score } = scoreConfidence(components);

  return { confidence, score, dataCompleteness, components };
}
