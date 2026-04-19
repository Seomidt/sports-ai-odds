/**
 * Publish filter (Fase 1.4).
 *
 * Tips are ALWAYS persisted to the DB for audit and learning, but are only
 * *published* (returned from public endpoints) when they meet quality gates.
 * Internal /api/admin/* endpoints can bypass this filter to see everything.
 */

const DEFAULT_EDGE_THRESHOLD = 0.04; // 4 percentage points
const DEFAULT_DATA_COMPLETENESS_MIN = 0.6;
const PRIMARY_MARKETS = new Set(["match_result", "over_under", "over_under_2_5", "btts"]);

export interface PublishableTip {
  betType: string;
  edge: number | null;
  confidence: string | null; // "high" | "medium" | "low"
  featureSnapshot?: Record<string, unknown> | null;
}

export interface PublishFilterOptions {
  edgeThreshold?: number;
  dataCompletenessMin?: number;
  primaryMarketsOnly?: boolean;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  return v.toLowerCase() === "true" || v === "1";
}

function envNumber(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (!v) return defaultValue;
  const n = Number(v);
  return isFinite(n) ? n : defaultValue;
}

export function getPublishConfig(overrides: PublishFilterOptions = {}) {
  return {
    edgeThreshold: overrides.edgeThreshold ?? envNumber("EDGE_THRESHOLD", DEFAULT_EDGE_THRESHOLD),
    dataCompletenessMin: overrides.dataCompletenessMin ?? envNumber("DATA_COMPLETENESS_MIN", DEFAULT_DATA_COMPLETENESS_MIN),
    primaryMarketsOnly: overrides.primaryMarketsOnly ?? envBool("PRIMARY_MARKETS_ONLY", true),
  };
}

function dataCompletenessFromSnapshot(snapshot: Record<string, unknown> | null | undefined): number {
  if (!snapshot) return 0;
  const keys = ["form", "injuries", "weather", "h2h"];
  let present = 0;
  for (const k of keys) {
    const v = snapshot[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    present++;
  }
  return present / keys.length;
}

export function isTipPublishable(tip: PublishableTip, options: PublishFilterOptions = {}): boolean {
  const cfg = getPublishConfig(options);

  if (cfg.primaryMarketsOnly && !PRIMARY_MARKETS.has(tip.betType)) return false;

  const edge = tip.edge ?? 0;
  if (edge < cfg.edgeThreshold) return false;

  if ((tip.confidence ?? "").toLowerCase() === "low") return false;

  // Grandfather tips created before Fase 1.1 (no featureSnapshot populated yet):
  // only enforce completeness when a snapshot is present.
  if (tip.featureSnapshot) {
    const completeness = dataCompletenessFromSnapshot(tip.featureSnapshot);
    if (completeness < cfg.dataCompletenessMin) return false;
  }

  return true;
}

export function filterPublishableTips<T extends PublishableTip>(tips: T[], options: PublishFilterOptions = {}): T[] {
  return tips.filter((t) => isTipPublishable(t, options));
}
