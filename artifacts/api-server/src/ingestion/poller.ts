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

async function syncTodayFixtures() {
  const today = new Date().toISOString().split("T")[0]!;
  await syncFixturesForDate(today);
  // Also sync tomorrow and day after
  await syncFixturesForDate(getTomorrow());
  await syncFixturesForDate(getDateOffset(2));
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
  if (!entry || !entry.bookmakers.length) return;

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
  const allTeams = await db.query.teams.findMany({ columns: { teamId: true } });
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

  console.log("[poller] Starting polling service (Pro plan — full Tier 1+2+3)");

  // ── Immediate startup syncs ────────────────────────────────────────────────
  syncTodayFixtures().catch(console.error);
  syncStandings().catch(console.error);
  // Pro: coaches + transfers on startup (low urgency, runs once)
  setTimeout(() => syncCoachesForKnownTeams().catch(console.error), 30 * 1000);
  setTimeout(() => syncTransfersForTrackedTeams().catch(console.error), 60 * 1000);

  // ── Recurring intervals ────────────────────────────────────────────────────

  // Fixtures schedule: every 5 min
  setInterval(() => syncTodayFixtures().catch(console.error), 5 * 60 * 1000);

  // Standings: every hour
  setInterval(() => syncStandings().catch(console.error), 60 * 60 * 1000);

  // Pre-match lineups + odds + predictions: every 10 min
  setInterval(() => {
    syncPreMatchData().catch(console.error);
    syncOdds().catch(console.error);
  }, 10 * 60 * 1000);

  // Pro: Top scorers + assists + sidelined: once per day
  setInterval(() => {
    syncTopScorersAndAssists().catch(console.error);
    syncSidelinedForRecentPlayers().catch(console.error);
  }, 24 * 60 * 60 * 1000);

  // Pro: Coaches + transfers refresh: every 3 days
  setInterval(() => {
    syncCoachesForKnownTeams().catch(console.error);
    syncTransfersForTrackedTeams().catch(console.error);
  }, 3 * 24 * 60 * 60 * 1000);

  // Adaptive live loop: sprints at 15s for tracked live matches, idles at 2min
  adaptiveLiveLoop().catch(console.error);
}
