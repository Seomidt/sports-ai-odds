import { db } from "@workspace/db";
import {
  fixtures,
  fixtureStats,
  fixtureEvents,
  fixtureLineups,
  teamFeatures,
  predictions,
  playerStats,
  liveOddsSnapshots,
  h2hFixtures,
  teamSeasonStats,
} from "@workspace/db/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { triggerPostMatchReview } from "../ai/analysisLayer.js";

async function upsertFeature(fixtureId: number, teamId: number, phase: string, featureKey: string, featureValue: number | null) {
  await db
    .insert(teamFeatures)
    .values({ fixtureId, teamId, phase, featureKey, featureValue, computedAt: new Date() })
    .onConflictDoUpdate({
      target: [teamFeatures.fixtureId, teamFeatures.teamId, teamFeatures.phase, teamFeatures.featureKey],
      set: { featureValue, computedAt: new Date() },
    });
}

async function getRecentFixturesForTeam(teamId: number, limit: number): Promise<typeof fixtures.$inferSelect[]> {
  return db.query.fixtures.findMany({
    where: (f, { or, eq, and, not, inArray }) =>
      and(
        or(eq(f.homeTeamId, teamId), eq(f.awayTeamId, teamId)),
        not(inArray(f.statusShort, ["NS", "TBD", "PST", "CANC"]))
      ),
    orderBy: (f, { desc }) => [desc(f.kickoff)],
    limit,
  });
}

function formPoints(fixture: typeof fixtures.$inferSelect, teamId: number): number {
  const isHome = fixture.homeTeamId === teamId;
  const teamGoals = isHome ? (fixture.homeGoals ?? 0) : (fixture.awayGoals ?? 0);
  const oppGoals = isHome ? (fixture.awayGoals ?? 0) : (fixture.homeGoals ?? 0);
  if (teamGoals > oppGoals) return 3;
  if (teamGoals === oppGoals) return 1;
  return 0;
}

