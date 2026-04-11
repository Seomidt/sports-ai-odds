# AI Football Analysis & Alerts Platform

## Overview

A 5-layer deterministic AI football analysis platform using the API-Football API. Covers pre-match, live, and post-match analysis. Built on a pnpm monorepo using TypeScript.

## Architecture (5 layers)

1. **Data Ingestion** (`artifacts/api-server/src/ingestion/`) — Polls API-Football, upserts into PostgreSQL tables
2. **Feature Engine** (`artifacts/api-server/src/features/`) — Computes form, xG, momentum, pressure signals from raw data
3. **Signal Engine** (`artifacts/api-server/src/signals/`) — Deterministic rule-based signals (no AI). Named signals stored in DB
4. **AI Explanation Layer** (`artifacts/api-server/src/ai/`) — Claude (Anthropic via Replit AI Integrations) receives only pre-computed primitive signals, never raw data
5. **Alerting + Frontend** — Alert engine polls signals, sends in-app toast alerts; React frontend (TBD)

## Design

- Dark glassmorphism theme, "Signal Terminal" branding
- Teal/cyan accent, amber for warnings, red reserved for goal/card events only
- Analyst cockpit aesthetic, dense data layout, no emojis
- Mockup screens: Dashboard, Match Live, Match Pre-match (in mockup-sandbox)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Claude haiku-4-5 via Replit AI Integrations (Anthropic)
- **Build**: esbuild (ESM bundle)
- **Data source**: API-Football v3 (free tier, 100 req/day, 10 req/min)

## DB Tables

- `fixtures`, `teams`, `standings` — raw league data
- `fixture_events`, `fixture_lineups`, `fixture_stats`, `player_stats` — match detail
- `injuries`, `odds_snapshots` — injury & odds data
- `team_features` — computed features per team/fixture/phase (pre/live/post)
- `fixture_signals` — named signals with label + value/bool
- `followed_fixtures`, `alert_log` — alerting system

## Key Commands

- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm run typecheck` — full typecheck across all packages

## Secrets Required

- `API_FOOTBALL_KEY` — API-Football API key
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic via Replit AI Integrations (auto-set)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Anthropic base URL (auto-set)

## API Endpoints

- `GET /api/fixtures/today` — today's + next 3 days fixtures per league
- `GET /api/fixtures/:id` — fixture detail (events, stats, lineups)
- `GET /api/fixtures/:id/signals?phase=pre|live|post` — named signals
- `GET /api/fixtures/:id/features` — computed features
- `GET /api/standings/:leagueId` — league standings
- `GET /api/teams/:id/injuries` — team injuries
- `GET /api/analysis/:id/pre|live|post` — AI analysis
- `POST /api/alerts/explain` — generate alert text
- `POST /api/fixtures/:id/follow` — follow a fixture (x-session-id header)
- `GET /api/alerts/unread` — unread alerts for session
