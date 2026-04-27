import { useAuth } from "@/hooks/useAuth";
import {
  useGetAdminStats,
  useGetAdminUsers, 
  useAddAdminUser, 
  useDeleteAdminUser, 
  useUpdateAdminUser,
  getGetAdminUsersQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity, ShieldAlert, Users, Server, Plus, Trash2, Shield, User as UserIcon, CreditCard, CheckCircle2, XCircle, Brain, DollarSign, Zap, Database, Play, RefreshCw, Clock, AlertTriangle, LogIn } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { format } from "date-fns";
import { useState, useRef, Component, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AddUserBodyRole, UpdateUserBodyRole } from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Redirect } from "wouter";

class AdminErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Layout>
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400" />
            <h2 className="text-xl font-mono font-bold text-white">Admin Panel Error</h2>
            <p className="text-muted-foreground font-mono text-sm max-w-md">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-mono text-sm rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        </Layout>
      );
    }
    return this.props.children;
  }
}

interface BillingStatus {
  enabled: boolean;
  configured: boolean;
  mode?: "live" | "test";
  accountId?: string;
  accountName?: string;
  message?: string;
  setupSteps?: string[];
}

interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: {
    id: string;
    amount: number | null;
    currency: string;
    interval: string;
    intervalCount: number;
  }[];
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount == null) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

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

interface AiHealth {
  apiKeyConfigured: boolean;
  keyEnvVar: string;
}

