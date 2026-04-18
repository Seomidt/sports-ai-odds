# Admin Panel Bug Fix & Error Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 concrete bugs in the admin panel and API server, then add AI health visibility and better error detail so issues can be diagnosed without checking Railway logs.

**Architecture:** Backend-first: fix response shapes and extend endpoints, then update the frontend to match. All changes are confined to 5 files. No new routes or components — only fixes and additions within existing structures.

**Tech Stack:** Express 5 / TypeScript / Drizzle ORM (backend), React / TanStack Query / Tailwind (frontend), Supabase Auth, Anthropic SDK.

**Spec:** `docs/superpowers/specs/2026-04-18-admin-bugfix-design.md`

---

### Task 1: Backend — Fix `/admin/supabase-users` response shape

**Files:**
- Modify: `artifacts/api-server/src/routes/admin.ts` (line ~213–230)

- [ ] **Step 1: Find the supabase-users handler**

Open `artifacts/api-server/src/routes/admin.ts`. Locate the `router.get("/admin/supabase-users", ...)` handler (around line 213). It currently ends with `return res.json(users)` where `users` is an array.

- [ ] **Step 2: Wrap the response in `{ users, total }`**

Replace the final `return res.json(users)` with:

```typescript
return res.json({ users, total: users.length });
```

Full handler after change:
```typescript
router.get("/admin/supabase-users", requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
    if (error) throw error;
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      firstName: null,
      lastName: null,
      createdAt: u.created_at ? new Date(u.created_at).getTime() : null,
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null,
    }));
    return res.json({ users, total: users.length });
  } catch (err) {
    console.error("[admin] supabase-users error:", err);
    return res.status(500).json({ error: "Failed to fetch Supabase users" });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/admin.ts
git commit -m "fix: wrap supabase-users response in { users, total }"
```

---

### Task 2: Backend — Extend `/admin/db-stats` with upcoming tips coverage

**Files:**
- Modify: `artifacts/api-server/src/routes/admin.ts` (the db-stats handler)

- [ ] **Step 1: Add the `lte` and `inArray` imports if missing**

At the top of `admin.ts`, the import line is:
```typescript
import { eq, sql } from "drizzle-orm";
```
Replace with:
```typescript
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";
```

- [ ] **Step 2: Extend the db-stats handler**

Find the `router.get("/admin/db-stats", ...)` handler. Replace the entire handler with:

```typescript
router.get("/admin/db-stats", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      [fixturesRow],
      [teamsRow],
      [standingsRow],
      [signalsRow],
      [tipsRow],
      [oddsRow],
      upcomingRows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(fixtures),
      db.select({ count: sql<number>`count(*)::int` }).from(teams),
      db.select({ count: sql<number>`count(*)::int` }).from(standings),
      db.select({ count: sql<number>`count(*)::int` }).from(fixtureSignals),
      db.select({ count: sql<number>`count(*)::int` }).from(aiBettingTips),
      db.select({ count: sql<number>`count(*)::int` }).from(oddsMarkets),
      db.select({ fixtureId: fixtures.fixtureId })
        .from(fixtures)
        .where(
          and(
            gte(fixtures.kickoff, now),
            lte(fixtures.kickoff, in7Days),
            inArray(fixtures.statusShort, ["NS", "TBD"]),
          ),
        ),
    ]);

    const upcomingIds = upcomingRows.map((r) => r.fixtureId);
    let upcomingWithTips = 0;

    if (upcomingIds.length > 0) {
      const tipsRows = await db
        .selectDistinct({ fixtureId: aiBettingTips.fixtureId })
        .from(aiBettingTips)
        .where(inArray(aiBettingTips.fixtureId, upcomingIds));
      upcomingWithTips = tipsRows.length;
    }

    return res.json({
      fixtures: fixturesRow?.count ?? 0,
      teams: teamsRow?.count ?? 0,
      standings: standingsRow?.count ?? 0,
      fixtureSignals: signalsRow?.count ?? 0,
      aiTips: tipsRow?.count ?? 0,
      oddsMarkets: oddsRow?.count ?? 0,
      upcomingFixtures: upcomingIds.length,
      upcomingWithTips,
      upcomingWithoutTips: upcomingIds.length - upcomingWithTips,
    });
  } catch (err) {
    console.error("[admin] db-stats error:", err);
    return res.status(500).json({ error: "Failed to fetch DB stats" });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/admin.ts
git commit -m "fix: add upcomingWithTips/upcomingWithoutTips to db-stats"
```

---

### Task 3: Backend — Track `lastError` and `lastRunAt` in AI stats

