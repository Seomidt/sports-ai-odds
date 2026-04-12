/**
 * Widget Proxy — serves API-Football v3 format responses from our DB.
 * The API-Sports widgets use `data-url-football="/api/widget-proxy"` which
 * causes them to call this endpoint instead of the real API-Football API.
 * This means zero extra API quota is consumed for widget rendering.
 */
import { Router } from "express";
import { db, pool } from "@workspace/db";
import { fixtures, standings } from "@workspace/db/schema";
import { and, or, eq, gte, lte } from "drizzle-orm";

const router = Router();

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function cacheHeaders(res: Parameters<typeof router.get>[1] extends (...args: infer P) => any ? P[1] : never, maxAgeSeconds: number) {
  res.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${Math.max(30, Math.floor(maxAgeSeconds / 2))}`);
}

const STATUS_LONG: Record<string, string> = {
  NS: "Not Started",
  TBD: "Time To Be Defined",
  "1H": "First Half, Kick Off",
  HT: "Halftime",
  "2H": "Second Half, 2nd Half Started",
  ET: "Extra Time",
  BT: "Break Time",
  P: "Penalty In Progress",
  SUSP: "Match Suspended",
  INT: "Match Interrupted",
  LIVE: "In Progress",
  FT: "Match Finished",
  AET: "Match Finished - After Extra Time",
  PEN: "Match Finished - Penalty Shoot-out",
  PST: "Match Postponed",
  CANC: "Match Cancelled",
  ABD: "Match Abandoned",
  AWD: "Technical Loss",
  WO: "WalkOver",
};

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];
const POST_STATUSES = ["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"];

const LEAGUE_META: Record<number, { country: string; logo: string; flag: string | null }> = {
  // Top 5 + UEFA
  39:  { country: "England",     logo: "https://media.api-sports.io/football/leagues/39.png",  flag: "https://media.api-sports.io/flags/gb.svg" },
  140: { country: "Spain",       logo: "https://media.api-sports.io/football/leagues/140.png", flag: "https://media.api-sports.io/flags/es.svg" },
  135: { country: "Italy",       logo: "https://media.api-sports.io/football/leagues/135.png", flag: "https://media.api-sports.io/flags/it.svg" },
  78:  { country: "Germany",     logo: "https://media.api-sports.io/football/leagues/78.png",  flag: "https://media.api-sports.io/flags/de.svg" },
  61:  { country: "France",      logo: "https://media.api-sports.io/football/leagues/61.png",  flag: "https://media.api-sports.io/flags/fr.svg" },
  2:   { country: "World",       logo: "https://media.api-sports.io/football/leagues/2.png",   flag: null },
  3:   { country: "World",       logo: "https://media.api-sports.io/football/leagues/3.png",   flag: null },
  848: { country: "World",       logo: "https://media.api-sports.io/football/leagues/848.png", flag: null },
  // Other European
  40:  { country: "England",     logo: "https://media.api-sports.io/football/leagues/40.png",  flag: "https://media.api-sports.io/flags/gb.svg" },
  79:  { country: "Germany",     logo: "https://media.api-sports.io/football/leagues/79.png",  flag: "https://media.api-sports.io/flags/de.svg" },
  88:  { country: "Netherlands", logo: "https://media.api-sports.io/football/leagues/88.png",  flag: "https://media.api-sports.io/flags/nl.svg" },
  94:  { country: "Portugal",    logo: "https://media.api-sports.io/football/leagues/94.png",  flag: "https://media.api-sports.io/flags/pt.svg" },
  107: { country: "Belgium",     logo: "https://media.api-sports.io/football/leagues/107.png", flag: "https://media.api-sports.io/flags/be.svg" },
  113: { country: "Sweden",      logo: "https://media.api-sports.io/football/leagues/113.png", flag: "https://media.api-sports.io/flags/se.svg" },
  119: { country: "Denmark",     logo: "https://media.api-sports.io/football/leagues/119.png", flag: "https://media.api-sports.io/flags/dk.svg" },
  120: { country: "Denmark",     logo: "https://media.api-sports.io/football/leagues/120.png", flag: "https://media.api-sports.io/flags/dk.svg" },
  179: { country: "Scotland",    logo: "https://media.api-sports.io/football/leagues/179.png", flag: "https://media.api-sports.io/flags/gb-sct.svg" },
  203: { country: "Turkey",      logo: "https://media.api-sports.io/football/leagues/203.png", flag: "https://media.api-sports.io/flags/tr.svg" },
  218: { country: "Austria",     logo: "https://media.api-sports.io/football/leagues/218.png", flag: "https://media.api-sports.io/flags/at.svg" },
  235: { country: "Norway",      logo: "https://media.api-sports.io/football/leagues/235.png", flag: "https://media.api-sports.io/flags/no.svg" },
  244: { country: "Finland",     logo: "https://media.api-sports.io/football/leagues/244.png", flag: "https://media.api-sports.io/flags/fi.svg" },
  271: { country: "Poland",      logo: "https://media.api-sports.io/football/leagues/271.png", flag: "https://media.api-sports.io/flags/pl.svg" },
  // World
  98:  { country: "Japan",       logo: "https://media.api-sports.io/football/leagues/98.png",  flag: "https://media.api-sports.io/flags/jp.svg" },
  188: { country: "Australia",   logo: "https://media.api-sports.io/football/leagues/188.png", flag: "https://media.api-sports.io/flags/au.svg" },
  253: { country: "USA",         logo: "https://media.api-sports.io/football/leagues/253.png", flag: "https://media.api-sports.io/flags/us.svg" },
  262: { country: "Mexico",      logo: "https://media.api-sports.io/football/leagues/262.png", flag: "https://media.api-sports.io/flags/mx.svg" },
  292: { country: "South Korea", logo: "https://media.api-sports.io/football/leagues/292.png", flag: "https://media.api-sports.io/flags/kr.svg" },
};

type DbFixture = typeof fixtures.$inferSelect;

function fixtureToV3(f: DbFixture) {
  const kickoffIso = f.kickoff ? new Date(f.kickoff).toISOString() : null;
  const timestamp = f.kickoff ? Math.floor(new Date(f.kickoff).getTime() / 1000) : null;
  const statusShort = f.statusShort ?? "NS";
  const isLive = LIVE_STATUSES.includes(statusShort);
  const isPost = POST_STATUSES.includes(statusShort);

  let homeWinner: boolean | null = null;
  let awayWinner: boolean | null = null;
  if (isPost && f.homeGoals != null && f.awayGoals != null) {
    homeWinner = f.homeGoals > f.awayGoals;
    awayWinner = f.awayGoals > f.homeGoals;
  }

  const meta = LEAGUE_META[f.leagueId] ?? { country: "Unknown", logo: "", flag: null };

  return {
    fixture: {
      id: f.fixtureId,
      referee: f.referee ?? null,
      timezone: "UTC",
      date: kickoffIso,
      timestamp,
      periods: { first: null, second: null },
      venue: { id: null, name: f.venue ?? null, city: null },
      status: {
        long: STATUS_LONG[statusShort] ?? statusShort,
        short: statusShort,
        elapsed: isLive ? (f.statusElapsed ?? null) : null,
      },
    },
    league: {
      id: f.leagueId,
      name: f.leagueName ?? "",
      country: meta.country,
      logo: f.leagueLogo ?? meta.logo,
      flag: meta.flag,
      season: f.seasonYear,
      round: "Regular Season",
    },
    teams: {
      home: {
        id: f.homeTeamId,
        name: f.homeTeamName ?? String(f.homeTeamId),
        logo: f.homeTeamLogo ?? "",
        winner: homeWinner,
      },
      away: {
        id: f.awayTeamId,
        name: f.awayTeamName ?? String(f.awayTeamId),
        logo: f.awayTeamLogo ?? "",
        winner: awayWinner,
      },
    },
    goals: {
      home: f.homeGoals ?? null,
      away: f.awayGoals ?? null,
    },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: isPost ? (f.homeGoals ?? null) : null, away: isPost ? (f.awayGoals ?? null) : null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

function v3Response(endpoint: string, params: Record<string, string>, data: unknown[]) {
  return {
    get: endpoint,
    parameters: params,
    errors: [],
    results: data.length,
    paging: { current: 1, total: 1 },
    response: data,
  };
}

router.get("/widget-proxy/fixtures", async (req, res) => {
  const { date, live, league, team, season, status } = req.query as Record<string, string | undefined>;
  const cacheKey = `fixtures:${date ?? "today"}:${live ?? ""}:${league ?? ""}:${team ?? ""}:${season ?? ""}:${status ?? ""}`;
  const ttlMs = live === "all" ? 15_000 : 300_000;

  const cached = getCached<ReturnType<typeof v3Response>>(cacheKey);
  if (cached) {
    cacheHeaders(res, ttlMs / 1000);
    return res.json(cached);
  }

  try {
    let response;

    if (live === "all") {
      const rows = await db.select().from(fixtures);
      const liveRows = rows.filter((f) => LIVE_STATUSES.includes(f.statusShort ?? ""));
      response = v3Response("fixtures", { live: "all" }, liveRows.map(fixtureToV3));
    } else if (date) {
      const day = new Date(date);
      const start = new Date(day); start.setUTCHours(0, 0, 0, 0);
      const end = new Date(day); end.setUTCHours(23, 59, 59, 999);
      const rows = await db.select().from(fixtures).where(and(gte(fixtures.kickoff, start), lte(fixtures.kickoff, end)));
      let filtered = rows;
      if (league) filtered = filtered.filter((f) => f.leagueId === Number(league));
      if (status) filtered = filtered.filter((f) => f.statusShort === status);
      response = v3Response("fixtures", { date }, filtered.map(fixtureToV3));
    } else if (team) {
      const teamId = Number(team);
      const rows = await db.select().from(fixtures).where(or(eq(fixtures.homeTeamId, teamId), eq(fixtures.awayTeamId, teamId)));
      let filtered = rows;
      if (league) filtered = filtered.filter((f) => f.leagueId === Number(league));
      if (season) filtered = filtered.filter((f) => f.seasonYear === Number(season));
      response = v3Response("fixtures", { team }, filtered.map(fixtureToV3));
    } else if (league) {
      const rows = await db.select().from(fixtures).where(eq(fixtures.leagueId, Number(league)));
      let filtered = rows;
      if (season) filtered = filtered.filter((f) => f.seasonYear === Number(season));
      response = v3Response("fixtures", { league }, filtered.map(fixtureToV3));
    } else {
      const today = new Date();
      const start = new Date(today); start.setUTCHours(0, 0, 0, 0);
      const end = new Date(today); end.setUTCHours(23, 59, 59, 999);
      const rows = await db.select().from(fixtures).where(and(gte(fixtures.kickoff, start), lte(fixtures.kickoff, end)));
      response = v3Response("fixtures", { date: today.toISOString().split("T")[0]! }, rows.map(fixtureToV3));
    }

    setCached(cacheKey, response, ttlMs);
    cacheHeaders(res, ttlMs / 1000);
    return res.json(response);
  } catch (err) {
    console.error("[widget-proxy] fixtures error:", err);
    return res.status(500).json({ errors: { server: "Internal error" }, response: [] });
  }
});

router.get("/widget-proxy/fixtures/headtohead", async (req, res) => {
  const h2h = req.query["h2h"] as string | undefined;
  const cacheKey = `h2h:${h2h ?? ""}`;
  const cached = getCached<ReturnType<typeof v3Response>>(cacheKey);
  if (cached) {
    cacheHeaders(res, 3600);
    return res.json(cached);
  }

  if (!h2h || !h2h.includes("-")) {
    return res.status(400).json({ errors: { h2h: "Required: h2h=id1-id2" }, response: [] });
  }

  const [rawA, rawB] = h2h.split("-");
  const idA = Number(rawA);
  const idB = Number(rawB);
  if (!idA || !idB) {
    return res.status(400).json({ errors: { h2h: "Invalid team IDs" }, response: [] });
  }

  try {
    const rows = await db.select().from(fixtures).where(
      or(
        and(eq(fixtures.homeTeamId, idA), eq(fixtures.awayTeamId, idB)),
        and(eq(fixtures.homeTeamId, idB), eq(fixtures.awayTeamId, idA))
      )
    );
    rows.sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return tb - ta;
    });
    const response = v3Response("fixtures/headtohead", { h2h }, rows.map(fixtureToV3));
    setCached(cacheKey, response, 3600_000);
    cacheHeaders(res, 3600);
    return res.json(response);
  } catch (err) {
    console.error("[widget-proxy] h2h error:", err);
    return res.status(500).json({ errors: { server: "Internal error" }, response: [] });
  }
});

router.get("/widget-proxy/standings", async (req, res) => {
  const leagueId = Number(req.query["league"] ?? 0);
  const seasonYear = Number(req.query["season"] ?? 2024);
  const cacheKey = `standings:${leagueId}:${seasonYear}`;
  const cached = getCached<ReturnType<typeof v3Response>>(cacheKey);
  if (cached) {
    cacheHeaders(res, 3600);
    return res.json(cached);
  }

  if (!leagueId) {
    return res.status(400).json({ errors: { league: "Required" }, response: [] });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         s.team_id AS "teamId",
         s.rank,
         s.points,
         s.played,
         s.won,
         s.drawn,
         s.lost,
         s.goals_for AS "goalsFor",
         s.goals_against AS "goalsAgainst",
         s.goals_diff AS "goalsDiff",
         s.form,
         s.updated_at AS "updatedAt",
         COALESCE(s.team_name, t.name, s.team_id::text) AS "teamName",
         COALESCE(s.team_logo, t.logo) AS "teamLogo"
       FROM standings s
       LEFT JOIN teams t ON t.team_id = s.team_id
       WHERE s.league_id = $1 AND s.season_year = $2
       ORDER BY s.rank ASC`,
      [leagueId, seasonYear]
    );

    const meta = LEAGUE_META[leagueId] ?? { country: "Unknown", logo: "", flag: null };
    const leagueNames: Record<number, string> = {
      39: "Premier League", 140: "La Liga", 135: "Serie A", 78: "Bundesliga",
      61: "Ligue 1", 2: "UEFA Champions League", 3: "UEFA Europa League", 848: "UEFA Conference League",
      40: "Championship", 79: "2. Bundesliga", 88: "Eredivisie", 94: "Primeira Liga",
      107: "Belgian Pro League", 113: "Allsvenskan", 119: "Superliga", 120: "1. Division",
      179: "Scottish Premiership", 203: "Süper Lig", 218: "Bundesliga Austria",
      235: "Eliteserien", 244: "Veikkausliiga", 271: "Ekstraklasa",
      98: "J1 League", 188: "A-League Men", 253: "MLS", 262: "Liga MX", 292: "K League 1",
    };

    const standingsTable = rows.map((s: Record<string, unknown>) => ({
      rank: s["rank"],
      team: {
        id: s["teamId"],
        name: s["teamName"],
        logo: s["teamLogo"] ?? "",
      },
      points: s["points"],
      goalsDiff: s["goalsDiff"],
      group: leagueNames[leagueId] ?? "League",
      form: s["form"] ?? "",
      status: "same",
      description: null,
      all: {
        played: s["played"],
        win: s["won"],
        draw: s["drawn"],
        lose: s["lost"],
        goals: { for: s["goalsFor"], against: s["goalsAgainst"] },
      },
      home: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
      away: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
      update: s["updatedAt"] ? new Date(s["updatedAt"] as string).toISOString() : new Date().toISOString(),
    }));

    const response = [{
      league: {
        id: leagueId,
        name: leagueNames[leagueId] ?? "League",
        country: meta.country,
        logo: meta.logo,
        flag: meta.flag,
        season: seasonYear,
        standings: [standingsTable],
      },
    }];

    const payload = v3Response("standings", { league: String(leagueId), season: String(seasonYear) }, response);
    setCached(cacheKey, payload, 3600_000);
    cacheHeaders(res, 3600);
    return res.json(payload);
  } catch (err) {
    console.error("[widget-proxy] standings error:", err);
    return res.status(500).json({ errors: { server: "Internal error" }, response: [] });
  }
});

