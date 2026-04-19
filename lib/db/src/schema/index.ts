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
  uniqueIndex,
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
    venueCity: text("venue_city"),
    referee: text("referee"),
    weatherTemp: real("weather_temp"),
    weatherDesc: text("weather_desc"),
    weatherIcon: text("weather_icon"),
    weatherWind: real("weather_wind"),
    weatherHumidity: integer("weather_humidity"),
    weatherFetchedAt: timestamp("weather_fetched_at"),
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
    teamName: text("team_name"),
    teamLogo: text("team_logo"),
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
    btts: real("btts"),
    overUnder25: real("over_under_25"),
    handicapHome: real("handicap_home"),
    snappedAt: timestamp("snapped_at").defaultNow().notNull(),
  },
  (t) => [index("odds_fixture_idx").on(t.fixtureId)]
);

// ─── Pro plan: Predictions, live odds, player season stats, coaches, sidelined, transfers ───

export const predictions = pgTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    homeWinPercent: real("home_win_percent"),
    drawPercent: real("draw_percent"),
    awayWinPercent: real("away_win_percent"),
    goalsHome: real("goals_home"),
    goalsAway: real("goals_away"),
    adviceText: text("advice_text"),
    winner: text("winner"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("predictions_fixture_unique").on(t.fixtureId)]
);

export const liveOddsSnapshots = pgTable(
  "live_odds_snapshots",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    bookmaker: text("bookmaker"),
    homeWin: real("home_win"),
    draw: real("draw"),
    awayWin: real("away_win"),
    snappedAt: timestamp("snapped_at").defaultNow().notNull(),
  },
  (t) => [index("live_odds_fixture_idx").on(t.fixtureId)]
);

export const playerSeasonStats = pgTable(
  "player_season_stats",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    playerName: text("player_name"),
    teamId: integer("team_id"),
    leagueId: integer("league_id").notNull(),
    seasonYear: integer("season_year").notNull(),
    position: text("position"),
    goals: integer("goals"),
    assists: integer("assists"),
    appearances: integer("appearances"),
    minutesPlayed: integer("minutes_played"),
    rating: real("rating"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("player_season_stats_unique").on(t.playerId, t.leagueId, t.seasonYear)]
);

export const coaches = pgTable(
  "coaches",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id").notNull(),
    name: text("name"),
    teamId: integer("team_id").notNull(),
    nationality: text("nationality"),
    age: integer("age"),
    photoUrl: text("photo_url"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("coaches_team_unique").on(t.teamId)]
);

export const sidelinedPlayers = pgTable(
  "sidelined_players",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    playerName: text("player_name"),
    teamId: integer("team_id"),
    type: text("type"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("sidelined_team_idx").on(t.teamId),
    unique("sidelined_player_unique").on(t.playerId, t.type, t.startDate),
  ]
);

export const transfers = pgTable(
  "transfers",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    playerName: text("player_name"),
    teamInId: integer("team_in_id"),
    teamInName: text("team_in_name"),
    teamOutId: integer("team_out_id"),
    teamOutName: text("team_out_name"),
    transferType: text("transfer_type"),
    transferDate: text("transfer_date"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("transfers_player_idx").on(t.playerId),
    index("transfers_team_in_idx").on(t.teamInId),
  ]
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
    userId: text("user_id").notNull(),
    fixtureId: integer("fixture_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("followed_fixtures_unique").on(t.userId, t.fixtureId)]
);

export const alertLog = pgTable(
  "alert_log",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    sessionId: text("session_id"),
    signalKey: text("signal_key").notNull(),
    alertText: text("alert_text").notNull(),
    tier: text("tier").default("info"),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("alert_log_fixture_idx").on(t.fixtureId, t.sessionId)]
);

// ─── User access control ──────────────────────────────────────────────────────

export const allowedUsers = pgTable(
  "allowed_users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("user"), // "admin" | "user"
    addedBy: text("added_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Stripe billing fields — populated when STRIPE_ENABLED=true
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePlanName: text("stripe_plan_name"),
    stripeSubscriptionStatus: text("stripe_subscription_status"), // "active" | "trialing" | "past_due" | "canceled" | null
    // Fase 2.2 — plan tier for gating
    plan: text("plan").notNull().default("free"), // "free" | "pro"
    planStartedAt: timestamp("plan_started_at"),
    planCancelAt: timestamp("plan_cancel_at"),
  },
  (t) => [unique("allowed_users_email_unique").on(t.email)]
);

export type AllowedUser = typeof allowedUsers.$inferSelect;

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
export type Prediction = typeof predictions.$inferSelect;
export type LiveOddsSnapshot = typeof liveOddsSnapshots.$inferSelect;
export type PlayerSeasonStat = typeof playerSeasonStats.$inferSelect;
export type Coach = typeof coaches.$inferSelect;
export type SidelinedPlayer = typeof sidelinedPlayers.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;

