import {
  pgTable,
  serial,
  integer,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ─── Layer 1: Raw ingestion tables ────────────────────────────────────────────

export const teams = pgTable("teams", {
  teamId: integer("team_id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo"),
  country: text("country"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fixtures = pgTable(
  "fixtures",
  {
    fixtureId: integer("fixture_id").primaryKey(),
    leagueId: integer("league_id").notNull(),
    leagueName: text("league_name"),
    leagueLogo: text("league_logo"),
    seasonYear: integer("season_year").notNull(),
    homeTeamId: integer("home_team_id").notNull(),
    awayTeamId: integer("away_team_id").notNull(),
    homeTeamName: text("home_team_name"),
    awayTeamName: text("away_team_name"),
    homeTeamLogo: text("home_team_logo"),
    awayTeamLogo: text("away_team_logo"),
    kickoff: timestamp("kickoff"),
    statusShort: text("status_short"),
    statusElapsed: integer("status_elapsed"),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    venue: text("venue"),
    referee: text("referee"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("fixtures_kickoff_idx").on(t.kickoff),
    index("fixtures_league_idx").on(t.leagueId),
  ]
);

export const standings = pgTable(
  "standings",
  {
    id: serial("id").primaryKey(),
    leagueId: integer("league_id").notNull(),
    seasonYear: integer("season_year").notNull(),
    teamId: integer("team_id").notNull(),
    rank: integer("rank"),
    points: integer("points"),
    played: integer("played"),
    won: integer("won"),
    drawn: integer("drawn"),
    lost: integer("lost"),
    goalsFor: integer("goals_for"),
    goalsAgainst: integer("goals_against"),
    goalsDiff: integer("goals_diff"),
    form: text("form"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("standings_league_team_unique").on(t.leagueId, t.seasonYear, t.teamId)]
);

export const fixtureEvents = pgTable(
  "fixture_events",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    minute: integer("minute"),
    extraMinute: integer("extra_minute"),
    teamId: integer("team_id"),
    playerId: integer("player_id"),
    playerName: text("player_name"),
    assistId: integer("assist_id"),
    assistName: text("assist_name"),
    type: text("type"),
    detail: text("detail"),
    comments: text("comments"),
  },
  (t) => [index("fixture_events_fixture_idx").on(t.fixtureId)]
);

export const fixtureLineups = pgTable(
  "fixture_lineups",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    teamId: integer("team_id").notNull(),
    formation: text("formation"),
    startingXI: jsonb("starting_xi"),
    substitutes: jsonb("substitutes"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("fixture_lineups_unique").on(t.fixtureId, t.teamId)]
);

export const fixtureStats = pgTable(
  "fixture_stats",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    teamId: integer("team_id").notNull(),
    shotsOnGoal: integer("shots_on_goal"),
    shotsOffGoal: integer("shots_off_goal"),
    totalShots: integer("total_shots"),
    blockedShots: integer("blocked_shots"),
    cornerKicks: integer("corner_kicks"),
    fouls: integer("fouls"),
    yellowCards: integer("yellow_cards"),
    redCards: integer("red_cards"),
    ballPossession: integer("ball_possession"),
    passAccuracy: integer("pass_accuracy"),
    totalPasses: integer("total_passes"),
    expectedGoals: real("expected_goals"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("fixture_stats_unique").on(t.fixtureId, t.teamId)]
);

export const playerStats = pgTable(
  "player_stats",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    playerId: integer("player_id").notNull(),
    teamId: integer("team_id").notNull(),
    name: text("name"),
    position: text("position"),
    rating: real("rating"),
    goals: integer("goals"),
    assists: integer("assists"),
    minutesPlayed: integer("minutes_played"),
    passAccuracy: real("pass_accuracy"),
    shotsTotal: integer("shots_total"),
    shotsOnTarget: integer("shots_on_target"),
    duelsWon: integer("duels_won"),
    duelsTotal: integer("duels_total"),
  },
  (t) => [unique("player_stats_unique").on(t.fixtureId, t.playerId)]
);

export const injuries = pgTable(
  "injuries",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    playerId: integer("player_id").notNull(),
    playerName: text("player_name"),
    type: text("type"),
    reason: text("reason"),
    fixtureId: integer("fixture_id"),
    leagueId: integer("league_id"),
    seasonYear: integer("season_year"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("injuries_team_idx").on(t.teamId)]
);

export const oddsSnapshots = pgTable(
  "odds_snapshots",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    bookmaker: text("bookmaker"),
    homeWin: real("home_win"),
    draw: real("draw"),
    awayWin: real("away_win"),
    snappedAt: timestamp("snapped_at").defaultNow().notNull(),
  },
  (t) => [index("odds_fixture_idx").on(t.fixtureId)]
);

// ─── Layer 2+3: Feature & Signal tables ────────────────────────────────────────

export const teamFeatures = pgTable(
  "team_features",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    teamId: integer("team_id").notNull(),
    phase: text("phase").notNull(),
    featureKey: text("feature_key").notNull(),
    featureValue: real("feature_value"),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (t) => [
    index("team_features_fixture_idx").on(t.fixtureId, t.teamId, t.phase),
    unique("team_features_unique").on(t.fixtureId, t.teamId, t.phase, t.featureKey),
  ]
);

export const fixtureSignals = pgTable(
  "fixture_signals",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    phase: text("phase").notNull(),
    signalKey: text("signal_key").notNull(),
    signalLabel: text("signal_label").notNull(),
    signalValue: real("signal_value"),
    signalBool: boolean("signal_bool"),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  },
  (t) => [
    index("fixture_signals_fixture_idx").on(t.fixtureId, t.phase),
    unique("fixture_signals_unique").on(t.fixtureId, t.phase, t.signalKey),
  ]
);

// ─── Layer 5: Alerting tables ─────────────────────────────────────────────────

export const followedFixtures = pgTable(
  "followed_fixtures",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    fixtureId: integer("fixture_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("followed_fixtures_unique").on(t.sessionId, t.fixtureId)]
);

export const alertLog = pgTable(
  "alert_log",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    sessionId: text("session_id"),
    signalKey: text("signal_key").notNull(),
    alertText: text("alert_text").notNull(),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("alert_log_fixture_idx").on(t.fixtureId, t.sessionId)]
);

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const insertFixtureSchema = createInsertSchema(fixtures);
export const insertTeamSchema = createInsertSchema(teams);
export const insertFixtureEventSchema = createInsertSchema(fixtureEvents);
export const insertFixtureStatsSchema = createInsertSchema(fixtureStats);
export const insertTeamFeatureSchema = createInsertSchema(teamFeatures);
export const insertFixtureSignalSchema = createInsertSchema(fixtureSignals);
export const insertAlertLogSchema = createInsertSchema(alertLog);

export type Fixture = typeof fixtures.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type FixtureEvent = typeof fixtureEvents.$inferSelect;
export type FixtureStats = typeof fixtureStats.$inferSelect;
export type TeamFeature = typeof teamFeatures.$inferSelect;
export type FixtureSignal = typeof fixtureSignals.$inferSelect;
export type AlertLog = typeof alertLog.$inferSelect;