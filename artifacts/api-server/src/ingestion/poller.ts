import { db } from "@workspace/db";
import {
  fixtures,
  teams,
  standings,
  fixtureEvents,
  fixtureStats,
  fixtureLineups,
  injuries,
  oddsSnapshots,
  predictions,
  liveOddsSnapshots,
  playerStats,
  playerSeasonStats,
  coaches,
  sidelinedPlayers,
  transfers,
  h2hFixtures,
  teamSeasonStats,
  playerProfiles,
  venues,
  trophies,
  oddsMarkets,
  fixtureSignals,
  alertLog,
  aiBettingTips,
} from "@workspace/db/schema";
import { eq, and, inArray, lt, sql, isNull, isNotNull, ne, gte } from "drizzle-orm";
import {
  TRACKED_LEAGUES,
  fetchTodayFixtures,
  fetchFixturesByDate,
  fetchLiveFixtures,
  fetchFixtureEvents,
  fetchFixtureStats,
  fetchFixtureLineups,
  fetchFixturePlayerStats,
  fetchStandings,
  fetchOdds,
  fetchOddsForBookmaker,
  PRIORITY_BOOKMAKER_IDS,
  fetchPredictions,
  fetchLiveOdds,
  fetchTopScorers,
  fetchTopAssists,
  fetchCoach,
  fetchSidelined,
  fetchTransfers,
  fetchH2H,
  fetchTeamStatistics,
  fetchTeamInfo,
  fetchPlayer,
  fetchTrophies,
  fetchTopYellowCards,
  fetchTopRedCards,
  fetchOddsAllMarkets,
  fetchSquad,
  fetchFixtureInjuries,
  fetchFixturesBySeason,
  fetchFixtureById,
  initApiStats,
  isQuotaExhausted,
  kvGet,
  kvSet,
  type ApiFixture,
  type ApiStatItem,
  type ApiLineup,
} from "./apiFootballClient.js";
import { initAiStats, getBettingTips, triggerPostMatchReview } from "../ai/analysisLayer.js";
import { runPreMatchFeatures, runLiveFeatures, runPostMatchFeatures } from "../features/featureEngine.js";
import { runSignalEngine } from "../signals/signalEngine.js";
import { cacheDel } from "../lib/routeCache.js";
import { fetchWeatherForCity, geocodeCity, fetchHistoricalWeather } from "../lib/weatherClient.js";
import { captureClosingOdds } from "./closingOdds.js";

const TRACKED_LEAGUE_IDS = new Set(TRACKED_LEAGUES.map((l) => l.id));

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0]!;
}

function getDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

async function upsertFixture(f: ApiFixture) {
  const kickoff = f.fixture.date ? new Date(f.fixture.date) : null;
  await db
    .insert(fixtures)
    .values({
      fixtureId: f.fixture.id,
      leagueId: f.league.id,
      leagueName: f.league.name,
      leagueLogo: f.league.logo,
      seasonYear: f.league.season,
      homeTeamId: f.teams.home.id,
      awayTeamId: f.teams.away.id,
      homeTeamName: f.teams.home.name,
      awayTeamName: f.teams.away.name,
      homeTeamLogo: f.teams.home.logo,
      awayTeamLogo: f.teams.away.logo,
      kickoff,
      statusShort: f.fixture.status.short,
      statusElapsed: f.fixture.status.elapsed,
      homeGoals: f.goals.home,
      awayGoals: f.goals.away,
      venue: f.fixture.venue?.name ?? null,
      venueCity: f.fixture.venue?.city ?? null,
      referee: f.fixture.referee,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: fixtures.fixtureId,
      set: {
        statusShort: f.fixture.status.short,
        statusElapsed: f.fixture.status.elapsed,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        venue: f.fixture.venue?.name ?? null,
        venueCity: f.fixture.venue?.city ?? null,
        updatedAt: new Date(),
      },
    });

  // Upsert teams
  for (const team of [f.teams.home, f.teams.away]) {
    await db
      .insert(teams)
      .values({ teamId: team.id, name: team.name, logo: team.logo })
      .onConflictDoUpdate({
        target: teams.teamId,
        set: { name: team.name, logo: team.logo, updatedAt: new Date() },
      });
  }
}

async function syncFixturesForDate(date: string) {
  console.log(`[poller] Syncing fixtures for ${date}`);
  for (const league of TRACKED_LEAGUES) {
    const data = await fetchFixturesByDate(league.id, league.season, date);
    if (!data) continue;
    for (const f of data) {
      await upsertFixture(f);
    }
    console.log(`[poller] ${league.name}: ${data.length} fixtures for ${date}`);
  }
}

async function syncNearTermFixtures() {
  // Only today + tomorrow — for NS/scheduled status freshness.
  // Live scores are handled by the adaptive live loop (15s sprint).
  // Past results handled by syncRecentResults (every 2h).
  await syncFixturesForDate(new Date().toISOString().split("T")[0]!);
  await syncFixturesForDate(getTomorrow());
}

async function syncRecentResults() {
  // Yesterday + 2 days ago: FT results are stable, 2h refresh is plenty
  await syncFixturesForDate(getDateOffset(-1));
  await syncFixturesForDate(getDateOffset(-2));
}

async function syncTodayFixtures() {
  // Full window 3 days back + 7 days ahead: called every 2 hours
  for (let i = -3; i <= 6; i++) {
    await syncFixturesForDate(getDateOffset(i));
  }
}

async function syncStandings() {
  console.log("[poller] Syncing standings");
  for (const league of TRACKED_LEAGUES) {
    const data = await fetchStandings(league.id, league.season);
    if (!data) continue;

    for (const group of data) {
      for (const s of group) {
        await db
          .insert(standings)
          .values({
            leagueId: league.id,
            seasonYear: league.season,
            teamId: s.team.id,
            teamName: s.team.name ?? null,
            teamLogo: s.team.logo ?? null,
            rank: s.rank,
            points: s.points,
            played: s.all.played,
            won: s.all.win,
            drawn: s.all.draw,
            lost: s.all.lose,
            goalsFor: s.all.goals.for,
            goalsAgainst: s.all.goals.against,
            goalsDiff: s.goalsDiff,
            form: s.form,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [standings.leagueId, standings.seasonYear, standings.teamId],
            set: {
              teamName: s.team.name ?? null,
              teamLogo: s.team.logo ?? null,
              rank: s.rank,
              points: s.points,
              played: s.all.played,
              won: s.all.win,
              drawn: s.all.draw,
              lost: s.all.lose,
              goalsFor: s.all.goals.for,
              goalsAgainst: s.all.goals.against,
              goalsDiff: s.goalsDiff,
              form: s.form,
              updatedAt: new Date(),
            },
          });
      }
    }
    console.log(`[poller] Standings synced for league ${league.id}`);
  }
}

async function syncPreMatchData() {
  // Sync lineups for fixtures starting within 90 minutes
  const now = new Date();
  const soon = new Date(now.getTime() + 90 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(
        gte(f.kickoff, now),
        lte(f.kickoff, soon),
        inArray(f.statusShort, ["NS", "TBD"])
      ),
  });

  for (const fix of upcoming) {
    const lineups = await fetchFixtureLineups(fix.fixtureId);
    if (!lineups || !Array.isArray(lineups) || lineups.length === 0) continue;

    for (const lineup of lineups as ApiLineup[]) {
      // Drizzle jsonb columns accept serializable values; JSON.stringify/parse ensures clean JSON
      const startingXI = JSON.parse(JSON.stringify(lineup.startXI)) as ApiLineup["startXI"];
      const substitutes = JSON.parse(JSON.stringify(lineup.substitutes)) as ApiLineup["substitutes"];

      await db
        .insert(fixtureLineups)
        .values({
          fixtureId: fix.fixtureId,
          teamId: lineup.team.id,
          formation: lineup.formation,
          startingXI,
          substitutes,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [fixtureLineups.fixtureId, fixtureLineups.teamId],
          set: {
            formation: lineup.formation,
            startingXI,
            substitutes,
            updatedAt: new Date(),
          },
        });
    }

    // Pro: fetch predictions for upcoming fixtures
    await syncPredictionForFixture(fix.fixtureId);

    // Run pre-match features + signals
    await runPreMatchFeatures(fix.fixtureId, fix.homeTeamId, fix.awayTeamId);
    await runSignalEngine(fix.fixtureId, "pre");
  }
}

async function insertOddsSnapshot(
  fixtureId: number,
  bookmakerName: string,
  bookmakers: Array<{ name: string; bets: Array<{ name: string; values: Array<{ value: string; odd: string }> }> }>,
  extras?: { btts?: number | null; overUnder25?: number | null; handicapHome?: number | null }
) {
  const bm = bookmakers.find((b) => b.name === bookmakerName) ?? bookmakers[0];
  if (!bm) return;
  const market = bm.bets.find((b) => b.name === "Match Winner");
  if (!market) return;
  const homeVal = parseFloat(market.values.find((v) => v.value === "Home")?.odd ?? "0");
  const drawVal = parseFloat(market.values.find((v) => v.value === "Draw")?.odd ?? "0");
  const awayVal = parseFloat(market.values.find((v) => v.value === "Away")?.odd ?? "0");
  if (!homeVal && !drawVal && !awayVal) return;

  let btts = extras?.btts ?? null;
  let overUnder25 = extras?.overUnder25 ?? null;
  let handicapHome = extras?.handicapHome ?? null;

  if (btts == null) {
    const bttsMarket = bm.bets.find((b) => b.name === "Both Teams Score");
    if (bttsMarket) btts = parseFloat(bttsMarket.values.find((v) => v.value === "Yes")?.odd ?? "0") || null;
  }
  if (overUnder25 == null) {
    const ouMarket = bm.bets.find((b) => b.name === "Goals Over/Under");
    if (ouMarket) overUnder25 = parseFloat(ouMarket.values.find((v) => v.value === "Over 2.5")?.odd ?? "0") || null;
  }

  // Read previous snapshot for odds-drop detection (before deleting)
  const prev = await db.query.oddsSnapshots.findFirst({
    where: (o, { and: a, eq: e }) => a(e(o.fixtureId, fixtureId), e(o.bookmaker, bm.name)),
  });

  await db.delete(oddsSnapshots).where(
    and(eq(oddsSnapshots.fixtureId, fixtureId), eq(oddsSnapshots.bookmaker, bm.name))
  );
  await db.insert(oddsSnapshots).values({
    fixtureId,
    bookmaker: bm.name,
    homeWin: homeVal || null,
    draw: drawVal || null,
    awayWin: awayVal || null,
    btts,
    overUnder25,
    handicapHome: handicapHome ?? null,
    snappedAt: new Date(),
  });

  // Detect significant odds drop (>= 0.15) and fire broadcast alert
  if (prev) {
    const DROP = 0.15;
    const drops: Array<{ label: string; from: number; to: number }> = [];
    if (prev.homeWin && homeVal && prev.homeWin - homeVal >= DROP) drops.push({ label: "Home", from: prev.homeWin, to: homeVal });
    if (prev.draw && drawVal && prev.draw - drawVal >= DROP) drops.push({ label: "Draw", from: prev.draw, to: drawVal });
    if (prev.awayWin && awayVal && prev.awayWin - awayVal >= DROP) drops.push({ label: "Away", from: prev.awayWin, to: awayVal });
    if (drops.length > 0) {
      // Get fixture team names
      const fix = await db.query.fixtures.findFirst({
        where: (f, { eq: e }) => e(f.fixtureId, fixtureId),
        columns: { homeTeamName: true, awayTeamName: true },
      });
      const matchName = fix ? `${fix.homeTeamName} vs ${fix.awayTeamName}` : `Fixture ${fixtureId}`;
      const dropStr = drops.map(d => `${d.label} ${d.from.toFixed(2)} → ${d.to.toFixed(2)}`).join(", ");
      db.insert(alertLog).values({
        fixtureId,
        sessionId: null,
        signalKey: "odds_drop",
        alertText: `Odds dropping fast: ${matchName} — ${dropStr} (${bm.name})`,
        isRead: false,
        createdAt: new Date(),
      }).catch((e: unknown) => console.error("[odds-drop] alert insert error:", e));
    }
  }
}

