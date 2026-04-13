import { db } from "@workspace/db";
import { fixtureSignals, teamFeatures } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchWeatherForCity } from "../lib/weatherClient.js";

type Phase = "pre" | "live" | "post";

async function getFeatures(fixtureId: number, teamId: number, phase: string) {
  const rows = await db.query.teamFeatures.findMany({
    where: (f, { and: andFn, eq: eqFn }) =>
      andFn(
        eqFn(f.fixtureId, fixtureId),
        eqFn(f.teamId, teamId),
        eqFn(f.phase, phase)
      ),
  });
  return Object.fromEntries(rows.map((r) => [r.featureKey, r.featureValue ?? 0]));
}

async function upsertSignal(
  fixtureId: number,
  phase: string,
  signalKey: string,
  signalLabel: string,
  signalValue: number | null,
  signalBool: boolean | null
) {
  await db
    .insert(fixtureSignals)
    .values({
      fixtureId,
      phase,
      signalKey,
      signalLabel,
      signalValue,
      signalBool,
      triggeredAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [fixtureSignals.fixtureId, fixtureSignals.phase, fixtureSignals.signalKey],
      set: { signalValue, signalBool, triggeredAt: new Date() },
    });
}

export async function runSignalEngine(fixtureId: number, phase: Phase) {
  const fixture = await db.query.fixtures.findFirst({
    where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
  });
  if (!fixture) return;

  const homeId = fixture.homeTeamId;
  const awayId = fixture.awayTeamId;

  if (phase === "pre") {
    const hf = await getFeatures(fixtureId, homeId, "pre");
    const af = await getFeatures(fixtureId, awayId, "pre");

    // Weather signal — use stored weather if available.
    // Only fetch live if we have an explicit city name (not a stadium name).
    // The dedicated weather sync job handles fetching with correct city names.
    const venueCity = fixture.venueCity?.trim();
    let weatherDesc = fixture.weatherDesc;
    let weatherWind = fixture.weatherWind;
    let weatherTemp = fixture.weatherTemp;

    if (!weatherDesc && venueCity && fixture.kickoff) {
      const w = await fetchWeatherForCity(venueCity, Math.floor(fixture.kickoff.getTime() / 1000));
      if (w) { weatherDesc = w.desc; weatherWind = w.wind; weatherTemp = w.temp; }
    }

    const isAdverseWeather =
      (weatherWind ?? 0) > 10 ||
      (weatherDesc ?? "").toLowerCase().includes("snow") ||
      (weatherDesc ?? "").toLowerCase().includes("blizzard") ||
      (weatherDesc ?? "").toLowerCase().includes("heavy rain") ||
      (weatherDesc ?? "").toLowerCase().includes("thunderstorm") ||
      (weatherDesc ?? "").toLowerCase().includes("hail") ||
      (weatherDesc ?? "").toLowerCase().includes("sleet") ||
      (weatherTemp ?? 15) < -5 ||
      (weatherTemp ?? 15) > 36;

    if (weatherDesc) {
      await upsertSignal(fixtureId, "pre", "adverse_weather",
        isAdverseWeather
          ? `Vejr kan påvirke spillet: ${weatherDesc} (${Math.round(weatherTemp ?? 0)}°C, vind ${Math.round(weatherWind ?? 0)} m/s)`
          : `Vejrforhold: ${weatherDesc} (${Math.round(weatherTemp ?? 0)}°C)`,
        weatherWind ?? null,
        isAdverseWeather);
    }

    // Underdog momentum advantage
    const underdogAdvantage = (af["team_form_last_5"] ?? 0) > (hf["team_form_last_5"] ?? 0) + 0.2;
    await upsertSignal(fixtureId, "pre", "underdog_momentum_advantage",
      "Underdog has form advantage", null, underdogAdvantage);

    // High scoring likely
    const highScoring = (hf["avg_goals_for_last_10"] ?? 0) > 1.5 && (af["avg_goals_for_last_10"] ?? 0) > 1.5;
    const avgGoals = ((hf["avg_goals_for_last_10"] ?? 0) + (af["avg_goals_for_last_10"] ?? 0)) / 2;
    await upsertSignal(fixtureId, "pre", "high_scoring_fixture",
      "High-scoring fixture likely", avgGoals, highScoring);

    // Defensive battle
    const defensiveBattle = (hf["avg_goals_against_last_10"] ?? 1) < 1.0 &&
      (af["avg_goals_against_last_10"] ?? 1) < 1.0 &&
      (hf["clean_sheet_rate"] ?? 0) > 0.4 &&
      (af["clean_sheet_rate"] ?? 0) > 0.4;
    await upsertSignal(fixtureId, "pre", "defensive_battle",
      "Defensive battle expected", null, defensiveBattle);

    // Inconsistent lineup
    const inconsistentLineup = (hf["lineup_stability_score"] ?? 1) < 0.6;
    await upsertSignal(fixtureId, "pre", "inconsistent_lineup",
      "Inconsistent home lineup", hf["lineup_stability_score"] ?? null, inconsistentLineup);

    // Home strength advantage
    const homeStrengthAdv = (hf["home_strength_index"] ?? 0) > 1.5;
    await upsertSignal(fixtureId, "pre", "home_strength_advantage",
      "Home team strength advantage", hf["home_strength_index"] ?? null, homeStrengthAdv);

    // Away weakness
    const awayWeakness = (af["away_weakness_index"] ?? 0) > 0.5;
    await upsertSignal(fixtureId, "pre", "away_weakness",
      "Away side showing weakness", af["away_weakness_index"] ?? null, awayWeakness);
  }

  if (phase === "live") {
    const hf = await getFeatures(fixtureId, homeId, "live");
    const af = await getFeatures(fixtureId, awayId, "live");

    // Momentum shift
    const momentumShift = Math.abs((hf["momentum_delta"] ?? 0) - (af["momentum_delta"] ?? 0)) > 3.0;
    const leadingTeam = (hf["momentum_delta"] ?? 0) > (af["momentum_delta"] ?? 0) ? "home" : "away";
    await upsertSignal(fixtureId, "live", "momentum_shift",
      `Momentum shift — ${leadingTeam} dominant`,
      Math.abs((hf["momentum_delta"] ?? 0) - (af["momentum_delta"] ?? 0)),
      momentumShift);

    // Home pressure rising
    const homePressureRising = (hf["pressure_shift_score"] ?? 0) > 2.0;
    await upsertSignal(fixtureId, "live", "home_pressure_rising",
      "Home team attacking pressure rising", hf["pressure_shift_score"] ?? null, homePressureRising);

    // Red card changed balance
    const redCardImpact =
      ((hf["red_card_count"] ?? 0) > 0 || (af["red_card_count"] ?? 0) > 0) && momentumShift;
    await upsertSignal(fixtureId, "live", "red_card_changed_balance",
      "Red card materially changed attacking balance",
      (hf["red_card_count"] ?? 0) + (af["red_card_count"] ?? 0),
      redCardImpact);

    // Upset risk
    const upsetRisk = hf["upset_risk_score"] ?? 0.5;
    const highUpsetRisk = upsetRisk > 0.65;
    await upsertSignal(fixtureId, "live", "upset_risk",
      "Match state inconsistent with pre-match expectation", upsetRisk, highUpsetRisk);

    // Away performing over expected tempo
    const awayOverPerforming = (af["pressure_shift_score"] ?? 0) > 2.5;
    const awayTempoPct = Math.round(((af["pressure_shift_score"] ?? 0) / 2.0 - 1) * 100);
    await upsertSignal(fixtureId, "live", "away_over_expected_tempo",
      `Away team performing ${awayTempoPct}% over expected tempo`,
      af["pressure_shift_score"] ?? null,
      awayOverPerforming);
  }

  if (phase === "post") {
    const hf = await getFeatures(fixtureId, homeId, "post");
    const af = await getFeatures(fixtureId, awayId, "post");

    // xG underperformance
    const homeXGUnder = (hf["xg_accuracy"] ?? 1) < 0.6;
    await upsertSignal(fixtureId, "post", "home_xg_underperformance",
      "Home team underperformed xG significantly", hf["xg_accuracy"] ?? null, homeXGUnder);

    // Set pieces decisive
    const setpieceDecisive =
      (hf["set_piece_goal_rate"] ?? 0) > 0.5 || (af["set_piece_goal_rate"] ?? 0) > 0.5;
    await upsertSignal(fixtureId, "post", "set_pieces_decisive",
      "Set pieces were decisive in this match",
      Math.max(hf["set_piece_goal_rate"] ?? 0, af["set_piece_goal_rate"] ?? 0),
      setpieceDecisive);

    // Result vs expectation (look at pre-match signals)
    const preSignals = await db.query.fixtureSignals.findMany({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "pre")),
    });
    const expectedHomeAdv = preSignals.find((s) => s.signalKey === "home_strength_advantage")?.signalBool;
    const isHome = fixture.homeGoals !== null && fixture.awayGoals !== null;
    if (isHome && expectedHomeAdv !== null && expectedHomeAdv !== undefined) {
      const homeWon = (fixture.homeGoals ?? 0) > (fixture.awayGoals ?? 0);
      const resultConsistent = expectedHomeAdv ? homeWon : !homeWon;
      await upsertSignal(fixtureId, "post", "result_vs_expectation",
        resultConsistent ? "Result consistent with pre-match expectation" : "Upset detected",
        null, !resultConsistent);
    }
  }

  console.log(`[signal-engine] Signals computed for fixture ${fixtureId} phase=${phase}`);
}
