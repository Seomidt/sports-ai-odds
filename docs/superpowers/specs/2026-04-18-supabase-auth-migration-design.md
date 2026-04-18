# Supabase Auth Migration Design

**Date:** 2026-04-18
**Replaces:** Clerk authentication (frontend + backend)
**Admin user:** seomidt@gmail.com

---

## Goal

Replace Clerk with Supabase Auth across the full stack. Sign-in methods: email+password and Google OAuth. Admin role determined by hardcoded `ADMIN_EMAIL=seomidt@gmail.com` (unchanged).

---

## Architecture

### What changes

| Layer | Remove | Add |
|-------|--------|-----|
| Frontend | `ClerkProvider`, `SignIn/SignUp`, `useAuth`, `useUser`, `useClerk`, `@clerk/react` | `@supabase/supabase-js`, `@supabase/auth-ui-react`, `@supabase/auth-ui-shared` |
| Backend | `@clerk/express`, `clerkMiddleware()`, `clerkProxyMiddleware`, `clerkClient` | `@supabase/supabase-js` admin client |
| DB | `followed_fixtures` rows with Clerk user IDs | TRUNCATE `followed_fixtures` |
| Env (Railway) | `CLERK_SECRET_KEY` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Env (Vercel) | `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

### What does not change

- `allowedUsers` table and email-based access control
- `ADMIN_EMAIL=seomidt@gmail.com` hardcode in Railway env
- All route logic beyond auth middleware
- `vercel.json` rewrites
- `followedFixtures` table schema (column stays `text`, stores Supabase UUIDs going forward)

---

## Frontend

### New files

**`artifacts/football-platform/src/lib/supabase.ts`**
```ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

**`artifacts/football-platform/src/hooks/useAuth.ts`**
Wraps `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`:
- `user` — `{ id: string, email: string }` or null
- `session` — full Supabase session object or null
- `isSignedIn` — boolean
- `isLoading` — boolean (true until first auth state resolved)
- `signOut()` — calls `supabase.auth.signOut()`

### Modified files

**`App.tsx`**
- Remove `ClerkProvider`, `SignIn`, `SignUp`, `useClerk`, `useUser`, `useAuth`, proxy URL config
- Add `AuthProvider` wrapping the app (provides session state via context)
- `ClerkTokenInjector` → `useEffect` calling `setTokenGetter(() => supabase.auth.getSession().then(r => r.data.session?.access_token ?? null))`
- `ClerkQueryClientCacheInvalidator` → `supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') queryClient.clear() })`
- `ProtectedRoute` checks `isSignedIn` from new `useAuth` hook; redirects to `/login`
- Routes `/sign-in` and `/sign-up` → single `/login` route

**Login page (`src/pages/Login.tsx` — new)**
- Uses `<Auth>` from `@supabase/auth-ui-react`
- `supabaseClient={supabase}`, `providers={['google']}`, `redirectTo={window.location.origin}`
- Themed with `appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: '#18cfc0', brandAccent: '#18cfc0' } } } }}`
- Wrapped in the existing dark glass card layout

**`Layout.tsx`**
- Replace `useClerk()` + `useUser()` with `useAuth()` from new hook
- `user.email` from `useAuth().user?.email`
- `signOut()` from `useAuth().signOut()`

**`Admin.tsx`**
- Replace `useAuth()` from `@clerk/react` with `useAuth()` from new hook
- `getToken()` → `session?.access_token` (or via `setTokenGetter` — same result)
- Rename `clerkUsersData` → `supabaseUsersData`, update endpoint to `/api/admin/supabase-users`

**`Match.tsx`**, **`Following.tsx`**
- Replace `useUser()` from `@clerk/react` with `useAuth()` from new hook

---

## Backend

### New files