async function syncOdds() {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, eq }) => and(gte(f.kickoff, now), lte(f.kickoff, in48Hours), eq(f.statusShort, "NS")),
  });

  for (const fix of upcoming) {
    const seen = new Set<string>();

    // Fetch default — gets whatever bookmakers API returns (usually 10Bet, Marathonbet, William Hill)
    const odds = await fetchOdds(fix.fixtureId);
    if (odds) {
      for (const bm of odds.bookmakers) {
        if (seen.has(bm.name)) continue;
        seen.add(bm.name);
        await insertOddsSnapshot(fix.fixtureId, bm.name, odds.bookmakers, {
          btts: odds._btts,
          overUnder25: odds._overUnder25,
          handicapHome: odds._handicapHome,
        });
      }
    }

    // Explicitly fetch priority bookmakers (Bet365, Bwin, Unibet)
    for (const [bmId, bmName] of Object.entries(PRIORITY_BOOKMAKER_IDS)) {
      if (seen.has(bmName)) continue;
      const bmOdds = await fetchOddsForBookmaker(fix.fixtureId, Number(bmId));
      if (!bmOdds || bmOdds.bookmakers.length === 0) continue;
      seen.add(bmName);
      await insertOddsSnapshot(fix.fixtureId, bmOdds.bookmakers[0]!.name, bmOdds.bookmakers);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

/**
 * Light odds sweep for fixtures 48h–7 days ahead.
 * syncOdds() covers 0-48h at high frequency; this fills the gap so
 * bulkGenerateAiTips() has odds data for the full upcoming week.
 * One API call per fixture (default bookmaker only). ~100-200 calls/run.
 */
async function syncOddsForUpcomingWeek(): Promise<void> {
  const now = new Date();
  const from = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(gte(f.kickoff, from), lte(f.kickoff, to), inArray(f.statusShort, ["NS", "TBD"])),
    columns: { fixtureId: true, homeTeamName: true, awayTeamName: true },
  });

  if (upcoming.length === 0) return;

  // Find fixtures that already have at least one snapshot — skip them to save API quota
  const existing = await db.query.oddsSnapshots.findMany({
    where: (s, { inArray: inArr }) => inArr(s.fixtureId, upcoming.map((f) => f.fixtureId)),
    columns: { fixtureId: true },
  });
  const alreadyHave = new Set(existing.map((r) => r.fixtureId));
  const missing = upcoming.filter((f) => !alreadyHave.has(f.fixtureId));

  if (missing.length === 0) {
    console.log(`[odds-week] All ${upcoming.length} fixtures (48h-7d) already have odds`);
    return;
  }

  console.log(`[odds-week] Fetching odds for ${missing.length} fixtures (48h–7d window)`);
  let ok = 0;

  for (const fix of missing) {
    try {
      const odds = await fetchOdds(fix.fixtureId);
      if (odds && odds.bookmakers.length > 0) {
        for (const bm of odds.bookmakers) {
          await insertOddsSnapshot(fix.fixtureId, bm.name, odds.bookmakers, {
            btts: odds._btts,
            overUnder25: odds._overUnder25,
            handicapHome: odds._handicapHome,
          });
        }
        ok++;
      }
      await new Promise((r) => setTimeout(r, 200)); // rate-limit friendly
    } catch (err) {
      console.error(`[odds-week] Error for fixture ${fix.fixtureId}:`, err);
    }
  }

  console.log(`[odds-week] Done — odds fetched for ${ok}/${missing.length} fixtures`);
}

async function syncPredictionForFixture(fixtureId: number) {
  const data = await fetchPredictions(fixtureId);
  if (!data || data.length === 0) return;
  const pred = data[0];
  if (!pred) return;

  const p = pred.predictions;
  const parsePercent = (s: string | undefined) => {
    if (!s) return null;
    return parseFloat(s.replace("%", "")) || null;
  };

  await db
    .insert(predictions)
    .values({
      fixtureId,
      homeWinPercent: parsePercent(p.percent.home),
      drawPercent: parsePercent(p.percent.draw),
      awayWinPercent: parsePercent(p.percent.away),
      goalsHome: p.goals.home ? parseFloat(p.goals.home) : null,
      goalsAway: p.goals.away ? parseFloat(p.goals.away) : null,
      adviceText: p.advice,
      winner: p.winner?.name ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: predictions.fixtureId,
      set: {
        homeWinPercent: parsePercent(p.percent.home),
        drawPercent: parsePercent(p.percent.draw),
        awayWinPercent: parsePercent(p.percent.away),
        goalsHome: p.goals.home ? parseFloat(p.goals.home) : null,
        goalsAway: p.goals.away ? parseFloat(p.goals.away) : null,
        adviceText: p.advice,
        winner: p.winner?.name ?? null,
        updatedAt: new Date(),
      },
    });
}

async function syncPlayerStatsForFixture(fixtureId: number) {
  const data = await fetchFixturePlayerStats(fixtureId);
  if (!data) return;

  for (const teamEntry of data) {
    const teamId = teamEntry.team.id;

    for (const { player, statistics } of teamEntry.players) {
      const s = statistics[0];
      if (!s) continue;

      const passAccStr = s.passes.accuracy != null ? String(s.passes.accuracy).replace("%", "") : null;
      const passAcc = passAccStr !== null ? parseFloat(passAccStr) : null;
      const rating = s.games.rating != null ? parseFloat(s.games.rating) : null;

      await db
        .insert(playerStats)
        .values({
          fixtureId,
          playerId: player.id,
          teamId,
          name: player.name,
          position: s.games.position,
          rating: rating !== null && !isNaN(rating) ? rating : null,
          goals: s.goals.total,
          assists: s.goals.assists,
          minutesPlayed: s.games.minutes,
          passAccuracy: passAcc !== null && !isNaN(passAcc) ? passAcc : null,
          shotsTotal: s.shots.total,
          shotsOnTarget: s.shots.on,
          duelsWon: s.duels.won,
          duelsTotal: s.duels.total,
        })
        .onConflictDoUpdate({
          target: [playerStats.fixtureId, playerStats.playerId],
          set: {
            rating: rating !== null && !isNaN(rating) ? rating : null,
            goals: s.goals.total,
            assists: s.goals.assists,
            minutesPlayed: s.games.minutes,
            passAccuracy: passAcc !== null && !isNaN(passAcc) ? passAcc : null,
            shotsTotal: s.shots.total,
            shotsOnTarget: s.shots.on,
            duelsWon: s.duels.won,
            duelsTotal: s.duels.total,
          },
        });
    }
  }
}

async function syncLiveOddsForFixture(fixtureId: number) {
  const data = await fetchLiveOdds(fixtureId);
  if (!data || data.length === 0) return;
  const entry = data[0];
  if (!entry || !entry.bookmakers || entry.bookmakers.length === 0) return;

  const bm = entry.bookmakers[0]!;
  const matchWinner = bm.bets.find((b) => b.name === "Match Winner");
  if (!matchWinner) return;

  const homeWin = parseFloat(matchWinner.values.find((v) => v.value === "Home")?.odd ?? "0") || null;
  const draw = parseFloat(matchWinner.values.find((v) => v.value === "Draw")?.odd ?? "0") || null;
  const awayWin = parseFloat(matchWinner.values.find((v) => v.value === "Away")?.odd ?? "0") || null;

  await db.insert(liveOddsSnapshots).values({
    fixtureId,
    bookmaker: bm.name,
    homeWin,
    draw,
    awayWin,
    snappedAt: new Date(),
  });
}

async function syncTopScorersAndAssists() {
  console.log("[poller] Syncing top scorers and assists");
  for (const league of TRACKED_LEAGUES) {
    const [scorers, assists] = await Promise.all([
      fetchTopScorers(league.id, league.season),
      fetchTopAssists(league.id, league.season),
    ]);

    const all = [...(scorers ?? []), ...(assists ?? [])];
    for (const entry of all) {
      const s = entry.statistics[0];
      if (!s) continue;
      const rating = s.games.rating ? parseFloat(s.games.rating) : null;

      await db
        .insert(playerSeasonStats)
        .values({
          playerId: entry.player.id,
          playerName: entry.player.name,
          teamId: s.team.id,
          leagueId: s.league.id,
          seasonYear: s.league.season,
          position: s.games.position,
          goals: s.goals.total,
          assists: s.goals.assists,
          appearances: s.games.appearances,
          minutesPlayed: s.games.minutes,
          rating: isNaN(rating ?? NaN) ? null : rating,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [playerSeasonStats.playerId, playerSeasonStats.leagueId, playerSeasonStats.seasonYear],
          set: {
            goals: s.goals.total,
            assists: s.goals.assists,
            appearances: s.games.appearances,
            minutesPlayed: s.games.minutes,
            rating: isNaN(rating ?? NaN) ? null : rating,
            updatedAt: new Date(),
          },
        });
    }
    console.log(`[poller] Top stats synced for ${league.name}`);
  }
}

async function syncCoachesForKnownTeams() {
  console.log("[poller] Syncing coaches");
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte }) => and(gte(f.kickoff, now), lte(f.kickoff, in7days)),
    columns: { homeTeamId: true, awayTeamId: true },
    limit: 60,
  });
  const teamIdSet = new Set<number>();
  for (const f of upcomingFixtures) {
    teamIdSet.add(f.homeTeamId);
    teamIdSet.add(f.awayTeamId);
  }
  if (teamIdSet.size === 0) {
    console.log("[poller] Coaches: no upcoming fixtures — skipping");
    return;
  }
  const allTeams = Array.from(teamIdSet).map((id) => ({ teamId: id }));
  for (const team of allTeams) {
    const data = await fetchCoach(team.teamId);
    if (!data || data.length === 0) continue;
    const coach = data[0]!;

    await db
      .insert(coaches)
      .values({
        coachId: coach.id,
        name: coach.name,
        teamId: team.teamId,
        nationality: coach.nationality,
        age: coach.age,
        photoUrl: coach.photo,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: coaches.teamId,
        set: {
          coachId: coach.id,
          name: coach.name,
          nationality: coach.nationality,
          age: coach.age,
          photoUrl: coach.photo,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`[poller] Coaches synced for ${allTeams.length} teams`);
}

async function syncSidelinedForRecentPlayers() {
  console.log("[poller] Syncing sidelined players");
  const recentLineups = await db.query.fixtureLineups.findMany({
    orderBy: (l, { desc: d }) => [d(l.updatedAt)],
    limit: 20,
  });

  // Map playerId -> teamId using lineup data so we can store teamId with sidelined records
  const playerToTeam = new Map<number, number>();
  for (const lineup of recentLineups) {
    const xi = lineup.startingXI as Array<{ player: { id: number } }> | null;
    const subs = lineup.substitutes as Array<{ player: { id: number } }> | null;
    for (const p of [...(xi ?? []), ...(subs ?? [])]) {
      if (p?.player?.id) playerToTeam.set(p.player.id, lineup.teamId);
    }
  }

  for (const [playerId, teamId] of playerToTeam) {
    const data = await fetchSidelined(playerId);
    if (!data || data.length === 0) continue;
    const entry = data[0]!;

    for (const sl of entry.sidelined) {
      await db
        .insert(sidelinedPlayers)
        .values({
          playerId: entry.player.id,
          playerName: entry.player.name,
          teamId,
          type: sl.type,
          startDate: sl.start,
          endDate: sl.end,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [sidelinedPlayers.playerId, sidelinedPlayers.type, sidelinedPlayers.startDate],
          set: { endDate: sl.end, updatedAt: new Date() },
        });
    }
  }
  console.log(`[poller] Sidelined checked for ${playerToTeam.size} players`);
}

async function syncTransfersForTrackedTeams() {
  console.log("[poller] Syncing transfers");
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: (f, { and, gte }) => and(gte(f.kickoff, new Date())),
    columns: { homeTeamId: true, awayTeamId: true },
    limit: 50,
  });

  const teamIds = new Set<number>();
  for (const f of upcomingFixtures) {
    teamIds.add(f.homeTeamId);
    teamIds.add(f.awayTeamId);
  }

  for (const teamId of teamIds) {
    const data = await fetchTransfers(teamId);
    if (!data) continue;

    for (const entry of data) {
      for (const t of entry.transfers.slice(0, 5)) {
        await db
          .insert(transfers)
          .values({
            playerId: entry.player.id,
            playerName: entry.player.name,
            teamInId: t.teams.in.id,
            teamInName: t.teams.in.name,
            teamOutId: t.teams.out.id,
            teamOutName: t.teams.out.name,
            transferType: t.type,
            transferDate: t.date,
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }
  }
  console.log(`[poller] Transfers synced for ${teamIds.size} teams`);
}

// ── New comprehensive sync functions ──────────────────────────────────────────

async function syncH2HForUpcomingFixtures() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray: inArr }) =>
      and(gte(f.kickoff, now), lte(f.kickoff, in48h), inArr(f.statusShort, ["NS", "TBD"])),
    limit: 20,
  });

  for (const fix of upcoming) {
    const data = await fetchH2H(fix.homeTeamId, fix.awayTeamId, 10);
    if (!data) continue;

    for (const entry of data) {
      if (!["FT", "AET", "PEN"].includes(entry.fixture.status.short)) continue;
      await db
        .insert(h2hFixtures)
        .values({
          fixtureId: entry.fixture.id,
          leagueId: entry.league.id,
          leagueName: entry.league.name,
          seasonYear: entry.league.season,
          homeTeamId: entry.teams.home.id,
          homeTeamName: entry.teams.home.name,
          homeTeamLogo: entry.teams.home.logo,
          awayTeamId: entry.teams.away.id,
          awayTeamName: entry.teams.away.name,
          awayTeamLogo: entry.teams.away.logo,
          homeGoals: entry.goals.home,
          awayGoals: entry.goals.away,
          kickoff: entry.fixture.date ? new Date(entry.fixture.date) : null,
          statusShort: entry.fixture.status.short,
          forTeam1Id: fix.homeTeamId,
          forTeam2Id: fix.awayTeamId,
        })
        .onConflictDoNothing();
    }
  }
  console.log(`[poller] H2H synced for ${upcoming.length} upcoming fixtures`);
}

