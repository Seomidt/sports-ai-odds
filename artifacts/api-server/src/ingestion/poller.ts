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
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
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
  type ApiFixture,
  type ApiStatItem,
  type ApiLineup,
} from "./apiFootballClient.js";
import { runPreMatchFeatures, runLiveFeatures, runPostMatchFeatures } from "../features/featureEngine.js";
import { runSignalEngine } from "../signals/signalEngine.js";

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

async function syncOdds() {
  const now = new Date();
  const inSixHours = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte }) => and(gte(f.kickoff, now), lte(f.kickoff, inSixHours)),
  });

  for (const fix of upcoming) {
    const odds = await fetchOdds(fix.fixtureId);
    if (!odds) continue;

    for (const bm of odds.bookmakers) {
      const market = bm.bets.find((b) => b.name === "Match Winner");
      if (!market) continue;

      const homeVal = parseFloat(market.values.find((v) => v.value === "Home")?.odd ?? "0");
      const drawVal = parseFloat(market.values.find((v) => v.value === "Draw")?.odd ?? "0");
      const awayVal = parseFloat(market.values.find((v) => v.value === "Away")?.odd ?? "0");

      await db.insert(oddsSnapshots).values({
        fixtureId: fix.fixtureId,
        bookmaker: bm.name,
        homeWin: homeVal || null,
        draw: drawVal || null,
        awayWin: awayVal || null,
        btts: odds._btts ?? null,
        overUnder25: odds._overUnder25 ?? null,
        handicapHome: odds._handicapHome ?? null,
        snappedAt: new Date(),
      });
      break;
    }
  }
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
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = await db.query.fixtures.findMany({
    where: (f, { and, gte, lte }) => and(gte(f.kickoff, now), lte(f.kickoff, in24h)),
    limit: 30,
  });

  for (const fix of upcoming) {
    const markets = await fetchOddsAllMarkets(fix.fixtureId);
    if (!markets || markets.length === 0) continue;

    for (const m of markets) {
      await db.insert(oddsMarkets).values({
        fixtureId: fix.fixtureId,
        bookmaker: m.bookmaker,
        markets: m.markets as Record<string, unknown>,
        snappedAt: new Date(),
      });
    }
  }
  console.log(`[poller] Full odds markets synced for ${upcoming.length} upcoming fixtures`);
}

// Track fixtures that have already had post-match processing to avoid duplicates
const postMatchProcessed = new Set<number>();

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
        } else if (isFinished && !postMatchProcessed.has(f.fixture.id)) {
          postMatchProcessed.add(f.fixture.id);
          console.log(`[poller] Post-match processing for fixture ${f.fixture.id}`);
          await runPostMatchFeatures(f.fixture.id);
          await runSignalEngine(f.fixture.id, "post");
        }
      }

      await new Promise((r) => setTimeout(r, trackedCount > 0 ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS));
    } catch (err) {
      console.error("[poller] adaptiveLiveLoop error:", err);
      await new Promise((r) => setTimeout(r, 30 * 1000));
    }
  }
}

export function startPoller() {
  if (pollerStarted) return;
  pollerStarted = true;

  console.log("[poller] Starting polling service (Ultra plan — 75k req/day, 500 req/min)");

  // ── Immediate startup syncs ────────────────────────────────────────────────
  syncNearTermFixtures().catch(console.error);
  syncRecentResults().catch(console.error); // Yesterday + day before at startup
  syncStandings().catch(console.error);

  // Staggered startup for full 7-day window + heavy syncs (avoids API burst)
  setTimeout(() => syncTodayFixtures().catch(console.error), 30 * 1000);
  setTimeout(() => syncCoachesForKnownTeams().catch(console.error), 60 * 1000);
  setTimeout(() => syncTransfersForTrackedTeams().catch(console.error), 90 * 1000);
  setTimeout(() => syncH2HForUpcomingFixtures().catch(console.error), 2 * 60 * 1000);
  setTimeout(() => syncVenuesAndInfoForKnownTeams().catch(console.error), 3 * 60 * 1000);
  setTimeout(() => syncTeamSeasonStats().catch(console.error), 4 * 60 * 1000);
  setTimeout(() => syncTopScorersAndAssists().catch(console.error), 5 * 60 * 1000);
  setTimeout(() => syncTopDiscipline().catch(console.error), 6 * 60 * 1000);
  setTimeout(() => syncTrophiesForKnownTeams().catch(console.error), 7 * 60 * 1000);
  setTimeout(() => syncPlayerProfilesForTopPlayers().catch(console.error), 8 * 60 * 1000);
  setTimeout(() => syncOddsAllMarketsForUpcoming().catch(console.error), 9 * 60 * 1000);
  setTimeout(() => syncSquadsForUpcomingTeams().catch(console.error), 10 * 60 * 1000);
  setTimeout(() => syncFixtureInjuriesForUpcoming().catch(console.error), 11 * 60 * 1000);
  setTimeout(() => syncSidelinedForRecentPlayers().catch(console.error), 12 * 60 * 1000);

  // ── Recurring intervals ────────────────────────────────────────────────────

  // Today + tomorrow fixtures: every 15 min — live scores handled by adaptiveLiveLoop
  setInterval(() => syncNearTermFixtures().catch(console.error), 15 * 60 * 1000);

  // Yesterday + day before (FT results): every 2 hours — finished games rarely change
  setInterval(() => syncRecentResults().catch(console.error), 2 * 60 * 60 * 1000);

  // Full window -3 to +7 days: every 2 hours
  setInterval(() => syncTodayFixtures().catch(console.error), 2 * 60 * 60 * 1000);

  // Standings: every 2 hours (updates after match ends, not mid-game)
  setInterval(() => syncStandings().catch(console.error), 2 * 60 * 60 * 1000);

  // Pre-match lineups + odds + predictions + injuries: every 5 min (Ultra budget allows it)
  setInterval(() => {
    syncPreMatchData().catch(console.error);
    syncOdds().catch(console.error);
    syncOddsAllMarketsForUpcoming().catch(console.error);
    syncFixtureInjuriesForUpcoming().catch(console.error);
  }, 5 * 60 * 1000);

  // H2H: every 6 hours (changes only before a new fixture)
  setInterval(() => syncH2HForUpcomingFixtures().catch(console.error), 6 * 60 * 60 * 1000);

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

  // Adaptive live loop: sprints at 15s for tracked live matches, idles at 2min
  adaptiveLiveLoop().catch(console.error);
}
