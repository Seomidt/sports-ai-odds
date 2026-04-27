import { db } from "@workspace/db";
import { systemKv } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const BASE_URL = "https://v3.football.api-sports.io";

const API_KEY = process.env["API_FOOTBALL_KEY"];

if (!API_KEY) {
  console.warn("[api-football] API_FOOTBALL_KEY not set — ingestion will be disabled");
}

let requestsToday = 0;
const MAX_REQUESTS_PER_DAY = 75_000; // Ultra plan: 75,000 req/day
const QUOTA_SAFETY_BUFFER = 200;      // Stop 200 calls before hard limit
const MIN_REQUEST_INTERVAL_MS = 250; // Ultra plan: 500 req/min = 120ms, use 250ms safety margin
let requestLog: { timestamp: number; endpoint: string }[] = [];
let dayResetAt = Date.now();
let quotaExhaustedAt: number | null = null; // set when API returns quota error

export function isQuotaExhausted(): boolean {
  return quotaExhaustedAt !== null || requestsToday >= MAX_REQUESTS_PER_DAY - QUOTA_SAFETY_BUFFER;
}

// 7-day rolling history — now persisted to DB across restarts
const dailyHistory: { date: string; count: number }[] = [];

// ── Persistence helpers ──────────────────────────────────────────────────────

export async function kvGet(key: string): Promise<string | null> {
  try {
    const row = await db.query.systemKv.findFirst({ where: (t, { eq: eqFn }) => eqFn(t.key, key) });
    return row?.value ?? null;
  } catch { return null; }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    await db.insert(systemKv).values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } });
  } catch { /* best-effort */ }
}

/** Load today's request count + 7-day history from DB. Call once on startup. */
export async function initApiStats(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const todayVal = await kvGet(`api:today:${today}`);
  if (todayVal) requestsToday = parseInt(todayVal, 10) || 0;

  const histVal = await kvGet("api:history");
  if (histVal) {
    try {
      const parsed = JSON.parse(histVal) as { date: string; count: number }[];
      // Only keep days that are not today (today is tracked live)
      const past = parsed.filter((d) => d.date !== today);
      dailyHistory.push(...past.slice(-6));
    } catch { /* ignore */ }
  }
  console.log(`[api-football] Stats loaded from DB — ${requestsToday} requests today`);
}

let _flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced flush — writes at most once per 30s */
function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    const today = new Date().toISOString().slice(0, 10);
    await kvSet(`api:today:${today}`, String(requestsToday));
  }, 30_000);
}

// Serialise ALL API requests through a single promise chain to prevent concurrent
// requests from racing past the rate-limit check.
let requestChain: Promise<void> = Promise.resolve();

function serialiseRequest<T>(fn: () => Promise<T>): Promise<T> {
  const result = requestChain.then(() => fn());
  // Advance the chain by the minimum interval regardless of fn outcome
  requestChain = result.then(
    () => new Promise<void>((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS)),
    () => new Promise<void>((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS)),
  );
  return result;
}

async function apiFetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T | null> {
  if (!API_KEY) return null;

  // ── Circuit breaker: stop if quota is known to be exhausted ──────────────
  if (isQuotaExhausted()) {
    // Only log once per hour so we don't flood the console
    const now = Date.now();
    if (!quotaExhaustedAt || now - quotaExhaustedAt > 60 * 60 * 1000) {
      console.warn("[api-football] Quota exhausted — all API calls blocked until midnight UTC. Skipping:", endpoint);
    }
    return null;
  }

  return serialiseRequest(async () => {

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
    scheduleFlush();
    requestLog.push({ timestamp: Date.now(), endpoint });
    // Keep only last 200 entries in memory
    if (requestLog.length > 200) requestLog = requestLog.slice(-200);

    if (!res.ok) {
      console.error(`[api-football] HTTP ${res.status} for ${endpoint}`);
      return null;
    }

    const json = await res.json() as { response: T; errors: Record<string, string> | unknown };

    if (json.errors && Object.keys(json.errors as object).length > 0) {
      const errStr = JSON.stringify(json.errors);
      // ── Detect daily quota exhaustion from API response body ──────────────
      if (errStr.toLowerCase().includes("request limit") || errStr.toLowerCase().includes("rate limit")) {
        if (!quotaExhaustedAt) {
          quotaExhaustedAt = Date.now();
          console.error("[api-football] QUOTA EXHAUSTED — circuit breaker activated. All calls blocked until midnight UTC.");
        }
      } else {
        console.error("[api-football] API error:", json.errors);
      }
      return null;
    }

    return json.response;
  } catch (err) {
    console.error("[api-football] Fetch error:", err);
    return null;
  }
  }); // end serialiseRequest
}