**Files:**
- Modify: `artifacts/api-server/src/ai/analysisLayer.ts`

- [ ] **Step 1: Add module-level tracking variables**

In `analysisLayer.ts`, find the token tracking section (around line 42–50, after the `aiUsageLog` declaration). Add two new variables directly after `let aiUsageLog`:

```typescript
let lastAiError: string | null = null;
let lastAiRunAt: number | null = null;
```

- [ ] **Step 2: Update `callClaude` to set these on success and failure**

Find the `callClaude` function. Update it so:
- On success: set `lastAiRunAt = Date.now()` and clear `lastAiError = null`
- On error: set `lastAiError` to the error message

Replace the existing `callClaude` function:

```typescript
async function callClaude(userMessage: string, system?: string): Promise<string | null> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      ...(system ? {
        system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      } : {}),
      messages: [{ role: "user", content: userMessage }],
    });
    const inputTok = msg.usage?.input_tokens ?? 0;
    const outputTok = msg.usage?.output_tokens ?? 0;
    totalInputTokens += inputTok;
    totalOutputTokens += outputTok;
    scheduleAiFlush();
    aiUsageLog.push({ at: Date.now(), inputTokens: inputTok, outputTokens: outputTok });
    if (aiUsageLog.length > 500) aiUsageLog = aiUsageLog.slice(-500);
    lastAiRunAt = Date.now();
    lastAiError = null;
    const block = msg.content[0];
    if (block?.type === "text") return block.text;
    return null;
  } catch (err) {
    lastAiError = err instanceof Error ? err.message : String(err);
    console.error("[ai] Claude error:", err);
    return null;
  }
}
```

- [ ] **Step 3: Expose `lastError` and `lastRunAt` in `getAiStats`**

Find the `getAiStats` function. Add `lastError` and `lastRunAt` to the returned object:

```typescript
return {
  totalInputTokens,
  totalOutputTokens,
  totalTokens: totalInputTokens + totalOutputTokens,
  estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
  todayInputTokens: sum(entriesToday, "inputTokens"),
  todayOutputTokens: sum(entriesToday, "outputTokens"),
  last24hInputTokens: sum(entries24h, "inputTokens"),
  last24hOutputTokens: sum(entries24h, "outputTokens"),
  last7dInputTokens: last7dInput,
  last7dOutputTokens: last7dOutput,
  last7dTokens: last7dInput + last7dOutput,
  avgDailyTokens: Math.round((last7dInput + last7dOutput) / daysWithData),
  callsTotal: aiUsageLog.length,
  model: "claude-haiku-4-5-20251001",
  pricingNote: `$${INPUT_COST_PER_M}/MTok in · $${OUTPUT_COST_PER_M}/MTok out`,
  lastError,
  lastRunAt,
};
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/ai/analysisLayer.ts
git commit -m "fix: track lastError and lastRunAt in AI stats"
```

---

### Task 4: Frontend — Fix `App.tsx` token getter name

**Files:**
- Modify: `artifacts/football-platform/src/App.tsx` (line 6)

- [ ] **Step 1: Fix the import**

On line 6 of `App.tsx`, change:
```typescript
import { useGetMe, setTokenGetter } from "@workspace/api-client-react";
```
to:
```typescript
import { useGetMe, setAuthTokenGetter } from "@workspace/api-client-react";
```

- [ ] **Step 2: Fix the usage in `SupabaseTokenInjector`**

Find the `SupabaseTokenInjector` component (lines 43–51). Change `setTokenGetter` to `setAuthTokenGetter`:

```typescript
function SupabaseTokenInjector() {
  useEffect(() => {
    setAuthTokenGetter(() =>
      supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null)
    );
    return () => setAuthTokenGetter(() => Promise.resolve(null));
  }, []);
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/football-platform/src/App.tsx
git commit -m "fix: correct setAuthTokenGetter import name in App.tsx"
```

---

### Task 5: Frontend — Fix `useAuth.ts` stale token

**Files:**
- Modify: `artifacts/football-platform/src/hooks/useAuth.ts` (line 40)

- [ ] **Step 1: Update `getToken` to always fetch a fresh session**

Find line 40 in `useAuth.ts`:
```typescript
getToken: () => Promise.resolve(session?.access_token ?? null),
```
Replace with:
```typescript
getToken: () => supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null),
```

The `supabase` client is already imported at the top of the file.

- [ ] **Step 2: Commit**

```bash
git add artifacts/football-platform/src/hooks/useAuth.ts
git commit -m "fix: use supabase.auth.getSession() in getToken to avoid stale tokens"
```

---

### Task 6: Frontend — Fix Registered Accounts section in Admin.tsx

