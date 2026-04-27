/**
 * tipEngine.ts — Algorithmic betting tip generator
 *
 * Replaces Claude AI for tip generation. Uses backtested signal rules
 * derived from 23,000+ matches. AI is kept only for daily admin insights.
 *
 * Outputs the same tip format as the AI so the rest of the pipeline is unchanged.
 */

import type { CalibrationFactors } from "./calibrationEngine.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlgoOdds {
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
}

interface AlgoSeasonStats {
  form: string | null;
  goalsForAvg: number | null; goalsAgainstAvg: number | null;
  cleanSheets: number | null; played: number | null;
  winStreak: number | null;
  // Home-specific (present on homeSeasonStats)
  goalsForAvgHome?: number | null; goalsAgainstAvgHome?: number | null;
  cleanSheetsHome?: number | null; failedToScoreHome?: number | null;
  winsHome?: number | null; lossesHome?: number | null;
  // Away-specific (present on awaySeasonStats)
  goalsForAvgAway?: number | null; goalsAgainstAvgAway?: number | null;
  cleanSheetsAway?: number | null; failedToScoreAway?: number | null;
  winsAway?: number | null; lossesAway?: number | null;
}

interface AlgoRecentStats {
  avgCorners: number | null; avgCards: number | null;
  avgShots: number | null; avgPossession: number | null; avgFouls: number | null;
}

export interface AlgoContext {
  homeTeam: string; awayTeam: string;
  leagueName: string | null;
  homeRank: number | null; awayRank: number | null;
  homePoints: number | null; awayPoints: number | null;
  homeGD: number | null; awayGD: number | null;
  homeSeasonStats: AlgoSeasonStats | null;
  awaySeasonStats: AlgoSeasonStats | null;
  homeRecentXg: number | null; awayRecentXg: number | null;
  homeRecentStats: AlgoRecentStats | null;
  awayRecentStats: AlgoRecentStats | null;
  prediction: {
    homeWinPct: number | null; drawPct: number | null; awayWinPct: number | null;
    goalsHome: number | null; goalsAway: number | null;
  } | null;
  odds: AlgoOdds;
  weather: { isAdverse: boolean; adverseReason?: string } | null;
  signals: Record<string, number | boolean | string>;
}

