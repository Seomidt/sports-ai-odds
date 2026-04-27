/**
 * calibrationEngine.ts — Algorithmic self-improvement
 *
 * Reads historical tip results from DB, computes per-market calibration factors,
 * and exposes them so tipEngine.ts can shrink over-confident probability estimates.
 *
 * Factor calculation:
 *   actualHitRate = hits / (hits + misses)
 *   rawFactor     = actualHitRate / avgPredictedProbability
 *   factor        = 1.0 + (rawFactor - 1.0) × shrinkage(sampleSize)
 *
 * Shrinkage grows from 0 → 1 as samples grow from 0 → MIN_SAMPLES_FULL.
 * Below MIN_SAMPLES_MIN, no adjustment is applied.
 * Factor is clamped to [0.60, 1.40] to prevent wild swings.
 */

import { db } from "@workspace/db";
import { aiBettingTips } from "@workspace/db/schema";
import { and, gte, inArray, isNotNull, sql } from "drizzle-orm";

// ─── Config ───────────────────────────────────────────────────────────────────

const MIN_SAMPLES_MIN  = 20;   // fewer than this → no adjustment
const MIN_SAMPLES_FULL = 80;   // at this point shrinkage = 1.0 (full trust)
const FACTOR_MIN = 0.60;
const FACTOR_MAX = 1.40;
const LOOKBACK_DAYS = 90;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // recalculate once per day

// ─── Types ────────────────────────────────────────────────────────────────────

/** Key format: "betType/betSide" e.g. "match_result/home", "over_under/over25", "btts/yes" */
export type CalibrationKey = string;
export type CalibrationFactors = Map<CalibrationKey, number>;

interface CalibrationRow {
  betType: string;
  betSide: string | null;
  hits: number;
  total: number;
  avgPredicted: number;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cachedFactors: CalibrationFactors | null = null;
let cacheExpiresAt = 0;

function shrinkage(n: number): number {
  if (n < MIN_SAMPLES_MIN) return 0;
  if (n >= MIN_SAMPLES_FULL) return 1;
  return (n - MIN_SAMPLES_MIN) / (MIN_SAMPLES_FULL - MIN_SAMPLES_MIN);
}

function computeFactor(row: CalibrationRow): number {
  if (row.total < MIN_SAMPLES_MIN || row.avgPredicted <= 0) return 1.0;
  const actualRate = row.hits / row.total;
  const rawFactor = actualRate / row.avgPredicted;
  const s = shrinkage(row.total);
  const factor = 1.0 + (rawFactor - 1.0) * s;
  return Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor));
}

// ─── Main calibration function ────────────────────────────────────────────────

export async function runCalibration(): Promise<CalibrationFactors> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      betType: aiBettingTips.betType,
      betSide: aiBettingTips.betSide,
      hits:  sql<number>`count(*) filter (where ${aiBettingTips.outcome} = 'hit')::int`,
      total: sql<number>`count(*) filter (where ${aiBettingTips.outcome} in ('hit','miss'))::int`,
      avgPredicted: sql<number>`coalesce(avg(${aiBettingTips.aiProbability}) filter (where ${aiBettingTips.outcome} in ('hit','miss')), 0)`,
    })
    .from(aiBettingTips)
    .where(
      and(
        isNotNull(aiBettingTips.outcome),
        isNotNull(aiBettingTips.aiProbability),
        inArray(aiBettingTips.outcome, ["hit", "miss"]),
        gte(aiBettingTips.reviewedAt, cutoff),
      )
    )
    .groupBy(aiBettingTips.betType, aiBettingTips.betSide);

  const factors: CalibrationFactors = new Map();

  for (const row of rows) {
    const key: CalibrationKey = `${row.betType}/${row.betSide ?? ""}`;
    const factor = computeFactor(row as CalibrationRow);
    factors.set(key, factor);

    const actualRate = row.total > 0 ? Math.round((row.hits / row.total) * 100) : null;
    console.log(
      `[calibration] ${key}: samples=${row.total} avgPred=${(row.avgPredicted * 100).toFixed(1)}% ` +
      `actual=${actualRate ?? "?"}% factor=${factor.toFixed(3)}`
    );
  }

  cachedFactors = factors;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return factors;
}

/**
 * Returns cached calibration factors. If cache is stale or empty, runs a fresh
 * calibration query. Safe to call from tipEngine — will use in-memory if fresh.
 */
export async function getCalibrationFactors(): Promise<CalibrationFactors> {
  if (cachedFactors && Date.now() < cacheExpiresAt) return cachedFactors;
  return runCalibration();
}

/**
 * Returns calibration factor for a specific market key.
 * Returns 1.0 if not enough data (no adjustment applied).
 */
export function getFactor(factors: CalibrationFactors, betType: string, betSide: string | null): number {
  const key: CalibrationKey = `${betType}/${betSide ?? ""}`;
  return factors.get(key) ?? 1.0;
}
