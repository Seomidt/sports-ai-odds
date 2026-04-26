/**
 * tipEngine.ts — Algorithmic betting tip generator
 *
 * Replaces Claude AI for tip generation. Uses backtested signal rules
 * derived from 23,000+ matches. AI is kept only for daily admin insights.
 *
 * Outputs the same tip format as the AI so the rest of the pipeline is unchanged.
 */

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

function matchResultReasoning(
  ctx: AlgoContext,
  side: "home" | "draw" | "away",
  prob: number,
): string {
  const rankDiff = ctx.awayRank != null && ctx.homeRank != null ? ctx.awayRank - ctx.homeRank : null;
  const gdDiff = ctx.homeGD != null && ctx.awayGD != null ? ctx.homeGD - ctx.awayGD : null;
  const ptsDiff = ctx.homePoints != null && ctx.awayPoints != null ? ctx.homePoints - ctx.awayPoints : null;
  const pct = Math.round(prob * 100);

  if (side === "home") {
    if (rankDiff != null && gdDiff != null && rankDiff >= 8 && gdDiff >= 5) {
      return truncate(`${ctx.homeTeam} ranked ${rankDiff} places higher with GD advantage of +${gdDiff} — strong home win probability at ${pct}%.`);
    }
    if (ptsDiff != null && ptsDiff >= 10) {
      return truncate(`${ctx.homeTeam} leads the table by ${ptsDiff} points — superior league position and home advantage.`);
    }
    return truncate(`${ctx.homeTeam} rank and form edge over ${ctx.awayTeam} — home win at ${pct}% probability.`);
  }

  if (side === "away") {
    const absDiff = rankDiff != null ? Math.abs(rankDiff) : null;
    if (absDiff != null && gdDiff != null && absDiff >= 8) {
      return truncate(`${ctx.awayTeam} ranked ${absDiff} places higher with better GD — away win expected at ${pct}% despite travel.`);
    }
    const absPts = ptsDiff != null ? Math.abs(ptsDiff) : null;
    if (absPts != null && absPts >= 10) {
      return truncate(`${ctx.awayTeam} significantly stronger on points — table quality backs away win at ${pct}%.`);
    }
    return truncate(`${ctx.awayTeam} table position and form favour away win over ${ctx.homeTeam}.`);
  }

  // draw
  return truncate(`Closely matched sides — rank and points gap minimal, draw elevated to ${pct}% probability.`);
}

function overUnderReasoning(
  ctx: AlgoContext,
  line: string,
  isOver: boolean,
  lambda: number,
  prob: number,
): string {
  const pct = Math.round(prob * 100);
  if (isOver) {
    return truncate(`Combined expected goals of ${lambda.toFixed(1)} per game — both attacks productive, over ${line} goals at ${pct}%.`);
  }
  return truncate(`Combined expected goals of ${lambda.toFixed(1)} — defensive quality on both sides, under ${line} goals at ${pct}%.`);
}

function bttsReasoning(ctx: AlgoContext, isYes: boolean, prob: number): string {
  const pct = Math.round(prob * 100);
  const homeFor = ctx.homeSeasonStats?.goalsForAvgHome ?? ctx.homeSeasonStats?.goalsForAvg;
  const awayFor = ctx.awaySeasonStats?.goalsForAvgAway ?? ctx.awaySeasonStats?.goalsForAvg;
  if (isYes && homeFor != null && awayFor != null) {
    return truncate(`${ctx.homeTeam} scores ${homeFor.toFixed(1)} at home, ${ctx.awayTeam} ${awayFor.toFixed(1)} away — both likely to find the net at ${pct}%.`);
  }
  if (!isYes) {
    return truncate(`High clean sheet rate on at least one side reduces BTTS probability — at least one team kept quiet.`);
  }
  return truncate(`Scoring tendency from both teams backs BTTS Yes at ${pct}% probability.`);
}