export interface AlgoTip {
  recommendation: string;
  bet_type: string;
  bet_side: string | null;
  trust_score: number;
  estimated_probability: number;
  reasoning: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** P(X <= k) for Poisson(lambda) */
function poissonCdf(lambda: number, k: number): number {
  let p = 0;
  for (let i = 0; i <= k; i++) {
    p += Math.exp(-lambda) * Math.pow(lambda, i) / factorial(i);
  }
  return p;
}

/** Win rate from form string (e.g. "WWDLW"), last N games */
function parseForm(form: string | null, last = 5): number {
  if (!form) return 0.45; // neutral fallback
  const recent = form.slice(-last).toUpperCase();
  const wins = (recent.match(/W/g) ?? []).length;
  return wins / Math.max(recent.length, 1);
}

/** Map estimated probability to a 1-10 trust score */
function trustFromProb(prob: number): number {
  if (prob >= 0.72) return 9;
  if (prob >= 0.65) return 8;
  if (prob >= 0.58) return 7;
  if (prob >= 0.52) return 6;
  if (prob >= 0.47) return 5;
  if (prob >= 0.42) return 4;
  return 3;
}

// ─── Market probability calculators ──────────────────────────────────────────

/**
 * Match result probabilities.
 * Primary signal: rank diff + GD diff (backtested as strongest predictor).
 * Secondary: points diff, form.
 * Blended 70/30 with API-Football prediction when available.
 */
function calcMatchResult(ctx: AlgoContext): { homeProb: number; drawProb: number; awayProb: number } {
  // Base probs (long-run European football averages)
  let homeProb = 0.44;
  let drawProb = 0.25;
  let awayProb = 0.31;

  // rankDiff > 0 means home is ranked higher (better)
  const rankDiff = ctx.awayRank != null && ctx.homeRank != null ? ctx.awayRank - ctx.homeRank : null;
  // gdDiff > 0 means home has better goal difference
  const gdDiff = ctx.homeGD != null && ctx.awayGD != null ? ctx.homeGD - ctx.awayGD : null;
  // ptsDiff > 0 means home has more points
  const ptsDiff = ctx.homePoints != null && ctx.awayPoints != null ? ctx.homePoints - ctx.awayPoints : null;

  // ── Rank + GD combined (strongest signal) ──────────────────────────────────
  if (rankDiff != null && gdDiff != null) {
    if (rankDiff >= 10 && gdDiff >= 10) {
      homeProb += 0.20; drawProb -= 0.09; awayProb -= 0.11;
    } else if (rankDiff >= 5 && gdDiff >= 5) {
      homeProb += 0.12; drawProb -= 0.05; awayProb -= 0.07;
    } else if (rankDiff >= 3 && gdDiff >= 3) {
      homeProb += 0.06; drawProb -= 0.02; awayProb -= 0.04;
    } else if (rankDiff <= -10 && gdDiff <= -10) {
      awayProb += 0.16; drawProb -= 0.07; homeProb -= 0.09;
    } else if (rankDiff <= -5 && gdDiff <= -5) {
      awayProb += 0.09; drawProb -= 0.03; homeProb -= 0.06;
    } else if (rankDiff <= -3 && gdDiff <= -3) {
      awayProb += 0.05; drawProb -= 0.02; homeProb -= 0.03;
    }
  }

  // ── Points diff (secondary signal) ────────────────────────────────────────
  if (ptsDiff != null) {
    if (ptsDiff >= 15) { homeProb += 0.07; drawProb -= 0.03; awayProb -= 0.04; }
    else if (ptsDiff >= 10) { homeProb += 0.04; drawProb -= 0.02; awayProb -= 0.02; }
    else if (ptsDiff <= -15) { awayProb += 0.07; drawProb -= 0.03; homeProb -= 0.04; }
    else if (ptsDiff <= -10) { awayProb += 0.04; drawProb -= 0.02; homeProb -= 0.02; }
  }

  // ── Form (confirming signal, ±3pp max) ────────────────────────────────────
  const homeFormRate = parseForm(ctx.homeSeasonStats?.form ?? null);
  const awayFormRate = parseForm(ctx.awaySeasonStats?.form ?? null);
  const formDiff = homeFormRate - awayFormRate;
  if (formDiff > 0.3) { homeProb += 0.03; awayProb -= 0.02; drawProb -= 0.01; }
  else if (formDiff < -0.3) { awayProb += 0.03; homeProb -= 0.02; drawProb -= 0.01; }

  // ── Draw bonus: closely matched sides ─────────────────────────────────────
  if (rankDiff != null && ptsDiff != null && Math.abs(rankDiff) <= 2 && Math.abs(ptsDiff) <= 3) {
    drawProb += 0.04; homeProb -= 0.02; awayProb -= 0.02;
  }

  // ── Blend with API-Football prediction (30% weight) ───────────────────────
  if (
    ctx.prediction?.homeWinPct != null &&
    ctx.prediction?.drawPct != null &&
    ctx.prediction?.awayWinPct != null
  ) {
    const apiHome = ctx.prediction.homeWinPct / 100;
    const apiDraw = ctx.prediction.drawPct / 100;
    const apiAway = ctx.prediction.awayWinPct / 100;
    homeProb = 0.70 * homeProb + 0.30 * apiHome;
    drawProb = 0.70 * drawProb + 0.30 * apiDraw;
    awayProb = 0.70 * awayProb + 0.30 * apiAway;
  }

  // Normalize to sum to 1
  const total = homeProb + drawProb + awayProb;
  return {
    homeProb: clamp(homeProb / total, 0.05, 0.90),
    drawProb: clamp(drawProb / total, 0.05, 0.50),
    awayProb: clamp(awayProb / total, 0.05, 0.75),
  };
}

/**
 * Over/Under probabilities using Poisson distribution.
 * Lambda = blended expected goals from team attack/defense averages.
 */
function calcOverUnder(ctx: AlgoContext): {
  over25prob: number; over15prob: number; over35prob: number;
} {
  // Use home/away-specific stats where available (more accurate than season total)
  const homeFor = ctx.homeSeasonStats?.goalsForAvgHome ?? ctx.homeSeasonStats?.goalsForAvg ?? 1.30;
  const awayFor = ctx.awaySeasonStats?.goalsForAvgAway ?? ctx.awaySeasonStats?.goalsForAvg ?? 1.00;
  const homeAgainst = ctx.homeSeasonStats?.goalsAgainstAvgHome ?? ctx.homeSeasonStats?.goalsAgainstAvg ?? 1.10;
  const awayAgainst = ctx.awaySeasonStats?.goalsAgainstAvgAway ?? ctx.awaySeasonStats?.goalsAgainstAvg ?? 1.30;

  // Expected goals: blend of attack and defense averages
  const lambdaRaw = (homeFor + awayAgainst + awayFor + homeAgainst) / 2;

  // xG adjustment (up to ±0.3 goals if xG diverges from season avg)
  let lambda = lambdaRaw;
  if (ctx.homeRecentXg != null && ctx.awayRecentXg != null) {
    const xgTotal = ctx.homeRecentXg + ctx.awayRecentXg;
    lambda = 0.75 * lambdaRaw + 0.25 * xgTotal;
  }

  // API-Football predicted goals (light blend if available)
  if (ctx.prediction?.goalsHome != null && ctx.prediction?.goalsAway != null) {
    const apiLambda = ctx.prediction.goalsHome + ctx.prediction.goalsAway;
    lambda = 0.85 * lambda + 0.15 * apiLambda;
  }

  lambda = Math.max(0.5, lambda);

  let over25prob = 1 - poissonCdf(lambda, 2);
  let over15prob = 1 - poissonCdf(lambda, 1);
  let over35prob = 1 - poissonCdf(lambda, 3);

  // H2H average goals adjustment
  const h2hAvgGoals = ctx.signals["h2h_avg_goals"];
  if (typeof h2hAvgGoals === "number") {
    if (h2hAvgGoals > 3.2) { over25prob += 0.03; over35prob += 0.02; }
    else if (h2hAvgGoals < 1.8) { over25prob -= 0.03; over15prob -= 0.02; }
  }

  // Adverse weather suppresses goals
  if (ctx.weather?.isAdverse) {
    over25prob -= 0.05;
    over15prob -= 0.03;
    over35prob -= 0.06;
  }

  return {
    over25prob: clamp(over25prob, 0.20, 0.85),
    over15prob: clamp(over15prob, 0.40, 0.95),
    over35prob: clamp(over35prob, 0.10, 0.70),
  };
}

/**
 * BTTS probability.
 * P(both score) ≈ P(home scores ≥1) × P(away scores ≥1) via Poisson,
 * adjusted for clean sheet rates and failed-to-score rates.
 */
function calcBtts(ctx: AlgoContext): { bttsYesProb: number } {
  const homeFor = ctx.homeSeasonStats?.goalsForAvgHome ?? ctx.homeSeasonStats?.goalsForAvg ?? 1.30;
  const awayFor = ctx.awaySeasonStats?.goalsForAvgAway ?? ctx.awaySeasonStats?.goalsForAvg ?? 1.00;

  // P(scores at least 1) = 1 - P(0 goals) = 1 - e^-lambda
  const homeScoreProb = 1 - Math.exp(-Math.max(0.1, homeFor));
  const awayScoreProb = 1 - Math.exp(-Math.max(0.1, awayFor));
  let bttsYesProb = homeScoreProb * awayScoreProb;

  const homePlayed = ctx.homeSeasonStats?.played ?? 20;
  const awayPlayed = ctx.awaySeasonStats?.played ?? 20;
  const homeHomePlayed = Math.max(1, homePlayed / 2);
  const awayAwayPlayed = Math.max(1, awayPlayed / 2);

  // Clean sheet rate penalises BTTS yes (opponent unlikely to score against this defence)
  const homeCSRate = ctx.homeSeasonStats?.cleanSheetsHome != null
    ? ctx.homeSeasonStats.cleanSheetsHome / homeHomePlayed : null;
  const awayCSRate = ctx.awaySeasonStats?.cleanSheetsAway != null
    ? ctx.awaySeasonStats.cleanSheetsAway / awayAwayPlayed : null;

  if (homeCSRate != null && homeCSRate > 0.45) bttsYesProb -= 0.08;
  else if (homeCSRate != null && homeCSRate > 0.35) bttsYesProb -= 0.04;
  if (awayCSRate != null && awayCSRate > 0.45) bttsYesProb -= 0.08;
  else if (awayCSRate != null && awayCSRate > 0.35) bttsYesProb -= 0.04;

  // Failed to score rate
  if (ctx.homeSeasonStats?.failedToScoreHome != null) {
    const failRate = ctx.homeSeasonStats.failedToScoreHome / homeHomePlayed;
    if (failRate > 0.35) bttsYesProb -= 0.06;
  }
  if (ctx.awaySeasonStats?.failedToScoreAway != null) {
    const failRate = ctx.awaySeasonStats.failedToScoreAway / awayAwayPlayed;
    if (failRate > 0.35) bttsYesProb -= 0.06;
  }

  return { bttsYesProb: clamp(bttsYesProb, 0.15, 0.82) };
}

/**
 * Corners over probability.
 * Based on combined recent average corners and possession tendency.
 */
function calcCorners(ctx: AlgoContext): { cornersOverProb: number } {
  const homeAvg = ctx.homeRecentStats?.avgCorners ?? 5.0;
  const awayAvg = ctx.awayRecentStats?.avgCorners ?? 5.0;
  const combined = homeAvg + awayAvg;

  // Map to probability (typical line is ~9.5 corners)
  let prob: number;
  if (combined > 12.5) prob = 0.68;
  else if (combined > 11.5) prob = 0.62;
  else if (combined > 10.5) prob = 0.57;
  else if (combined > 9.5) prob = 0.52;
  else if (combined > 8.5) prob = 0.47;
  else if (combined > 7.5) prob = 0.42;
  else prob = 0.36;

  // High possession teams generate more corners
  const homePoss = ctx.homeRecentStats?.avgPossession ?? 50;
  const awayPoss = ctx.awayRecentStats?.avgPossession ?? 50;
  if (homePoss > 57 || awayPoss > 57) prob += 0.04;

  return { cornersOverProb: clamp(prob, 0.25, 0.78) };
}

// ─── Reasoning templates ──────────────────────────────────────────────────────

function truncate(text: string, maxWords = 35): string {
  const words = text.split(" ");
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ").replace(/[,.]?$/, "") + ".";
}

function rankLabel(rank: number | null | undefined): string {
  return rank != null ? `#${rank}` : "unranked";
}

function matchResultReasoning(
  ctx: AlgoContext,
  side: "home" | "draw" | "away",
  prob: number,
): string {
  const rankDiff = ctx.awayRank != null && ctx.homeRank != null ? ctx.awayRank - ctx.homeRank : null;
  const gdDiff = ctx.homeGD != null && ctx.awayGD != null ? ctx.homeGD - ctx.awayGD : null;
  const ptsDiff = ctx.homePoints != null && ctx.awayPoints != null ? ctx.homePoints - ctx.awayPoints : null;
  const pct = Math.round(prob * 100);
  const hLabel = `${ctx.homeTeam} ${rankLabel(ctx.homeRank)}`;
  const aLabel = `${ctx.awayTeam} ${rankLabel(ctx.awayRank)}`;

  if (side === "home") {
    if (rankDiff != null && rankDiff >= 8 && gdDiff != null && gdDiff >= 5) {
      return truncate(`${hLabel} vs ${aLabel} — ${rankDiff}-place ranking gap and GD advantage of +${gdDiff} strongly favors the home side. Home win backed at ${pct}%.`);
    }
    if (ptsDiff != null && ptsDiff >= 10) {
      return truncate(`${hLabel} holds a ${ptsDiff}-point table lead over ${aLabel}. Superior league position and home advantage combine for a ${pct}% win probability.`);
    }
    if (rankDiff != null && rankDiff >= 4) {
      return truncate(`${hLabel} ranked ${rankDiff} places above ${aLabel} — table quality and home advantage back a ${pct}% win probability.`);
    }
    return truncate(`${hLabel} holds a marginal edge over ${aLabel} at home — algorithm rates home win at ${pct}%.`);
  }

  if (side === "away") {
    const absDiff = rankDiff != null ? Math.abs(rankDiff) : null;
    const absPts = ptsDiff != null ? Math.abs(ptsDiff) : null;
    if (absDiff != null && absDiff >= 8 && gdDiff != null) {
      return truncate(`${aLabel} ranked ${absDiff} places above ${hLabel} — significant quality gap backs an away win at ${pct}% despite travel.`);
    }
    if (absPts != null && absPts >= 10) {
      return truncate(`${aLabel} outranks ${hLabel} by ${absPts} points — table superiority overrides home advantage, away win at ${pct}%.`);
    }
    if (absDiff != null && absDiff >= 4) {
      return truncate(`${aLabel} ranked ${absDiff} places above ${hLabel} — visitor quality favoured at ${pct}% despite playing away.`);
    }
    return truncate(`${aLabel} edge in form and table position over ${hLabel} — away win probability ${pct}%.`);
  }

  // draw
  if (rankDiff != null && Math.abs(rankDiff) <= 3) {
    return truncate(`${hLabel} vs ${aLabel} — sides separated by just ${Math.abs(rankDiff)} places. Minimal gap in quality elevates draw probability to ${pct}%.`);
  }
  return truncate(`${hLabel} vs ${aLabel} — closely matched on form and table position. Draw rated at ${pct}% probability.`);
}

function overUnderReasoning(
  ctx: AlgoContext,
  line: string,
  isOver: boolean,
  lambda: number,
  prob: number,
): string {
  const pct = Math.round(prob * 100);
  const homeFor = ctx.homeSeasonStats?.goalsForAvgHome ?? ctx.homeSeasonStats?.goalsForAvg;
  const awayFor = ctx.awaySeasonStats?.goalsForAvgAway ?? ctx.awaySeasonStats?.goalsForAvg;
  if (isOver) {
    if (homeFor != null && awayFor != null) {
      return truncate(`${ctx.homeTeam} averages ${homeFor.toFixed(1)} goals at home, ${ctx.awayTeam} ${awayFor.toFixed(1)} away — combined output of ${lambda.toFixed(1)} expected goals backs over ${line} at ${pct}%.`);
    }
    return truncate(`Expected goals model projects ${lambda.toFixed(1)} total goals — both attacks productive enough to clear the ${line} line at ${pct}%.`);
  }
  if (homeFor != null && awayFor != null) {
    return truncate(`${ctx.homeTeam} (${homeFor.toFixed(1)} at home) and ${ctx.awayTeam} (${awayFor.toFixed(1)} away) — combined output of ${lambda.toFixed(1)} goals favours staying under ${line} at ${pct}%.`);
  }
  return truncate(`Defensive quality on both sides keeps expected goals at ${lambda.toFixed(1)} — under ${line} goals favoured at ${pct}%.`);
}

function bttsReasoning(ctx: AlgoContext, isYes: boolean, prob: number): string {
  const pct = Math.round(prob * 100);
  const homeFor = ctx.homeSeasonStats?.goalsForAvgHome ?? ctx.homeSeasonStats?.goalsForAvg;
  const awayFor = ctx.awaySeasonStats?.goalsForAvgAway ?? ctx.awaySeasonStats?.goalsForAvg;
  const homeAgainst = ctx.homeSeasonStats?.goalsAgainstAvgHome ?? ctx.homeSeasonStats?.goalsAgainstAvg;
  const awayAgainst = ctx.awaySeasonStats?.goalsAgainstAvgAway ?? ctx.awaySeasonStats?.goalsAgainstAvg;
  if (isYes && homeFor != null && awayFor != null) {
    const defNote = homeAgainst != null && awayAgainst != null
      ? ` Both defences concede (${homeAgainst.toFixed(1)} and ${awayAgainst.toFixed(1)} per game).`
      : "";
    return truncate(`${ctx.homeTeam} scores ${homeFor.toFixed(1)} at home, ${ctx.awayTeam} ${awayFor.toFixed(1)} away — both teams likely to score at ${pct}%.${defNote}`);
  }
  if (!isYes) {
    return truncate(`At least one side has a strong defensive record — BTTS unlikely with probability at ${pct}%.`);
  }
  return truncate(`Scoring tendency from both teams backs BTTS Yes at ${pct}% probability.`);
}

function cornersReasoning(ctx: AlgoContext, isOver: boolean, prob: number): string {
  const homeAvg = ctx.homeRecentStats?.avgCorners ?? 5;
  const awayAvg = ctx.awayRecentStats?.avgCorners ?? 5;
  const combined = homeAvg + awayAvg;
  const pct = Math.round(prob * 100);
  if (isOver) {
    return truncate(`${ctx.homeTeam} wins ${homeAvg.toFixed(1)} corners per game, ${ctx.awayTeam} ${awayAvg.toFixed(1)} — combined average of ${combined.toFixed(1)} backs the over line at ${pct}%.`);
  }
  return truncate(`Combined corner average of ${combined.toFixed(1)} per game — low set piece volume keeps the under line favoured at ${pct}%.`);
}

function doubleChanceReasoning(
  ctx: AlgoContext,
  side: "1X" | "X2" | "12",
  combinedProb: number,
): string {
  const rankDiff = ctx.awayRank != null && ctx.homeRank != null ? ctx.awayRank - ctx.homeRank : null;
  const pct = Math.round(combinedProb * 100);
  const hLabel = `${ctx.homeTeam} ${rankLabel(ctx.homeRank)}`;
  const aLabel = `${ctx.awayTeam} ${rankLabel(ctx.awayRank)}`;

  if (side === "12") {
    if (rankDiff != null && Math.abs(rankDiff) >= 6) {
      const stronger = rankDiff > 0 ? ctx.homeTeam : ctx.awayTeam;
      return truncate(`${hLabel} vs ${aLabel} — ${Math.abs(rankDiff)}-place ranking gap and skill differential heavily favors a decisive result. Excludes draw outcome. Combined win probability ${pct}%.`);
    }
    return truncate(`${hLabel} vs ${aLabel} — both teams more likely to win than draw. Double chance covers either winner at ${pct}% combined probability.`);
  }
  if (side === "1X") {
    return truncate(`${hLabel} backed by home advantage — ${ctx.homeTeam} or draw covers two outcomes at ${pct}% combined probability. Reduces away win risk.`);
  }
  // X2
  return truncate(`${aLabel} likely to at least avoid defeat — draw or ${ctx.awayTeam} win covers two outcomes at ${pct}% combined probability.`);
}

// ─── Main tip generator ───────────────────────────────────────────────────────

interface Candidate {
  bet_type: string;
  bet_side: string | null;
  recommendation: string;
  prob: number;
  odds: number | null;
  edge: number;
  reasoning: string;
}

function withEdge(candidates: Omit<Candidate, "edge">[]): Candidate[] {
  return candidates
    .filter(c => c.odds != null && c.odds > 1)
    .map(c => ({ ...c, edge: c.prob * (c.odds ?? 1) - 1 }))
    .sort((a, b) => b.edge - a.edge);
}

// ─── Calibration helper ───────────────────────────────────────────────────────

function applyCalibration(
  rawProb: number,
  factors: CalibrationFactors | null,
  betType: string,
  betSide: string,
): number {
  if (!factors) return rawProb;
  const factor = factors.get(`${betType}/${betSide}`) ?? 1.0;
  return clamp(rawProb * factor, 0.05, 0.95);
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateAlgorithmicTips(
  ctx: AlgoContext,
  calibration: CalibrationFactors | null = null,
): { tips: AlgoTip[] } {
  // Raw probabilities
  const raw = calcMatchResult(ctx);
  const rawOU = calcOverUnder(ctx);
  const rawBtts = calcBtts(ctx);
  const rawCorners = calcCorners(ctx);

  // Apply calibration — shrinks over-confident probabilities toward actual historical hit rates
  const homeProb     = applyCalibration(raw.homeProb,            calibration, "match_result", "home");
  const drawProb     = applyCalibration(raw.drawProb,            calibration, "match_result", "draw");
  const awayProb     = applyCalibration(raw.awayProb,            calibration, "match_result", "away");
  const over25prob   = applyCalibration(rawOU.over25prob,        calibration, "over_under",   "over25");
  const over15prob   = applyCalibration(rawOU.over15prob,        calibration, "over_under",   "over15");
  const over35prob   = applyCalibration(rawOU.over35prob,        calibration, "over_under",   "over35");
  const under25prob  = applyCalibration(1 - rawOU.over25prob,    calibration, "over_under",   "under25");
  const bttsYesProb  = applyCalibration(rawBtts.bttsYesProb,    calibration, "btts",         "yes");
  const bttsNoProb   = applyCalibration(1 - rawBtts.bttsYesProb, calibration, "btts",        "no");
  const cornersOverProb = applyCalibration(rawCorners.cornersOverProb, calibration, "corners", "over");

  // Compute lambda for reasoning text
  const homeFor = ctx.homeSeasonStats?.goalsForAvgHome ?? ctx.homeSeasonStats?.goalsForAvg ?? 1.30;
  const awayFor = ctx.awaySeasonStats?.goalsForAvgAway ?? ctx.awaySeasonStats?.goalsForAvg ?? 1.00;
  const homeAgainst = ctx.homeSeasonStats?.goalsAgainstAvgHome ?? ctx.homeSeasonStats?.goalsAgainstAvg ?? 1.10;
  const awayAgainst = ctx.awaySeasonStats?.goalsAgainstAvgAway ?? ctx.awaySeasonStats?.goalsAgainstAvg ?? 1.30;
  const lambda = Math.max(0.5, (homeFor + awayAgainst + awayFor + homeAgainst) / 2);

  // ── Match result: best edge side ──────────────────────────────────────────
  const matchCandidates = withEdge([
    {
      bet_type: "match_result", bet_side: "home",
      recommendation: `${ctx.homeTeam} Win`,
      prob: homeProb, odds: ctx.odds.home,
      reasoning: matchResultReasoning(ctx, "home", homeProb),
    },
    {
      bet_type: "match_result", bet_side: "draw",
      recommendation: "Draw",
      prob: drawProb, odds: ctx.odds.draw,
      reasoning: matchResultReasoning(ctx, "draw", drawProb),
    },
    {
      bet_type: "match_result", bet_side: "away",
      recommendation: `${ctx.awayTeam} Win`,
      prob: awayProb, odds: ctx.odds.away,
      reasoning: matchResultReasoning(ctx, "away", awayProb),
    },
  ]);

  // ── Over/Under: best edge line (includes Under 2.5) ───────────────────────
  const ouCandidates = withEdge([
    {
      bet_type: "over_under", bet_side: "over25",
      recommendation: "Over 2.5 Goals",
      prob: over25prob, odds: ctx.odds.over25,
      reasoning: overUnderReasoning(ctx, "2.5", true, lambda, over25prob),
    },
    {
      bet_type: "over_under", bet_side: "over15",
      recommendation: "Over 1.5 Goals",
      prob: over15prob, odds: ctx.odds.over15,
      reasoning: overUnderReasoning(ctx, "1.5", true, lambda, over15prob),
    },
    {
      bet_type: "over_under", bet_side: "over35",
      recommendation: "Over 3.5 Goals",
      prob: over35prob, odds: ctx.odds.over35,
      reasoning: overUnderReasoning(ctx, "3.5", true, lambda, over35prob),
    },
    // Under 2.5 — when lambda is low (defensive match) this often has best edge
    {
      bet_type: "over_under", bet_side: "under25",
      recommendation: "Under 2.5 Goals",
      prob: under25prob,
      odds: ctx.odds.over25 != null && ctx.odds.over25 > 1
        ? (() => {
            const overImplied = 1 / ctx.odds.over25;
            const underImplied = 1 - overImplied;
            return underImplied > 0.05 ? Math.round((1 / underImplied) * 100) / 100 : null;
          })()
        : null,
      reasoning: overUnderReasoning(ctx, "2.5", false, lambda, under25prob),
    },
  ]);

  // ── BTTS (Yes and No) ─────────────────────────────────────────────────────
  const bttsCandidates = withEdge([
    {
      bet_type: "btts", bet_side: "yes",
      recommendation: "BTTS Yes",
      prob: bttsYesProb, odds: ctx.odds.btts,
      reasoning: bttsReasoning(ctx, true, bttsYesProb),
    },
    // BTTS No — only if we have an implied "No" odds (approximate as 1/(1-bttsImplied))
    ...(ctx.odds.btts != null && ctx.odds.btts > 1 ? [{
      bet_type: "btts", bet_side: "no",
      recommendation: "BTTS No",
      prob: bttsNoProb,
      odds: (() => {
        const bttsImplied = 1 / ctx.odds.btts!;
        const noImplied = 1 - bttsImplied;
        return noImplied > 0.05 ? Math.round((1 / noImplied) * 100) / 100 : null;
      })(),
      reasoning: bttsReasoning(ctx, false, bttsNoProb),
    }] : []),
  ]);

  // ── Corners ───────────────────────────────────────────────────────────────
  const cornerCandidates = withEdge([
    {
      bet_type: "corners", bet_side: "over",
      recommendation: "Corners Over",
      prob: cornersOverProb, odds: ctx.odds.cornersOver,
      reasoning: cornersReasoning(ctx, true, cornersOverProb),
    },
  ]);

  // ── Asian Handicap (only if strong home favorite) ─────────────────────────
  const rankDiff = ctx.awayRank != null && ctx.homeRank != null ? ctx.awayRank - ctx.homeRank : null;
  const gdDiff = ctx.homeGD != null && ctx.awayGD != null ? ctx.homeGD - ctx.awayGD : null;
  const handicapCandidates: Candidate[] = [];
  if (rankDiff != null && gdDiff != null && rankDiff >= 5 && gdDiff >= 5 && ctx.odds.asianHandicapHome != null) {
    const handicapProb = clamp(homeProb * 0.92, 0.30, 0.80); // slight haircut for handicap line uncertainty
    handicapCandidates.push(...withEdge([{
      bet_type: "asian_handicap", bet_side: "home",
      recommendation: `${ctx.homeTeam} Asian Handicap`,
      prob: handicapProb, odds: ctx.odds.asianHandicapHome,
      reasoning: truncate(`${ctx.homeTeam} ${rankLabel(ctx.homeRank)} ranked ${rankDiff} places above ${ctx.awayTeam} ${rankLabel(ctx.awayRank)} with GD advantage of +${gdDiff ?? "?"} — table quality justifies handicap at ${Math.round(handicapProb * 100)}% probability.`),
    }]));
  }

  // ── Double Chance ─────────────────────────────────────────────────────────
  const dc1XProb = clamp(homeProb + drawProb, 0.1, 0.95);
  const dcX2Prob = clamp(drawProb + awayProb, 0.1, 0.95);
  const dc12Prob = clamp(homeProb + awayProb, 0.1, 0.95);
  const dcCandidates = withEdge([
    ...(ctx.odds.doubleChance1X != null ? [{
      bet_type: "double_chance", bet_side: "1X",
      recommendation: `${ctx.homeTeam} or Draw (1X)`,
      prob: dc1XProb, odds: ctx.odds.doubleChance1X,
      reasoning: doubleChanceReasoning(ctx, "1X", dc1XProb),
    }] : []),
    ...(ctx.odds.doubleChanceX2 != null ? [{
      bet_type: "double_chance", bet_side: "X2",
      recommendation: `Draw or ${ctx.awayTeam} (X2)`,
      prob: dcX2Prob, odds: ctx.odds.doubleChanceX2,
      reasoning: doubleChanceReasoning(ctx, "X2", dcX2Prob),
    }] : []),
    ...(ctx.odds.doubleChance12 != null ? [{
      bet_type: "double_chance", bet_side: "12",
      recommendation: `${ctx.homeTeam} or ${ctx.awayTeam} (12)`,
      prob: dc12Prob, odds: ctx.odds.doubleChance12,
      reasoning: doubleChanceReasoning(ctx, "12", dc12Prob),
    }] : []),
  ]);

  // ── Win to Nil ────────────────────────────────────────────────────────────
  const winToNilCandidates = withEdge([
    ...(ctx.odds.winToNilHome != null && rankDiff != null && rankDiff >= 7 ? [{
      bet_type: "win_to_nil", bet_side: "home",
      recommendation: `${ctx.homeTeam} Win to Nil`,
      prob: clamp(homeProb * 0.45, 0.10, 0.50), // win AND clean sheet
      odds: ctx.odds.winToNilHome,
      reasoning: truncate(`${ctx.homeTeam} ${rankLabel(ctx.homeRank)} ranked ${rankDiff} places above ${ctx.awayTeam} ${rankLabel(ctx.awayRank)} — dominant home side with defensive record backs win to nil at ${Math.round(homeProb * 0.45 * 100)}%.`),
    }] : []),
  ]);

  // ── Select final tips — only where we have genuine edge ──────────────────
  // MIN_EDGE: minimum positive expected value required to recommend a tip.
  // A tip with edge = 0.04 means: for every €1 staked, algo expects +4 cents return.
  // Tips below this threshold are noise — not worth playing.
  const MIN_EDGE = 0.04;

  const finalTips: Candidate[] = [];

  // Required markets: only include if edge clears the bar
  const bestMatch = matchCandidates[0];
  const bestOU    = ouCandidates[0];
  const bestBtts  = bttsCandidates[0];

  if (bestMatch && bestMatch.edge >= MIN_EDGE) finalTips.push(bestMatch);
  if (bestOU    && bestOU.edge    >= MIN_EDGE) finalTips.push(bestOU);
  if (bestBtts  && bestBtts.edge  >= MIN_EDGE) finalTips.push(bestBtts);

  // Optional markets: same edge gate, then fill up to 5
  const usedTypes = new Set(finalTips.map(t => t.bet_type));
  const optional = [
    ...cornerCandidates,
    ...handicapCandidates,
    ...dcCandidates,
    ...winToNilCandidates,
  ]
    .filter(c => !usedTypes.has(c.bet_type) && c.edge >= MIN_EDGE)
    .sort((a, b) => b.edge - a.edge);

  for (const opt of optional) {
    if (finalTips.length >= 5) break;
    if (!finalTips.some(t => t.bet_type === opt.bet_type)) {
      finalTips.push(opt);
    }
  }

  return {
    tips: finalTips.map(tip => ({
      recommendation: tip.recommendation,
      bet_type: tip.bet_type,
      bet_side: tip.bet_side,
      trust_score: trustFromProb(tip.prob),
      estimated_probability: Math.round(tip.prob * 100) / 100,
      reasoning: tip.reasoning,
    })),
  };
}
