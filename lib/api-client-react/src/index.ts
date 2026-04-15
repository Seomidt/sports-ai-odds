// Generated API (primary source of truth)
export * from "./generated/api";
export * from "./generated/api.schemas";

// Fetch config
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

/**
 * COMPATIBILITY LAYER
 * Frontend expects legacy naming → map to generated functions
 */

// Fixtures
export {
  useGetFixturesToday as useGetTodayFixtures,
  getGetFixturesTodayQueryKey as getGetTodayFixturesQueryKey,
} from "./generated/api";

// Standings
export {
  useGetLeagues as useGetStandings,
  getGetLeaguesQueryKey as getGetStandingsQueryKey,
} from "./generated/api";

// Odds
export {
  useGetFixtureOdds,
  getGetFixtureOddsQueryKey,
} from "./generated/api";

// Live odds
export {
  useGetFixtureLiveOdds,
  getGetFixtureLiveOddsQueryKey,
} from "./generated/api";

// Markets
export {
  useGetFixtureOddsMarkets,
  getGetFixtureOddsMarketsQueryKey,
} from "./generated/api";

// H2H
export {
  useGetFixtureH2H,
  getGetFixtureH2HQueryKey,
} from "./generated/api";

// Lineups
export {
  useGetFixtureLineups,
  getGetFixtureLineupsQueryKey,
} from "./generated/api";

// Stats
export {
  useGetFixtureStats,
  getGetFixtureStatsQueryKey,
} from "./generated/api";

// Events
export {
  useGetFixtureEvents,
  getGetFixtureEventsQueryKey,
} from "./generated/api;

// Prediction
export {
  useGetFixturePrediction,
  getGetFixturePredictionQueryKey,
} from "./generated/api";

// Team stats
export {
  useGetTeamStatistics,
  getGetTeamStatisticsQueryKey,
} from "./generated/api";