function AiStatsSection() {
  const { getToken } = useAuth();
  const { data, isLoading } = useQuery<AiStats>({
    queryKey: ["aiStats"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/admin/ai-stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch AI stats");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

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

  return (
    <div className="border-t border-white/10 pt-8">
      <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-6 border-b border-white/10 pb-2 flex items-center">
        <Brain className="w-5 h-5 mr-2 text-violet-400" />
        AI USAGE
      </h2>

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
            <span className="text-xs font-mono text-muted-foreground">
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

      {isLoading ? (
        <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Total tokens */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">Total Tokens</span>
              <Zap className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {data.totalTokens.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {data.totalInputTokens.toLocaleString()} in · {data.totalOutputTokens.toLocaleString()} out
            </div>
          </div>

          {/* Today */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">Today (UTC)</span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {((data.todayInputTokens ?? 0) + (data.todayOutputTokens ?? 0)).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {(data.todayInputTokens ?? 0).toLocaleString()} in · {(data.todayOutputTokens ?? 0).toLocaleString()} out
            </div>
          </div>

          {/* 7-day average */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">7-Day Avg / Day</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {(data.avgDailyTokens ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {(data.last7dTokens ?? 0).toLocaleString()} total last 7 days
            </div>
          </div>

          {/* Estimated cost */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">Est. Cost</span>
              <DollarSign className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              ${data.estimatedCostUsd.toFixed(4)}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-1 leading-relaxed">
              {data.pricingNote}
            </div>
          </div>

          {/* API calls */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">AI Calls</span>
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {data.callsTotal}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {data.model}
            </div>
          </div>

        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">AI stats unavailable.</p>
      )}
    </div>
  );
}

interface SeedStatus {
  running: boolean;
  progress: { done: number; total: number; current: string };
  lastRun: string | null;
  fixturesSeeded: number;
  seasonsCompleted: string[];
  error: string | null;
}

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

function HistoricalDataSection() {
  const { toast } = useToast();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [seasons, setSeasons] = useState("2");

  const { data: status, isLoading } = useQuery<SeedStatus>({
    queryKey: ["seedStatus"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/admin/seed-history/status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch seed status");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as SeedStatus | undefined;
      return d?.running ? 2_000 : 15_000;
    },
    staleTime: 2_000,
  });

  const { data: dbStats } = useQuery<DbStats>({
    queryKey: ["dbStats"],
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

  const handleSeed = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/seed-history?seasons=${seasons}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 409) {
        toast({ title: "Seed already running", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error("Failed to start seed");
      toast({ title: `Historical seed started for ${seasons} season(s)` });
      queryClient.invalidateQueries({ queryKey: ["seedStatus"] });
    } catch {
      toast({ title: "Failed to start seed", variant: "destructive" });
    }
  };

  const pct = status && status.progress.total > 0
    ? Math.round((status.progress.done / status.progress.total) * 100)
    : 0;

  return (
    <div className="border-t border-white/10 pt-8">
      <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-6 border-b border-white/10 pb-2 flex items-center">
        <Database className="w-5 h-5 mr-2 text-teal-400" />
        HISTORICAL DATA SEED
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Controls */}
        <div className="glass-card p-6 rounded-xl space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Seasons to import</label>
            <Select value={seasons} onValueChange={setSeasons} disabled={status?.running}>
              <SelectTrigger className="bg-black/40 border-white/10 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Current season only</SelectItem>
                <SelectItem value="2">2 seasons</SelectItem>
                <SelectItem value="3">3 seasons</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSeed}
            disabled={status?.running}
            className="w-full font-mono tracking-wider"
            variant={status?.running ? "outline" : "default"}
          >
            {status?.running
              ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> SEEDING...</>
              : <><Play className="w-4 h-4 mr-2" /> START SEED</>
            }
          </Button>
          <p className="text-xs text-muted-foreground font-mono leading-relaxed">
            Imports all historical fixtures and stores them permanently in the database. Runs automatically once on first boot. Use this to add extra seasons or force a re-import.
          </p>
        </div>

        {/* Status */}
        <div className="lg:col-span-2 glass-card p-6 rounded-xl space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Activity className="w-6 h-6 text-primary animate-pulse" />
            </div>
          ) : status ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Status</div>
                  <div className={`text-sm font-mono font-bold ${status.running ? "text-amber-400" : status.error ? "text-red-400" : "text-teal-400"}`}>
                    {status.running ? "RUNNING" : status.error ? "ERROR" : "IDLE"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Fixtures in DB</div>
                  <div className="text-sm font-mono font-bold text-white">
                    {dbStats ? dbStats.fixtures.toLocaleString() : status.fixturesSeeded.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Last Run</div>
                  <div className="text-sm font-mono text-muted-foreground">
                    {status.lastRun ? format(new Date(status.lastRun), "MMM dd HH:mm") : "Never"}
                  </div>
                </div>
              </div>

              {dbStats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10">
                  {[
                    { label: "Teams", value: dbStats.teams },
                    { label: "Standings", value: dbStats.standings },
                    { label: "Signals", value: dbStats.fixtureSignals },
                    { label: "Odds Markets", value: dbStats.oddsMarkets },
                    { label: "AI Tips", value: dbStats.aiTips },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[10px] font-mono text-muted-foreground/60 uppercase mb-0.5">{label}</div>
                      <div className="text-xs font-mono text-white/80">{value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}

              {status.running && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-muted-foreground">
                    <span>{status.progress.current || "Starting..."}</span>
                    <span>{status.progress.done}/{status.progress.total}</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-teal-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}

              {status.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs font-mono text-red-400">{status.error}</p>
                </div>
              )}

              {status.seasonsCompleted.length > 0 && (
                <div className="border-t border-white/10 pt-4 space-y-1">
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Completed</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {status.seasonsCompleted.map((s, i) => (
                      <div key={i} className="text-xs font-mono text-teal-400/80 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 shrink-0" /> {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Status unavailable.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BillingSection() {
  const { data: status, isLoading: isLoadingStatus } = useQuery<BillingStatus>({
    queryKey: ["billingStatus"],
    queryFn: async () => {
      const res = await fetch("/api/billing/status");
      if (!res.ok) throw new Error("Failed to fetch billing status");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const { data: plansData, isLoading: isLoadingPlans } = useQuery<{ plans: BillingPlan[] }>({
    queryKey: ["billingPlans"],
    queryFn: async () => {
      const res = await fetch("/api/billing/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
    enabled: status?.enabled === true,
  });

  const isLoading = isLoadingStatus;
  const plans = plansData?.plans ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
        <CreditCard className="w-5 h-5 mr-2 text-primary" />
        BILLING
      </h2>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Status card */}
          <div className="glass-card p-6 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-muted-foreground uppercase">Stripe Status</span>
              {status?.enabled && status.configured ? (
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-teal-400 bg-teal-400/10 px-2 py-1 rounded-full border border-teal-400/20">
                  <CheckCircle2 className="w-3 h-3" /> ACTIVE
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full border border-amber-400/20">
                  <XCircle className="w-3 h-3" /> INACTIVE
                </span>
              )}
            </div>

            {status?.enabled && status.configured ? (
              <div className="space-y-2 border-t border-white/10 pt-4">
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-muted-foreground">Mode</span>
                  <span className={`font-bold uppercase ${status.mode === "live" ? "text-teal-400" : "text-amber-400"}`}>
                    {status.mode}
                  </span>
                </div>
                {status.accountName && (
                  <div className="flex justify-between text-sm font-mono">
                    <span className="text-muted-foreground">Account</span>
                    <span className="text-white truncate ml-4 text-right">{status.accountName}</span>
                  </div>
                )}
                {status.accountId && (
                  <div className="flex justify-between text-sm font-mono">
                    <span className="text-muted-foreground">ID</span>
                    <span className="text-muted-foreground truncate ml-4 text-right text-xs">{status.accountId}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {status?.message ?? "Stripe payments are not yet activated."}
              </p>
            )}
          </div>

          {/* Subscription plans */}
          <div className="lg:col-span-2 glass-card p-6 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-muted-foreground uppercase">Subscription Plans</span>
              {plans.length > 0 && (
                <span className="text-xs font-mono text-muted-foreground">{plans.length} plan{plans.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {status?.enabled && isLoadingPlans ? (
              <div className="flex justify-center py-4">
                <Activity className="w-5 h-5 text-primary animate-pulse" />
              </div>
            ) : plans.length > 0 ? (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <div key={plan.id} className="flex items-start justify-between bg-black/20 rounded-lg p-4 border border-white/5">
                    <div className="space-y-1">
                      <div className="font-mono font-bold text-white text-sm">{plan.name}</div>
                      {plan.description && (
                        <div className="text-xs text-muted-foreground">{plan.description}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                      {plan.prices.map((price) => (
                        <span key={price.id} className="text-sm font-mono font-bold text-teal-400">
                          {formatAmount(price.amount, price.currency)}{" "}
                          <span className="text-muted-foreground font-normal text-xs">
                            / {price.intervalCount > 1 ? `${price.intervalCount} ` : ""}{price.interval}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <CreditCard className="w-8 h-8 text-white/10" />
                <p className="text-sm text-muted-foreground">
                  {status?.enabled
                    ? "No plans found. Run the seed-products script to create plans."
                    : "Plans will appear here once Stripe is activated."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Setup instructions — only shown when inactive */}
      {!status?.configured && (
        <div className="glass-card p-6 rounded-xl border border-amber-400/10 bg-amber-400/5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-amber-400 uppercase tracking-wider">Setup Required — How to Activate Stripe</span>
          </div>
          <ol className="space-y-3">
            {(status?.setupSteps ?? [
              "Connect the Stripe integration via the Integrations panel",
              "Set STRIPE_SECRET_KEY in environment secrets",
              "Optionally set STRIPE_WEBHOOK_SECRET for webhook verification",
              "Set STRIPE_ENABLED=true in environment secrets",
              "Restart the API server",
              "Run the seed-products script to create subscription plans in Stripe",
            ]).map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm font-mono text-muted-foreground">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-muted-foreground font-mono">
              After activation, users will be able to subscribe to plans via Stripe Checkout. Subscription status is synced automatically via webhooks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface SyncResult { fixtures: number; oddsFetched: number; predictionsFetched: number; h2hFetched: number; injuriesFetched: number; tipsQueued: number; }

function ForceSyncSection() {
  const { toast } = useToast();
  const { getToken } = useAuth();
  const [fixtureIdInput, setFixtureIdInput] = useState("");
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingH2HBackfill, setLoadingH2HBackfill] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [aiTipsError, setAiTipsError] = useState<string | null>(null);
  const [aiTipsSuccess, setAiTipsSuccess] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = () => {
    stopPolling();
    let failCount = 0;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/sync-status", { headers: await authHeaders() });
        // 401/403 during token refresh — silently retry, don't stop
        if (res.status === 401 || res.status === 403) {
          failCount++;
          if (failCount > 10) { stopPolling(); setLoadingFull(false); }
          return;
        }
        failCount = 0;
        if (!res.ok) {
          stopPolling();
          setLoadingFull(false);
          toast({ title: "Sync status fejl", variant: "destructive" });
          return;
        }
        const data = await res.json();
        if (!data.running) {
          stopPolling();
          setLoadingFull(false);
          if (data.error) {
            setSyncError(data.error);
            toast({ title: "Sync fejlede", description: data.error, variant: "destructive" });
          } else if (data.result) {
            setSyncError(null);
            setSyncResult(data.result);
          }
        }
      } catch {
        // Network hiccup — keep retrying silently
        failCount++;
        if (failCount > 5) {
          stopPolling();
          setLoadingFull(false);
          toast({ title: "Mistede forbindelsen under sync", variant: "destructive" });
        }
      }
    }, 3000);
  };

  const handleForceFullSync = async () => {
    setSyncResult(null);
    setLoadingFull(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/force-full-sync", { method: "POST", headers });
      let body = "";
      let data: any = {};
      try { body = await res.text(); data = JSON.parse(body); } catch { /* non-JSON */ }
      if (!res.ok) {
        toast({
          title: data.error ?? `Sync fejlede (${res.status})`,
          description: body.length < 200 ? body : `Status: ${res.status}`,
          variant: "destructive",
        });
        setLoadingFull(false);
        return;
      }
      startPolling();
    } catch (err) {
      toast({ title: `Netværksfejl: ${err instanceof Error ? err.message : String(err)}`, variant: "destructive" });
      setLoadingFull(false);
    }
  };

  const handleTestPing = async () => {
    try {
      const res = await fetch("/api/admin/ping", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      toast({ title: res.ok ? `POST ping OK (${res.status})` : `POST ping fejl (${res.status})`, description: JSON.stringify(data) });
    } catch (err) {
      toast({ title: `Ping netværksfejl`, description: String(err), variant: "destructive" });
    }
  };

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

  const handleH2HBackfill = async () => {
    setLoadingH2HBackfill(true);
    try {
      const res = await fetch("/api/admin/h2h-backfill", { method: "POST", headers: await authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data.error ?? `H2H backfill fejl (${res.status})`, variant: "destructive" });
      } else {
        toast({ title: "H2H stats backfill startet", description: "Henter xG, skud, hjørner for alle historiske H2H kampe — kører i baggrunden" });
      }
    } catch (err) {
      toast({ title: `Netværksfejl: ${err instanceof Error ? err.message : String(err)}`, variant: "destructive" });
    } finally {
      setLoadingH2HBackfill(false);
    }
  };

  const handleForceFixtureSync = async () => {
    const id = parseInt(fixtureIdInput.trim(), 10);
    if (!id) {
      toast({ title: "Enter a valid fixture ID", variant: "destructive" });
      return;
    }
    setLoadingFixture(true);
    try {
      const res = await fetch(`/api/admin/force-sync/${id}`, { method: "POST", headers: await authHeaders() });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok) {
        toast({ title: data.error ?? `Sync failed (${res.status})`, variant: "destructive" });
      } else {
        toast({ title: "Fixture sync started", description: data.message });
      }
    } catch (err) {
      toast({ title: `Network error: ${err instanceof Error ? err.message : String(err)}`, variant: "destructive" });
    } finally {
      setLoadingFixture(false);
    }
  };

  return (
    <div className="glass-card p-6 rounded-xl space-y-6">
      <div>
        <h3 className="text-base font-bold font-mono text-white mb-1">Force Sync</h3>
        <p className="text-xs text-muted-foreground">
          Henter kun det der mangler. Fixtures der allerede har odds, predictions, H2H eller AI tips springes over — kun huller i databasen fyldes ud.
        </p>
      </div>

      {/* Full sync */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">All upcoming fixtures (7-day window)</div>
        <button
          onClick={handleForceFullSync}
          disabled={loadingFull}
          className="w-full h-11 bg-primary text-primary-foreground text-sm font-mono font-bold rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loadingFull ? "Syncing — please wait..." : "Force Full Sync"}
        </button>
        <button
          onClick={handleForceAiTips}
          disabled={loadingAi}
          className="w-full h-10 bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-mono font-bold rounded-md hover:bg-violet-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Brain className="w-4 h-4" />
          {loadingAi ? "Starting..." : "Force AI Tips Generation"}
        </button>
        <button
          onClick={handleH2HBackfill}
          disabled={loadingH2HBackfill}
          className="w-full h-10 bg-teal-500/20 border border-teal-500/30 text-teal-300 text-sm font-mono font-bold rounded-md hover:bg-teal-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Database className="w-4 h-4" />
          {loadingH2HBackfill ? "Starting..." : "Backfill H2H Stats (xG · Skud · Hjørner)"}
        </button>
        <button
          onClick={handleTestPing}
          className="w-full h-8 bg-white/5 border border-white/10 text-muted-foreground text-xs font-mono rounded-md hover:bg-white/10 transition-colors"
        >
          Test POST routing (ping)
        </button>
        <p className="text-[10px] text-muted-foreground/60 font-mono">
          Knappen er aktiv mens den kører. Kun manglende data hentes.
        </p>

        {aiTipsError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">AI Tips fejl</div>
            <p className="text-xs font-mono text-red-400">{aiTipsError}</p>
          </div>
        )}
        {aiTipsSuccess && !aiTipsError && (
          <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-3">
            <p className="text-xs font-mono text-teal-400">Generation startet — check AI USAGE for progress</p>
          </div>
        )}
        {syncError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Sync fejl</div>
            <p className="text-xs font-mono text-red-400">{syncError}</p>
          </div>
        )}

        {syncResult && (
          <div className="mt-3 bg-white/5 border border-white/10 rounded-lg p-4 font-mono text-xs space-y-1.5">
            <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-2">Sync resultat</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fixtures i vindue</span>
              <span className="text-white font-bold">{syncResult.fixtures}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Odds hentet</span>
              <span className={syncResult.oddsFetched > 0 ? "text-teal-400 font-bold" : "text-muted-foreground"}>{syncResult.oddsFetched}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Predictions hentet</span>
              <span className={syncResult.predictionsFetched > 0 ? "text-teal-400 font-bold" : "text-muted-foreground"}>{syncResult.predictionsFetched}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">H2H holdepar hentet</span>
              <span className={syncResult.h2hFetched > 0 ? "text-teal-400 font-bold" : "text-muted-foreground"}>{syncResult.h2hFetched}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Injuries hentet</span>
              <span className={syncResult.injuriesFetched > 0 ? "text-teal-400 font-bold" : "text-muted-foreground"}>{syncResult.injuriesFetched}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1.5">
              <span className="text-muted-foreground">AI tips i kø</span>
              <span className={syncResult.tipsQueued > 0 ? "text-violet-400 font-bold" : "text-muted-foreground"}>{syncResult.tipsQueued} fixtures</span>
            </div>
          </div>
        )}
      </div>

      {/* Per-fixture sync */}
      <div className="space-y-2 pt-2 border-t border-white/10">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Single fixture</div>
        <div className="flex gap-3">
          <input
            type="number"
            placeholder="Fixture ID e.g. 1534912"
            value={fixtureIdInput}
            onChange={(e) => setFixtureIdInput(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-mono text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={handleForceFixtureSync}
            disabled={loadingFixture || !fixtureIdInput}
            className="px-4 py-2 bg-white/10 text-white text-sm font-mono font-bold rounded-md hover:bg-white/15 disabled:opacity-50 transition-colors border border-white/10"
          >
            {loadingFixture ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Daily AI Admin Insight ────────────────────────────────────────────────────

interface AdminInsight {
  generatedAt: string;
  summary: string;
  insights: Array<{ market: string; winRate: number; totalTips: number; observation: string }>;
  suggestions: string[];
  message?: string;
}

function AdminInsightSection() {
  const { getToken } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery<AdminInsight>({
    queryKey: ["adminInsight"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/admin/insight", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch insight");
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div className="border-t border-white/10 pt-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white uppercase tracking-wider border-b border-white/10 pb-2 flex items-center">
          <Brain className="w-5 h-5 mr-2 text-violet-400" />
          DAILY AI INSIGHT
        </h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded border border-white/10 hover:border-white/20"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
      ) : data?.message ? (
        <div className="glass-card p-6 rounded-xl text-muted-foreground font-mono text-sm">
          {data.message}
        </div>
      ) : data ? (
        <div className="space-y-4">
          {data.generatedAt && (
            <p className="text-xs font-mono text-muted-foreground">
              Generated: {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
          <div className="glass-card p-5 rounded-xl">
            <p className="text-sm text-white/80 font-mono leading-relaxed">{data.summary}</p>
          </div>
          {data.insights && data.insights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.insights.map((ins, i) => (
                <div key={i} className="glass-card p-4 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-violet-300 uppercase">{ins.market}</span>
                    <span className={`text-xs font-mono font-bold ${ins.winRate >= 0.55 ? "text-teal-400" : ins.winRate >= 0.45 ? "text-amber-400" : "text-red-400"}`}>
                      {Math.round(ins.winRate * 100)}% ({ins.totalTips} tips)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{ins.observation}</p>
                </div>
              ))}
            </div>
          )}
          {data.suggestions && data.suggestions.length > 0 && (
            <div className="glass-card p-5 rounded-xl space-y-2">
              <p className="text-xs font-mono font-bold text-amber-400 uppercase mb-3">Algorithm Suggestions</p>
              {data.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5 shrink-0">→</span>
                  <p className="text-xs font-mono text-white/70">{s}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Admin() {
  return (
    <AdminErrorBoundary>
      <AdminContent />
    </AdminErrorBoundary>
  );
}

function AdminContent() {
  const { getToken } = useAuth();
  const { data: me } = useGetMe();
  const { data: statsData, isLoading: isLoadingStats } = useGetAdminStats();
  const { data: usersData, isLoading: isLoadingUsers } = useGetAdminUsers();

  const { data: clerkUsersData, isLoading: isLoadingClerkUsers } = useQuery({
    queryKey: ["admin", "supabase-users"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/admin/supabase-users", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch Clerk users");
      return res.json() as Promise<{ users: { id: string; email: string; firstName: string | null; lastName: string | null; createdAt: number; lastSignInAt: number | null }[]; total: number }>;
    },
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addMutation = useAddAdminUser();
  const deleteMutation = useDeleteAdminUser();
  const updateMutation = useUpdateAdminUser();

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AddUserBodyRole>("user");

  if (!me) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Activity className="w-8 h-8 text-primary animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (me.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  const handleAddUser = async () => {
    if (!newEmail) return;
    try {
      await addMutation.mutateAsync({ data: { email: newEmail, role: newRole } });
      await queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
      setNewEmail("");
      setNewRole("user");
      toast({ title: "User added successfully" });
    } catch (e) {
      toast({ title: "Failed to add user", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
      toast({ title: "User removed" });
    } catch (e) {
      toast({ title: "Failed to remove user", variant: "destructive" });
    }
  };

  const handleUpdateRole = async (id: number, role: string) => {
    try {
      await updateMutation.mutateAsync({ id, data: { role: role as UpdateUserBodyRole } });
      await queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
      toast({ title: "Role updated" });
    } catch (e) {
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2 flex items-center">
            <ShieldAlert className="w-8 h-8 mr-3 text-destructive" />
            SYSTEM ADMINISTRATION
          </h1>
          <p className="text-muted-foreground">Manage platform access, monitor API quotas and configure billing.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: API Stats */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
              <Server className="w-5 h-5 mr-2 text-primary" />
              API TELEMETRY
            </h2>
            
            {isLoadingStats ? (
              <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
            ) : statsData ? (
              <div className="space-y-6">
                <div className="glass-card p-6 rounded-xl">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-1">
                      Requests Today
                      <HelpTooltip side="top" iconClassName="w-3.5 h-3.5">
                        Total API-Football requests made today against your daily quota
                      </HelpTooltip>
                    </span>
                    <span className="text-2xl font-mono font-bold text-white">
                      {statsData.requestsToday} <span className="text-sm text-muted-foreground">/ {statsData.maxPerDay}</span>
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2.5 mb-4 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full ${statsData.requestsToday / statsData.maxPerDay > 0.8 ? 'bg-destructive' : 'bg-primary'}`} 
                      style={{ width: `${Math.min((statsData.requestsToday / statsData.maxPerDay) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/10 pt-4">
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-1 flex items-center gap-1">
                        Last Hour
                        <HelpTooltip side="top" iconClassName="w-3 h-3">
                          Requests in the last 60 minutes (plan limit: 500/min)
                        </HelpTooltip>
                      </div>
                      <div className="text-lg font-mono text-white">{statsData.requestsThisHour}</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-1 flex items-center gap-1">
                        Remaining
                        <HelpTooltip side="top" iconClassName="w-3 h-3">
                          API requests remaining for today before hitting your daily cap
                        </HelpTooltip>
                      </div>
                      <div className="text-lg font-mono text-white">{statsData.remaining}</div>
                    </div>
                  </div>
                </div>

                {(statsData as any).dailyAvg != null && (
                  <div className="glass-card p-5 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-1">
                        7-Day Average
                        <HelpTooltip side="top" iconClassName="w-3.5 h-3.5">
                          Gennemsnitligt antal API-kald per dag de seneste 7 dage
                        </HelpTooltip>
                      </span>
                      <span className="text-2xl font-mono font-bold text-primary">
                        {(statsData as any).dailyAvg ?? 0}
                        <span className="text-sm font-normal text-muted-foreground ml-1">/ day</span>
                      </span>
                    </div>
                  </div>
                )}

              </div>
            ) : null}
          </div>

          {/* Right Column: User Management */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
              <Users className="w-5 h-5 mr-2 text-primary" />
              ACCESS CONTROL
            </h2>
            
            <div className="glass-card p-6 rounded-xl space-y-6">
              <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end bg-black/20 p-4 rounded-lg border border-white/5">
                <div className="flex-1 min-w-0 space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Email Address</label>
                  <Input 
                    placeholder="analyst@syndicate.com" 
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                    className="w-full bg-black/40 border-white/10 font-mono text-white placeholder:text-muted-foreground/40 px-4 py-3 h-12 text-sm"
                  />
                </div>
                <div className="w-full lg:w-32 space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Role</label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AddUserBodyRole)}>
                    <SelectTrigger className="bg-black/40 border-white/10 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddUser} disabled={!newEmail || addMutation.isPending} className="w-full lg:w-auto font-mono tracking-wider">
                  <Plus className="w-4 h-4 mr-2" /> ADD
                </Button>
              </div>

              {isLoadingUsers ? (
                <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-black/20 font-mono border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-normal">Analyst</th>
                        <th className="px-4 py-3 font-normal">Role</th>
                        <th className="px-4 py-3 font-normal">Granted At</th>
                        <th className="px-4 py-3 font-normal text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData?.users?.map((user) => (
                        <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-4 font-medium text-white flex items-center">
                            {user.role === 'admin' ? <Shield className="w-4 h-4 mr-2 text-secondary" /> : <UserIcon className="w-4 h-4 mr-2 text-muted-foreground" />}
                            {user.email}
                          </td>
                          <td className="px-4 py-4">
                            <Select 
                              value={user.role} 
                              onValueChange={(v) => handleUpdateRole(user.id, v)}
                              disabled={updateMutation.isPending}
                            >
                              <SelectTrigger className="w-28 h-8 bg-transparent border-white/10 text-xs font-mono">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-4 font-mono text-muted-foreground text-xs">
                            {format(new Date(user.createdAt), 'MMM dd, yyyy HH:mm')}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:bg-destructive/20 hover:text-destructive h-8 px-2"
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!usersData?.users?.length && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                            No authorized analysts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Registered Accounts Section */}
        <div className="border-t border-white/10 pt-8">
          <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
            <LogIn className="w-5 h-5 mr-2 text-primary" />
            REGISTERED ACCOUNTS
            <span className="ml-3 text-sm font-normal text-muted-foreground font-mono normal-case">
              {clerkUsersData ? `${clerkUsersData.total} total` : ""}
            </span>
            <HelpTooltip side="top" iconClassName="w-3.5 h-3.5" className="ml-2">
              All accounts that have signed up via Clerk authentication
            </HelpTooltip>
          </h2>
          {isLoadingClerkUsers ? (
            <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
          ) : clerkUsersData?.users?.length ? (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-black/20 font-mono border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 font-normal">Account</th>
                      <th className="px-4 py-3 font-normal">Email</th>
                      <th className="px-4 py-3 font-normal">Signed Up</th>
                      <th className="px-4 py-3 font-normal">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clerkUsersData.users.map((u) => {
                      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                      return (
                        <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                            {name}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {format(new Date(u.createdAt), 'MMM dd, yyyy')}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {u.lastSignInAt ? format(new Date(u.lastSignInAt), 'MMM dd, yyyy HH:mm') : <span className="text-muted-foreground/40">Never</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="glass-card p-8 rounded-xl text-center text-muted-foreground font-mono text-sm">
              No registered accounts found.
            </div>
          )}
        </div>

        {/* AI Stats Section */}
        <AiStatsSection />

        {/* Daily AI Insight Section */}
        <AdminInsightSection />

        {/* Historical Data Seed Section */}
        <HistoricalDataSection />

        {/* Force Sync Section */}
        <ForceSyncSection />

        {/* Billing Section */}
        <div className="border-t border-white/10 pt-8">
          <BillingSection />
        </div>
      </div>
    </Layout>
  );
}
