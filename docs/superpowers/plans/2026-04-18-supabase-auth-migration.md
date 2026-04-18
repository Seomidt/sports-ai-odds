# Supabase Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clerk authentication with Supabase Auth (email+password + Google OAuth) across the full stack.

**Architecture:** The backend gains a Supabase admin client that verifies Bearer JWTs via `supabaseAdmin.auth.getUser(token)` — no more Clerk proxy or `clerkMiddleware`. The frontend gains a `useAuth` hook wrapping Supabase session state, a `Login` page using `@supabase/auth-ui-react`, and drops `ClerkProvider` entirely.

**Tech Stack:** `@supabase/supabase-js` (backend + frontend), `@supabase/auth-ui-react` + `@supabase/auth-ui-shared` (login UI), Drizzle ORM (DB), Wouter (routing), TanStack Query (data fetching).

---

## File Map

| File | Action |
|------|--------|
| `artifacts/api-server/src/lib/supabase.ts` | **Create** — Supabase admin client |
| `artifacts/api-server/src/middlewares/requireAuth.ts` | **Rewrite** — Supabase JWT verification |
| `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` | **Delete** |
| `artifacts/api-server/src/app.ts` | **Modify** — remove Clerk middleware |
| `artifacts/api-server/src/routes/me.ts` | **Rewrite** — use Supabase admin client |
| `artifacts/api-server/src/routes/admin.ts` | **Modify** — rename endpoint, use Supabase |
| `artifacts/api-server/src/routes/fixtures.ts` | **Modify** — replace `getAuth` |
| `artifacts/football-platform/src/lib/supabase.ts` | **Create** — Supabase browser client |
| `artifacts/football-platform/src/hooks/useAuth.ts` | **Create** — auth hook |
| `artifacts/football-platform/src/pages/Login.tsx` | **Create** — login page |
| `artifacts/football-platform/src/App.tsx` | **Rewrite** — drop ClerkProvider |
| `artifacts/football-platform/src/components/Layout.tsx` | **Modify** — swap Clerk hooks |
| `artifacts/football-platform/src/pages/Admin.tsx` | **Modify** — swap import + endpoint URL |
| `artifacts/football-platform/src/pages/Match.tsx` | **Modify** — swap Clerk hook |
| `artifacts/football-platform/src/pages/Following.tsx` | **Modify** — swap Clerk hook |
| `artifacts/api-server/package.json` | **Modify** — swap packages |
| `artifacts/football-platform/package.json` | **Modify** — swap packages |

---

## Task 1: Swap packages

**Files:**
- Modify: `artifacts/api-server/package.json`
- Modify: `artifacts/football-platform/package.json`

- [ ] **Step 1: Remove Clerk and add Supabase in the API server**

```bash
cd artifacts/api-server
pnpm remove @clerk/express
pnpm add @supabase/supabase-js
```

Expected: No errors. `package.json` now lists `@supabase/supabase-js` and no `@clerk/express`.

- [ ] **Step 2: Remove Clerk and add Supabase in the frontend**

```bash
cd artifacts/football-platform
pnpm remove @clerk/react
pnpm add @supabase/supabase-js @supabase/auth-ui-react @supabase/auth-ui-shared
```

Expected: No errors. `package.json` lists the three new Supabase packages and no `@clerk/react`.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add artifacts/api-server/package.json artifacts/football-platform/package.json pnpm-lock.yaml
git commit -m "chore: swap @clerk/* for @supabase/* packages"
```

---

## Task 2: Backend — create Supabase admin client

**Files:**
- Create: `artifacts/api-server/src/lib/supabase.ts`

- [ ] **Step 1: Create the file**

`artifacts/api-server/src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/src/lib/supabase.ts
git commit -m "feat(api): add Supabase admin client"
```

---

## Task 3: Backend — rewrite requireAuth middleware

**Files:**
- Modify: `artifacts/api-server/src/middlewares/requireAuth.ts`

- [ ] **Step 1: Replace the entire file**

`artifacts/api-server/src/middlewares/requireAuth.ts`:
```typescript
import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "seomidt@gmail.com").toLowerCase().trim();

