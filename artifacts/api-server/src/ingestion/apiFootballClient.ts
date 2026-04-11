const BASE_URL = "https://v3.football.api-sports.io";

const API_KEY = process.env["API_FOOTBALL_KEY"];

if (!API_KEY) {
  console.warn("[api-football] API_FOOTBALL_KEY not set — ingestion will be disabled");
}

let requestsToday = 0;
const MAX_REQUESTS_PER_DAY = 90;
let lastRequestAt = 0;
const MIN_REQUEST_INTERVAL_MS = 7000; // 10 req/min = 1 per 6s, use 7s to be safe

async function apiFetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
  if (!API_KEY) return null;
  if (requestsToday >= MAX_REQUESTS_PER_DAY) {
    console.warn("[api-football] Daily request limit reached, skipping:", endpoint);
    return null;
  }

  // Rate limit: 10 req/min on free tier
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();

  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": API_KEY,
      },
    });

    requestsToday++;

    if (!res.ok) {
      console.error(`[api-football] HTTP ${res.status} for ${endpoint}`);
      return null;
    }

    const json = await res.json() as { response: T; errors: unknown };

    if (json.errors && Object.keys(json.errors as object).length > 0) {
      console.error("[api-football] API error:", json.errors);
      return null;
    }

    return json.response;
  } catch (err) {
    console.error("[api-football] Fetch error:", err);
    return null;
  }
}

// Reset counter daily
setInterval(() => {
  requestsToday = 0;
  console.log("[api-football] Daily request counter reset");
}, 24 * 60 * 60 * 1000);

export const TRACKED_LEAGUES = [
  { id: 39, name: "Premier League", season: 2024 },
  { id: 140, name: "La Liga", season: 2024 },
  { id: 135, name: "Serie A", season: 2024 },
  { id: 78, name: "Bundesliga", season: 2024 },
  { id: 2, name: "Champions League", season: 2024 },
];

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed: number | null };
    venue: { name: string } | null;
    referee: string | null;
  };
  league: { id: number; name: string; logo: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface ApiEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { id: number; name: string } | null;
  assist: { id: number | null; name: string | null } | null;
  type: string;
  detail: string;
  comments: string | null;
}

export interface ApiStatItem {
  type: string;
  value: string | number | null;
}

export interface ApiTeamStats {
  team: { id: number };
  statistics: ApiStatItem[];
}

export interface ApiStanding {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  form: string;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

export interface ApiInjury {
  player: { id: number; name: string; type: string; reason: string };
  team: { id: number };
  fixture: { id: number } | null;
  league: { id: number; season: number } | null;
}

export interface ApiOdds {
  bookmakers: Array<{
    name: string;
    bets: Array<{
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

export async function fetchTodayFixtures(leagueId: number, season: number): Promise<ApiFixture[] | null> {
  const today = new Date().toISOString().split("T")[0];
  return apiFetch<ApiFixture[]>("/fixtures", { league: leagueId, season, date: today! });
}

export async function fetchFixturesByDate(leagueId: number, season: number, date: string): Promise<ApiFixture[] | null> {
  return apiFetch<ApiFixture[]>("/fixtures", { league: leagueId, season, date });
}

export async function fetchLiveFixtures(): Promise<ApiFixture[] | null> {
  return apiFetch<ApiFixture[]>("/fixtures", { live: "all" });
}

export async function fetchFixtureEvents(fixtureId: number): Promise<ApiEvent[] | null> {
  return apiFetch<ApiEvent[]>("/fixtures/events", { fixture: fixtureId });
}

export async function fetchFixtureStats(fixtureId: number): Promise<ApiTeamStats[] | null> {
  return apiFetch<ApiTeamStats[]>("/fixtures/statistics", { fixture: fixtureId });
}

export async function fetchFixtureLineups(fixtureId: number): Promise<unknown[] | null> {
  return apiFetch("/fixtures/lineups", { fixture: fixtureId });
}

export async function fetchStandings(leagueId: number, season: number): Promise<ApiStanding[][] | null> {
  const data = await apiFetch<Array<{ league: { standings: ApiStanding[][] } }>>("/standings", { league: leagueId, season });
  return data?.[0]?.league?.standings ?? null;
}

export async function fetchTeamInjuries(teamId: number, season: number, leagueId: number): Promise<ApiInjury[] | null> {
  return apiFetch<ApiInjury[]>("/injuries", { team: teamId, season, league: leagueId });
}

export async function fetchOdds(fixtureId: number): Promise<ApiOdds | null> {
  const data = await apiFetch<ApiOdds[]>("/odds", { fixture: fixtureId });
  return data?.[0] ?? null;
}

export async function fetchFixturesByTeam(teamId: number, season: number, last: number): Promise<ApiFixture[] | null> {
  return apiFetch<ApiFixture[]>("/fixtures", { team: teamId, season, last });
}
