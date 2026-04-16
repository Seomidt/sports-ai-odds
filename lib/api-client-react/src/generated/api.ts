/* eslint-disable */
/* Auto-generated client (repaired) */

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
} from "./api.schemas";

export type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined | null>;
};

const BASE_PATH =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${BASE_PATH}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url.toString();
}

async function request<T = any>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, headers, ...rest } = options;

  const res = await fetch(buildUrl(path, query), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

/* ===== Health ===== */

export function healthCheck() {
  return request("/api/healthz");
}

/* ===== Me ===== */

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/api/me");
}

/* ===== Fixtures ===== */

export function getFixturesToday(): Promise<TodayFixturesResponse> {
  return request<TodayFixturesResponse>("/api/fixtures/today");
}

export function getTopPicks() {
  return request("/api/fixtures/top-picks");
}

export function getFixtureById(fixtureId: number): Promise<FixtureDetailResponse> {
  return request<FixtureDetailResponse>(`/api/fixtures/${fixtureId}`);
}

export function getFixtureFeatures(fixtureId: number) {
  return request(`/api/fixtures/${fixtureId}/features`);
}

export function getFixtureSignals(fixtureId: number, params?: GetFixtureSignalsParams): Promise<SignalsResponse> {
  return request<SignalsResponse>(`/api/fixtures/${fixtureId}/signals`, { query: params });
}

export function getFixtureOdds(fixtureId: number): Promise<OddsResponse> {
  return request<OddsResponse>(`/api/fixtures/${fixtureId}/odds`);
}

export function getFixtureH2H(fixtureId: number): Promise<H2HResponse> {
  return request<H2HResponse>(`/api/fixtures/${fixtureId}/h2h`);
}

export function getFixtureOddsMarkets(fixtureId: number) {
  return request(`/api/fixtures/${fixtureId}/odds-markets`);
}

export function getFixtureLiveOdds(fixtureId: number): Promise<LiveOddsResponse> {
  return request<LiveOddsResponse>(`/api/fixtures/${fixtureId}/live-odds`);
}

/* ===== Standings ===== */

export function getLeagues() {
  return request("/api/standings/leagues");
}

export function getLeagueStandings(leagueId: number): Promise<StandingsResponse> {
  return request<StandingsResponse>(`/api/standings/${leagueId}`);
}

/* ===== Teams ===== */

export function getTeamInjuries(teamId: number) {
  return request(`/api/teams/${teamId}/injuries`);
}

export function getTeamStatistics(teamId: number, params?: GetTeamStatisticsParams): Promise<TeamStatisticsResponse> {
  return request<TeamStatisticsResponse>(`/api/teams/${teamId}/statistics`, { query: params });
}

/* ===== Admin ===== */

export function getAdminStats(): Promise<AdminStatsResponse> {
  return request<AdminStatsResponse>("/api/admin/stats");
}

export function getAdminUsers(): Promise<AdminUsersResponse> {
  return request<AdminUsersResponse>("/api/admin/users");
}

export function addAdminUser(body: AddUserBody): Promise<AdminUserResponse> {
  return request<AdminUserResponse>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminUser(id: number, body: UpdateUserBody): Promise<AdminUserResponse> {
  return request<AdminUserResponse>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteAdminUser(id: number): Promise<DeleteConfirmation> {
  return request<DeleteConfirmation>(`/api/admin/users/${id}`, {
    method: "DELETE",
  });
}
