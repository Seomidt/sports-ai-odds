import { useQuery } from "@tanstack/react-query";
import {
  useGetTodayFixtures,
  getGetTodayFixturesQueryKey,

  useGetStandings,
  getGetStandingsQueryKey,

  useGetFixture,
  getGetFixtureQueryKey,

  useGetFixtureFeatures,
  getGetFixtureFeaturesQueryKey,

  useGetFixtureSignals,
  getGetFixtureSignalsQueryKey,

  useGetFixtureOdds,
  getGetFixtureOddsQueryKey,

  useGetFixtureLiveOdds,
  getGetFixtureLiveOddsQueryKey,

  useGetFixtureOddsMarkets,
  getGetFixtureOddsMarketsQueryKey,

  useGetFixtureH2H,
  getGetFixtureH2HQueryKey,

  useGetTeamStatistics,
  getGetTeamStatisticsQueryKey,

  useGetTeamInjuries,
  getGetTeamInjuriesQueryKey,

  useGetTopPickFixtures,
  getGetTopPickFixturesQueryKey,

  useGetTopDiscipline,
  getGetTopDisciplineQueryKey,

  useGetLiveAnalysis,
  getGetLiveAnalysisQueryKey,

  useGetPostReview,
  getGetPostReviewQueryKey,

  useGetBettingTipForFixture,
  getGetBettingTipForFixtureQueryKey,

  useGetPlayer,
  getGetPlayerQueryKey,

  useGetFollowedFixtures,
  getGetFollowedFixturesQueryKey,

  useGetUnreadAlerts,
  getGetUnreadAlertsQueryKey,

  useGetAiAccuracy,
  getGetAiAccuracyQueryKey,

  useGetTeamVenue,
  getGetTeamVenueQueryKey,

  useGetTeamTrophies,
  getGetTeamTrophiesQueryKey,

  useGetAdminStats,
  getGetAdminStatsQueryKey,

  useGetAdminUsers,
  getGetAdminUsersQueryKey,
} from "./generated/api";

export {
  useGetTodayFixtures,
  getGetTodayFixturesQueryKey,

  useGetStandings,
  getGetStandingsQueryKey,

  useGetFixture,
  getGetFixtureQueryKey,

  useGetFixtureFeatures,
  getGetFixtureFeaturesQueryKey,

  useGetFixtureSignals,
  getGetFixtureSignalsQueryKey,

  useGetFixtureOdds,
  getGetFixtureOddsQueryKey,

  useGetFixtureLiveOdds,
  getGetFixtureLiveOddsQueryKey,

  useGetFixtureOddsMarkets,
  getGetFixtureOddsMarketsQueryKey,

  useGetFixtureH2H,
  getGetFixtureH2HQueryKey,

  useGetTeamStatistics,
  getGetTeamStatisticsQueryKey,

  useGetTeamInjuries,
  getGetTeamInjuriesQueryKey,

  useGetTopPickFixtures,
  getGetTopPickFixturesQueryKey,

  useGetTopDiscipline,
  getGetTopDisciplineQueryKey,

  useGetLiveAnalysis,
  getGetLiveAnalysisQueryKey,

  useGetPostReview,
  getGetPostReviewQueryKey,

  useGetBettingTipForFixture,
  getGetBettingTipForFixtureQueryKey,

  useGetPlayer,
  getGetPlayerQueryKey,

  useGetFollowedFixtures,
  getGetFollowedFixturesQueryKey,

  useGetUnreadAlerts,
  getGetUnreadAlertsQueryKey,

  useGetAiAccuracy,
  getGetAiAccuracyQueryKey,

  useGetTeamVenue,
  getGetTeamVenueQueryKey,

  useGetTeamTrophies,
  getGetTeamTrophiesQueryKey,

  useGetAdminStats,
  getGetAdminStatsQueryKey,

  useGetAdminUsers,
  getGetAdminUsersQueryKey,
};

/**
 * Compatibility aliases expected by existing frontend
 */
export {
  useGetTodayFixtures as useGetFixturesToday,
  getGetTodayFixturesQueryKey as getGetFixturesTodayQueryKey,
};

export function useGetMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => ({
      user: null,
      authenticated: false,
      role: null,
    }),
    staleTime: 30_000,
  });
}

/**
 * Missing in current generated client, but some pages may still import them.
 * Keep build green with safe compatibility stubs.
 */
export function useGetFixtureLineups(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "lineups"],
    queryFn: async () => ({ ok: true, items: [] }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 30_000,
  });
}

export function getGetFixtureLineupsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "lineups"] as const;
}

export function useGetFixtureStats(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "stats"],
    queryFn: async () => ({ ok: true, items: [] }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 30_000,
  });
}

export function getGetFixtureStatsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "stats"] as const;
}

export function useGetFixtureEvents(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "events"],
    queryFn: async () => ({ ok: true, items: [] }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 15_000,
  });
}

export function getGetFixtureEventsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "events"] as const;
}

export function useGetFixturePrediction(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "prediction"],
    queryFn: async () => ({ ok: true, item: null }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 60_000,
  });
}

export function getGetFixturePredictionQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "prediction"] as const;
}