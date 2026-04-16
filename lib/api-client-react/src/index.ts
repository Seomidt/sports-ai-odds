export * from "./generated/api";
export * from "./generated/api.schemas";
export * from "./hooks";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

export type Fixture = {
  fixtureId: number;
  leagueId: number;
  leagueName: string;
  leagueLogo: string;
  seasonYear: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  kickoff: string;
  statusShort: string | null;
  statusElapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string | null;
  venueCity: string | null;
  referee: string | null;
  weatherTemp: number | null;
  weatherDesc: string | null;
  weatherIcon: string | null;
  weatherWind: number | null;
  weatherHumidity: number | null;
  weatherFetchedAt: string | null;
  updatedAt: string;
};

export const getGetFixturesTodayQueryKey = getGetTodayFixturesQueryKey;
export const useGetFixturesToday = useGetTodayFixtures;