**Files:**
- Modify: `artifacts/football-platform/src/pages/Admin.tsx`

- [ ] **Step 1: Update the response type in the query**

Find the `clerkUsersData` query in `AdminContent` (around line 832–843). The `queryFn` return type is already typed as `{ users: [...]; total: number }` — this now matches the fixed API. No type change needed.

Update the query result display: find line ~1094:
```typescript
{clerkUsersData ? `${clerkUsersData.total} total` : ""}
```
This already references `.total` correctly. Verify the users table render uses `clerkUsersData.users` (not `clerkUsersData` directly as an array). It should already be `clerkUsersData.users.map(...)` — confirm at line ~1115. No change needed if already correct.

- [ ] **Step 2: Confirm the empty state check**

Find line ~1102:
```typescript
) : clerkUsersData?.users?.length ? (
```
This is already correct. The fix is server-side (Task 1) — with the API now returning `{ users, total }`, this condition will correctly evaluate.

- [ ] **Step 3: Commit (only if any frontend changes were made)**

```bash
git add artifacts/football-platform/src/pages/Admin.tsx
git commit -m "fix: registered accounts now uses { users, total } response shape"
```

---

### Task 7: Frontend — Add AI Health card to `AiStatsSection`

**Files:**
- Modify: `artifacts/football-platform/src/pages/Admin.tsx` — `AiStatsSection` component

- [ ] **Step 1: Add `AiHealthResponse` and `DbStats` type additions**

At the top of `Admin.tsx`, find the existing `AiStats` interface (around line 89). Add `lastError` and `lastRunAt` fields:

```typescript
interface AiStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  todayInputTokens: number;
  todayOutputTokens: number;
  last24hInputTokens: number;
  last24hOutputTokens: number;
  last7dInputTokens?: number;
  last7dOutputTokens?: number;
  last7dTokens?: number;
  avgDailyTokens?: number;
  callsTotal: number;
  model: string;
  pricingNote: string;
  lastError: string | null;
  lastRunAt: number | null;
}
```

Find the existing `DbStats` interface (around line 222). Add the new fields:

```typescript
interface DbStats {
  fixtures: number;
  teams: number;
  standings: number;
  fixtureSignals: number;
  aiTips: number;
  oddsMarkets: number;
  upcomingFixtures: number;
  upcomingWithTips: number;
  upcomingWithoutTips: number;
}
```

Add a new `AiHealth` interface:
```typescript
interface AiHealth {
  apiKeyConfigured: boolean;
  keyEnvVar: string;
}
```

- [ ] **Step 2: Add `aiHealth` query inside `AiStatsSection`**

Inside the `AiStatsSection` function, after the existing `useQuery` for AI stats, add:

```typescript
const { data: health } = useQuery<AiHealth>({
  queryKey: ["aiHealth"],
  queryFn: async () => {
    const token = await getToken();
    const res = await fetch("/api/admin/ai-health", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to fetch AI health");
    return res.json();
  },
  staleTime: 60_000,
});

const { data: dbStats } = useQuery<DbStats>({
  queryKey: ["dbStatsAi"],
  queryFn: async () => {
    const token = await getToken();
    const res = await fetch("/api/admin/db-stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to fetch DB stats");
    return res.json();
  },
  refetchInterval: 30_000,
  staleTime: 15_000,
});
```

- [ ] **Step 3: Add AI Health card before the stats grid**

Inside `AiStatsSection`, in the JSX, add this block directly after the `<h2>` heading and before the `{isLoading ? (` check:

```tsx
{/* AI Health card */}
{health && (
  <div className={`flex flex-wrap items-center gap-4 p-4 rounded-xl border mb-6 ${
    health.apiKeyConfigured
      ? "bg-teal-500/5 border-teal-500/20"
      : "bg-red-500/10 border-red-500/30"
  }`}>
    <div className="flex items-center gap-2">
      {health.apiKeyConfigured
        ? <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
        : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
      <span className={`text-xs font-mono font-bold ${health.apiKeyConfigured ? "text-teal-400" : "text-red-400"}`}>
        {health.apiKeyConfigured ? "API KEY CONFIGURED" : `API KEY MISSING — set ${health.keyEnvVar} on Railway`}
      </span>
    </div>
    {dbStats && (
      <div className="flex items-center gap-3 ml-auto text-xs font-mono text-muted-foreground">
        <span className="text-teal-400 font-bold">{dbStats.upcomingWithTips}</span>
        <span>/ {dbStats.upcomingFixtures} upcoming with tips</span>
        {dbStats.upcomingWithoutTips > 0 && (
          <span className="text-amber-400 font-bold">{dbStats.upcomingWithoutTips} missing</span>
        )}
      </div>
    )}
    {data?.lastRunAt && (
      <span className="text-xs font-mono text-muted-foreground ml-2">
        Last run: {format(new Date(data.lastRunAt), "MMM dd HH:mm")}
      </span>
    )}
    {data?.lastError && (
      <span className="text-xs font-mono text-red-400 truncate max-w-xs" title={data.lastError}>
        Error: {data.lastError}
      </span>
    )}
  </div>
)}
```