function cornersReasoning(ctx: AlgoContext, isOver: boolean, prob: number): string {
  const combined = ((ctx.homeRecentStats?.avgCorners ?? 5) + (ctx.awayRecentStats?.avgCorners ?? 5));
  const pct = Math.round(prob * 100);
  if (isOver) {
    return truncate(`Teams average ${combined.toFixed(1)} combined corners per game — set piece activity supports over line at ${pct}%.`);
  }
  return truncate(`Low corner volume from both teams — under line favoured at ${pct}%.`);
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

export function generateAlgorithmicTips(ctx: AlgoContext): { tips: AlgoTip[] } {
  const { homeProb, drawProb, awayProb } = calcMatchResult(ctx);
  const { over25prob, over15prob, over35prob } = calcOverUnder(ctx);
  const { bttsYesProb } = calcBtts(ctx);
  const { cornersOverProb } = calcCorners(ctx);

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

  // ── Over/Under: best edge line ─────────────────────────────────────────────
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
  ]);

  // ── BTTS ──────────────────────────────────────────────────────────────────
  const bttsCandidates = withEdge([
    {
      bet_type: "btts", bet_side: "yes",
      recommendation: "BTTS Yes",
      prob: bttsYesProb, odds: ctx.odds.btts,
      reasoning: bttsReasoning(ctx, true, bttsYesProb),
    },
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
      reasoning: truncate(`${ctx.homeTeam} ranked ${rankDiff} positions higher — strong table advantage justifies handicap line at ${Math.round(handicapProb * 100)}%.`),
    }]));
  }

  // ── Double Chance (safety net for uncertain matches) ─────────────────────
  const dcCandidates = withEdge([
    ...(ctx.odds.doubleChance1X != null ? [{
      bet_type: "double_chance", bet_side: "1X",
      recommendation: `${ctx.homeTeam} or Draw (1X)`,
      prob: clamp(homeProb + drawProb, 0.1, 0.95),
      odds: ctx.odds.doubleChance1X,
      reasoning: truncate(`${ctx.homeTeam} or Draw covers two outcomes — combined probability ${Math.round((homeProb + drawProb) * 100)}%.`),
    }] : []),
    ...(ctx.odds.doubleChanceX2 != null ? [{
      bet_type: "double_chance", bet_side: "X2",
      recommendation: `Draw or ${ctx.awayTeam} (X2)`,
      prob: clamp(drawProb + awayProb, 0.1, 0.95),
      odds: ctx.odds.doubleChanceX2,
      reasoning: truncate(`Draw or ${ctx.awayTeam} covers two outcomes — combined probability ${Math.round((drawProb + awayProb) * 100)}%.`),
    }] : []),
  ]);

  // ── Win to Nil ────────────────────────────────────────────────────────────
  const winToNilCandidates = withEdge([
    ...(ctx.odds.winToNilHome != null && rankDiff != null && rankDiff >= 7 ? [{
      bet_type: "win_to_nil", bet_side: "home",
      recommendation: `${ctx.homeTeam} Win to Nil`,
      prob: clamp(homeProb * 0.45, 0.10, 0.50), // win AND clean sheet
      odds: ctx.odds.winToNilHome,
      reasoning: truncate(`${ctx.homeTeam} strong at home with defensive record — win to nil viable at current odds.`),
    }] : []),
  ]);

  // ── Select final 5 tips ───────────────────────────────────────────────────
  // Required markets: match_result, over_under, btts
  // Fill remaining 2 slots with highest edge from optional markets

  const finalTips: Candidate[] = [];

  const bestMatch = matchCandidates[0];
  const bestOU = ouCandidates[0];
  const bestBtts = bttsCandidates[0];

  if (bestMatch) finalTips.push(bestMatch);
  if (bestOU) finalTips.push(bestOU);
  if (bestBtts) finalTips.push(bestBtts);

  const usedTypes = new Set(finalTips.map(t => t.bet_type));
  const optional = [
    ...cornerCandidates,
    ...handicapCandidates,
    ...dcCandidates,
    ...winToNilCandidates,
  ]
    .filter(c => !usedTypes.has(c.bet_type) && c.edge > -0.5)
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