export async function runPreMatchFeatures(fixtureId: number, homeTeamId: number, awayTeamId: number) {
  for (const [teamId, isHome] of [[homeTeamId, true], [awayTeamId, false]] as const) {
    const recent = await getRecentFixturesForTeam(teamId, 10);
    if (recent.length === 0) continue;

    const last5 = recent.slice(0, 5);
    const last10 = recent.slice(0, 10);

    // form_last_5: W=3,D=1,L=0 normalized to 0-1
    const formPoints5 = last5.reduce((acc, f) => acc + formPoints(f, teamId), 0);
    const formNorm = formPoints5 / (5 * 3);
    await upsertFeature(fixtureId, teamId, "pre", "team_form_last_5", formNorm);

    // avg_goals_for_last_10
    const goalsFor10 = last10.reduce((acc, f) => {
      const isH = f.homeTeamId === teamId;
      return acc + (isH ? (f.homeGoals ?? 0) : (f.awayGoals ?? 0));
    }, 0);
    await upsertFeature(fixtureId, teamId, "pre", "avg_goals_for_last_10", goalsFor10 / last10.length);

    // avg_goals_against_last_10
    const goalsAgainst10 = last10.reduce((acc, f) => {
      const isH = f.homeTeamId === teamId;
      return acc + (isH ? (f.awayGoals ?? 0) : (f.homeGoals ?? 0));
    }, 0);
    await upsertFeature(fixtureId, teamId, "pre", "avg_goals_against_last_10", goalsAgainst10 / last10.length);

    // clean_sheet_rate (last 10)
    const cleanSheets = last10.filter((f) => {
      const isH = f.homeTeamId === teamId;
      return isH ? (f.awayGoals ?? 0) === 0 : (f.homeGoals ?? 0) === 0;
    }).length;
    await upsertFeature(fixtureId, teamId, "pre", "clean_sheet_rate", cleanSheets / last10.length);

    // home/away strength
    if (isHome) {
      const homeFixtures = last10.filter((f) => f.homeTeamId === teamId);
      if (homeFixtures.length > 0) {
        const homeForm = homeFixtures.reduce((acc, f) => acc + formPoints(f, teamId), 0) / (homeFixtures.length * 3);
        const homeGF = homeFixtures.reduce((acc, f) => acc + (f.homeGoals ?? 0), 0) / homeFixtures.length;
        const homeGA = homeFixtures.reduce((acc, f) => acc + (f.awayGoals ?? 0), 0) / homeFixtures.length;
        const strengthIdx = homeGA > 0 ? homeForm + homeGF / homeGA : homeForm + homeGF;
        await upsertFeature(fixtureId, teamId, "pre", "home_strength_index", Math.min(strengthIdx, 5));
      }
    } else {
      const awayFixtures = last10.filter((f) => f.awayTeamId === teamId);
      if (awayFixtures.length > 0) {
        const awayForm = awayFixtures.reduce((acc, f) => acc + formPoints(f, teamId), 0) / (awayFixtures.length * 3);
        const awayGA = awayFixtures.reduce((acc, f) => acc + (f.homeGoals ?? 0), 0) / awayFixtures.length;
        const weaknessIdx = 1 - awayForm + awayGA * 0.2;
        await upsertFeature(fixtureId, teamId, "pre", "away_weakness_index", Math.max(0, Math.min(weaknessIdx, 2)));
      }
    }

    // lineup_stability_score (comparing last 3 lineups)
    const recentLineups = await db.query.fixtureLineups.findMany({
      where: (l, { eq: eqFn }) => eqFn(l.teamId, teamId),
      orderBy: (l, { desc: descFn }) => [descFn(l.updatedAt)],
      limit: 4,
    });

    if (recentLineups.length >= 2) {
      const latest = (recentLineups[0]?.startingXI as Array<{ playerId: number }> | null) ?? [];
      const prev = (recentLineups[1]?.startingXI as Array<{ playerId: number }> | null) ?? [];
      const latestIds = new Set(latest.map((p) => p.playerId));
      const prevIds = new Set(prev.map((p) => p.playerId));
      const overlap = [...latestIds].filter((id) => prevIds.has(id)).length;
      const stability = overlap / Math.max(latestIds.size, prevIds.size, 1);
      await upsertFeature(fixtureId, teamId, "pre", "lineup_stability_score", stability);
    }
  }

  // Pro: API prediction win probability as features
  const pred = await db.query.predictions.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.fixtureId, fixtureId),
  });

  if (pred) {
    const homeProb = (pred.homeWinPercent ?? 0) / 100;
    const drawProb = (pred.drawPercent ?? 0) / 100;
    const awayProb = (pred.awayWinPercent ?? 0) / 100;

    await upsertFeature(fixtureId, homeTeamId, "pre", "api_win_prob", homeProb);
    await upsertFeature(fixtureId, awayTeamId, "pre", "api_win_prob", awayProb);
    await upsertFeature(fixtureId, homeTeamId, "pre", "api_draw_prob", drawProb);
    await upsertFeature(fixtureId, homeTeamId, "pre", "api_goals_predicted_for", pred.goalsHome);
    await upsertFeature(fixtureId, awayTeamId, "pre", "api_goals_predicted_for", pred.goalsAway);
  }

  // Pro: Average player rating from recent fixture player stats
  for (const [teamId] of [[homeTeamId], [awayTeamId]] as const) {
    const recentPlayerStats = await db.query.playerStats.findMany({
      where: (ps, { eq: eqFn }) => eqFn(ps.teamId, teamId),
      orderBy: (ps, { desc: d }) => [d(ps.fixtureId)],
      limit: 22,
    });

    if (recentPlayerStats.length > 0) {
      const rated = recentPlayerStats.filter((p) => p.rating !== null);
      if (rated.length > 0) {
        const avgRating = rated.reduce((acc, p) => acc + (p.rating ?? 0), 0) / rated.length;
        await upsertFeature(fixtureId, teamId, "pre", "avg_player_rating", avgRating);
      }
    }
  }

  // ── H2H features ──────────────────────────────────────────────────────────
  const h2hRows = await db.query.h2hFixtures.findMany({
    where: (h, { or: orFn, and: andFn, eq: eqFn }) =>
      orFn(
        andFn(eqFn(h.forTeam1Id, homeTeamId), eqFn(h.forTeam2Id, awayTeamId)),
        andFn(eqFn(h.forTeam1Id, awayTeamId), eqFn(h.forTeam2Id, homeTeamId))
      ),
    orderBy: (h, { desc: d }) => [d(h.kickoff)],
    limit: 10,
  });

  if (h2hRows.length >= 3) {
    const last10 = h2hRows.slice(0, 10);
    let homeWins = 0, draws = 0, awayWins = 0, totalGoals = 0;

    for (const match of last10) {
      const hg = match.homeGoals ?? 0;
      const ag = match.awayGoals ?? 0;
      totalGoals += hg + ag;
      // "home" perspective: the actual home team in the H2H match
      const isHomeMatchingOurHome = match.homeTeamId === homeTeamId;
      if (hg > ag) { isHomeMatchingOurHome ? homeWins++ : awayWins++; }
      else if (hg < ag) { isHomeMatchingOurHome ? awayWins++ : homeWins++; }
      else draws++;
    }

    const n = last10.length;
    await upsertFeature(fixtureId, homeTeamId, "pre", "h2h_win_rate", homeWins / n);
    await upsertFeature(fixtureId, awayTeamId, "pre", "h2h_win_rate", awayWins / n);
    await upsertFeature(fixtureId, homeTeamId, "pre", "h2h_draw_rate", draws / n);
    await upsertFeature(fixtureId, homeTeamId, "pre", "h2h_avg_goals", totalGoals / n);
    await upsertFeature(fixtureId, awayTeamId, "pre", "h2h_avg_goals", totalGoals / n);
    console.log(`[feature-engine] H2H features from ${n} meetings`);
  }

  // ── Team season stats features ────────────────────────────────────────────
  for (const [teamId, isHome] of [[homeTeamId, true], [awayTeamId, false]] as const) {
    // Find best matching season stats (try each tracked league)
    const seasonStats = await db.query.teamSeasonStats.findFirst({
      where: (ts, { eq: eqFn }) => eqFn(ts.teamId, teamId),
      orderBy: (ts, { desc: d }) => [d(ts.updatedAt)],
    });

    if (!seasonStats) continue;

    const played = seasonStats.playedTotal ?? 0;
    if (played === 0) continue;

    // Win rate (season)
    const seasonWinRate = (seasonStats.winsTotal ?? 0) / played;
    await upsertFeature(fixtureId, teamId, "pre", "season_win_rate", seasonWinRate);

    // Home/away specific win rate
    if (isHome) {
      const homePlayed = seasonStats.playedHome ?? 0;
      if (homePlayed > 0) {
        const homeWinRate = (seasonStats.winsHome ?? 0) / homePlayed;
        await upsertFeature(fixtureId, teamId, "pre", "home_win_rate_season", homeWinRate);
      }
    } else {
      const awayPlayed = seasonStats.playedAway ?? 0;
      if (awayPlayed > 0) {
        const awayWinRate = (seasonStats.winsAway ?? 0) / awayPlayed;
        await upsertFeature(fixtureId, teamId, "pre", "away_win_rate_season", awayWinRate);
      }
    }

    // Season average goals scored/conceded
    if (seasonStats.goalsForAvgTotal != null) {
      await upsertFeature(fixtureId, teamId, "pre", "season_avg_goals_scored", seasonStats.goalsForAvgTotal);
    }
    if (seasonStats.goalsAgainstAvgTotal != null) {
      await upsertFeature(fixtureId, teamId, "pre", "season_avg_goals_conceded", seasonStats.goalsAgainstAvgTotal);
    }

    // Season clean sheet rate
    if (seasonStats.cleanSheetsTotal != null) {
      await upsertFeature(fixtureId, teamId, "pre", "season_clean_sheet_rate", seasonStats.cleanSheetsTotal / played);
    }

    // Season failed to score rate (scoring blank rate)
    if (seasonStats.failedToScoreTotal != null) {
      await upsertFeature(fixtureId, teamId, "pre", "season_blank_rate", seasonStats.failedToScoreTotal / played);
    }

    // Recent form from season stats form string (e.g. "WWLDW")
    if (seasonStats.form && seasonStats.form.length >= 3) {
      const recent5 = seasonStats.form.slice(-5);
      const formPts = [...recent5].reduce((acc, c) => acc + (c === "W" ? 3 : c === "D" ? 1 : 0), 0);
      await upsertFeature(fixtureId, teamId, "pre", "season_form_last5", formPts / 15);
    }
  }

  console.log(`[feature-engine] Pre-match features computed for fixture ${fixtureId}`);
}

