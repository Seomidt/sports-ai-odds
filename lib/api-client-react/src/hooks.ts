import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import {
  getMe,
  getFixturesToday,
  getFixtureById,
  getFixtureSignals,
  getFixtureOdds,
  getFixtureH2H,
  getFixtureOddsMarkets,
  getFixtureLiveOdds,
  getTeamStatistics,
  getLeagueStandings,
  getAdminStats,
  getAdminUsers,
  addAdminUser,
  updateAdminUser,
  deleteAdminUser,
} from "./generated/api";
import type {
  MeResponse,
  TodayFixturesResponse,
  FixtureDetailResponse,
  SignalsResponse,
  OddsResponse,
  H2HResponse,
  LiveOddsResponse,
  TeamStatisticsResponse,
  StandingsResponse,
  AdminStatsResponse,
  AdminUsersResponse,
  AdminUserResponse,
  DeleteConfirmation,
  GetFixtureSignalsParams,
  GetTeamStatisticsParams,
  AddUserBody,
  UpdateUserBody,
} from "./generated/api.schemas";

/* ===== Query key factories ===== */

export const getGetMeQueryKey = () => ["me"] as const;

export const getGetTodayFixturesQueryKey = () => ["todayFixtures"] as const;

export const getGetFixtureQueryKey = (fixtureId: number) =>
  ["fixture", fixtureId] as const;

export const getGetFixtureSignalsQueryKey = (fixtureId: number, params?: GetFixtureSignalsParams) =>
  ["fixtureSignals", fixtureId, params] as const;

export const getGetFixtureOddsQueryKey = (fixtureId: number) =>
  ["fixtureOdds", fixtureId] as const;

export const getGetFixtureH2HQueryKey = (fixtureId: number) =>
  ["fixtureH2H", fixtureId] as const;

export const getGetFixtureOddsMarketsQueryKey = (fixtureId: number) =>
  ["fixtureOddsMarkets", fixtureId] as const;

export const getGetFixtureLiveOddsQueryKey = (fixtureId: number) =>
  ["fixtureLiveOdds", fixtureId] as const;

export const getGetTeamStatisticsQueryKey = (teamId: number, params?: GetTeamStatisticsParams) =>
  ["teamStatistics", teamId, params] as const;

export const getGetStandingsQueryKey = (leagueId: number) =>
  ["standings", leagueId] as const;

export const getGetAdminStatsQueryKey = () => ["adminStats"] as const;

export const getGetAdminUsersQueryKey = () => ["adminUsers"] as const;

/* ===== Hooks ===== */

export function useGetMe(
  options?: Omit<UseQueryOptions<MeResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<MeResponse, Error>({
    queryKey: getGetMeQueryKey(),
    queryFn: () => getMe(),
    ...options,
  });
}

export function useGetTodayFixtures(
  options?: Omit<UseQueryOptions<TodayFixturesResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<TodayFixturesResponse, Error>({
    queryKey: getGetTodayFixturesQueryKey(),
    queryFn: () => getFixturesToday(),
    ...options,
  });
}

export function useGetFixture(
  fixtureId: number,
  options?: Omit<UseQueryOptions<FixtureDetailResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<FixtureDetailResponse, Error>({
    queryKey: getGetFixtureQueryKey(fixtureId),
    queryFn: () => getFixtureById(fixtureId),
    ...options,
  });
}

export function useGetFixtureSignals(
  fixtureId: number,
  params?: GetFixtureSignalsParams,
  options?: Omit<UseQueryOptions<SignalsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<SignalsResponse, Error>({
    queryKey: getGetFixtureSignalsQueryKey(fixtureId, params),
    queryFn: () => getFixtureSignals(fixtureId, params),
    ...options,
  });
}

export function useGetFixtureOdds(
  fixtureId: number,
  options?: Omit<UseQueryOptions<OddsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<OddsResponse, Error>({
    queryKey: getGetFixtureOddsQueryKey(fixtureId),
    queryFn: () => getFixtureOdds(fixtureId),
    ...options,
  });
}

export function useGetFixtureH2H(
  fixtureId: number,
  options?: Omit<UseQueryOptions<H2HResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<H2HResponse, Error>({
    queryKey: getGetFixtureH2HQueryKey(fixtureId),
    queryFn: () => getFixtureH2H(fixtureId),
    ...options,
  });
}

export function useGetFixtureOddsMarkets(
  fixtureId: number,
  options?: Omit<UseQueryOptions<any, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<any, Error>({
    queryKey: getGetFixtureOddsMarketsQueryKey(fixtureId),
    queryFn: () => getFixtureOddsMarkets(fixtureId),
    ...options,
  });
}

export function useGetFixtureLiveOdds(
  fixtureId: number,
  options?: Omit<UseQueryOptions<LiveOddsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<LiveOddsResponse, Error>({
    queryKey: getGetFixtureLiveOddsQueryKey(fixtureId),
    queryFn: () => getFixtureLiveOdds(fixtureId),
    ...options,
  });
}

export function useGetTeamStatistics(
  teamId: number,
  params?: GetTeamStatisticsParams,
  options?: Omit<UseQueryOptions<TeamStatisticsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<TeamStatisticsResponse, Error>({
    queryKey: getGetTeamStatisticsQueryKey(teamId, params),
    queryFn: () => getTeamStatistics(teamId, params),
    ...options,
  });
}

export function useGetStandings(
  leagueId: number,
  options?: Omit<UseQueryOptions<StandingsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<StandingsResponse, Error>({
    queryKey: getGetStandingsQueryKey(leagueId),
    queryFn: () => getLeagueStandings(leagueId),
    ...options,
  });
}

export function useGetAdminStats(
  options?: Omit<UseQueryOptions<AdminStatsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<AdminStatsResponse, Error>({
    queryKey: getGetAdminStatsQueryKey(),
    queryFn: () => getAdminStats(),
    ...options,
  });
}

export function useGetAdminUsers(
  options?: Omit<UseQueryOptions<AdminUsersResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<AdminUsersResponse, Error>({
    queryKey: getGetAdminUsersQueryKey(),
    queryFn: () => getAdminUsers(),
    ...options,
  });
}

export function useAddAdminUser(
  options?: UseMutationOptions<AdminUserResponse, Error, AddUserBody>,
) {
  const queryClient = useQueryClient();
  return useMutation<AdminUserResponse, Error, AddUserBody>({
    mutationFn: (body) => addAdminUser(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
    },
    ...options,
  });
}

export function useUpdateAdminUser(
  options?: UseMutationOptions<AdminUserResponse, Error, { id: number; body: UpdateUserBody }>,
) {
  const queryClient = useQueryClient();
  return useMutation<AdminUserResponse, Error, { id: number; body: UpdateUserBody }>({
    mutationFn: ({ id, body }) => updateAdminUser(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
    },
    ...options,
  });
}

export function useDeleteAdminUser(
  options?: UseMutationOptions<DeleteConfirmation, Error, number>,
) {
  const queryClient = useQueryClient();
  return useMutation<DeleteConfirmation, Error, number>({
    mutationFn: (id) => deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
    },
    ...options,
  });
}