export async function getUserFromRequest(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user?.email) return null;
  return { id: user.id, email: user.email.toLowerCase().trim() };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  getUserFromRequest(req)
    .then((user) => {
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    })
    .catch(() => res.status(401).json({ error: "Unauthorized" }));
}

export async function requireAllowedUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) { next(); return; }

  const allowed = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.email, user.email),
  });

  if (!allowed) {
    res.status(403).json({ error: "Access denied. You are not on the allowed list." });
    return;
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) { next(); return; }

  const allowed = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.email, user.email),
  });

  if (!allowed || allowed.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
```

- [ ] **Step 2: Verify it compiles (TypeScript check)**

```bash
cd artifacts/api-server
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: No errors referencing `requireAuth.ts`.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add artifacts/api-server/src/middlewares/requireAuth.ts
git commit -m "feat(api): rewrite requireAuth to use Supabase JWT verification"
```

---

## Task 4: Backend — remove Clerk middleware from app.ts and delete proxy file

**Files:**
- Modify: `artifacts/api-server/src/app.ts`
- Delete: `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`

- [ ] **Step 1: Remove all Clerk lines from app.ts**

In `artifacts/api-server/src/app.ts`, remove these 4 lines:

```typescript
// REMOVE line 4:
import { clerkMiddleware } from "@clerk/express";
// REMOVE line 5:
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware.js";
// REMOVE line 17:
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// REMOVE line 75:
app.use(clerkMiddleware());
```

The resulting `app.ts` should look like this (complete file):
```typescript
import express, { type Express } from "express";
import cors from "cors";
import pinoHttpImport from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { STRIPE_ENABLED } from "./billing/stripeClient.js";
import { handleStripeWebhook } from "./billing/webhookHandler.js";

const pinoHttp = pinoHttpImport as unknown as (options?: unknown) => express.RequestHandler;

const app: Express = express();

app.use(pinoHttp({ logger }));

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

function buildDevOrigins(): Set<string> {
  const origins = new Set<string>();
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) {
    origins.add(`https://${domain}`);
    origins.add(`http://${domain}`);
  }
  return origins;
}

const DEV_ORIGINS = buildDevOrigins();

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const isReplitApp = /^https:\/\/[a-zA-Z0-9-]+\.replit\.app$/.test(origin);
      const isReplitDev = /^https?:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.repl\.co$/.test(origin);
      const isVercel = /^https:\/\/[a-zA-Z0-9-]+(\.vercel\.app|\.now\.sh)$/.test(origin);
      const allowed =
        isLocalhost ||
        isReplitApp ||
        isReplitDev ||
        isVercel ||
        DEV_ORIGINS.has(origin) ||
        ALLOWED_ORIGINS.has(origin);
      callback(allowed ? null : new Error("CORS: origin not allowed"), allowed);
    },
  }),
);

if (STRIPE_ENABLED) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    handleStripeWebhook,
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
```

- [ ] **Step 2: Delete the Clerk proxy middleware file**

```bash
rm artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts
```

- [ ] **Step 3: Verify compilation**

```bash
cd artifacts/api-server
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: No errors about `clerkMiddleware` or `clerkProxyMiddleware`.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add artifacts/api-server/src/app.ts
git rm artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts
git commit -m "chore(api): remove Clerk middleware and proxy"
```

---

## Task 5: Backend — rewrite routes/me.ts

**Files:**
- Modify: `artifacts/api-server/src/routes/me.ts`

- [ ] **Step 1: Replace the entire file**

`artifacts/api-server/src/routes/me.ts`:
```typescript
import { Router } from "express";
import { getUserFromRequest } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "seomidt@gmail.com").toLowerCase().trim();

const router = Router();