// Reset counter daily — persist today's count to DB and history
setInterval(async () => {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  dailyHistory.push({ date: dateStr, count: requestsToday });
  if (dailyHistory.length > 7) dailyHistory.shift(); // keep last 7 days
  // Persist final count + updated history before reset
  await kvSet(`api:today:${dateStr}`, String(requestsToday));
  await kvSet("api:history", JSON.stringify(dailyHistory));
  requestsToday = 0;
  requestLog = [];
  dayResetAt = Date.now();
  quotaExhaustedAt = null; // Reset circuit breaker for new day
  console.log("[api-football] Daily request counter reset — circuit breaker cleared");
}, 24 * 60 * 60 * 1000);

export function getApiStats() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const requestsThisHour = requestLog.filter((r) => r.timestamp > oneHourAgo).length;
  const recentRequests = requestLog.slice(-20).reverse().map((r) => ({
    endpoint: r.endpoint,
    time: new Date(r.timestamp).toISOString(),
  }));

  // Build 7-day chart data (past 6 archived days + today)
  const todayStr = new Date().toISOString().slice(0, 10);
  const last7 = [...dailyHistory.slice(-6), { date: todayStr, count: requestsToday }];
  const dailyAvg = last7.length > 0
    ? Math.round(last7.reduce((s, d) => s + d.count, 0) / last7.length)
    : requestsToday;

  return {
    requestsToday,
    maxPerDay: MAX_REQUESTS_PER_DAY,
    remaining: MAX_REQUESTS_PER_DAY - requestsToday,
    requestsThisHour,
    dayResetAt: new Date(dayResetAt).toISOString(),
    quotaExhausted: isQuotaExhausted(),
    quotaExhaustedAt: quotaExhaustedAt ? new Date(quotaExhaustedAt).toISOString() : null,
    recentRequests,
    dailyHistory: last7,
    dailyAvg,
  };
}

