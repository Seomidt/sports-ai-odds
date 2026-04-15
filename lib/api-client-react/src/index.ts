export * from "./generated/api";
export * from "./hooks";

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

export function getGetTodayFixturesQueryKey() {
  return ["fixtures", "today"] as const;
}

export function getGetFixtureOddsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "odds"] as const;
}

export function getGetFixtureLiveOddsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "live-odds"] as const;
}

export function getGetFixtureOddsMarketsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "odds-markets"] as const;
}

export function getGetFixtureH2HQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "h2h"] as const;
}

export function getGetFixtureLineupsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "lineups"] as const;
}

export function getGetFixtureStatsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "stats"] as const;
}

export function getGetFixtureEventsQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "events"] as const;
}

export function getGetFixturePredictionQueryKey(fixtureId: number) {
  return ["fixtures", fixtureId, "prediction"] as const;
}

export function getGetTeamStatisticsQueryKey(teamId: number) {
  return ["teams", teamId, "statistics"] as const;
}