// ─── Extended Pro data tables ─────────────────────────────────────────────────

export const h2hFixtures = pgTable(
  "h2h_fixtures",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    leagueId: integer("league_id"),
    leagueName: text("league_name"),
    seasonYear: integer("season_year"),
    homeTeamId: integer("home_team_id").notNull(),
    homeTeamName: text("home_team_name"),
    homeTeamLogo: text("home_team_logo"),
    awayTeamId: integer("away_team_id").notNull(),
    awayTeamName: text("away_team_name"),
    awayTeamLogo: text("away_team_logo"),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    kickoff: timestamp("kickoff"),
    statusShort: text("status_short"),
    forTeam1Id: integer("for_team1_id").notNull(),
    forTeam2Id: integer("for_team2_id").notNull(),
  },
  (t) => [
    unique("h2h_fixtures_unique").on(t.fixtureId, t.forTeam1Id, t.forTeam2Id),
    index("h2h_teams_idx").on(t.forTeam1Id, t.forTeam2Id),
  ]
);

export const teamSeasonStats = pgTable(
  "team_season_stats",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    leagueId: integer("league_id").notNull(),
    seasonYear: integer("season_year").notNull(),
    form: text("form"),
    playedHome: integer("played_home"),
    playedAway: integer("played_away"),
    playedTotal: integer("played_total"),
    winsHome: integer("wins_home"),
    winsAway: integer("wins_away"),
    winsTotal: integer("wins_total"),
    drawsHome: integer("draws_home"),
    drawsAway: integer("draws_away"),
    drawsTotal: integer("draws_total"),
    lossesHome: integer("losses_home"),
    lossesAway: integer("losses_away"),
    lossesTotal: integer("losses_total"),
    goalsForHome: integer("goals_for_home"),
    goalsForAway: integer("goals_for_away"),
    goalsForTotal: integer("goals_for_total"),
    goalsForAvgHome: real("goals_for_avg_home"),
    goalsForAvgAway: real("goals_for_avg_away"),
    goalsForAvgTotal: real("goals_for_avg_total"),
    goalsAgainstHome: integer("goals_against_home"),
    goalsAgainstAway: integer("goals_against_away"),
    goalsAgainstTotal: integer("goals_against_total"),
    goalsAgainstAvgHome: real("goals_against_avg_home"),
    goalsAgainstAvgAway: real("goals_against_avg_away"),
    goalsAgainstAvgTotal: real("goals_against_avg_total"),
    cleanSheetsHome: integer("clean_sheets_home"),
    cleanSheetsAway: integer("clean_sheets_away"),
    cleanSheetsTotal: integer("clean_sheets_total"),
    failedToScoreHome: integer("failed_to_score_home"),
    failedToScoreAway: integer("failed_to_score_away"),
    failedToScoreTotal: integer("failed_to_score_total"),
    penaltyScoredTotal: integer("penalty_scored_total"),
    penaltyMissedTotal: integer("penalty_missed_total"),
    biggestWinStreak: integer("biggest_win_streak"),
    biggestLossStreak: integer("biggest_loss_streak"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("team_season_stats_unique").on(t.teamId, t.leagueId, t.seasonYear)]
);