export const TRACKED_LEAGUES = [
  // ── UEFA ──────────────────────────────────────────────────────────────────
  { id: 2,   name: "Champions League",   season: 2025 },
  { id: 3,   name: "Europa League",      season: 2025 },
  { id: 848, name: "Conference League",  season: 2025 },
  // ── England ───────────────────────────────────────────────────────────────
  { id: 39,  name: "Premier League",     season: 2025 },
  { id: 40,  name: "Championship",       season: 2025 },
  // ── Spain ─────────────────────────────────────────────────────────────────
  { id: 140, name: "La Liga",            season: 2025 },
  // ── Germany ───────────────────────────────────────────────────────────────
  { id: 78,  name: "Bundesliga",         season: 2025 },
  { id: 79,  name: "2. Bundesliga",      season: 2025 },
  // ── Italy ─────────────────────────────────────────────────────────────────
  { id: 135, name: "Serie A",            season: 2025 },
  // ── France ────────────────────────────────────────────────────────────────
  { id: 61,  name: "Ligue 1",            season: 2025 },
  // ── Netherlands ───────────────────────────────────────────────────────────
  { id: 88,  name: "Eredivisie",         season: 2025 },
  // ── Portugal ──────────────────────────────────────────────────────────────
  { id: 94,  name: "Primeira Liga",      season: 2025 },
  // ── Belgium ───────────────────────────────────────────────────────────────
  { id: 144, name: "Belgian Pro League", season: 2025 },
  // ── Scotland ──────────────────────────────────────────────────────────────
  { id: 179, name: "Scottish Prem.",     season: 2025 },
  // ── Austria ───────────────────────────────────────────────────────────────
  { id: 218, name: "Bundesliga (AUT)",   season: 2025 },
  // ── Turkey ────────────────────────────────────────────────────────────────
  { id: 203, name: "Süper Lig",          season: 2025 },
  // ── Poland ────────────────────────────────────────────────────────────────
  { id: 106, name: "Ekstraklasa",         season: 2025 },
  // ── Scandinavia (calendar year) ───────────────────────────────────────────
  { id: 119, name: "Superliga",          season: 2026 },
  { id: 120, name: "1. Division",        season: 2026 },
  { id: 113, name: "Allsvenskan",        season: 2026 },
  { id: 235, name: "Eliteserien",        season: 2026 },
  { id: 244, name: "Veikkausliiga",      season: 2026 },
  // ── Americas ──────────────────────────────────────────────────────────────
  { id: 253, name: "MLS",               season: 2026 },
  { id: 262, name: "Liga MX",           season: 2025 }, // Clausura 2026 = season 2025
  // ── Asia / Pacific ────────────────────────────────────────────────────────
  { id: 98,  name: "J1 League",         season: 2026 },
  { id: 292, name: "K League 1",        season: 2026 },
  { id: 188, name: "A-League Men",      season: 2025 }, // Oct 2025 – May 2026
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

export async function fetchFixtureById(fixtureId: number): Promise<ApiFixture | null> {
  const results = await apiFetch<ApiFixture[]>("/fixtures", { id: fixtureId });
  return results?.[0] ?? null;
}

export async function fetchFixtureEvents(fixtureId: number): Promise<ApiEvent[] | null> {
  return apiFetch<ApiEvent[]>("/fixtures/events", { fixture: fixtureId });
}

export async function fetchFixtureStats(fixtureId: number): Promise<ApiTeamStats[] | null> {
  return apiFetch<ApiTeamStats[]>("/fixtures/statistics", { fixture: fixtureId });
}

export interface ApiLineupPlayer {
  player: { id: number; name: string; number: number; pos: string; grid: string | null };
}

export interface ApiLineup {
  team: { id: number; name: string; logo: string };
  formation: string;
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
  coach: { id: number | null; name: string | null; photo: string | null };
}

export async function fetchFixtureLineups(fixtureId: number): Promise<ApiLineup[] | null> {
  return apiFetch<ApiLineup[]>("/fixtures/lineups", { fixture: fixtureId });
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

// ─── New comprehensive endpoints ───────────────────────────────────────────────

export interface ApiH2HEntry {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: { id: number; name: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export async function fetchH2H(team1Id: number, team2Id: number, last = 10): Promise<ApiH2HEntry[] | null> {
  return apiFetch<ApiH2HEntry[]>("/fixtures/headtohead", { h2h: `${team1Id}-${team2Id}`, last });
}

export interface ApiTeamStatistics {
  team: { id: number; name: string };
  league: { id: number; season: number };
  form: string | null;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
    };
    against: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
    };
  };
  biggest: {
    streak: { wins: number; draws: number; loses: number };
    goals: { for: { home: number; away: number }; against: { home: number; away: number } };
  };
  clean_sheet: { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
  penalty: {
    scored: { total: number };
    missed: { total: number };
  };
}

export async function fetchTeamStatistics(teamId: number, leagueId: number, season: number): Promise<ApiTeamStatistics | null> {
  const data = await apiFetch<ApiTeamStatistics>("/teams/statistics", { team: teamId, league: leagueId, season });
  return data ?? null;
}

export interface ApiTeamInfo {
  team: {
    id: number;
    name: string;
    code: string | null;
    country: string | null;
    founded: number | null;
    national: boolean;
    logo: string | null;
  };
  venue: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  };
}

export async function fetchTeamInfo(teamId: number): Promise<ApiTeamInfo | null> {
  const data = await apiFetch<ApiTeamInfo[]>("/teams", { id: teamId });
  return data?.[0] ?? null;
}

export interface ApiPlayerProfile {
  player: {
    id: number;
    name: string;
    firstname: string | null;
    lastname: string | null;
    age: number | null;
    nationality: string | null;
    height: string | null;
    weight: string | null;
    photo: string | null;
  };
  statistics: Array<{
    team: { id: number; name: string };
    league: { id: number; season: number };
    games: {
      appearances: number | null;
      minutes: number | null;
      position: string | null;
      rating: string | null;
    };
    goals: { total: number | null; assists: number | null };
    cards: { yellow: number | null; yellowred: number | null; red: number | null };
  }>;
}

export async function fetchPlayer(playerId: number, season: number): Promise<ApiPlayerProfile | null> {
  const data = await apiFetch<ApiPlayerProfile[]>("/players", { id: playerId, season });
  return data?.[0] ?? null;
}

export interface ApiTrophy {
  league: { id: number | null; name: string | null; type: string | null; logo: string | null };
  place: string | null;
  season: string | null;
}

export async function fetchTrophies(teamId: number): Promise<ApiTrophy[] | null> {
  return apiFetch<ApiTrophy[]>("/trophies", { team: teamId });
}

export async function fetchTopYellowCards(leagueId: number, season: number): Promise<ApiTopScorer[] | null> {
  return apiFetch<ApiTopScorer[]>("/players/topyellowcards", { league: leagueId, season });
}

export async function fetchTopRedCards(leagueId: number, season: number): Promise<ApiTopScorer[] | null> {
  return apiFetch<ApiTopScorer[]>("/players/topredcards", { league: leagueId, season });
}

export interface ApiOddsMarket {
  bookmaker: string;
  markets: Record<string, Array<{ value: string; odd: string }>>;
}

// Bookmaker IDs we explicitly request to ensure coverage
export const PRIORITY_BOOKMAKER_IDS: Record<number, string> = {
  8: "Bet365",
  6: "Bwin",
  16: "Unibet",
};

/** Fetch odds for a specific bookmaker by ID (returns null if not available) */
export async function fetchOddsForBookmaker(fixtureId: number, bookmakerId: number): Promise<ApiOddsExtended | null> {
  const data = await apiFetch<ApiOdds[]>("/odds", { fixture: fixtureId, bookmaker: bookmakerId });
  const raw = data?.[0] ?? null;
  if (!raw || raw.bookmakers.length === 0) return null;
  return { ...raw };
}

/** Fetch ALL markets for ALL bookmakers for a fixture — fixes bug where only first bookmaker was returned */
export async function fetchOddsAllMarkets(fixtureId: number): Promise<ApiOddsMarket[] | null> {
  const data = await apiFetch<ApiOdds[]>("/odds", { fixture: fixtureId });
  if (!data || data.length === 0) return null;

  const results: ApiOddsMarket[] = [];

  for (const entry of data) {
    for (const bm of entry.bookmakers) {
      const markets: Record<string, Array<{ value: string; odd: string }>> = {};
      for (const bet of bm.bets) {
        markets[bet.name] = bet.values.map((v) => ({ value: v.value, odd: v.odd }));
      }
      results.push({ bookmaker: bm.name, markets });
    }
  }

  return results.length > 0 ? results : null;
}

// ─── Ultra plan additional endpoints ──────────────────────────────────────────

export interface ApiSquadPlayer {
  id: number;
  name: string;
  age: number | null;
  number: number | null;
  position: string | null;
  photo: string | null;
}

export interface ApiSquad {
  team: { id: number; name: string; logo: string };
  players: ApiSquadPlayer[];
}

export async function fetchSquad(teamId: number): Promise<ApiSquad | null> {
  const data = await apiFetch<ApiSquad[]>("/players/squads", { team: teamId });
  return data?.[0] ?? null;
}

export interface ApiFixtureInjury {
  player: { id: number; name: string; photo: string | null; type: string | null; reason: string | null };
  team: { id: number; name: string; logo: string };
}

export async function fetchFixtureInjuries(fixtureId: number): Promise<ApiFixtureInjury[] | null> {
  return apiFetch<ApiFixtureInjury[]>("/injuries", { fixture: fixtureId });
}

export async function fetchTopAppearances(leagueId: number, season: number): Promise<ApiTopScorer[] | null> {
  return apiFetch<ApiTopScorer[]>("/players/topassists", { league: leagueId, season });
}

export interface ApiRound {
  round: string;
}

export async function fetchRounds(leagueId: number, season: number): Promise<string[] | null> {
  return apiFetch<string[]>("/fixtures/rounds", { league: leagueId, season });
}

// ─── Historical season bulk-fetch (handles pagination) ─────────────────────────

export async function fetchFixturesBySeason(
  leagueId: number,
  season: number
): Promise<ApiFixture[] | null> {
  if (!API_KEY) return null;
  if (requestsToday >= MAX_REQUESTS_PER_DAY) {
    console.warn("[api-football] Daily limit reached during season fetch");
    return null;
  }

  return serialiseRequest(async () => {
    const url = new URL(`${BASE_URL}/fixtures`);
    url.searchParams.set("league", String(leagueId));
    url.searchParams.set("season", String(season));

    try {
      const res = await fetch(url.toString(), {
        headers: { "x-apisports-key": API_KEY! },
      });

      requestsToday++;
      scheduleFlush();
      requestLog.push({ timestamp: Date.now(), endpoint: "/fixtures[season]" });
      if (requestLog.length > 200) requestLog = requestLog.slice(-200);

      if (!res.ok) {
        console.error(`[api-football] HTTP ${res.status} season fetch`);
        return null;
      }

      const json = await res.json() as {
        response: ApiFixture[];
        errors: unknown;
      };

      if (json.errors && Object.keys(json.errors as object).length > 0) {
        console.error("[api-football] Season fetch API error:", JSON.stringify(json.errors));
        return null;
      }

      return json.response.length > 0 ? json.response : null;
    } catch (err) {
      console.error("[api-football] Season fetch error:", err);
      return null;
    }
  });
}