async function syncTeamSeasonStats() {
  console.log("[poller] Syncing team season stats");
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte }) => and(gte(f.kickoff, now), lte(f.kickoff, in7days)),
    columns: { homeTeamId: true, awayTeamId: true, leagueId: true },
    limit: 60,
  });

  const teamLeaguePairs = new Set<string>();
  for (const f of upcomingFixtures) {
    teamLeaguePairs.add(`${f.homeTeamId}:${f.leagueId}`);
    teamLeaguePairs.add(`${f.awayTeamId}:${f.leagueId}`);
  }

  if (teamLeaguePairs.size === 0) {
    console.log("[poller] Team season stats: no upcoming fixtures — skipping");
    return;
  }

  for (const pair of teamLeaguePairs) {
    const [teamIdStr, leagueIdStr] = pair.split(":");
    const teamId = Number(teamIdStr);
    const leagueId = Number(leagueIdStr);
    const league = TRACKED_LEAGUES.find((l) => l.id === leagueId);
    if (!league) continue;

    const team = { teamId };
    for (const lg of [league]) {
      const data = await fetchTeamStatistics(team.teamId, lg.id, lg.season);
      if (!data) continue;

      const f = data.fixtures;
      const g = data.goals;
      const parseAvg = (s: string | null | undefined) => s ? parseFloat(s) || null : null;

      await db
        .insert(teamSeasonStats)
        .values({
          teamId: team.teamId,
          leagueId: league.id,
          seasonYear: league.season,
          form: data.form,
          playedHome: f.played.home,
          playedAway: f.played.away,
          playedTotal: f.played.total,
          winsHome: f.wins.home,
          winsAway: f.wins.away,
          winsTotal: f.wins.total,
          drawsHome: f.draws.home,
          drawsAway: f.draws.away,
          drawsTotal: f.draws.total,
          lossesHome: f.loses.home,
          lossesAway: f.loses.away,
          lossesTotal: f.loses.total,
          goalsForHome: g.for.total.home,
          goalsForAway: g.for.total.away,
          goalsForTotal: g.for.total.total,
          goalsForAvgHome: parseAvg(g.for.average.home),
          goalsForAvgAway: parseAvg(g.for.average.away),
          goalsForAvgTotal: parseAvg(g.for.average.total),
          goalsAgainstHome: g.against.total.home,
          goalsAgainstAway: g.against.total.away,
          goalsAgainstTotal: g.against.total.total,
          goalsAgainstAvgHome: parseAvg(g.against.average.home),
          goalsAgainstAvgAway: parseAvg(g.against.average.away),
          goalsAgainstAvgTotal: parseAvg(g.against.average.total),
          cleanSheetsHome: data.clean_sheet.home,
          cleanSheetsAway: data.clean_sheet.away,
          cleanSheetsTotal: data.clean_sheet.total,
          failedToScoreHome: data.failed_to_score.home,
          failedToScoreAway: data.failed_to_score.away,
          failedToScoreTotal: data.failed_to_score.total,
          penaltyScoredTotal: data.penalty.scored.total,
          penaltyMissedTotal: data.penalty.missed.total,
          biggestWinStreak: data.biggest.streak.wins,
          biggestLossStreak: data.biggest.streak.loses,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [teamSeasonStats.teamId, teamSeasonStats.leagueId, teamSeasonStats.seasonYear],
          set: {
            form: data.form,
            playedTotal: f.played.total,
            winsTotal: f.wins.total,
            drawsTotal: f.draws.total,
            lossesTotal: f.loses.total,
            goalsForTotal: g.for.total.total,
            goalsForAvgTotal: parseAvg(g.for.average.total),
            goalsAgainstTotal: g.against.total.total,
            goalsAgainstAvgTotal: parseAvg(g.against.average.total),
            cleanSheetsTotal: data.clean_sheet.total,
            failedToScoreTotal: data.failed_to_score.total,
            biggestWinStreak: data.biggest.streak.wins,
            biggestLossStreak: data.biggest.streak.loses,
            updatedAt: new Date(),
          },
        });
    }
  }
  console.log(`[poller] Team season stats synced for ${teamLeaguePairs.size} team/league pairs`);
}

async function syncVenuesAndInfoForKnownTeams() {
  console.log("[poller] Syncing team info + venues");
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte }) => and(gte(f.kickoff, now), lte(f.kickoff, in7days)),
    columns: { homeTeamId: true, awayTeamId: true },
    limit: 60,
  });
  const teamIdSet = new Set<number>();
  for (const f of upcomingFixtures) {
    teamIdSet.add(f.homeTeamId);
    teamIdSet.add(f.awayTeamId);
  }
  if (teamIdSet.size === 0) {
    console.log("[poller] Venues: no upcoming fixtures — skipping");
    return;
  }
  const allTeams = Array.from(teamIdSet).map((id) => ({ teamId: id }));

  for (const team of allTeams) {
    const info = await fetchTeamInfo(team.teamId);
    if (!info) continue;

    const v = info.venue;
    if (v.name) {
      await db
        .insert(venues)
        .values({
          venueId: v.id ?? null,
          name: v.name,
          address: v.address,
          city: v.city,
          country: v.country,
          capacity: v.capacity,
          surface: v.surface,
          imageUrl: v.image,
          teamId: team.teamId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: venues.teamId,
          set: {
            name: v.name,
            city: v.city,
            capacity: v.capacity,
            surface: v.surface,
            imageUrl: v.image,
            updatedAt: new Date(),
          },
        });
    }

    // Update team with country info
    await db
      .update(teams)
      .set({ country: info.team.country ?? null, updatedAt: new Date() })
      .where(eq(teams.teamId, team.teamId));
  }
  console.log(`[poller] Venues synced for ${allTeams.length} teams`);
}

async function syncTrophiesForKnownTeams() {
  console.log("[poller] Syncing trophies");
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte }) => and(gte(f.kickoff, now), lte(f.kickoff, in7days)),
    columns: { homeTeamId: true, awayTeamId: true },
    limit: 60,
  });
  const teamIdSet = new Set<number>();
  for (const f of upcomingFixtures) {
    teamIdSet.add(f.homeTeamId);
    teamIdSet.add(f.awayTeamId);
  }
  if (teamIdSet.size === 0) {
    console.log("[poller] Trophies: no upcoming fixtures — skipping");
    return;
  }
  const allTeams = Array.from(teamIdSet).map((id) => ({ teamId: id }));

  for (const team of allTeams) {
    const data = await fetchTrophies(team.teamId);
    if (!data) continue;

    for (const trophy of data) {
      if (!trophy.place || !trophy.season) continue;
      await db
        .insert(trophies)
        .values({
          teamId: team.teamId,
          leagueName: trophy.league.name,
          leagueType: trophy.league.type,
          place: trophy.place,
          season: trophy.season,
        })
        .onConflictDoNothing();
    }
  }
  console.log(`[poller] Trophies synced for ${allTeams.length} teams`);
}

async function syncSquadsForUpcomingTeams() {
  console.log("[poller] Syncing squads for upcoming teams");
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(gte(f.kickoff, now), lte(f.kickoff, in7days), inArray(f.statusShort, ["NS", "TBD"])),
    columns: { homeTeamId: true, awayTeamId: true },
  });
  if (upcomingFixtures.length === 0) { console.log("[poller] Squads: no upcoming fixtures — skipping"); return; }

  const teamIds = new Set<number>();
  for (const f of upcomingFixtures) { teamIds.add(f.homeTeamId); teamIds.add(f.awayTeamId); }

  for (const teamId of teamIds) {
    const squad = await fetchSquad(teamId);
    if (!squad) continue;
    for (const player of squad.players) {
      await db
        .insert(playerProfiles)
        .values({
          playerId: player.id,
          name: player.name,
          age: player.age,
          photo: player.photo,
          position: player.position,
          teamId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: playerProfiles.playerId,
          set: { age: player.age, photo: player.photo, position: player.position, teamId, updatedAt: new Date() },
        });
    }
  }
  console.log(`[poller] Squads synced for ${teamIds.size} teams`);
}

async function syncFixtureInjuriesForUpcoming() {
  console.log("[poller] Syncing injuries for upcoming fixtures");
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(gte(f.kickoff, now), lte(f.kickoff, in48h), inArray(f.statusShort, ["NS", "TBD"])),
    columns: { fixtureId: true },
  });

  for (const fix of upcoming) {
    const data = await fetchFixtureInjuries(fix.fixtureId);
    if (!data || data.length === 0) continue;
    for (const inj of data) {
      await db
        .insert(injuries)
        .values({
          fixtureId: fix.fixtureId,
          playerId: inj.player.id,
          playerName: inj.player.name,
          teamId: inj.team.id,
          type: inj.player.type,
          reason: inj.player.reason,
        })
        .onConflictDoNothing();
    }
  }
  console.log(`[poller] Fixture injuries synced for ${upcoming.length} fixtures`);
}