router.get("/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.json({ authenticated: false, role: null, accessDenied: true });
    }

    if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
      return res.json({ authenticated: true, role: "admin", accessDenied: false, email: user.email });
    }

    const allowed = await db.query.allowedUsers.findFirst({
      where: eq(allowedUsers.email, user.email),
    });

    if (!allowed) {
      return res.json({ authenticated: true, role: null, accessDenied: true, email: user.email });
    }

    return res.json({ authenticated: true, role: allowed.role, accessDenied: false, email: user.email });
  } catch (err) {
    console.error("[/me] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/src/routes/me.ts
git commit -m "feat(api): migrate /me route to Supabase auth"
```

---

## Task 6: Backend — update routes/admin.ts

**Files:**
- Modify: `artifacts/api-server/src/routes/admin.ts`

- [ ] **Step 1: Remove clerkClient import**

In `artifacts/api-server/src/routes/admin.ts`, change line 2:

```typescript
// Remove:
import { clerkClient } from "@clerk/express";
// Add:
import { supabaseAdmin } from "../lib/supabase.js";
```

- [ ] **Step 2: Replace the /admin/clerk-users endpoint**

Find and replace the entire `router.get("/admin/clerk-users", ...)` block (lines 213–229):

```typescript
// Remove the old block:
router.get("/admin/clerk-users", requireAdmin, async (_req, res) => {
  try {
    const response = await clerkClient.users.getUserList({ limit: 100, orderBy: "-created_at" });
    const users = response.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? "",
      firstName: u.firstName,
      lastName: u.lastName,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
    }));
    return res.json({ users, total: response.totalCount });
  } catch (err) {
    console.error("[admin] clerk-users error:", err);
    return res.status(500).json({ error: "Failed to fetch Clerk users" });
  }
});

// Replace with:
router.get("/admin/supabase-users", requireAdmin, async (_req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
    if (error) throw error;
    const mapped = users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      firstName: null as string | null,
      lastName: null as string | null,
      createdAt: new Date(u.created_at).getTime(),
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null,
    }));
    return res.json({ users: mapped, total: mapped.length });
  } catch (err) {
    console.error("[admin] supabase-users error:", err);
    return res.status(500).json({ error: "Failed to fetch Supabase users" });
  }
});
```

- [ ] **Step 3: Verify compilation**

```bash
cd artifacts/api-server
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add artifacts/api-server/src/routes/admin.ts
git commit -m "feat(api): migrate admin routes to Supabase (rename clerk-users → supabase-users)"
```

---

## Task 7: Backend — update routes/fixtures.ts

**Files:**
- Modify: `artifacts/api-server/src/routes/fixtures.ts`

- [ ] **Step 1: Replace the getAuth import with getUserFromRequest**

In `artifacts/api-server/src/routes/fixtures.ts`, change line 3:

```typescript
// Remove:
import { getAuth } from "@clerk/express";
// Add:
import { getUserFromRequest } from "../middlewares/requireAuth.js";
```

- [ ] **Step 2: Replace the auth call inside /fixtures/followed**

Find lines 114–127 and replace:

```typescript
// Remove:
router.get("/fixtures/followed", async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.json({ fixtureIds: [] });
    const rows = await db
      .select({ fixtureId: followedFixtures.fixtureId })
      .from(followedFixtures)
      .where(eq(followedFixtures.userId, userId));
    return res.json({ fixtureIds: rows.map(r => r.fixtureId) });
  } catch (err) {
    reqLogError("fixtures.followed", err);
    return res.json({ fixtureIds: [] });
  }
});

// Replace with:
router.get("/fixtures/followed", async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.json({ fixtureIds: [] });
    const rows = await db
      .select({ fixtureId: followedFixtures.fixtureId })
      .from(followedFixtures)
      .where(eq(followedFixtures.userId, user.id));
    return res.json({ fixtureIds: rows.map(r => r.fixtureId) });
  } catch (err) {
    reqLogError("fixtures.followed", err);
    return res.json({ fixtureIds: [] });
  }
});
```

- [ ] **Step 3: Verify compilation**

```bash
cd artifacts/api-server
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: No errors. No remaining `@clerk` imports in the API server:

```bash
grep -r "@clerk" src/ --include="*.ts"
```

