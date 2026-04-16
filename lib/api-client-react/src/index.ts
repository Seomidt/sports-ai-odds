import { useQuery } from "@tanstack/react-query";
import * as api from "./generated/api";

export * from "./generated/api";
export * from "./generated/api.schemas";
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

/**
 * Compatibility exports expected by older frontend files
 */
export const useGetFixturesToday = api.useGetTodayFixtures;
export const getGetFixturesTodayQueryKey = api.getGetTodayFixturesQueryKey;

/**
 * Local compatibility hook.
 * generated/api.ts does not expose useGetMe.
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

export function getGetMeQueryKey() {
  return ["me"] as const;
}