async function syncPlayerProfilesForTopPlayers() {
  console.log("[poller] Syncing player profiles");
  const topPlayers = await db.query.playerSeasonStats.findMany({
    columns: { playerId: true, leagueId: true, seasonYear: true },
    orderBy: (p, { desc: d }) => [d(p.goals)],
    limit: 50,
  });

  for (const entry of topPlayers) {
    const data = await fetchPlayer(entry.playerId, entry.seasonYear);
    if (!data) continue;

    const pl = data.player;
    const stats = data.statistics[0];
    const cards = stats?.cards;
    const rating = stats?.games.rating ? parseFloat(stats.games.rating) : null;

    await db
      .insert(playerProfiles)
      .values({
        playerId: pl.id,
        name: pl.name,
        firstName: pl.firstname,
        lastName: pl.lastname,
        age: pl.age,
        nationality: pl.nationality,
        height: pl.height,
        weight: pl.weight,
        photo: pl.photo,
        position: stats?.games.position ?? null,
        teamId: stats?.team.id ?? null,
        teamName: stats?.team.name ?? null,
        yellowCards: cards?.yellow ?? null,
        redCards: cards?.red ?? null,
        appearances: stats?.games.appearances ?? null,
        goals: stats?.goals.total ?? null,
        assists: stats?.goals.assists ?? null,
        minutesPlayed: stats?.games.minutes ?? null,
        rating: rating !== null && !isNaN(rating) ? rating : null,
        leagueId: stats?.league.id ?? null,
        seasonYear: stats?.league.season ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: playerProfiles.playerId,
        set: {
          age: pl.age,
          teamId: stats?.team.id ?? null,
          teamName: stats?.team.name ?? null,
          yellowCards: cards?.yellow ?? null,
          redCards: cards?.red ?? null,
          appearances: stats?.games.appearances ?? null,
          goals: stats?.goals.total ?? null,
          assists: stats?.goals.assists ?? null,
          minutesPlayed: stats?.games.minutes ?? null,
          rating: rating !== null && !isNaN(rating) ? rating : null,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`[poller] Player profiles synced for ${topPlayers.length} players`);
}

async function syncTopDiscipline() {
  console.log("[poller] Syncing top yellow/red cards");
  for (const league of TRACKED_LEAGUES) {
    const [yellows, reds] = await Promise.all([
      fetchTopYellowCards(league.id, league.season),
      fetchTopRedCards(league.id, league.season),
    ]);

    const all = [...(yellows ?? []), ...(reds ?? [])];
    for (const entry of all) {
      const s = entry.statistics[0];
      if (!s) continue;
      const rating = s.games.rating ? parseFloat(s.games.rating) : null;

      await db
        .insert(playerSeasonStats)
        .values({
          playerId: entry.player.id,
          playerName: entry.player.name,
          teamId: s.team.id,
          leagueId: s.league.id,
          seasonYear: s.league.season,
          position: s.games.position,
          goals: s.goals.total,
          assists: s.goals.assists,
          appearances: s.games.appearances,
          minutesPlayed: s.games.minutes,
          rating: isNaN(rating ?? NaN) ? null : rating,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [playerSeasonStats.playerId, playerSeasonStats.leagueId, playerSeasonStats.seasonYear],
          set: {
            goals: s.goals.total,
            assists: s.goals.assists,
            appearances: s.games.appearances,
            minutesPlayed: s.games.minutes,
            rating: isNaN(rating ?? NaN) ? null : rating,
            updatedAt: new Date(),
          },
        });
    }
    console.log(`[poller] Discipline leaders synced for ${league.name}`);
  }
}

async function syncOddsAllMarketsForUpcoming() {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6h ago

  // Fetch all upcoming fixtures in the next 7 days
  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) => and(
      gte(f.kickoff, now),
      lte(f.kickoff, in7d),
      inArray(f.statusShort, ["NS", "TBD"]),
    ),
    limit: 60,
  });

  // Find which fixtures already have fresh odds (< 6h old) — skip those to save quota
  const freshOdds = upcoming.length > 0
    ? await db.select({ fixtureId: oddsMarkets.fixtureId })
        .from(oddsMarkets)
        .where(and(
          inArray(oddsMarkets.fixtureId, upcoming.map(f => f.fixtureId)),
          gte(oddsMarkets.snappedAt, staleThreshold),
        ))
    : [];
  const hasFreshOdds = new Set(freshOdds.map(r => r.fixtureId));

  const fixturesForSync = upcoming.filter(f => !hasFreshOdds.has(f.fixtureId));
  if (fixturesForSync.length === 0) {
    console.log(`[poller] Full odds markets: all ${upcoming.length} fixtures have fresh data — skipping`);
    return;
  }
  console.log(`[poller] Full odds markets: syncing ${fixturesForSync.length} fixtures (${upcoming.length - fixturesForSync.length} already fresh)`);

  for (const fix of fixturesForSync) {
    const seen = new Set<string>();
    const snappedAt = new Date();

    // Default fetch — gets all bookmakers the API returns by default
    const markets = await fetchOddsAllMarkets(fix.fixtureId);
    if (markets) {
      for (const m of markets) {
        if (seen.has(m.bookmaker)) continue;
        seen.add(m.bookmaker);
        await db.delete(oddsMarkets).where(
          and(eq(oddsMarkets.fixtureId, fix.fixtureId), eq(oddsMarkets.bookmaker, m.bookmaker))
        );
        await db.insert(oddsMarkets).values({
          fixtureId: fix.fixtureId,
          bookmaker: m.bookmaker,
          markets: m.markets as Record<string, unknown>,
          snappedAt,
        });
      }
    }

    // Explicitly fetch priority bookmakers to ensure full coverage
    for (const [bmId, bmName] of Object.entries(PRIORITY_BOOKMAKER_IDS)) {
      if (seen.has(bmName)) continue;
      const bmOdds = await fetchOddsForBookmaker(fix.fixtureId, Number(bmId));
      if (!bmOdds || bmOdds.bookmakers.length === 0) continue;
      const bm = bmOdds.bookmakers[0]!;
      seen.add(bm.name);
      const mkt: Record<string, Array<{ value: string; odd: string }>> = {};
      for (const bet of bm.bets) {
        mkt[bet.name] = bet.values.map((v) => ({ value: v.value, odd: v.odd }));
      }
      await db.delete(oddsMarkets).where(
        and(eq(oddsMarkets.fixtureId, fix.fixtureId), eq(oddsMarkets.bookmaker, bm.name))
      );
      await db.insert(oddsMarkets).values({
        fixtureId: fix.fixtureId,
        bookmaker: bm.name,
        markets: mkt as Record<string, unknown>,
        snappedAt,
      });
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  console.log(`[poller] Full odds markets synced for ${fixturesForSync.length} fixtures (7-day window)`);
}

// Track fixtures that have already had post-match processing to avoid duplicates
const postMatchProcessed = new Set<number>();

// Track consecutive fetch failures for stale-live fixtures (reset on success)
const staleFetchFailures = new Map<number, number>();

let pollerStarted = false;

// Adaptive live poller — sprints at 15s when tracked matches are live, idles at 2min when quiet
// Only processes fixtures from our 5 tracked leagues to stay within API quota
async function adaptiveLiveLoop() {
  const LIVE_INTERVAL_MS = 15 * 1000;      // 15s during active play
  const IDLE_INTERVAL_MS = 2 * 60 * 1000;  // 2min when no live matches

  let lastTrackedCount = 0;

  while (true) {
    try {
      const liveData = await fetchLiveFixtures();
      // Filter to only our tracked leagues — avoids wasting API calls on untracked matches
      const tracked = (liveData ?? []).filter((f) => TRACKED_LEAGUE_IDS.has(f.league.id));
      const trackedCount = tracked.length;

      if (trackedCount !== lastTrackedCount) {
        const total = liveData?.length ?? 0;
        console.log(`[poller] Tracked live: ${trackedCount}/${total} — switching to ${trackedCount > 0 ? "SPRINT (15s)" : "IDLE (2min)"} mode`);
        lastTrackedCount = trackedCount;
      }

      for (const f of tracked) {
        await upsertFixture(f);

        const statusShort = f.fixture.status.short;
        const isInPlay = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(statusShort);
        const isFinished = ["FT", "AET", "PEN"].includes(statusShort);

        if (isInPlay) {
          // Events + stats (always)
          const events = await fetchFixtureEvents(f.fixture.id);
          if (events) {
            await db.delete(fixtureEvents).where(eq(fixtureEvents.fixtureId, f.fixture.id));
            for (const ev of events) {
              await db.insert(fixtureEvents).values({
                fixtureId: f.fixture.id,
                minute: ev.time.elapsed,
                extraMinute: ev.time.extra,
                teamId: ev.team.id,
                playerId: ev.player?.id ?? null,
                playerName: ev.player?.name ?? null,
                assistId: ev.assist?.id ?? null,
                assistName: ev.assist?.name ?? null,
                type: ev.type,
                detail: ev.detail,
                comments: ev.comments,
              });
            }
          }

          const stats = await fetchFixtureStats(f.fixture.id);
          if (stats) {
            for (const teamStat of stats) {
              const getValue = (type: string): number | null => {
                const item = teamStat.statistics.find((s: ApiStatItem) => s.type === type);
                if (!item || item.value === null || item.value === undefined) return null;
                const val = String(item.value).replace("%", "");
                const num = parseFloat(val);
                return isNaN(num) ? null : num;
              };

              await db
                .insert(fixtureStats)
                .values({
                  fixtureId: f.fixture.id,
                  teamId: teamStat.team.id,
                  shotsOnGoal: getValue("Shots on Goal"),
                  shotsOffGoal: getValue("Shots off Goal"),
                  totalShots: getValue("Total Shots"),
                  blockedShots: getValue("Blocked Shots"),
                  cornerKicks: getValue("Corner Kicks"),
                  fouls: getValue("Fouls"),
                  yellowCards: getValue("Yellow Cards"),
                  redCards: getValue("Red Cards"),
                  ballPossession: getValue("Ball Possession"),
                  passAccuracy: getValue("Passes %"),
                  totalPasses: getValue("Total passes"),
                  expectedGoals: getValue("expected_goals"),
                  updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                  target: [fixtureStats.fixtureId, fixtureStats.teamId],
                  set: {
                    shotsOnGoal: getValue("Shots on Goal"),
                    shotsOffGoal: getValue("Shots off Goal"),
                    totalShots: getValue("Total Shots"),
                    cornerKicks: getValue("Corner Kicks"),
                    fouls: getValue("Fouls"),
                    yellowCards: getValue("Yellow Cards"),
                    redCards: getValue("Red Cards"),
                    ballPossession: getValue("Ball Possession"),
                    passAccuracy: getValue("Passes %"),
                    expectedGoals: getValue("expected_goals"),
                    updatedAt: new Date(),
                  },
                });
            }
          }

          // Pro: player-level stats + live odds for tracked fixtures
          await syncPlayerStatsForFixture(f.fixture.id);
          await syncLiveOddsForFixture(f.fixture.id);

          await runLiveFeatures(f.fixture.id, f.teams.home.id, f.teams.away.id);
          await runSignalEngine(f.fixture.id, "live");
          // Immediately evict the route cache so the next browser poll gets fresh data
          cacheDel(`fixture:${f.fixture.id}`);
          cacheDel(`fixtures:today:${new Date().toISOString().slice(0, 10)}`);
          cacheDel("fixtures:top-picks");
        } else if (isFinished && !postMatchProcessed.has(f.fixture.id)) {
          postMatchProcessed.add(f.fixture.id);
          console.log(`[poller] Post-match processing for fixture ${f.fixture.id}`);
          await upsertFixtureEventsAndStats(f.fixture.id);
          cacheDel(`fixture:${f.fixture.id}`);
          cacheDel(`fixtures:today:${new Date().toISOString().slice(0, 10)}`);
          cacheDel("fixtures:top-picks");
          await runPostMatchFeatures(f.fixture.id);
          await runSignalEngine(f.fixture.id, "post");
        }
      }

      // ── Stale-live cleanup ─────────────────────────────────────────────────
      // Fixtures can get stuck in a live status if the poller restarts mid-match
      // or misses the final FT update. Re-fetch any that the API no longer reports
      // as live but are still stored with a live status in the DB.
      //
      // We skip this entire block when the daily API quota is exhausted to avoid
      // burning through retries. Fixtures that repeatedly fail to resolve after
      // STALE_MAX_FAILURES attempts are force-resolved to "FT" in the DB so they
      // no longer block the loop.

      const STALE_LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE', 'SUSP'];
      const currentLiveIds = new Set(tracked.map((f) => f.fixture.id));
      const cutoff = new Date(Date.now() - 95 * 60 * 1000); // 95 min ago
      const STALE_MAX_FAILURES = 5; // force-resolve after this many consecutive null returns

      if (!isQuotaExhausted()) {
        const staleLive = await db.query.fixtures.findMany({
          where: (t, { inArray, lte, and: andFn }) =>
            andFn(inArray(t.statusShort, STALE_LIVE_STATUSES), lte(t.kickoff!, cutoff)),
          columns: { fixtureId: true, statusShort: true, kickoff: true },
          limit: 15,
        });

        for (const stale of staleLive) {
          if (currentLiveIds.has(stale.fixtureId)) continue; // still live — skip
          console.log(`[poller] Stale-live fixture ${stale.fixtureId} (${stale.statusShort}) — re-fetching final status`);
          const fresh = await fetchFixtureById(stale.fixtureId);
          if (fresh) {
            staleFetchFailures.delete(stale.fixtureId); // reset on success
            await upsertFixture(fresh);
            cacheDel(`fixture:${stale.fixtureId}`);
            const finalStatus = fresh.fixture.status.short;
            const isFinished = ['FT', 'AET', 'PEN', 'ABD', 'CANC', 'AWD', 'WO'].includes(finalStatus);
            if (isFinished && !postMatchProcessed.has(stale.fixtureId)) {
              postMatchProcessed.add(stale.fixtureId);
              runPostMatchFeatures(stale.fixtureId).catch(console.error);
              runSignalEngine(stale.fixtureId, "post").catch(console.error);
            }
            console.log(`[poller] Stale fixture ${stale.fixtureId} resolved → ${finalStatus}`);
          } else {
            // API returned null — track consecutive failures
            const failures = (staleFetchFailures.get(stale.fixtureId) ?? 0) + 1;
            staleFetchFailures.set(stale.fixtureId, failures);
            if (failures >= STALE_MAX_FAILURES) {
              // Force-resolve to FT so it no longer appears in stale queries
              await db.update(fixtures)
                .set({ statusShort: "FT", updatedAt: new Date() })
                .where(eq(fixtures.fixtureId, stale.fixtureId));
              staleFetchFailures.delete(stale.fixtureId);
              console.warn(`[poller] Stale fixture ${stale.fixtureId} force-resolved to FT after ${failures} failed fetches`);
              cacheDel(`fixture:${stale.fixtureId}`);
            } else {
              console.warn(`[poller] Stale fixture ${stale.fixtureId} fetch returned null (attempt ${failures}/${STALE_MAX_FAILURES})`);
            }
          }
        }
      } else {
        // Quota exhausted — skip stale-live cleanup silently
      }

      await new Promise((r) => setTimeout(r, trackedCount > 0 ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS));
    } catch (err) {
      console.error("[poller] adaptiveLiveLoop error:", err);
      await new Promise((r) => setTimeout(r, 30 * 1000));
    }
  }
}

// ─── Weather sync ─────────────────────────────────────────────────────────────
/**
 * Fetches weather forecasts for upcoming fixtures (next 5 days) where the
 * venue city is known. Refreshes every 3 hours; skips fixtures already fetched
 * within the last 3 hours.
 */
async function syncWeatherForUpcomingFixtures() {
  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  // Reset stale weather for fixtures that have no city yet (venueCity was added later)
  // so they will be re-fetched using the correct city name
  await db
    .update(fixtures)
    .set({ weatherFetchedAt: null })
    .where(
      and(
        isNotNull(fixtures.weatherFetchedAt),
        isNull(fixtures.venueCity)
      )
    );

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(
        gte(f.kickoff, now),
        lte(f.kickoff, in5Days),
        inArray(f.leagueId, [...TRACKED_LEAGUE_IDS])
      ),
  });

  const stale = upcoming.filter(
    (f) => !f.weatherFetchedAt || f.weatherFetchedAt < staleThreshold
  );

  if (stale.length === 0) {
    console.log("[weather] All upcoming fixtures already have fresh weather data");
    return;
  }

  console.log(`[weather] Fetching weather for ${stale.length} fixtures`);

  for (const f of stale) {
    try {
      // Prefer the explicit city name; fall back to first segment of venue name
      const cityName = f.venueCity?.trim() || (f.venue ?? "").split(",")[0]?.trim();
      if (!cityName) continue;

      const unixTs = f.kickoff ? Math.floor(f.kickoff.getTime() / 1000) : Math.floor(Date.now() / 1000);
      const w = await fetchWeatherForCity(cityName, unixTs);
      if (!w) continue;

      await db
        .update(fixtures)
        .set({
          weatherTemp: w.temp,
          weatherDesc: w.desc,
          weatherIcon: w.icon,
          weatherWind: w.wind,
          weatherHumidity: w.humidity,
          weatherFetchedAt: new Date(),
        })
        .where(eq(fixtures.fixtureId, f.fixtureId));

      console.log(`[weather] ${f.homeTeamName} vs ${f.awayTeamName}: ${w.desc}, ${Math.round(w.temp)}°C, wind ${Math.round(w.wind)}m/s${w.isAdverse ? " ⚠ ADVERSE" : ""}`);
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.warn(`[weather] Error for fixture ${f.fixtureId}:`, err);
    }
  }
}

