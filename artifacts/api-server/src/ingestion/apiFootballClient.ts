const BASE_URL = "https://v3.football.api-sports.io";

const API_KEY = process.env["API_FOOTBALL_KEY"];

if (!API_KEY) {
  console.warn("[api-football] API_FOOTBALL_KEY not set — ingestion will be disabled");
}

let requestsToday = 0;
const MAX_REQUESTS_PER_DAY = 3000; // Pro plan: much higher daily limit
let lastRequestAt = 0;
const MIN_REQUEST_INTERVAL_MS = 700; // Pro plan: 100 req/min = 1 per 600ms, use 700ms to be safe
let requestLog: { timestamp: number; endpoint: string }[] = [];
let dayResetAt = Date.now();

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
    requestLog.push({ timestamp: Date.now(), endpoint });
    // Keep only last 200 entries in memory
    if (requestLog.length > 200) requestLog = requestLog.slice(-200);

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
  requestLog = [];
  dayResetAt = Date.now();
  console.log("[api-football] Daily request counter reset");
}, 24 * 60 * 60 * 1000);

export function getApiStats() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const requestsThisHour = requestLog.filter((r) => r.timestamp > oneHourAgo).length;
  const recentRequests = requestLog.slice(-20).reverse().map((r) => ({
    endpoint: r.endpoint,
    time: new Date(r.timestamp).toISOString(),
  }));
  return {
    requestsToday,
    maxPerDay: MAX_REQUESTS_PER_DAY,
    remaining: MAX_REQUESTS_PER_DAY - requestsToday,
    requestsThisHour,
    dayResetAt: new Date(dayResetAt).toISOString(),
    recentRequests,
  };
}

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

export interface ApiOddsExtended extends ApiOdds {
  _btts?: number | null;
  _overUnder25?: number | null;
  _handicapHome?: number | null;
}

export async function fetchOdds(fixtureId: number): Promise<ApiOddsExtended | null> {
  const data = await apiFetch<ApiOdds[]>("/odds", { fixture: fixtureId });
  const raw = data?.[0] ?? null;
  if (!raw) return null;

  const result: ApiOddsExtended = { ...raw };

  for (const bm of raw.bookmakers) {
    const bttsMarket = bm.bets.find((b) => b.name === "Both Teams Score");
    if (bttsMarket) {
      const yesVal = parseFloat(bttsMarket.values.find((v) => v.value === "Yes")?.odd ?? "0");
      result._btts = yesVal || null;
    }

    const ouMarket = bm.bets.find((b) => b.name === "Goals Over/Under");
    if (ouMarket) {
      const over25 = ouMarket.values.find((v) => v.value === "Over 2.5");
      result._overUnder25 = over25 ? parseFloat(over25.odd) : null;
    }

    const handicapMarket = bm.bets.find((b) => b.name === "Asian Handicap");
    if (handicapMarket) {
      const homeH = handicapMarket.values[0];
      result._handicapHome = homeH ? parseFloat(homeH.odd) : null;
    }

    break;
  }

  return result;
}

export async function fetchFixturesByTeam(teamId: number, season: number, last: number): Promise<ApiFixture[] | null> {
  return apiFetch<ApiFixture[]>("/fixtures", { team: teamId, season, last });
}

// ─── Pro plan endpoints ────────────────────────────────────────────────────────

export interface ApiPlayerFixtureStat {
  team: { id: number; name: string; logo: string };
  players: Array<{
    player: { id: number; name: string; photo: string };
    statistics: Array<{
      games: { minutes: number | null; position: string | null; rating: string | null; captain: boolean };
      goals: { total: number | null; assists: number | null };
      shots: { total: number | null; on: number | null };
      passes: { total: number | null; key: number | null; accuracy: string | null };
      dribbles: { attempts: number | null; success: number | null };
      duels: { total: number | null; won: number | null };
    }>;
  }>;
}

export interface ApiPrediction {
  predictions: {
    winner: { id: number | null; name: string | null; comment: string | null } | null;
    win_or_draw: boolean | null;
    under_over: string | null;
    goals: { home: string | null; away: string | null };
    advice: string | null;
    percent: { home: string; draw: string; away: string };
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

export interface ApiLiveOdds {
  fixture: { id: number };
  update: string;
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string; handicap: string | null; main: boolean | null; suspended: boolean }>;
    }>;
  }>;
}

export interface ApiTopScorer {
  player: { id: number; name: string; photo: string };
  statistics: Array<{
    team: { id: number; name: string };
    league: { id: number; season: number };
    games: { appearances: number | null; minutes: number | null; rating: string | null; position: string | null };
    goals: { total: number | null; assists: number | null };
  }>;
}

export interface ApiCoach {
  id: number;
  name: string;
  nationality: string | null;
  age: number | null;
  photo: string | null;
  team: { id: number; name: string } | null;
}

export interface ApiSidelined {
  player: { id: number; name: string };
  sidelined: Array<{ type: string; start: string; end: string | null }>;
}

export interface ApiTransfer {
  player: { id: number; name: string };
  transfers: Array<{
    date: string;
    type: string;
    teams: {
      in: { id: number; name: string };
      out: { id: number; name: string };
    };
  }>;
}

export async function fetchFixturePlayerStats(fixtureId: number): Promise<ApiPlayerFixtureStat[] | null> {
  return apiFetch<ApiPlayerFixtureStat[]>("/fixtures/players", { fixture: fixtureId });
}

export async function fetchPredictions(fixtureId: number): Promise<ApiPrediction[] | null> {
  return apiFetch<ApiPrediction[]>("/predictions", { fixture: fixtureId });
}

export async function fetchLiveOdds(fixtureId: number): Promise<ApiLiveOdds[] | null> {
  return apiFetch<ApiLiveOdds[]>("/odds/live", { fixture: fixtureId });
}

export async function fetchTopScorers(leagueId: number, season: number): Promise<ApiTopScorer[] | null> {
  return apiFetch<ApiTopScorer[]>("/players/topscorers", { league: leagueId, season });
}

export async function fetchTopAssists(leagueId: number, season: number): Promise<ApiTopScorer[] | null> {
  return apiFetch<ApiTopScorer[]>("/players/topassists", { league: leagueId, season });
}

export async function fetchCoach(teamId: number): Promise<ApiCoach[] | null> {
  return apiFetch<ApiCoach[]>("/coachs", { team: teamId });
}

export async function fetchSidelined(playerId: number): Promise<ApiSidelined[] | null> {
  return apiFetch<ApiSidelined[]>("/sidelined", { player: playerId });
}

export async function fetchTransfers(teamId: number): Promise<ApiTransfer[] | null> {
  return apiFetch<ApiTransfer[]>("/transfers", { team: teamId });
}