**`artifacts/api-server/src/lib/supabase.ts`**
```ts
import { createClient } from '@supabase/supabase-js'
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

### Deleted files

- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — deleted entirely

### Modified files

**`app.ts`**
- Remove `import { clerkMiddleware }` and `app.use(clerkMiddleware())`
- Remove `import { CLERK_PROXY_PATH, clerkProxyMiddleware }` and `app.use(CLERK_PROXY_PATH, clerkProxyMiddleware())`

**`middlewares/requireAuth.ts`**
Complete rewrite. Helper `getUserFromRequest(req)`:
1. Reads `Authorization: Bearer <token>` header
2. Calls `supabaseAdmin.auth.getUser(token)` — verifies token and returns `{ id, email }`
3. Returns `null` if missing/invalid

Three exported middleware functions keep identical signatures:
- `requireAuth` — passes if `getUserFromRequest` returns a user
- `requireAllowedUser` — additionally checks email against `allowedUsers` table
- `requireAdmin` — checks email matches `ADMIN_EMAIL` or `allowedUsers.role === 'admin'`

No more `clerkClient.users.getUser()` call — email comes directly from Supabase JWT response.

**`routes/me.ts`**
- Replace `getAuth(req)` + `clerkClient.users.getUser()` with `getUserFromRequest(req)`
- Response shape unchanged: `{ authenticated, role, accessDenied, email }`

**`routes/admin.ts`**
- Remove `import { clerkClient }`
- Rename endpoint `/admin/clerk-users` → `/admin/supabase-users`
- Replace `clerkClient.users.getUserList()` with `supabaseAdmin.auth.admin.listUsers()`
- Map fields: `id`, `email` (from `user.email`), `createdAt` (from `user.created_at`), `lastSignInAt` (from `user.last_sign_in_at`)

**`routes/fixtures.ts`**
- No logic change. `getAuth(req)` → `getUserFromRequest(req)` for the `/fixtures/followed` endpoint

### Database migration

New Drizzle migration file:
```sql
TRUNCATE TABLE followed_fixtures;
```
Clears all Clerk user IDs. Supabase UUIDs populate going forward as users follow fixtures.

---

## Google OAuth setup (manual steps — not in code)

Before deploying:
1. In Supabase dashboard → Authentication → Providers → enable Google
2. Add Google OAuth Client ID + Secret (from Google Cloud Console)
3. Add `https://<your-vercel-app>.vercel.app` to Supabase allowed redirect URLs
4. In Google Cloud Console → add `https://<your-supabase-project>.supabase.co/auth/v1/callback` as authorised redirect URI

---

## File change summary

| File | Action |
|------|--------|
| `football-platform/src/lib/supabase.ts` | Create |
| `football-platform/src/hooks/useAuth.ts` | Create |
| `football-platform/src/pages/Login.tsx` | Create |
| `football-platform/src/App.tsx` | Rewrite auth sections |
| `football-platform/src/components/Layout.tsx` | Replace Clerk hooks |
| `football-platform/src/pages/Admin.tsx` | Replace Clerk hooks + endpoint |
| `football-platform/src/pages/Match.tsx` | Replace Clerk hook |
| `football-platform/src/pages/Following.tsx` | Replace Clerk hook |
| `api-server/src/lib/supabase.ts` | Create |
| `api-server/src/middlewares/requireAuth.ts` | Rewrite |
| `api-server/src/middlewares/clerkProxyMiddleware.ts` | Delete |
| `api-server/src/app.ts` | Remove Clerk middleware |
| `api-server/src/routes/me.ts` | Replace Clerk calls |
| `api-server/src/routes/admin.ts` | Replace Clerk calls + rename endpoint |
| `api-server/src/routes/fixtures.ts` | Replace getAuth call |
| `lib/db` migration | TRUNCATE followed_fixtures |
| `artifacts/api-server/package.json` | Remove `@clerk/express`, add `@supabase/supabase-js` |
| `artifacts/football-platform/package.json` | Remove `@clerk/react`, add `@supabase/supabase-js`, `@supabase/auth-ui-react`, `@supabase/auth-ui-shared` |