// ─── Post-match events + stats upsert helper ─────────────────────────────────
/**
 * Fetches events, stats, and lineups for a finished fixture and upserts them
 * into the DB. Called both by the live loop (on FT transition) and the
 * backfill job (for fixtures that were missed).
 */
async function upsertFixtureEventsAndStats(fixtureId: number): Promise<void> {
  const [events, stats, lineups] = await Promise.all([
    fetchFixtureEvents(fixtureId),
    fetchFixtureStats(fixtureId),
    fetchFixtureLineups(fixtureId),
  ]);

  if (events && events.length > 0) {
    await db.delete(fixtureEvents).where(eq(fixtureEvents.fixtureId, fixtureId));
    for (const ev of events) {
      await db.insert(fixtureEvents).values({
        fixtureId,
        minute: ev.time.elapsed,
        extraMinute: ev.time.extra,
        teamId: ev.team.id,
        playerId: ev.player?.id ?? null,
        playerName: ev.player?.name ?? null,
        assistId: ev.assist?.id ?? null,
        assistName: ev.assist?.name ?? null,
        type: ev.type,
        detail: ev.detail,
        comments: ev.comments,
      });
    }
  }

  if (stats) {
    for (const teamStat of stats) {
      const getValue = (type: string): number | null => {
        const item = teamStat.statistics.find((s: ApiStatItem) => s.type === type);
        if (!item || item.value === null || item.value === undefined) return null;
        const val = String(item.value).replace("%", "");
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      };
      await db
        .insert(fixtureStats)
        .values({
          fixtureId,
          teamId: teamStat.team.id,
          shotsOnGoal: getValue("Shots on Goal"),
          shotsOffGoal: getValue("Shots off Goal"),
          totalShots: getValue("Total Shots"),
          blockedShots: getValue("Blocked Shots"),
          cornerKicks: getValue("Corner Kicks"),
          fouls: getValue("Fouls"),
          yellowCards: getValue("Yellow Cards"),
          redCards: getValue("Red Cards"),
          ballPossession: getValue("Ball Possession"),
          passAccuracy: getValue("Passes %"),
          totalPasses: getValue("Total passes"),
          expectedGoals: getValue("expected_goals"),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [fixtureStats.fixtureId, fixtureStats.teamId],
          set: {
            shotsOnGoal: getValue("Shots on Goal"),
            shotsOffGoal: getValue("Shots off Goal"),
            totalShots: getValue("Total Shots"),
            blockedShots: getValue("Blocked Shots"),
            cornerKicks: getValue("Corner Kicks"),
            fouls: getValue("Fouls"),
            yellowCards: getValue("Yellow Cards"),
            redCards: getValue("Red Cards"),
            ballPossession: getValue("Ball Possession"),
            passAccuracy: getValue("Passes %"),
            totalPasses: getValue("Total passes"),
            expectedGoals: getValue("expected_goals"),
            updatedAt: new Date(),
          },
        });
    }
  }

  if (lineups) {
    for (const lineup of lineups) {
      await db
        .insert(fixtureLineups)
        .values({
          fixtureId,
          teamId: lineup.team.id,
          formation: lineup.formation ?? null,
          startingXI: lineup.startXI ?? [],
          substitutes: lineup.substitutes ?? [],
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [fixtureLineups.fixtureId, fixtureLineups.teamId],
          set: {
            formation: lineup.formation ?? null,
            startingXI: lineup.startXI ?? [],
            substitutes: lineup.substitutes ?? [],
            updatedAt: new Date(),
          },
        });
    }
  }
}

// ─── Missed post-match review sweep ───────────────────────────────────────────
/**
 * Finds ai_betting_tips with outcome IS NULL where the fixture has already
 * finished (status FT/AET/PEN). Triggers triggerPostMatchReview for each
 * unique fixture, rate-limited to 1 per 8 seconds to avoid AI overload.
 *
 * Safe to run repeatedly — triggerPostMatchReview is idempotent (skips if
 * all tips for a fixture already have outcomes).
 */
async function sweepMissedPostMatchReviews(): Promise<void> {
  try {
    // Find fixtures that have pending tips but the match is already finished
    const rows = await db
      .selectDistinct({ fixtureId: aiBettingTips.fixtureId })
      .from(aiBettingTips)
      .innerJoin(fixtures, eq(fixtures.fixtureId, aiBettingTips.fixtureId))
      .where(
        and(
          isNull(aiBettingTips.outcome),
          ne(aiBettingTips.betType, "no_bet"),
          inArray(fixtures.statusShort, ["FT", "AET", "PEN"]),
          gte(aiBettingTips.kickoff, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        )
      )
      .orderBy(aiBettingTips.fixtureId);

    if (rows.length === 0) return;

    console.log(`[review-sweep] Found ${rows.length} fixture(s) with pending tips — reviewing...`);

    for (const row of rows) {
      await triggerPostMatchReview(row.fixtureId);
      // Rate-limit: 1 review per 8 seconds to avoid hammering Claude
      await new Promise(r => setTimeout(r, 8_000));
    }

    console.log(`[review-sweep] Done reviewing ${rows.length} fixture(s)`);
  } catch (err) {
    console.warn("[review-sweep] Failed:", err);
  }
}

// ─── Edge backfill (one-shot migration) ───────────────────────────────────────
/**
 * Populates ai_probability and edge for any tips that are missing them.
 * Uses the trust_score / 10 fallback formula. Runs once at startup.
 * Safe to run repeatedly — only touches rows where edge IS NULL.
 */
async function backfillMissingEdge(): Promise<void> {
  try {
    const updated = await db
      .update(aiBettingTips)
      .set({
        aiProbability: sql`ROUND((trust_score / 10.0)::numeric, 4)`,
        edge: sql`CASE WHEN market_odds IS NOT NULL AND market_odds > 1 THEN ROUND(((trust_score / 10.0 * market_odds) - 1)::numeric, 4) ELSE NULL END`,
      })
      .where(isNull(aiBettingTips.edge))
      .returning({ id: aiBettingTips.id });
    if (updated.length > 0) {
      console.log(`[edge-backfill] Populated edge for ${updated.length} tips`);
    }
  } catch (err) {
    console.warn("[edge-backfill] Failed:", err);
  }
}

// ─── Post-match data backfill ─────────────────────────────────────────────────
/**
 * Finds finished fixtures from the last 14 days that have no events in the DB
 * and fetches their events, stats, and lineups. Processes up to 20 per run to
 * stay within API rate limits. Runs at startup and every 2h.
 */
async function backfillPostMatchData(): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const FINISHED = ["FT", "AET", "PEN"] as const;

  // Find finished fixtures in the last 14 days
  const finished = await db.query.fixtures.findMany({
    where: (f, { inArray, gte, and }) =>
      and(inArray(f.statusShort, [...FINISHED]), gte(f.kickoff!, cutoff)),
    columns: { fixtureId: true, homeTeamName: true, awayTeamName: true },
    limit: 200,
  });

  if (finished.length === 0) return;

  // Find which ones already have events
  const finishedIds = finished.map((f) => f.fixtureId);
  const withEvents = await db.query.fixtureEvents.findMany({
    where: (e, { inArray }) => inArray(e.fixtureId, finishedIds),
    columns: { fixtureId: true },
  });
  const hasEventsSet = new Set(withEvents.map((e) => e.fixtureId));

  const missing = finished.filter((f) => !hasEventsSet.has(f.fixtureId));
  if (missing.length === 0) {
    console.log("[backfill] All finished fixtures have event data");
    return;
  }

  const batch = missing.slice(0, 20);
  console.log(`[backfill] Fetching events+stats for ${batch.length} of ${missing.length} finished fixtures missing data`);

  for (const f of batch) {
    try {
      await upsertFixtureEventsAndStats(f.fixtureId);
      cacheDel(`fixture:${f.fixtureId}`);
      console.log(`[backfill] ${f.homeTeamName} vs ${f.awayTeamName} (${f.fixtureId}) done`);
      await new Promise((r) => setTimeout(r, 300)); // rate-limit friendly
    } catch (err) {
      console.warn(`[backfill] Failed for fixture ${f.fixtureId}:`, err);
    }
  }
}