Expected: No output.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add artifacts/api-server/src/routes/fixtures.ts
git commit -m "feat(api): migrate fixtures/followed to Supabase auth"
```

---

## Task 8: Frontend — create Supabase browser client

**Files:**
- Create: `artifacts/football-platform/src/lib/supabase.ts`

- [ ] **Step 1: Create the file**

`artifacts/football-platform/src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/football-platform/src/lib/supabase.ts
git commit -m "feat(web): add Supabase browser client"
```

---

## Task 9: Frontend — create useAuth hook

**Files:**
- Create: `artifacts/football-platform/src/hooks/useAuth.ts`

- [ ] **Step 1: Create the file**

`artifacts/football-platform/src/hooks/useAuth.ts`:
```typescript
import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: { id: string; email: string } | null;
  isSignedIn: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user
      ? { id: session.user.id, email: session.user.email ?? "" }
      : null,
    isSignedIn: session !== null,
    isLoading,
    signOut: () => supabase.auth.signOut().then(() => undefined),
    getToken: () => Promise.resolve(session?.access_token ?? null),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/football-platform/src/hooks/useAuth.ts
git commit -m "feat(web): add useAuth hook wrapping Supabase session"
```

---

## Task 10: Frontend — create Login page

**Files:**
- Create: `artifacts/football-platform/src/pages/Login.tsx`

- [ ] **Step 1: Create the file**

`artifacts/football-platform/src/pages/Login.tsx`:
```tsx
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Redirect } from "wouter";
import { Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export function Login() {
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) return null;
  if (isSignedIn) return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background opacity-50" />
      <div className="relative z-10 w-full max-w-sm glass-card p-8 rounded-xl">
        <div className="flex items-center justify-center mb-8">
          <Zap className="w-7 h-7 text-primary mr-2" />
          <span className="text-lg font-mono font-bold text-white tracking-wider uppercase">Sports AI Odds</span>
        </div>
        <Auth
          supabaseClient={supabase}
          providers={["google"]}
          redirectTo={`${window.location.origin}/dashboard`}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: "#18cfc0",
                  brandAccent: "#14a89b",
                  inputBackground: "rgba(255,255,255,0.05)",
                  inputBorder: "rgba(255,255,255,0.12)",
                  inputText: "white",
                  inputPlaceholder: "rgba(255,255,255,0.35)",
                  messageText: "rgba(255,255,255,0.75)",
                  anchorTextColor: "#18cfc0",
                  dividerBackground: "rgba(255,255,255,0.10)",
                },
                fonts: {
                  bodyFontFamily: `ui-monospace, SFMono-Regular, Menlo, monospace`,
                  inputFontFamily: `ui-monospace, SFMono-Regular, Menlo, monospace`,
                  buttonFontFamily: `ui-monospace, SFMono-Regular, Menlo, monospace`,
                },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/football-platform/src/pages/Login.tsx
git commit -m "feat(web): add Login page using Supabase Auth UI"
```

---

## Task 11: Frontend — rewrite App.tsx

**Files:**
- Modify: `artifacts/football-platform/src/App.tsx`

- [ ] **Step 1: Replace the entire file**

`artifacts/football-platform/src/App.tsx`:
```tsx
import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe, setTokenGetter } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

import { SessionProvider } from "./lib/session";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Live } from "./pages/Live";
import { PreMatch } from "./pages/PreMatch";
import { PostMatch } from "./pages/PostMatch";
import { Match } from "./pages/Match";
import { Standings } from "./pages/Standings";
import { Following } from "./pages/Following";
import { News } from "./pages/News";
import { Admin } from "./pages/Admin";
import { Signals } from "./pages/Signals";
import { Login } from "./pages/Login";
import NotFound from "./pages/not-found";
import accessPendingImage from "@assets/IMG_3621_1775934471623.png";
import { ShieldAlert, Activity } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function SupabaseTokenInjector() {
  useEffect(() => {
    setTokenGetter(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    });
    return () => setTokenGetter(() => Promise.resolve(null));
  }, []);
  return null;
}

function SupabaseCacheInvalidator() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);
  return null;
}

function AccessPendingPage() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <div className="w-40 h-40 rounded-3xl overflow-hidden border border-white/10 bg-white/5 mb-6 shadow-2xl">
        <img src={accessPendingImage} alt="Access pending" className="w-full h-full object-cover" />
      </div>
      <ShieldAlert className="w-16 h-16 text-secondary mb-6" />
      <h1 className="text-3xl font-bold font-mono text-white mb-2 tracking-tight">ACCESS PENDING</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Your account is signed in, but access has not been granted yet. If you should have access, ask an admin to approve your account.
      </p>
      <button
        onClick={() => signOut()}
        className="px-6 py-2 border border-white/10 rounded-md text-sm font-mono text-white hover:bg-white/5 transition-colors"
      >
        SIGN OUT
      </button>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoading } = useAuth();
  const { data: me, isLoading: meLoading } = useGetMe({ retry: false });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!isSignedIn) return <Redirect to="/login" />;

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (me?.accessDenied) return <AccessPendingPage />;

  return <Component />;
}