export async function runLiveFeatures(fixtureId: number, homeTeamId: number, awayTeamId: number) {
  for (const teamId of [homeTeamId, awayTeamId]) {
    const stats = await db.query.fixtureStats.findFirst({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.teamId, teamId)),
    });

    if (!stats) continue;

    const events = await db.query.fixtureEvents.findMany({
      where: (e, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(e.fixtureId, fixtureId), eqFn(e.teamId, teamId)),
    });

    const fixture = await db.query.fixtures.findFirst({
      where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
    });

    const elapsed = fixture?.statusElapsed ?? 0;

    // momentum_delta: goals=10, shots on target=2, corners=1 (last 15 min)
    const last15Events = events.filter((e) => (e.minute ?? 0) >= elapsed - 15);
    const momentumDelta =
      last15Events.filter((e) => e.type === "Goal").length * 10 +
      (stats.shotsOnGoal ?? 0) * 2 +
      (stats.cornerKicks ?? 0) * 1;
    await upsertFeature(fixtureId, teamId, "live", "momentum_delta", momentumDelta);

    // pressure_shift_score: (shots + corners) per 10-min window
    const pressureShift =
      ((stats.totalShots ?? 0) + (stats.cornerKicks ?? 0)) /
      Math.max(1, Math.floor(elapsed / 10));
    await upsertFeature(fixtureId, teamId, "live", "pressure_shift_score", pressureShift);

    // red_card_count
    const redCards = events.filter(
      (e) => e.type === "Card" && (e.detail === "Red Card" || e.detail === "Second Yellow card")
    ).length;
    await upsertFeature(fixtureId, teamId, "live", "red_card_count", redCards);
  }

  // upset_risk_score: underdog's momentum vs favourite
  const homeMomentum = await db.query.teamFeatures.findFirst({
    where: (f, { and: andFn, eq: eqFn }) =>
      andFn(
        eqFn(f.fixtureId, fixtureId),
        eqFn(f.teamId, homeTeamId),
        eqFn(f.phase, "live"),
        eqFn(f.featureKey, "momentum_delta")
      ),
  });
  const awayMomentum = await db.query.teamFeatures.findFirst({
    where: (f, { and: andFn, eq: eqFn }) =>
      andFn(
        eqFn(f.fixtureId, fixtureId),
        eqFn(f.teamId, awayTeamId),
        eqFn(f.phase, "live"),
        eqFn(f.featureKey, "momentum_delta")
      ),
  });

  const hm = homeMomentum?.featureValue ?? 0;
  const am = awayMomentum?.featureValue ?? 0;
  const total = hm + am;
  let upsetRisk = total > 0 ? Math.min(am / total, 1) * 0.8 + 0.1 : 0.5;

  // Pro: blend with live odds movement if available
  const recentLiveOdds = await db.query.liveOddsSnapshots.findMany({
    where: (lo, { eq: eqFn }) => eqFn(lo.fixtureId, fixtureId),
    orderBy: (lo, { desc: d }) => [d(lo.snappedAt)],
    limit: 2,
  });

  if (recentLiveOdds.length === 2) {
    const latest = recentLiveOdds[0]!;
    const prev = recentLiveOdds[1]!;
    // If away odds shortening (decreasing) it means market likes away more → increase upset_risk
    const awayOddsDelta = (latest.awayWin ?? 0) - (prev.awayWin ?? 0);
    const oddsSignal = awayOddsDelta < 0 ? 0.15 : awayOddsDelta > 0 ? -0.1 : 0;
    upsetRisk = Math.max(0.05, Math.min(0.95, upsetRisk + oddsSignal));

    // Store the odds-based live probability as a feature
    if (latest.homeWin && latest.awayWin) {
      const homeImplied = 1 / latest.homeWin;
      const awayImplied = 1 / latest.awayWin;
      const drawImplied = latest.draw ? 1 / latest.draw : 0.25;
      const sumImplied = homeImplied + drawImplied + awayImplied;
      await upsertFeature(fixtureId, homeTeamId, "live", "live_win_prob_market", homeImplied / sumImplied);
      await upsertFeature(fixtureId, awayTeamId, "live", "live_win_prob_market", awayImplied / sumImplied);
    }
  }

  await upsertFeature(fixtureId, homeTeamId, "live", "upset_risk_score", upsetRisk);
  await upsertFeature(fixtureId, awayTeamId, "live", "upset_risk_score", 1 - upsetRisk);

  // Pro: live player rating as feature (average of starters in this fixture)
  for (const teamId of [homeTeamId, awayTeamId]) {
    const livePlayerStats = await db.query.playerStats.findMany({
      where: (ps, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(ps.fixtureId, fixtureId), eqFn(ps.teamId, teamId)),
    });

    if (livePlayerStats.length > 0) {
      const rated = livePlayerStats.filter((p) => p.rating !== null && (p.minutesPlayed ?? 0) > 0);
      if (rated.length > 0) {
        const avgRating = rated.reduce((acc, p) => acc + (p.rating ?? 0), 0) / rated.length;
        await upsertFeature(fixtureId, teamId, "live", "live_avg_player_rating", avgRating);
      }
    }
  }
}