// ─── Historical weather backfill ──────────────────────────────────────────────
/**
 * Backfills weather data for finished fixtures using Open-Meteo's free historical
 * archive API (no API key needed, data from 1940 to present).
 * Processes up to BATCH_SIZE fixtures per call, using geocoding cache to avoid
 * re-geocoding the same cities. Runs hourly until all historical data is filled.
 */
const POST_MATCH_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"] as const;
const BACKFILL_BATCH = 100;

async function backfillHistoricalWeather() {
  const unweathered = await db.query.fixtures.findMany({
    where: (f, { inArray, isNull, and }) =>
      and(
        inArray(f.statusShort, [...POST_MATCH_STATUSES]),
        isNull(f.weatherDesc)
      ),
    limit: BACKFILL_BATCH,
    orderBy: (f, { desc }) => [desc(f.kickoff)], // most recent first
  });

  if (unweathered.length === 0) {
    console.log("[weather-backfill] All finished fixtures have weather data");
    return;
  }

  console.log(`[weather-backfill] Processing ${unweathered.length} finished fixtures`);
  let filled = 0;
  let failed = 0;

  for (const f of unweathered) {
    try {
      if (!f.kickoff) { failed++; continue; }

      // Try venue city first, then fall back to venue name (stadium)
      const cityName = f.venueCity?.trim() || (f.venue ?? "").split(",")[0]?.trim();
      if (!cityName) { failed++; continue; }

      const coords = await geocodeCity(cityName);
      if (!coords) {
        // If venue name geocoding failed, skip — venue_city will be populated by pollers eventually
        failed++;
        continue;
      }

      const kickoffUnix = Math.floor(f.kickoff.getTime() / 1000);
      const w = await fetchHistoricalWeather(coords.lat, coords.lon, kickoffUnix);
      if (!w) { failed++; continue; }

      await db
        .update(fixtures)
        .set({
          weatherTemp: w.temp,
          weatherDesc: w.desc,
          weatherIcon: w.icon,
          weatherWind: w.wind,
          weatherHumidity: w.humidity,
          weatherFetchedAt: new Date(),
        })
        .where(eq(fixtures.fixtureId, f.fixtureId));

      filled++;
      // Small delay to avoid hammering Open-Meteo
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.warn(`[weather-backfill] Error for fixture ${f.fixtureId}:`, err);
      failed++;
    }
  }

  console.log(`[weather-backfill] Done — ${filled} filled, ${failed} skipped/failed (${unweathered.length - filled - failed} remaining in batch)`);
}

// ─── Daily 5am Signal Pre-computation ─────────────────────────────────────────
/**
 * Pre-computes pre-match features and signals for ALL of today's upcoming fixtures.
 * Results are persisted in the fixture_signals DB table, so users see signals
 * immediately without waiting for the 90-minute lineup window.
 */
async function dailySignalPrecompute() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(
        gte(f.kickoff, now),
        lte(f.kickoff, in7Days),
        inArray(f.statusShort, ["NS", "TBD"])
      ),
  });

  console.log(`[signal-cron] Pre-computing signals for ${upcoming.length} fixtures (next 7 days)`);
  let computed = 0;

  for (const fix of upcoming) {
    try {
      await runPreMatchFeatures(fix.fixtureId, fix.homeTeamId, fix.awayTeamId);
      await runSignalEngine(fix.fixtureId, "pre");
      computed++;
    } catch (err) {
      console.error(`[signal-cron] Error for fixture ${fix.fixtureId}:`, err);
    }
  }

  console.log(`[signal-cron] Done — ${computed}/${upcoming.length} fixtures pre-computed`);

  // After signals are fresh, generate AI tips (only called from 5am cron, odds exist by then)
  if (computed > 0) {
    await bulkGenerateAiTips(200);
  }
}

/**
 * One-shot signal computation at startup — catches all upcoming fixtures
 * that already have data in the DB but no signals yet (e.g. after a fresh deploy).
 * Runs 14 minutes after startup so heavy sync jobs finish first.
 */
async function startupSignalCompute() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(
        gte(f.kickoff, now),
        lte(f.kickoff, in7Days),
        inArray(f.statusShort, ["NS", "TBD"])
      ),
  });

  if (upcoming.length === 0) return;

  // Find which fixtures already have pre-match signals stored in DB — skip those
  const existingSignals = await db.query.fixtureSignals.findMany({
    where: (s, { and, inArray: inArr, eq: eqFn }) =>
      and(
        inArr(s.fixtureId, upcoming.map((f) => f.fixtureId)),
        eqFn(s.phase, "pre")
      ),
    columns: { fixtureId: true },
  });
  const alreadyComputed = new Set(existingSignals.map((s) => s.fixtureId));
  const toCompute = upcoming.filter((f) => !alreadyComputed.has(f.fixtureId));

  if (toCompute.length === 0) {
    console.log(`[signal-startup] All ${upcoming.length} upcoming fixtures already have signals`);
    return;
  }

  console.log(`[signal-startup] Computing signals for ${toCompute.length}/${upcoming.length} fixtures (${alreadyComputed.size} already had signals)`);
  let computed = 0;

  for (const fix of toCompute) {
    try {
      await runPreMatchFeatures(fix.fixtureId, fix.homeTeamId, fix.awayTeamId);
      await runSignalEngine(fix.fixtureId, "pre");
      computed++;
    } catch (err) {
      console.error(`[signal-startup] Error for fixture ${fix.fixtureId}:`, err);
    }
  }

  console.log(`[signal-startup] Done — ${computed}/${toCompute.length} newly computed`);
}

/**
 * Generates AI betting tips (via Claude) for all upcoming fixtures that have
 * odds data but are missing tips in the DB. Safe to call multiple times —
 * getBettingTips() skips fixtures already having ≥10 tips.
 * Processes up to BATCH_SIZE per call to avoid hammering the AI API.
 */
export async function bulkGenerateAiTips(batchSize = 30): Promise<void> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte, inArray }) =>
      and(
        gte(f.kickoff, now),
        lte(f.kickoff, in7Days),
        inArray(f.statusShort, ["NS", "TBD"])
      ),
    columns: { fixtureId: true, homeTeamName: true, awayTeamName: true },
  });

  if (upcoming.length === 0) return;

  // Find fixtures that already have ≥3 tips — skip those
  const existingTips = await db.query.aiBettingTips.findMany({
    where: (t, { inArray: inArr }) =>
      inArr(t.fixtureId, upcoming.map((f) => f.fixtureId)),
    columns: { fixtureId: true },
  });
  const tipCount = new Map<number, number>();
  for (const t of existingTips) {
    tipCount.set(t.fixtureId, (tipCount.get(t.fixtureId) ?? 0) + 1);
  }
  const missing = upcoming.filter((f) => (tipCount.get(f.fixtureId) ?? 0) < 10);

  if (missing.length === 0) {
    console.log(`[ai-tips] All ${upcoming.length} upcoming fixtures already have 10 tips`);
    return;
  }

  const batch = missing.slice(0, batchSize);
  console.log(`[ai-tips] Generating tips for ${batch.length} of ${missing.length} fixtures missing picks`);
  let ok = 0;
  let skipped = 0;

  for (const fix of batch) {
    try {
      const tips = await getBettingTips(fix.fixtureId);
      if (tips) ok++;
      else skipped++;
    } catch (err) {
      console.error(`[ai-tips] Error for fixture ${fix.fixtureId}:`, err);
      skipped++;
    }
  }

  console.log(`[ai-tips] Done — ${ok} generated, ${skipped} skipped (no odds/error)`);
}

// ─── Midnight odds sweep ───────────────────────────────────────────────────────

async function runMidnightOddsSweep() {
  console.log("[midnight-odds] Full odds sweep for upcoming week starting");
  await syncOdds().catch(console.error);
  await syncOddsAllMarketsForUpcoming().catch(console.error);
  await syncOddsForUpcomingWeek().catch(console.error);
  console.log("[midnight-odds] Full odds sweep complete");
}

