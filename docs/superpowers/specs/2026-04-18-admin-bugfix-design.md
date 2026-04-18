# Admin Panel Bug Fix & Error Visibility — Design Spec
Date: 2026-04-18

## Summary

Fix 5 concrete bugs in the admin panel and API server, and add error visibility so the admin can diagnose issues without inspecting Railway logs.

## Problems Being Solved

1. **All generated API calls missing auth tokens** — `App.tsx` imports `setTokenGetter` which does not exist; the correct export is `setAuthTokenGetter`. This silently breaks all hooks that use the generated API client (stats, users, etc.).

2. **Force Sync / AI Sync return 404** — Railway auto-deploys from git. A recent commit (`1f8ea74`) temporarily disabled all admin routes. The routes are back in current code, but Railway may be running a stale build. The code fix + push triggers a fresh Railway deploy.

3. **Registered Accounts always empty** — `/api/admin/supabase-users` returns a flat array; `Admin.tsx` expects `{ users: [...], total: number }`. Shape mismatch means the section always renders "No registered accounts found."

4. **`getToken()` may return a stale access token** — `useAuth.ts` returns `session?.access_token` from React state, which can be expired if the tab is old. Should call `supabase.auth.getSession()` to always get a fresh token.

5. **No visibility into AI health or why tips are missing** — The admin panel shows token stats but not whether the API key is configured, when AI last ran, or how many upcoming fixtures lack tips.

## Architecture

No new services or routes are added. Changes are confined to:
- 2 frontend files (`App.tsx`, `useAuth.ts`)
- 1 frontend page (`Admin.tsx`)
- 1 backend route file (`admin.ts`)

### Backend changes (`artifacts/api-server/src/routes/admin.ts`)

**Fix `/admin/supabase-users`:** Return `{ users: [...], total: number }` instead of a flat array.

**Extend `/admin/ai-stats`:** Add `lastError: string | null` and `lastRunAt: number | null` fields so the frontend can show when AI last ran and what failed.

**Extend `/admin/db-stats`:** Add `upcomingWithTips: number` and `upcomingWithoutTips: number` counts — fixtures in the next 7 days, split by whether they have ≥1 AI tip.

### Frontend changes

**`App.tsx`:** Replace `setTokenGetter` with `setAuthTokenGetter` (1-line fix).

**`useAuth.ts`:** Change `getToken` from:
```ts
getToken: () => Promise.resolve(session?.access_token ?? null)
```
to:
```ts
getToken: () => supabase.auth.getSession().then(r => r.data.session?.access_token ?? null)
```

**`Admin.tsx` — three changes:**

1. *Registered Accounts*: Update `queryFn` to handle `{ users, total }` response shape and display `total` in the section header.

2. *AI Health card*: Add a card at the top of AI USAGE showing:
   - API key configured: yes/no (from `/admin/ai-health`)
   - Last AI run timestamp
   - Last error message (if any)
   - Upcoming fixtures: X with tips / Y without tips (from extended db-stats)

3. *Force Sync / AI Tips error detail*: Below each button, add a collapsible "Last error" panel that shows the full error message and timestamp when the last action failed. Uses the existing `syncResult`/`syncError` state — just displays it more clearly.

## Error Handling

- All `fetch` calls in Admin.tsx already catch errors and show toasts. The new "last error" panel persists the error until the next successful run, giving the admin time to read it.
- `lastError` in AI stats is set inside `callClaude()` when Claude returns an error, stored in memory alongside the existing usage log.
- If `/admin/ai-health` returns `apiKeyConfigured: false`, the AI Health card shows a prominent warning with the exact env var name to set (`ANTHROPIC_API_KEY`).

## Files Modified

| File | Change |
|------|--------|
| `artifacts/football-platform/src/App.tsx` | `setTokenGetter` → `setAuthTokenGetter` |
| `artifacts/football-platform/src/hooks/useAuth.ts` | `getToken` uses `supabase.auth.getSession()` |
| `artifacts/football-platform/src/pages/Admin.tsx` | Fix registered accounts shape, add AI health card, add error detail panels |
| `artifacts/api-server/src/routes/admin.ts` | Fix supabase-users response shape, extend ai-stats and db-stats |
| `artifacts/api-server/src/ai/analysisLayer.ts` | Track `lastError` and `lastRunAt` in AI stats |

## Out of Scope

- Fixing underlying cause if `ANTHROPIC_API_KEY` is truly missing on Railway (user must set it in Railway dashboard)
- Historical data backfill or new sync strategies
- Changes to the poller or fixture fetching logic
