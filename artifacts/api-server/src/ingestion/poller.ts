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
  fetchStandings,
  fetchOdds,
  type ApiFixture,
  type ApiStatItem,
} from "./apiFootballClient.js";
import { runPreMatchFeatures, runLiveFeatures, runPostMatchFeatures } from "../features/featureEngine.js";
import { runSignalEngine } from "../signals/signalEngine.js";

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

async function syncLiveFixtures() {
  const liveData = await fetchLiveFixtures();
  if (!liveData || liveData.length === 0) return;

  console.log(`[poller] ${liveData.length} live fixtures`);

  for (const f of liveData) {
    await upsertFixture(f);

    // Sync events
    const events = await fetchFixtureEvents(f.fixture.id);
    if (events) {
      // Delete old events and re-insert (events can be corrected by API)
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

    // Sync stats
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

    // Compute live features + signals
    await runLiveFeatures(f.fixture.id, f.teams.home.id, f.teams.away.id);
    await runSignalEngine(f.fixture.id, "live");
  }

  // Check for newly finished matches and run post-match
  const finishedIds = liveData
    .filter((f) => f.fixture.status.short === "FT")
    .map((f) => f.fixture.id);

  for (const fid of finishedIds) {
    await runPostMatchFeatures(fid);
    await runSignalEngine(fid, "post");
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

    for (const lineup of lineups as Array<{ team: { id: number }; formation: string; startXI: unknown[]; substitutes: unknown[] }>) {
      await db
        .insert(fixtureLineups)
        .values({
          fixtureId: fix.fixtureId,
          teamId: lineup.team.id,
          formation: lineup.formation,
          startingXI: lineup.startXI as never,
          substitutes: lineup.substitutes as never,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [fixtureLineups.fixtureId, fixtureLineups.teamId],
          set: {
            formation: lineup.formation,
            startingXI: lineup.startXI as never,
            substitutes: lineup.substitutes as never,
            updatedAt: new Date(),
          },
        });
    }

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

    // Get match winner market
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
        snappedAt: new Date(),
      });
      break; // Just first bookmaker
    }
  }
}

let pollerStarted = false;

export function startPoller() {
  if (pollerStarted) return;
  pollerStarted = true;

  console.log("[poller] Starting polling service");

  // Initial sync
  syncTodayFixtures().catch(console.error);
  syncStandings().catch(console.error);

  // Fixtures: every 5 min
  setInterval(() => syncTodayFixtures().catch(console.error), 5 * 60 * 1000);

  // Live fixtures: every 30 sec
  setInterval(() => syncLiveFixtures().catch(console.error), 30 * 1000);

  // Standings: every hour
  setInterval(() => syncStandings().catch(console.error), 60 * 60 * 1000);

  // Pre-match lineups + odds: every 10 min
  setInterval(() => {
    syncPreMatchData().catch(console.error);
    syncOdds().catch(console.error);
  }, 10 * 60 * 1000);
}