export async function runPostMatchFeatures(fixtureId: number) {
  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });
  if (!fixture) return;

  for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
    const stats = await db.query.fixtureStats.findFirst({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.teamId, teamId)),
    });
    if (!stats) continue;

    const xg = stats.expectedGoals ?? 0;
    const isHome = fixture.homeTeamId === teamId;
    const actualGoals = isHome ? (fixture.homeGoals ?? 0) : (fixture.awayGoals ?? 0);
    const xgAccuracy = xg > 0 ? actualGoals / xg : null;
    await upsertFeature(fixtureId, teamId, "post", "xg_accuracy", xgAccuracy);

    const events = await db.query.fixtureEvents.findMany({
      where: (e, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(e.fixtureId, fixtureId), eqFn(e.teamId, teamId)),
    });

    const goals = events.filter((e) => e.type === "Goal");
    const setpieceGoals = goals.filter((e) =>
      ["Free Kick", "Penalty"].includes(e.detail ?? "")
    ).length;
    const setpieceRate = goals.length > 0 ? setpieceGoals / goals.length : 0;
    await upsertFeature(fixtureId, teamId, "post", "set_piece_goal_rate", setpieceRate);
  }

  console.log(`[feature-engine] Post-match features computed for fixture ${fixtureId}`);

  // Trigger AI betting tip review (non-blocking)
  triggerPostMatchReview(fixtureId).catch((err) =>
    console.error(`[feature-engine] Post-match review error for ${fixtureId}:`, err)
  );
}
