/* eslint-disable */
/* Auto-generated client (repaired) */

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

/* ===== Fixtures ===== */

export function getFixturesToday() {
  return request("/api/fixtures/today");
}

export function getTopPicks() {
  return request("/api/fixtures/top-picks");
}

export function getFixtureById(fixtureId: number) {
  return request(`/api/fixtures/${fixtureId}`);
}

export function getFixtureFeatures(fixtureId: number) {
  return request(`/api/fixtures/${fixtureId}/features`);
}

export function getFixtureSignals(fixtureId: number) {
  return request(`/api/fixtures/${fixtureId}/signals`);
}

/* ===== Standings ===== */

export function getLeagues() {
  return request("/api/standings/leagues");
}

export function getLeagueStandings(leagueId: number) {
  return request(`/api/standings/${leagueId}`);
}

/* ===== Teams ===== */

export function getTeamInjuries(teamId: number) {
  return request(`/api/teams/${teamId}/injuries`);
}
