import { useQuery } from "@tanstack/react-query";
import {
  getFixtureById,
  getFixtureFeatures,
  getFixtureSignals,
  getFixturesToday,
  getLeagues,
  getLeagueStandings,
  getTeamInjuries,
  getTopPicks,
  healthCheck,
} from "./generated/api";

export function useGetMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        await healthCheck();
        return {
          user: null,
          authenticated: false,
          role: null,
        };
      } catch {
        return {
          user: null,
          authenticated: false,
          role: null,
        };
      }
    },
    staleTime: 30_000,
  });
}

export function useGetTodayFixtures() {
  return useQuery({
    queryKey: ["fixtures", "today"],
    queryFn: getFixturesToday,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetTopPicks() {
  return useQuery({
    queryKey: ["fixtures", "top-picks"],
    queryFn: getTopPicks,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetFixture(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId],
    queryFn: () => getFixtureById(fixtureId),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetFixtureFeatures(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "features"],
    queryFn: () => getFixtureFeatures(fixtureId),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetFixtureSignals(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "signals"],
    queryFn: () => getFixtureSignals(fixtureId),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetLeagues() {
  return useQuery({
    queryKey: ["standings", "leagues"],
    queryFn: getLeagues,
    staleTime: 60_000,
  });
}

export function useGetLeagueStandings(leagueId: number) {
  return useQuery({
    queryKey: ["standings", leagueId],
    queryFn: () => getLeagueStandings(leagueId),
    enabled: Number.isFinite(leagueId) && leagueId > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useGetTeamInjuries(teamId: number) {
  return useQuery({
    queryKey: ["teams", teamId, "injuries"],
    queryFn: () => getTeamInjuries(teamId),
    enabled: Number.isFinite(teamId) && teamId > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Compatibility hooks for old frontend imports.
 * They return safe empty payloads until the real endpoints are wired.
 */

export function useGetFixtureOdds(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "odds"],
    queryFn: async () => ({
      ok: true,
      items: [],
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetFixtureLiveOdds(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "live-odds"],
    queryFn: async () => ({
      ok: true,
      items: [],
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useGetFixtureH2H(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "h2h"],
    queryFn: async () => ({
      ok: true,
      items: [],
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 60_000,
  });
}

export function useGetFixtureLineups(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "lineups"],
    queryFn: async () => ({
      ok: true,
      items: [],
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useGetFixtureStats(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "stats"],
    queryFn: async () => ({
      ok: true,
      items: [],
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useGetFixtureEvents(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "events"],
    queryFn: async () => ({
      ok: true,
      items: [],
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useGetFixturePrediction(fixtureId: number) {
  return useQuery({
    queryKey: ["fixtures", fixtureId, "prediction"],
    queryFn: async () => ({
      ok: true,
      item: null,
    }),
    enabled: Number.isFinite(fixtureId) && fixtureId > 0,
    staleTime: 60_000,
  });
}