Note: `CheckCircle2` and `XCircle` are already imported in `Admin.tsx`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/football-platform/src/pages/Admin.tsx
git commit -m "feat: add AI health card to admin panel with key status and tips coverage"
```

---

### Task 8: Frontend — Add error detail panels to Force Sync / AI Tips

**Files:**
- Modify: `artifacts/football-platform/src/pages/Admin.tsx` — `ForceSyncSection` component

- [ ] **Step 1: Add `aiTipsError` state**

Inside `ForceSyncSection`, find the existing state declarations (around line 593–597):
```typescript
const [loadingFull, setLoadingFull] = useState(false);
const [loadingFixture, setLoadingFixture] = useState(false);
const [loadingAi, setLoadingAi] = useState(false);
const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
```

Add one more:
```typescript
const [aiTipsError, setAiTipsError] = useState<string | null>(null);
const [aiTipsSuccess, setAiTipsSuccess] = useState(false);
```

- [ ] **Step 2: Update `handleForceAiTips` to set error/success state**

Find `handleForceAiTips` and replace it:

```typescript
const handleForceAiTips = async () => {
  setLoadingAi(true);
  setAiTipsError(null);
  setAiTipsSuccess(false);
  try {
    const headers = await authHeaders();
    const res = await fetch("/api/admin/force-ai-tips", { method: "POST", headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error ?? `AI tips fejl (${res.status})`;
      setAiTipsError(msg);
      toast({ title: msg, variant: "destructive" });
    } else {
      setAiTipsSuccess(true);
      toast({ title: "AI tip generation startet", description: "Kører i baggrunden for alle kommende kampe" });
    }
  } catch (err) {
    const msg = `Netværksfejl: ${err instanceof Error ? err.message : String(err)}`;
    setAiTipsError(msg);
    toast({ title: msg, variant: "destructive" });
  } finally {
    setLoadingAi(false);
  }
};
```

- [ ] **Step 3: Show error/success detail below the AI Tips button**

Find the AI Tips button in the JSX (the `<button onClick={handleForceAiTips}...>` block). Add this immediately after it:

```tsx
{aiTipsError && (
  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
    <p className="text-xs font-mono text-red-400">{aiTipsError}</p>
  </div>
)}
{aiTipsSuccess && (
  <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-3">
    <p className="text-xs font-mono text-teal-400">Generation startet — check AI USAGE for progress</p>
  </div>
)}
```

- [ ] **Step 4: Make sync error more visible**

Find the `syncResult` display block (around line 763). Above it, add an explicit error panel for when sync completes with an error (the existing `syncError` state from the polling loop):

After the existing `stopPolling` is called in the polling `setInterval` callback, the `syncError` is already set. In the JSX, find any existing reference to `syncError` and confirm it's displayed. If not already shown, add below the sync button:

```tsx
{syncError && (
  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Sync fejl</div>
    <p className="text-xs font-mono text-red-400">{syncError}</p>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/football-platform/src/pages/Admin.tsx
git commit -m "feat: show persistent error detail panels for force sync and AI tips"
```

---

### Task 9: Push and verify

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

Railway and Vercel will both auto-deploy from GitHub.

- [ ] **Step 2: Monitor Railway deploy**

In the Railway dashboard, watch the build logs for `@workspace/api-server`. A successful deploy ends with `Server listening` in the logs.

- [ ] **Step 3: Verify admin panel in browser**

1. Open the admin panel
2. Check "API Telemetry" — should now show real numbers
3. Check "Registered Accounts" — should now show users
4. Check "AI USAGE" — the health card should show whether `ANTHROPIC_API_KEY` is configured
5. Click "Force Full Sync" — should start and poll for result
6. Click "Force AI Tips Generation" — should show success or a clear error

- [ ] **Step 4: If AI health card shows key missing**

Go to Railway dashboard → your API service → Variables → add `ANTHROPIC_API_KEY` with your Anthropic key. Railway will restart automatically.

- [ ] **Step 5: Final commit if any hotfixes needed**

```bash
git add <changed files>
git commit -m "fix: <describe hotfix>"
git push origin main
```
