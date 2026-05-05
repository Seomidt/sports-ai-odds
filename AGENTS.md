## Cursor Cloud specific instructions

### Architecture
This is a pnpm workspace monorepo for a football betting intelligence platform ("Signal Terminal"):
- **Backend**: `artifacts/api-server/` — Express API (port 8080), built with esbuild
- **Frontend**: `artifacts/football-platform/` — Vite + React SPA (port 3000), proxies `/api/*` to backend
- **DB layer**: `lib/db/` — Drizzle ORM + PostgreSQL schema
- **Shared libs**: `lib/api-zod/`, `lib/api-spec/`, `lib/api-client-react/`

### Running services

1. **Start PostgreSQL**: `pg_ctlcluster 18 main start`
2. **Build + start API server** (from workspace root):
   ```
   export DATABASE_URL="postgres://devuser:devpass@localhost:5432/signal_terminal"
   export PORT=8080 SUPABASE_URL="https://placeholder.supabase.co" SUPABASE_SERVICE_ROLE_KEY="placeholder-service-role-key" BILLING_ENABLED=false NODE_ENV=development
   pnpm --filter @workspace/api-server build && pnpm --filter @workspace/api-server start
   ```
3. **Start frontend dev server** (from `artifacts/football-platform/`):
   ```
   export VITE_SUPABASE_URL="https://placeholder.supabase.co" VITE_SUPABASE_ANON_KEY="placeholder-anon-key" PORT=3000
   node server.mjs
   ```

### Key gotchas
- **No dotenv**: Env vars must be exported in the shell before running services. The `.env` file in root is only used by Vite's built-in env loading for `VITE_*` vars.
- **Typecheck has pre-existing errors**: `pnpm run typecheck` will fail with ~30+ TS errors in `api-server` and `football-platform`. This is the existing state of the codebase on `main`. The esbuild-based build still succeeds.
- **No ESLint or test framework**: The only code quality tool is TypeScript (`pnpm run typecheck`) and Prettier (format only, no lint config).
- **No automated tests**: No test files or test runner exist in the repo.
- **Supabase auth requires real credentials**: The placeholder Supabase keys allow the server to start but authentication (login/signup) will not work. For full auth testing, real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` secrets are needed.
- **Database schema push**: After schema changes, run `DATABASE_URL=... pnpm --filter @workspace/db push` to sync.
- **API server build required**: The backend uses esbuild bundling — you must run `pnpm --filter @workspace/api-server build` before `start`. The `dev` script does both.
- **apt mirror**: Default Ubuntu repos may be unreachable in this VM. The Princeton mirror (`mirror.math.princeton.edu`) is configured in `/etc/apt/sources.list.d/ubuntu.sources` as a workaround.
