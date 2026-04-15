import { useQuery } from "@tanstack/react-query";
import {
  useGetFixturesToday as useGetTodayFixtures,
  getGetFixturesTodayQueryKey as getGetTodayFixturesQueryKey,

  useGetLeagues as useGetStandings,
  getGetLeaguesQueryKey as getGetStandingsQueryKey,

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

  useGetFixtureLineups,
  getGetFixtureLineupsQueryKey,

  useGetFixtureStats,
  getGetFixtureStatsQueryKey,

  useGetFixtureEvents,
  getGetFixtureEventsQueryKey,

  useGetFixturePrediction,
  getGetFixturePredictionQueryKey,

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

  useGetFixtureLineups,
  getGetFixtureLineupsQueryKey,

  useGetFixtureStats,
  getGetFixtureStatsQueryKey,

  useGetFixtureEvents,
  getGetFixtureEventsQueryKey,

  useGetFixturePrediction,
  getGetFixturePredictionQueryKey,

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
 * Local compatibility hook.
 * generated/api.ts does not export useGetMe.
 */
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