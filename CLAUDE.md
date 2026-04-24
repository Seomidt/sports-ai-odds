# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sports AI Odds is a full-stack TypeScript monorepo for an AI-powered football betting intelligence platform. It ingests live sports data, computes signals and features, calls the Claude API for betting tips/analysis, and serves a React SPA with real-time alerts.

## Monorepo Structure

**Package manager:** `pnpm` with workspaces.

```
artifacts/
  api-server/          # Node.js/Express backend — ingestion, AI, REST API
  football-platform/   # React SPA — Vite, TanStack Query, Wouter, Tailwind
lib/
  db/                  # Drizzle ORM schema + migrations (no migration files — push-only)
  api-spec/            # Source of truth: openapi.yaml
  api-zod/             # Generated Zod schemas (do not edit directly)
  api-client-react/    # Generated TanStack Query hooks (do not edit directly)
```

## Commands

### Root (from `/`)
```bash
pnpm build              # typecheck + build all packages
pnpm typecheck          # typecheck all libs and artifacts
pnpm typecheck:libs     # typecheck lib packages only
```

### api-server (from `artifacts/api-server/`)
```bash
pnpm dev        # build then start with NODE_ENV=development
pnpm build      # esbuild bundle → dist/index.mjs
pnpm start      # node --enable-source-maps dist/index.mjs
pnpm typecheck  # tsc --noEmit
```

### football-platform (from `artifacts/football-platform/`)
```bash
pnpm dev        # node server.mjs (Vite dev server)
pnpm build      # vite build
pnpm serve      # vite preview
pnpm typecheck  # tsc --noEmit
```

### Database (from `lib/db/`)
```bash
pnpm push        # drizzle-kit push (sync schema to DB)
pnpm push-force  # drizzle-kit push --force (destructive schema changes)
```

### API codegen (from `lib/api-spec/`)
```bash
pnpm codegen    # orval → regenerates lib/api-zod/src/ and lib/api-client-react/src/generated/
```

**No test suite exists.** TypeScript strict mode is the primary correctness mechanism.

## Architecture

### Data Pipeline

The backend runs a continuous polling loop (`api-server/src/ingestion/poller.ts`) that fetches from API-Football every 20–30 seconds. Data flows through three layers:

1. **Raw ingestion** → `fixtures`, `teams`, `standings`, `fixtureEvents`, `oddsSnapshots`, etc.
2. **Computed layer** → `teamFeatures` (per-team stats per fixture/phase) and `fixtureSignals` (detected patterns like `momentum_shift`, `upset_risk`)
3. **AI output** → `aiBettingTips`, `prematchSyntheses`, `newsArticles`, `predictionReviews`

The `featureEngine.ts` runs `runPreMatchFeatures` / `runLiveFeatures` / `runPostMatchFeatures`, then `signalEngine.ts` upserts signals to `fixtureSignals`, then `analysisLayer.ts` calls Claude to generate tips. After matches complete, `triggerPostMatchReview` computes Brier scores and ROI into `predictionReviews`.

### AI Layer (`api-server/src/ai/`)

- `analysisLayer.ts` — all Claude API calls: tip generation, live analysis, news articles, post-match review. Token usage (input/output) is accumulated in memory and flushed to `systemKv` every 10s. Token costs are tracked at $1/M input and $5/M output.
- `confidence.ts` — per-tip confidence scoring from features + signals
- `publishFilter.ts` — edge threshold gating before a tip is stored (`EDGE_THRESHOLD` env var, default 0.04)

### Route Cache

`api-server/src/lib/routeCache.ts` implements an in-memory cache with a cache-then-dedup pattern (`getOrFetch`): concurrent requests for the same key share a single in-flight Promise, so 100 simultaneous users trigger one DB/Claude call.

### API Contract

`lib/api-spec/openapi.yaml` is the canonical API definition. Whenever endpoints or schemas change:
1. Edit `openapi.yaml`
2. Run `pnpm codegen` from `lib/api-spec/` to regenerate `lib/api-zod/` and `lib/api-client-react/`
3. Never manually edit files under `lib/api-zod/src/generated/` or `lib/api-client-react/src/generated/`

### Auth & Access Control

- Auth is Supabase JWT. The `Authorization: Bearer <token>` header is verified via `supabaseAdmin.auth.getUser()` in `middlewares/requireAuth.ts`.
- Access is email-allowlist gated via the `allowedUsers` table.
- `ADMIN_EMAIL` env var bypasses the allowlist check entirely.
- Plan gating (`free` vs `pro`) is enforced by `middlewares/requirePlan.ts`. Free tier gets 24-hour delayed tips and no secondary markets.

### Billing

Stripe integration is **off by default** (`BILLING_ENABLED=false`). When disabled, all users are treated as Pro and `/api/billing/*` returns 503. The Stripe webhook handler must be registered **before** `express.json()` so the raw request body is preserved for signature verification.

### Frontend

The React SPA at `artifacts/football-platform/` uses:
- **Wouter** for client-side routing (not React Router)
- **TanStack Query** via auto-generated hooks from `lib/api-client-react/`
- **Radix UI** primitives with Tailwind CSS 4
- All API calls go through the generated `customFetch` mutator in `lib/api-client-react/src/custom-fetch.ts`

### Database Schema Conventions

Schema is defined in `lib/db/src/schema/index.ts` (single file, layered by comments). Migrations are push-only via `drizzle-kit push` — no migration files are tracked. Upserts use `.onConflictDoUpdate()` throughout; signals and features use composite unique constraints `(fixtureId, phase, key)`.

## Environment Variables

Copy `.env.example` to `.env` in the repo root. Key vars:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Auth |
| `API_FOOTBALL_KEY` | Sports data ingestion |
| `ANTHROPIC_API_KEY` | Claude API for AI analysis |
| `ADMIN_EMAIL` | Email that bypasses allowlist and gets admin routes |
| `BILLING_ENABLED` | Set `true` to activate Stripe; otherwise everyone is Pro |
| `STRIPE_SECRET_KEY` / `STRIPE_PRO_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Stripe billing |
| `EDGE_THRESHOLD` | Minimum edge to publish a tip (decimal, e.g. `0.04`) |
| `PRIMARY_MARKETS_ONLY` | Limit tips to 1X2 / O2.5 / BTTS when `true` |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist (localhost and `*.replit.app` always allowed) |

## TypeScript Config

All packages extend `tsconfig.base.json` at the repo root, which enforces strict mode (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`). The `lib/` packages use project references; the artifacts do not.
