export {
  useGetMe,

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

/**
 * Compatibility aliases for old frontend imports
 */

export {
  useGetTodayFixtures as useGetFixturesToday,
  getGetTodayFixturesQueryKey as getGetFixturesTodayQueryKey,
} from "./generated/api";