export const playerProfiles = pgTable(
  "player_profiles",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull().unique(),
    name: text("name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    age: integer("age"),
    nationality: text("nationality"),
    height: text("height"),
    weight: text("weight"),
    photo: text("photo"),
    position: text("position"),
    teamId: integer("team_id"),
    teamName: text("team_name"),
    yellowCards: integer("yellow_cards"),
    redCards: integer("red_cards"),
    appearances: integer("appearances"),
    goals: integer("goals"),
    assists: integer("assists"),
    minutesPlayed: integer("minutes_played"),
    rating: real("rating"),
    leagueId: integer("league_id"),
    seasonYear: integer("season_year"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

export const venues = pgTable(
  "venues",
  {
    id: serial("id").primaryKey(),
    venueId: integer("venue_id"),
    name: text("name"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    capacity: integer("capacity"),
    surface: text("surface"),
    imageUrl: text("image_url"),
    teamId: integer("team_id").notNull().unique(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

export const trophies = pgTable(
  "trophies",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    leagueName: text("league_name"),
    leagueType: text("league_type"),
    place: text("place"),
    season: text("season"),
  },
  (t) => [
    index("trophies_team_idx").on(t.teamId),
    unique("trophies_unique").on(t.teamId, t.leagueName, t.season, t.place),
  ]
);

export const oddsMarkets = pgTable(
  "odds_markets",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    bookmaker: text("bookmaker"),
    markets: jsonb("markets"),
    snappedAt: timestamp("snapped_at").defaultNow().notNull(),
  },
  (t) => [index("odds_markets_fixture_idx").on(t.fixtureId)]
);

// ─── AI Betting Intelligence ──────────────────────────────────────────────────

export const aiBettingTips = pgTable(
  "ai_betting_tips",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    homeTeam: text("home_team"),
    awayTeam: text("away_team"),
    kickoff: timestamp("kickoff"),
    leagueName: text("league_name"),
    recommendation: text("recommendation").notNull(),
    betType: text("bet_type").notNull(),
    betSide: text("bet_side"),
    trustScore: integer("trust_score").notNull(),
    aiProbability: real("ai_probability"),
    edge: real("edge"),
    reasoning: text("reasoning").notNull(),
    marketOdds: real("market_odds"),
    valueRating: text("value_rating"),
    outcome: text("outcome"),
    reviewHeadline: text("review_headline"),
    reviewSummary: text("review_summary"),
    accuracyNote: text("accuracy_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
    // ─── Production-grade auditability (Fase 1.1) ──────────────────────────
    modelVersion: text("model_version"),
    impliedProbability: real("implied_probability"),
    featureSnapshot: jsonb("feature_snapshot"),
    confidence: text("confidence"), // "high" | "medium" | "low"
    closingOdds: real("closing_odds"),
    kellyUnitFraction: real("kelly_unit_fraction"),
    canonicalPath: text("canonical_path"), // reserved for SEO (Fase 3)
  },
  (t) => [
    index("ai_betting_tips_fixture_idx").on(t.fixtureId),
    uniqueIndex("ai_betting_tips_fixture_bet_uniq").on(t.fixtureId, t.betType),
    index("ai_betting_tips_confidence_idx").on(t.confidence),
    index("ai_betting_tips_model_version_idx").on(t.modelVersion),
  ]
);

// ─── Prediction Reviews (Fase 1.1) ────────────────────────────────────────────
// Auditable post-match metrics per prediction: Brier score, ROI, CLV, error tags.

export const predictionReviews = pgTable(
  "prediction_reviews",
  {
    id: serial("id").primaryKey(),
    predictionId: integer("prediction_id").notNull(),
    brierScore: real("brier_score"),
    roiImpact: real("roi_impact"),
    calibrationBucket: text("calibration_bucket"), // "0-10%", "10-20%", ...
    errorTags: jsonb("error_tags"),
    closingLineValue: real("closing_line_value"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("prediction_reviews_prediction_uniq").on(t.predictionId),
    index("prediction_reviews_created_idx").on(t.createdAt),
  ]
);

// ─── User rolling stats (Fase 1.1) ────────────────────────────────────────────
// Pre-aggregated so frontend doesn't scan full history.

export const userStats = pgTable(
  "user_stats",
  {
    userId: text("user_id").primaryKey(),
    totalTips: integer("total_tips").notNull().default(0),
    winRate: real("win_rate"),
    roiPct: real("roi_pct"),
    avgClv: real("avg_clv"),
    brierScoreAvg: real("brier_score_avg"),
    bestMarket: text("best_market"),
    lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  }
);

// ─── AI News Cache (persisted to DB so Claude calls survive restarts) ─────────

export const newsArticles = pgTable(
  "news_articles",
  {
    id: serial("id").primaryKey(),
    leagueId: integer("league_id").notNull(),
    teamId: integer("team_id").notNull(),
    teamName: text("team_name").notNull(),
    teamLogo: text("team_logo"),
    rank: integer("rank").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    fixtureLine: text("fixture_line"),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    opponent: text("opponent"),
    result: text("result"),
    kickoff: timestamp("kickoff"),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("news_articles_league_team_uniq").on(t.leagueId, t.teamId),
    index("news_articles_league_idx").on(t.leagueId),
  ]
);

export type H2HFixture = typeof h2hFixtures.$inferSelect;
export type TeamSeasonStats = typeof teamSeasonStats.$inferSelect;
export type PlayerProfile = typeof playerProfiles.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Trophy = typeof trophies.$inferSelect;
export type AiBettingTip = typeof aiBettingTips.$inferSelect;
export type OddsMarket = typeof oddsMarkets.$inferSelect;
export type NewsArticle = typeof newsArticles.$inferSelect;

// ─── Pre-match AI Synthesis (persisted to survive restarts) ───────────────────

export const prematchSyntheses = pgTable(
  "prematch_syntheses",
  {
    id: serial("id").primaryKey(),
    fixtureId: integer("fixture_id").notNull(),
    headline: text("headline").notNull(),
    summary: text("summary").notNull(),
    keyFactors: jsonb("key_factors").$type<string[]>().notNull().default([]),
    bestBet: text("best_bet"),
    bestBetOdds: real("best_bet_odds"),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("prematch_syntheses_fixture_uniq").on(t.fixtureId),
    index("prematch_syntheses_fixture_idx").on(t.fixtureId),
  ]
);

export type PrematchSynthesisRow = typeof prematchSyntheses.$inferSelect;

// ─── Persistent key-value store (counters that survive restarts) ──────────────

export const systemKv = pgTable("system_kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});