function HomeRedirect() {
  const { isSignedIn, isLoading } = useAuth();
  if (isLoading) return null;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Home />;
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseTokenInjector />
      <SupabaseCacheInvalidator />
      <SessionProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/login" component={Login} />

          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/live"><ProtectedRoute component={Live} /></Route>
          <Route path="/pre-match"><ProtectedRoute component={PreMatch} /></Route>
          <Route path="/post-match"><ProtectedRoute component={PostMatch} /></Route>
          <Route path="/match/:id"><ProtectedRoute component={Match} /></Route>
          <Route path="/signals"><ProtectedRoute component={Signals} /></Route>
          <Route path="/standings"><ProtectedRoute component={Standings} /></Route>
          <Route path="/following"><ProtectedRoute component={Following} /></Route>
          <Route path="/news"><ProtectedRoute component={News} /></Route>
          <Route path="/admin"><ProtectedRoute component={Admin} /></Route>

          <Route component={NotFound} />
        </Switch>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <AppRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
```

- [ ] **Step 2: Verify no remaining Clerk imports in App.tsx**

```bash
grep "@clerk" artifacts/football-platform/src/App.tsx
```

Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add artifacts/football-platform/src/App.tsx
git commit -m "feat(web): replace ClerkProvider with Supabase auth in App.tsx"
```

---

## Task 12: Frontend — update Layout.tsx

**Files:**
- Modify: `artifacts/football-platform/src/components/Layout.tsx`

- [ ] **Step 1: Replace the Clerk import**

In `artifacts/football-platform/src/components/Layout.tsx`, change line 3:

```typescript
// Remove:
import { useClerk, useUser } from "@clerk/react";
// Add:
import { useAuth } from "@/hooks/useAuth";
```

- [ ] **Step 2: Replace the Clerk hook calls**

Find lines 13–14:
```typescript
const { signOut } = useClerk();
const { user } = useUser();
```

Replace with:
```typescript
const { signOut, user } = useAuth();
```

- [ ] **Step 3: Update the two email display references**

Find (appears twice — desktop sidebar and mobile menu):
```typescript
{user?.primaryEmailAddress?.emailAddress}
```

Replace both with:
```typescript
{user?.email}
```

- [ ] **Step 4: Update the two signOut calls**

Find (appears twice):
```typescript
onClick={() => signOut()}
```

These already call `signOut()` with no args — no change needed.

- [ ] **Step 5: Verify no Clerk imports remain**

```bash
grep "@clerk" artifacts/football-platform/src/components/Layout.tsx
```

Expected: No output.

- [ ] **Step 6: Commit**

```bash
git add artifacts/football-platform/src/components/Layout.tsx
git commit -m "feat(web): migrate Layout to Supabase useAuth hook"
```

---

## Task 13: Frontend — update Admin.tsx

**Files:**
- Modify: `artifacts/football-platform/src/pages/Admin.tsx`

- [ ] **Step 1: Replace the Clerk import on line 1**

```typescript
// Remove:
import { useAuth } from "@clerk/react";
// Add:
import { useAuth } from "@/hooks/useAuth";
```

- [ ] **Step 2: Update the clerk-users endpoint URL and query key**

Find in `AdminContent` (around line 832):
```typescript
queryKey: ["admin", "clerk-users"],
queryFn: async () => {
  const token = await getToken();
  const res = await fetch("/api/admin/clerk-users", {
```

Replace with:
```typescript
queryKey: ["admin", "supabase-users"],
queryFn: async () => {
  const token = await getToken();
  const res = await fetch("/api/admin/supabase-users", {
```

- [ ] **Step 3: Verify no Clerk imports remain**

```bash
grep "@clerk" artifacts/football-platform/src/pages/Admin.tsx
```

Expected: No output.

- [ ] **Step 4: Commit**

```bash
git add artifacts/football-platform/src/pages/Admin.tsx
git commit -m "feat(web): migrate Admin page to Supabase useAuth hook"
```

---

## Task 14: Frontend — update Match.tsx and Following.tsx

**Files:**
- Modify: `artifacts/football-platform/src/pages/Match.tsx`
- Modify: `artifacts/football-platform/src/pages/Following.tsx`

- [ ] **Step 1: Update Match.tsx import**

In `artifacts/football-platform/src/pages/Match.tsx`, change line 25:
```typescript
// Remove:
import { useUser } from "@clerk/react";
// Add:
import { useAuth } from "@/hooks/useAuth";
```

- [ ] **Step 2: Update Match.tsx hook call**

Change line 36:
```typescript
// Remove:
const { user } = useUser();
// Add:
const { user } = useAuth();
```

`user?.id` is used in queryKey and `enabled` — the Supabase user object also has `.id` as a UUID string, so no further changes are needed.

- [ ] **Step 3: Update Following.tsx import**

In `artifacts/football-platform/src/pages/Following.tsx`, change line 6:
```typescript
// Remove:
import { useUser } from "@clerk/react";
// Add:
import { useAuth } from "@/hooks/useAuth";
```

- [ ] **Step 4: Update Following.tsx hook call**

Change line 66:
```typescript
// Remove:
const { user } = useUser();
// Add:
const { user } = useAuth();
```

- [ ] **Step 5: Verify no Clerk imports remain anywhere in frontend**

```bash
grep -r "@clerk" artifacts/football-platform/src --include="*.tsx" --include="*.ts"
```

Expected: No output.

- [ ] **Step 6: Commit**

```bash
git add artifacts/football-platform/src/pages/Match.tsx artifacts/football-platform/src/pages/Following.tsx
git commit -m "feat(web): migrate Match and Following pages to Supabase useAuth"
```

---

## Task 15: Clear followed_fixtures table

The `followed_fixtures` table contains Clerk user IDs that will never match Supabase UUIDs.

- [ ] **Step 1: Run TRUNCATE in the Supabase SQL editor**

In the Supabase dashboard → SQL Editor, run:
```sql
TRUNCATE TABLE followed_fixtures;
```

Expected: "Success. No rows returned."

- [ ] **Step 2: Verify the table is empty**

```sql
SELECT COUNT(*) FROM followed_fixtures;
```

Expected: `count = 0`

---

## Task 16: Update environment variables

- [ ] **Step 1: Add Supabase variables to Railway**

In the Railway dashboard → your API server service → Variables, add:
```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Both values are found in the Supabase dashboard → Project Settings → API.

`CLERK_SECRET_KEY` can be removed once the deploy is confirmed working.

- [ ] **Step 2: Add Supabase variables to Vercel**

In the Vercel dashboard → your project → Settings → Environment Variables, add:
```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

Both values are found in the Supabase dashboard → Project Settings → API.

`VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PROXY_URL` can be removed once confirmed working.

- [ ] **Step 3: Configure Google OAuth in Supabase**

In the Supabase dashboard → Authentication → Providers → Google:
1. Enable Google provider
2. Enter Google OAuth Client ID and Client Secret (from Google Cloud Console)
3. Copy the Supabase callback URL shown (e.g. `https://<ref>.supabase.co/auth/v1/callback`)
4. In Google Cloud Console → your OAuth app → Authorised redirect URIs → add the callback URL above
5. Also add your Vercel app URL to Supabase's "Redirect URLs" allowlist under Authentication → URL Configuration

- [ ] **Step 4: Push to deploy**

```bash
git push
```

Expected: Railway and Vercel both deploy successfully.

- [ ] **Step 5: Smoke test**

1. Open your Vercel app URL in a browser
2. You should see the login page (not a Clerk sign-in widget — the Supabase Auth UI)
3. Sign in with email/password (create an account first if needed)
4. After sign-in, should redirect to `/dashboard`
5. Open `/admin` — should see admin panel working (seomidt@gmail.com is hardcoded as admin)
6. Check the "Registered Accounts" section shows Supabase users
7. Sign out and confirm redirect to login page