async function scheduleMidnightOddsSweep() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const lastRunKey = "midnight-odds-cron:lastRun";
  const lastRun = await kvGet(lastRunKey);

  // Midnight sweep: runs once per day at 00:00 UTC
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(0, 0, 0, 0);
  if (nextMidnight.getTime() <= now.getTime()) nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);

  if (lastRun !== todayStr) {
    const minLate = Math.round((now.getTime() - new Date(now.toISOString().slice(0,10) + "T00:00:00Z").getTime()) / 60_000);
    console.log(`[midnight-odds] Missed today's sweep by ${minLate} min — running catch-up now`);
    await kvSet(lastRunKey, todayStr);
    runMidnightOddsSweep().catch(console.error);
  } else {
    console.log(`[midnight-odds] Already ran today (${todayStr}) — next at ${nextMidnight.toISOString()}`);
  }

  const msUntilNext = nextMidnight.getTime() - now.getTime();
  setTimeout(async () => {
    const d = new Date().toISOString().slice(0, 10);
    await kvSet(lastRunKey, d);
    runMidnightOddsSweep().catch(console.error);
    setInterval(async () => {
      const d2 = new Date().toISOString().slice(0, 10);
      await kvSet(lastRunKey, d2);
      runMidnightOddsSweep().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// ─── Fixed-time AI tips cron (06:00, 12:00, 18:00 UTC) ────────────────────────

async function scheduleAiTipsAtHour(utcHour: number) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const padded = String(utcHour).padStart(2, "0");
  const lastRunKey = `ai-tips-cron:${padded}:lastRun`;
  const lastRun = await kvGet(lastRunKey);

  const nextRun = new Date(now);
  nextRun.setUTCHours(utcHour, 0, 0, 0);
  if (nextRun.getTime() <= now.getTime()) nextRun.setUTCDate(nextRun.getUTCDate() + 1);

  const pastHourToday = now.getUTCHours() >= utcHour;
  if (pastHourToday && lastRun !== todayStr) {
    const minLate = Math.round((now.getTime() - new Date(`${todayStr}T${padded}:00:00Z`).getTime()) / 60_000);
    console.log(`[ai-tips-cron] Missed ${padded}:00 UTC run by ${minLate} min — running catch-up now`);
    await kvSet(lastRunKey, todayStr);
    bulkGenerateAiTips(200).catch(console.error);
  } else if (lastRun !== todayStr) {
    console.log(`[ai-tips-cron] Next ${padded}:00 UTC run in ${Math.round((nextRun.getTime() - now.getTime()) / 60_000)} min`);
  } else {
    console.log(`[ai-tips-cron] ${padded}:00 UTC already ran today — next at ${nextRun.toISOString()}`);
  }

  const msUntilNext = nextRun.getTime() - now.getTime();
  setTimeout(async () => {
    const d = new Date().toISOString().slice(0, 10);
    await kvSet(lastRunKey, d);
    bulkGenerateAiTips(200).catch(console.error);
    setInterval(async () => {
      const d2 = new Date().toISOString().slice(0, 10);
      await kvSet(lastRunKey, d2);
      bulkGenerateAiTips(200).catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// ─── Daily signal pre-compute (05:00 UTC) ─────────────────────────────────────

async function scheduleDailySignalCron() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const lastRunKey = "signal-cron:lastRun";

  // Check if we already ran the cron today
  const lastRun = await kvGet(lastRunKey);
  const alreadyRanToday = lastRun === todayStr;

  // Compute next 5am UTC
  const next5amUTC = new Date(now);
  next5amUTC.setUTCHours(5, 0, 0, 0);
  if (next5amUTC <= now) next5amUTC.setUTCDate(next5amUTC.getUTCDate() + 1);

  const past5amToday = now.getUTCHours() >= 5;

  if (past5amToday && !alreadyRanToday) {
    // Missed today's 5am cron (server was down) — run now as catch-up
    const minLate = Math.round((now.getTime() - new Date(now).setUTCHours(5,0,0,0)) / 60_000);
    console.log(`[signal-cron] Missed today's 5am run by ${minLate} min — running catch-up now`);
    await kvSet(lastRunKey, todayStr);
    dailySignalPrecompute().catch(console.error);
  } else if (!alreadyRanToday) {
    console.log(`[signal-cron] Next 5am UTC run in ${Math.round((next5amUTC.getTime() - now.getTime()) / 60_000)} min (${next5amUTC.toISOString()})`);
  } else {
    console.log(`[signal-cron] Already ran today (${todayStr}) — next run at ${next5amUTC.toISOString()}`);
  }

  // Schedule all future 5am UTC runs
  const msUntilNext = next5amUTC.getTime() - now.getTime();
  setTimeout(async () => {
    const d = new Date().toISOString().slice(0, 10);
    await kvSet(lastRunKey, d);
    dailySignalPrecompute().catch(console.error);
    setInterval(async () => {
      const d2 = new Date().toISOString().slice(0, 10);
      await kvSet(lastRunKey, d2);
      dailySignalPrecompute().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// ─── Force sync cron (runs at configurable UTC hours) ─────────────────────────

async function scheduleForceSync(utcHour: number) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const padded = String(utcHour).padStart(2, "0");
  const lastRunKey = `force-sync-cron:${padded}:lastRun`;
  const lastRun = await kvGet(lastRunKey);

  const nextRun = new Date(now);
  nextRun.setUTCHours(utcHour, 0, 0, 0);
  if (nextRun.getTime() <= now.getTime()) nextRun.setUTCDate(nextRun.getUTCDate() + 1);

  const pastHourToday = now.getUTCHours() >= utcHour;
  if (pastHourToday && lastRun !== todayStr) {
    const minLate = Math.round((now.getTime() - new Date(`${todayStr}T${padded}:00:00Z`).getTime()) / 60_000);
    console.log(`[force-sync-cron] Missed ${padded}:00 UTC run by ${minLate} min — running catch-up now`);
    await kvSet(lastRunKey, todayStr);
    forceFullSync().catch(console.error);
  } else if (lastRun !== todayStr) {
    console.log(`[force-sync-cron] Next ${padded}:00 UTC run in ${Math.round((nextRun.getTime() - now.getTime()) / 60_000)} min`);
  } else {
    console.log(`[force-sync-cron] ${padded}:00 UTC already ran today — next at ${nextRun.toISOString()}`);
  }

  const msUntilNext = nextRun.getTime() - now.getTime();
  setTimeout(async () => {
    const d = new Date().toISOString().slice(0, 10);
    await kvSet(lastRunKey, d);
    forceFullSync().catch(console.error);
    setInterval(async () => {
      const d2 = new Date().toISOString().slice(0, 10);
      await kvSet(lastRunKey, d2);
      forceFullSync().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

export interface ForceSyncResult {
  fixtures: number;
  oddsFetched: number;
  predictionsFetched: number;
  h2hFetched: number;
  injuriesFetched: number;
  tipsQueued: number;
}

/**
 * Fill-gaps sync for all upcoming fixtures in the next 7 days.
 * Only fetches data that is genuinely missing from the database.
 * Does NOT re-fetch or overwrite data that already exists.
 */
export async function forceFullSync(onProgress?: (msg: string) => void): Promise<ForceSyncResult> {
  const log = (msg: string) => {
    console.log(`[force-full-sync] ${msg}`);
    onProgress?.(msg);
  };

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── 1. Sync fixture lists for next 7 days (upsert — safe to always run) ──
  log("Syncing fixture lists for next 7 days...");
  for (let i = 0; i < 7; i++) {
    const date = getDateOffset(i);
    await syncFixturesForDate(date).catch(console.error);
  }

  // ── 2. Get all upcoming NS/TBD fixtures in 7-day window ──────────────────
  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and: andFn, gte: gteFn, lte, inArray: inArr }) =>
      andFn(gteFn(f.kickoff, now), lte(f.kickoff, in7d), inArr(f.statusShort, ["NS", "TBD"])),
  });
  log(`Found ${upcoming.length} upcoming fixtures`);
  if (upcoming.length === 0) return { fixtures: 0, oddsFetched: 0, predictionsFetched: 0, h2hFetched: 0, injuriesFetched: 0, tipsQueued: 0 };

  const allIds = upcoming.map((f) => f.fixtureId);
  const result: ForceSyncResult = { fixtures: upcoming.length, oddsFetched: 0, predictionsFetched: 0, h2hFetched: 0, injuriesFetched: 0, tipsQueued: 0 };

  // ── 3. Odds: only fetch for fixtures that have NO odds at all ─────────────
  const withOdds = new Set(
    (await db.selectDistinct({ fixtureId: oddsMarkets.fixtureId })
      .from(oddsMarkets)
      .where(inArray(oddsMarkets.fixtureId, allIds))
    ).map((r) => r.fixtureId)
  );
  const missingOdds = upcoming.filter((f) => !withOdds.has(f.fixtureId));
  log(`Odds: ${withOdds.size} already have odds, fetching for ${missingOdds.length} missing`);
  result.oddsFetched = missingOdds.length;

  for (const fix of missingOdds) {
    const seen = new Set<string>();
    const snappedAt = new Date();

    const markets = await fetchOddsAllMarkets(fix.fixtureId).catch(() => null);
    if (markets) {
      for (const m of markets) {
        if (seen.has(m.bookmaker)) continue;
        seen.add(m.bookmaker);
        await db.insert(oddsMarkets).values({
          fixtureId: fix.fixtureId,
          bookmaker: m.bookmaker,
          markets: m.markets as Record<string, unknown>,
          snappedAt,
        }).onConflictDoNothing();
      }
    }

    for (const [bmId, bmName] of Object.entries(PRIORITY_BOOKMAKER_IDS)) {
      if (seen.has(bmName)) continue;
      const bmOdds = await fetchOddsForBookmaker(fix.fixtureId, Number(bmId)).catch(() => null);
      if (!bmOdds || bmOdds.bookmakers.length === 0) continue;
      const bm = bmOdds.bookmakers[0]!;
      seen.add(bm.name);
      const mkt: Record<string, Array<{ value: string; odd: string }>> = {};
      for (const bet of bm.bets) {
        mkt[bet.name] = bet.values.map((v) => ({ value: v.value, odd: v.odd }));
      }
      await db.insert(oddsMarkets).values({
        fixtureId: fix.fixtureId,
        bookmaker: bm.name,
        markets: mkt as Record<string, unknown>,
        snappedAt,
      }).onConflictDoNothing();
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  log("Odds done");

  // ── 4. Predictions: only fetch for fixtures that have NO prediction ────────
  const withPredictions = new Set(
    (await db.select({ fixtureId: predictions.fixtureId })
      .from(predictions)
      .where(inArray(predictions.fixtureId, allIds))
    ).map((r) => r.fixtureId)
  );
  const missingPredictions = upcoming.filter((f) => !withPredictions.has(f.fixtureId));
  log(`Predictions: ${withPredictions.size} already present, fetching ${missingPredictions.length} missing`);
  result.predictionsFetched = missingPredictions.length;

  for (const fix of missingPredictions) {
    await syncPredictionForFixture(fix.fixtureId).catch(console.error);
    await new Promise((r) => setTimeout(r, 100));
  }
  log("Predictions done");

  // ── 5. H2H: only fetch for team pairs that have NO h2h data ──────────────
  log("Syncing H2H for pairs with no existing data...");
  for (const fix of upcoming) {
    if (!fix.homeTeamId || !fix.awayTeamId) continue;
    const existing = await db.query.h2hFixtures.findFirst({
      where: (h, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(h.forTeam1Id, fix.homeTeamId!), eqFn(h.forTeam2Id, fix.awayTeamId!)),
    });
    if (existing) continue; // Already have H2H for this pair
    result.h2hFetched++;

    const data = await fetchH2H(fix.homeTeamId, fix.awayTeamId, 10).catch(() => null);
    if (!data) continue;
    for (const entry of data) {
      if (!["FT", "AET", "PEN"].includes(entry.fixture.status.short)) continue;
      await db.insert(h2hFixtures).values({
        fixtureId: entry.fixture.id,
        leagueId: entry.league.id,
        leagueName: entry.league.name,
        seasonYear: entry.league.season,
        homeTeamId: entry.teams.home.id,
        homeTeamName: entry.teams.home.name,
        homeTeamLogo: entry.teams.home.logo,
        awayTeamId: entry.teams.away.id,
        awayTeamName: entry.teams.away.name,
        awayTeamLogo: entry.teams.away.logo,
        homeGoals: entry.goals.home,
        awayGoals: entry.goals.away,
        kickoff: entry.fixture.date ? new Date(entry.fixture.date) : null,
        statusShort: entry.fixture.status.short,
        forTeam1Id: fix.homeTeamId,
        forTeam2Id: fix.awayTeamId,
      }).onConflictDoNothing();
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  log("H2H done");

  // ── 6. Injuries: only fetch for fixtures that have NO injury data ──────────
  const withInjuries = new Set(
    (await db.selectDistinct({ fixtureId: injuries.fixtureId })
      .from(injuries)
      .where(inArray(injuries.fixtureId, allIds))
    ).map((r) => r.fixtureId)
  );
  const missingInjuries = upcoming.filter((f) => !withInjuries.has(f.fixtureId));
  log(`Injuries: ${withInjuries.size} already present, fetching ${missingInjuries.length} missing`);
  result.injuriesFetched = missingInjuries.length;

  for (const fix of missingInjuries) {
    const data = await fetchFixtureInjuries(fix.fixtureId).catch(() => null);
    if (!data || data.length === 0) continue;
    for (const inj of data) {
      await db.insert(injuries).values({
        fixtureId: fix.fixtureId,
        playerId: inj.player.id,
        playerName: inj.player.name,
        teamId: inj.team.id,
        type: inj.player.type,
        reason: inj.player.reason,
      }).onConflictDoNothing();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  log("Injuries done");

  // ── 7. AI tips: only generate for fixtures that have fewer than 10 tips ───
  log("Generating AI tips for fixtures with missing tips...");
  const tipsCountRows = await db
    .selectDistinct({ fixtureId: aiBettingTips.fixtureId })
    .from(aiBettingTips)
    .where(inArray(aiBettingTips.fixtureId, allIds));
  const withTips = new Set(tipsCountRows.map((r) => r.fixtureId));
  result.tipsQueued = upcoming.filter((f) => !withTips.has(f.fixtureId)).length;
  // bulkGenerateAiTips already skips fixtures with ≥10 tips — no delete needed
  bulkGenerateAiTips(upcoming.length).catch(console.error);
  log(`AI tip generation queued in background (${result.tipsQueued} fixtures need tips)`);

  return result;
}

/**
 * Force-sync odds for a single fixture from API-Football, bypassing the freshness cache.
 * Returns true if any odds were written to the DB.
 */
export async function syncOddsForFixture(fixtureId: number): Promise<boolean> {
  const seen = new Set<string>();
  const snappedAt = new Date();
  let wrote = false;

  const markets = await fetchOddsAllMarkets(fixtureId);
  if (markets) {
    for (const m of markets) {
      if (seen.has(m.bookmaker)) continue;
      seen.add(m.bookmaker);
      await db.delete(oddsMarkets).where(
        and(eq(oddsMarkets.fixtureId, fixtureId), eq(oddsMarkets.bookmaker, m.bookmaker))
      );
      await db.insert(oddsMarkets).values({
        fixtureId,
        bookmaker: m.bookmaker,
        markets: m.markets as Record<string, unknown>,
        snappedAt,
      });
      wrote = true;
    }
  }

  for (const [bmId, bmName] of Object.entries(PRIORITY_BOOKMAKER_IDS)) {
    if (seen.has(bmName)) continue;
    const bmOdds = await fetchOddsForBookmaker(fixtureId, Number(bmId));
    if (!bmOdds || bmOdds.bookmakers.length === 0) continue;
    const bm = bmOdds.bookmakers[0]!;
    seen.add(bm.name);
    const mkt: Record<string, Array<{ value: string; odd: string }>> = {};
    for (const bet of bm.bets) {
      mkt[bet.name] = bet.values.map((v) => ({ value: v.value, odd: v.odd }));
    }
    await db.delete(oddsMarkets).where(
      and(eq(oddsMarkets.fixtureId, fixtureId), eq(oddsMarkets.bookmaker, bm.name))
    );
    await db.insert(oddsMarkets).values({
      fixtureId,
      bookmaker: bm.name,
      markets: mkt as Record<string, unknown>,
      snappedAt,
    });
    wrote = true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return wrote;
}

export function startPoller() {
  if (pollerStarted) return;
  pollerStarted = true;

  console.log("[poller] Starting polling service (Ultra plan — 75k req/day, 500 req/min)");

  // ── Load persisted stats from DB (survive restarts) ───────────────────────
  initApiStats().catch(console.error);
  initAiStats().catch(console.error);

  // ── One-shot migration: populate edge for tips missing it ─────────────────
  backfillMissingEdge().catch(console.error);

  // ── Sweep: trigger post-match reviews for tips still pending ──────────────
  sweepMissedPostMatchReviews().catch(console.error);

  // ── Immediate startup syncs ────────────────────────────────────────────────
  syncNearTermFixtures().catch(console.error);
  syncRecentResults().catch(console.error); // Yesterday + day before at startup
  syncStandings().catch(console.error);

  // Staggered startup for full 7-day window + heavy syncs (avoids API burst)
  setTimeout(() => syncTodayFixtures().catch(console.error), 30 * 1000);
  setTimeout(() => syncCoachesForKnownTeams().catch(console.error), 60 * 1000);
  setTimeout(() => syncTransfersForTrackedTeams().catch(console.error), 90 * 1000);
  setTimeout(() => syncH2HForUpcomingFixtures().catch(console.error), 2 * 60 * 1000);
  setTimeout(() => syncOdds().catch(console.error), 2.5 * 60 * 1000);
  // Immediate AI tips pass: runs 10s after boot using whatever is already in DB
  setTimeout(() => bulkGenerateAiTips(200).catch(console.error), 10 * 1000);
  // Second early pass: after odds sync has refreshed
  setTimeout(() => bulkGenerateAiTips(200).catch(console.error), 3 * 60 * 1000);
  setTimeout(() => syncVenuesAndInfoForKnownTeams().catch(console.error), 3.5 * 60 * 1000);
  setTimeout(() => syncTeamSeasonStats().catch(console.error), 4 * 60 * 1000);
  setTimeout(() => syncTopScorersAndAssists().catch(console.error), 5 * 60 * 1000);
  setTimeout(() => syncTopDiscipline().catch(console.error), 6 * 60 * 1000);
  setTimeout(() => syncTrophiesForKnownTeams().catch(console.error), 7 * 60 * 1000);
  setTimeout(() => syncPlayerProfilesForTopPlayers().catch(console.error), 8 * 60 * 1000);
  setTimeout(() => syncOddsAllMarketsForUpcoming().catch(console.error), 9 * 60 * 1000);
  // Week-ahead odds sweep: covers fixtures 48h-7d so AI tips have odds data
  setTimeout(() => syncOddsForUpcomingWeek().catch(console.error), 9.5 * 60 * 1000);
  setTimeout(() => syncSquadsForUpcomingTeams().catch(console.error), 10 * 60 * 1000);
  setTimeout(() => syncFixtureInjuriesForUpcoming().catch(console.error), 11 * 60 * 1000);
  setTimeout(() => syncSidelinedForRecentPlayers().catch(console.error), 12 * 60 * 1000);
  setTimeout(() => syncWeatherForUpcomingFixtures().catch(console.error), 13 * 60 * 1000);
  // Second AI tips pass: runs after week-ahead odds sweep has fresh data
  setTimeout(() => bulkGenerateAiTips(200).catch(console.error), 14 * 60 * 1000);
  // Historical weather backfill: starts 15 min after boot
  setTimeout(() => backfillHistoricalWeather().catch(console.error), 15 * 60 * 1000);
  // Signal computation for all upcoming fixtures — runs in parallel with AI tips, not blocking them
  setTimeout(() => startupSignalCompute().catch(console.error), 16 * 60 * 1000);
  // Post-match events+stats backfill: starts 20 min after boot
  setTimeout(() => backfillPostMatchData().catch(console.error), 20 * 60 * 1000);

  // ── Recurring intervals ────────────────────────────────────────────────────

  // Today + tomorrow fixtures: every 15 min — live scores handled by adaptiveLiveLoop
  setInterval(() => syncNearTermFixtures().catch(console.error), 15 * 60 * 1000);

  // Yesterday + day before (FT results): every 2 hours — finished games rarely change
  setInterval(() => syncRecentResults().catch(console.error), 2 * 60 * 60 * 1000);

  // Missed post-match review sweep: every 3 hours to catch any pending tips
  setInterval(() => sweepMissedPostMatchReviews().catch(console.error), 3 * 60 * 60 * 1000);

  // Full window -3 to +7 days: every 2 hours
  setInterval(() => syncTodayFixtures().catch(console.error), 2 * 60 * 60 * 1000);

  // Standings: every 2 hours (updates after match ends, not mid-game)
  setInterval(() => syncStandings().catch(console.error), 2 * 60 * 60 * 1000);

  // Pre-match lineups + base odds + injuries: every 5 min
  setInterval(() => {
    syncPreMatchData().catch(console.error);
    syncOdds().catch(console.error);
    syncFixtureInjuriesForUpcoming().catch(console.error);
  }, 5 * 60 * 1000);

  // Full odds markets (all bookmakers, all bet types): every 30 min is enough
  setInterval(() => syncOddsAllMarketsForUpcoming().catch(console.error), 30 * 60 * 1000);

  // H2H: every 6 hours (changes only before a new fixture)
  setInterval(() => syncH2HForUpcomingFixtures().catch(console.error), 6 * 60 * 60 * 1000);

  // Week-ahead odds sweep: every 12 hours (fills odds for fixtures 2-7 days out)
  setInterval(() => syncOddsForUpcomingWeek().catch(console.error), 12 * 60 * 60 * 1000);

  // AI tips are now driven by fixed-time crons (06:00, 12:00, 18:00 UTC)
  // scheduled via scheduleAiTipsAtHour() below — no interval needed here.

  // Team season stats: every 2 hours (more frequent = fresher form indicators)
  setInterval(() => syncTeamSeasonStats().catch(console.error), 2 * 60 * 60 * 1000);

  // Top scorers + assists + discipline: every 6 hours
  setInterval(() => {
    syncTopScorersAndAssists().catch(console.error);
    syncTopDiscipline().catch(console.error);
  }, 6 * 60 * 60 * 1000);

  // Player profiles + sidelined: every 12 hours
  setInterval(() => {
    syncPlayerProfilesForTopPlayers().catch(console.error);
    syncSidelinedForRecentPlayers().catch(console.error);
  }, 12 * 60 * 60 * 1000);

  // Squads: every 12 hours (squads change rarely mid-season)
  setInterval(() => syncSquadsForUpcomingTeams().catch(console.error), 12 * 60 * 60 * 1000);

  // Coaches + transfers + venues + trophies: once per day
  setInterval(() => {
    syncCoachesForKnownTeams().catch(console.error);
    syncTransfersForTrackedTeams().catch(console.error);
    syncVenuesAndInfoForKnownTeams().catch(console.error);
    syncTrophiesForKnownTeams().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  // Weather: every 3 hours (forecast accuracy degrades over time)
  setInterval(() => syncWeatherForUpcomingFixtures().catch(console.error), 3 * 60 * 60 * 1000);

  // Historical weather backfill: every hour (100 fixtures/run) until all finished fixtures have data
  setInterval(() => backfillHistoricalWeather().catch(console.error), 60 * 60 * 1000);

  // Post-match events+stats backfill: every 2 hours (20 fixtures/run) until all caught up
  setInterval(() => backfillPostMatchData().catch(console.error), 2 * 60 * 60 * 1000);

  // Closing-line capture: every 60s, snapshots last pre-kickoff odds for AI tips
  // on fixtures kicking off within the next 3 minutes (Fase 1.2)
  setInterval(() => captureClosingOdds().catch(console.error), 60 * 1000);

  // Adaptive live loop: sprints at 15s for tracked live matches, idles at 2min
  adaptiveLiveLoop().catch(console.error);

  // Historical data seed: only run if database has no past-season fixtures yet.
  // Runs once at startup (60s delay). Can always be triggered manually via admin panel.
  setTimeout(() => seedHistoricalIfNeeded().catch(console.error), 60 * 1000);

  // ── Fixed-time daily crons (all with catch-up on restart) ────────────────────
  // Midnight UTC: full odds sweep — fills gaps for the whole upcoming week
  scheduleMidnightOddsSweep().catch(console.error);
  // AI tips: 06:00, 12:00, 18:00 UTC — re-scores all fixtures after odds refresh
  scheduleAiTipsAtHour(6).catch(console.error);
  scheduleAiTipsAtHour(12).catch(console.error);
  scheduleAiTipsAtHour(18).catch(console.error);
  // Signal pre-compute: 05:00 UTC — caches signals for today's fixtures
  scheduleDailySignalCron().catch(console.error);
  // Force sync: 01:00, 07:00, 13:00, 19:00 UTC — fills gaps + generates AI tips 4x/day
  scheduleForceSync(1).catch(console.error);
  scheduleForceSync(7).catch(console.error);
  scheduleForceSync(13).catch(console.error);
  scheduleForceSync(19).catch(console.error);
}

// ─── Historical season seed ────────────────────────────────────────────────────

/** Auto-seed guard: only fetches historical fixtures if none exist in the database yet.
 *  This means the heavy API fetch runs exactly once (first boot), never again unless
 *  manually triggered via the admin panel. */
async function seedHistoricalIfNeeded(): Promise<void> {
  const currentSeason = TRACKED_LEAGUES[0]!.season; // e.g. 2025
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fixtures)
    .where(lt(fixtures.seasonYear, currentSeason))
    .limit(1);

  const historicalCount = row?.count ?? 0;
  if (historicalCount > 0) {
    console.log(`[seeder] Skipping auto-seed — ${historicalCount} historical fixtures already in DB`);
    return;
  }

  console.log("[seeder] No historical fixtures found — starting initial seed (2 seasons)");
  await seedHistoricalData(2);
}

export interface SeedStatus {
  running: boolean;
  progress: { done: number; total: number; current: string };
  lastRun: Date | null;
  fixturesSeeded: number;
  seasonsCompleted: string[];
  error: string | null;
}

let seedState: SeedStatus = {
  running: false,
  progress: { done: 0, total: 0, current: "" },
  lastRun: null,
  fixturesSeeded: 0,
  seasonsCompleted: [],
  error: null,
};

export function getSeedStatus(): SeedStatus {
  return { ...seedState };
}

/** Bulk-import all fixtures for the last `seasons` number of seasons across all tracked leagues.
 *  Runs sequentially (one league/season at a time) to stay well within rate limits.
 *  Safe to call multiple times — upsertFixture is idempotent. */
export async function seedHistoricalData(seasons = 2): Promise<void> {
  if (seedState.running) {
    console.log("[seeder] Already running, skipping duplicate call");
    return;
  }

  const currentSeason = TRACKED_LEAGUES[0]!.season; // e.g. 2025
  const seasonList = Array.from({ length: seasons }, (_, i) => currentSeason - i);
  const total = TRACKED_LEAGUES.length * seasonList.length;

  seedState = {
    running: true,
    progress: { done: 0, total, current: "" },
    lastRun: null,
    fixturesSeeded: 0,
    seasonsCompleted: [],
    error: null,
  };

  let totalSeeded = 0;

  try {
    for (const season of seasonList) {
      for (const league of TRACKED_LEAGUES) {
        const label = `${league.name ?? `League ${league.id}`} ${season}`;
        seedState.progress.current = label;
        console.log(`[seeder] Fetching ${label}...`);

        const fixtures_data = await fetchFixturesBySeason(league.id, season);

        if (fixtures_data && fixtures_data.length > 0) {
          let count = 0;
          for (const f of fixtures_data) {
            await upsertFixture(f);
            count++;
          }
          totalSeeded += count;
          seedState.fixturesSeeded = totalSeeded;
          console.log(`[seeder] ${label}: seeded ${count} fixtures`);
          seedState.seasonsCompleted.push(`${label} (${count})`);
        } else {
          console.log(`[seeder] ${label}: no data returned`);
          seedState.seasonsCompleted.push(`${label} (0)`);
        }

        seedState.progress.done++;
        // Brief pause between leagues to avoid rate spike
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    seedState.running = false;
    seedState.lastRun = new Date();
    console.log(`[seeder] Complete — ${totalSeeded} total fixtures seeded`);
  } catch (err) {
    seedState.running = false;
    seedState.error = String(err);
    console.error("[seeder] Error:", err);
  }
}