router.get("/widget-proxy/leagues", async (_req, res) => {
  const leagues = [
    { id: 39,  name: "Premier League",        country: "England",     season: 2025 },
    { id: 140, name: "La Liga",               country: "Spain",       season: 2025 },
    { id: 135, name: "Serie A",               country: "Italy",       season: 2025 },
    { id: 78,  name: "Bundesliga",            country: "Germany",     season: 2025 },
    { id: 61,  name: "Ligue 1",              country: "France",      season: 2025 },
    { id: 2,   name: "UEFA Champions League", country: "World",       season: 2025 },
    { id: 3,   name: "UEFA Europa League",    country: "World",       season: 2025 },
    { id: 848, name: "UEFA Conference League",country: "World",       season: 2025 },
    { id: 40,  name: "Championship",          country: "England",     season: 2025 },
    { id: 79,  name: "2. Bundesliga",         country: "Germany",     season: 2025 },
    { id: 88,  name: "Eredivisie",            country: "Netherlands", season: 2025 },
    { id: 94,  name: "Primeira Liga",         country: "Portugal",    season: 2025 },
    { id: 107, name: "Belgian Pro League",    country: "Belgium",     season: 2025 },
    { id: 113, name: "Allsvenskan",           country: "Sweden",      season: 2025 },
    { id: 119, name: "Superliga",             country: "Denmark",     season: 2025 },
    { id: 120, name: "1. Division",           country: "Denmark",     season: 2025 },
    { id: 179, name: "Scottish Premiership",  country: "Scotland",    season: 2025 },
    { id: 203, name: "Süper Lig",             country: "Turkey",      season: 2025 },
    { id: 218, name: "Bundesliga (Austria)",  country: "Austria",     season: 2025 },
    { id: 235, name: "Eliteserien",           country: "Norway",      season: 2025 },
    { id: 244, name: "Veikkausliiga",         country: "Finland",     season: 2025 },
    { id: 271, name: "Ekstraklasa",           country: "Poland",      season: 2025 },
    { id: 98,  name: "J1 League",             country: "Japan",       season: 2025 },
    { id: 188, name: "A-League Men",          country: "Australia",   season: 2025 },
    { id: 253, name: "MLS",                   country: "USA",         season: 2025 },
    { id: 262, name: "Liga MX",              country: "Mexico",      season: 2025 },
    { id: 292, name: "K League 1",            country: "South Korea", season: 2025 },
  ];

  const response = leagues.map((l) => {
    const meta = LEAGUE_META[l.id]!;
    return {
      league: { id: l.id, name: l.name, type: "League", logo: meta.logo },
      country: { name: l.country, code: null, flag: meta.flag },
      seasons: [{ year: l.season, start: `${l.season}-08-01`, end: `${l.season + 1}-06-01`, current: true, coverage: {} }],
    };
  });

  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600");
  return res.json(v3Response("leagues", {}, response));
});

export default router;
