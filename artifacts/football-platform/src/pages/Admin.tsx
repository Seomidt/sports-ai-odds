import { 
  useGetAdminStats, 
  useGetAdminUsers, 
  useAddAdminUser, 
  useDeleteAdminUser, 
  useUpdateAdminUser 
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity, ShieldAlert, Users, Server, Plus, Trash2, Shield, User as UserIcon, CreditCard, CheckCircle2, XCircle, Brain, DollarSign, Zap, Database, Play, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AddUserBodyRole, UpdateUserBodyRole } from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Redirect } from "wouter";

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
  last24hInputTokens: number;
  last24hOutputTokens: number;
  callsTotal: number;
  model: string;
  pricingNote: string;
}

function AiStatsSection() {
  const { data, isLoading } = useQuery<AiStats>({
    queryKey: ["aiStats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-stats");
      if (!res.ok) throw new Error("Failed to fetch AI stats");
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

          {/* Last 24h */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">Last 24h</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {(data.last24hInputTokens + data.last24hOutputTokens).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              {data.last24hInputTokens.toLocaleString()} in · {data.last24hOutputTokens.toLocaleString()} out
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

function HistoricalDataSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [seasons, setSeasons] = useState("2");

  const { data: status, isLoading } = useQuery<SeedStatus>({
    queryKey: ["seedStatus"],
    queryFn: async () => {
      const res = await fetch("/api/admin/seed-history/status");
      if (!res.ok) throw new Error("Failed to fetch seed status");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as SeedStatus | undefined;
      return d?.running ? 2_000 : 15_000;
    },
    staleTime: 2_000,
  });

  const handleSeed = async () => {
    try {
      const res = await fetch(`/api/admin/seed-history?seasons=${seasons}`, { method: "POST" });
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
            Imports all historical fixtures for tracked leagues. Runs automatically at startup — use this to re-seed or add extra seasons.
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
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Fixtures Seeded</div>
                  <div className="text-sm font-mono font-bold text-white">
                    {status.fixturesSeeded.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Last Run</div>
                  <div className="text-sm font-mono text-muted-foreground">
                    {status.lastRun ? format(new Date(status.lastRun), "MMM dd HH:mm") : "Never"}
                  </div>
                </div>
              </div>

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

export function Admin() {
  const { data: me } = useGetMe();
  const { data: statsData, isLoading: isLoadingStats } = useGetAdminStats();
  const { data: usersData, isLoading: isLoadingUsers } = useGetAdminUsers();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const addMutation = useAddAdminUser();
  const deleteMutation = useDeleteAdminUser();
  const updateMutation = useUpdateAdminUser();

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AddUserBodyRole>("user");

  if (me && me.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  const handleAddUser = async () => {
    if (!newEmail) return;
    try {
      await addMutation.mutateAsync({ data: { email: newEmail, role: newRole } });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setNewEmail("");
      toast({ title: "User added successfully" });
    } catch (e) {
      toast({ title: "Failed to add user", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast({ title: "User removed" });
    } catch (e) {
      toast({ title: "Failed to remove user", variant: "destructive" });
    }
  };

  const handleUpdateRole = async (id: number, role: string) => {
    try {
      await updateMutation.mutateAsync({ id, data: { role: role as UpdateUserBodyRole } });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
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
                    <span className="text-sm font-mono text-muted-foreground uppercase">Requests Today</span>
                    <span className="text-2xl font-mono font-bold text-white">
                      {statsData.requestsToday} <span className="text-sm text-muted-foreground">/ {statsData.maxPerDay}</span>
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2.5 mb-4 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full ${statsData.requestsToday / statsData.maxPerDay > 0.8 ? 'bg-destructive' : 'bg-primary'}`} 
                      style={{ width: `${Math.min((statsData.requestsToday / statsData.maxPerDay) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/10 pt-4">
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Last Hour</div>
                      <div className="text-lg font-mono text-white">{statsData.requestsThisHour}</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Remaining</div>
                      <div className="text-lg font-mono text-white">{statsData.remaining}</div>
                    </div>
                  </div>
                </div>

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
              <div className="flex gap-4 items-end bg-black/20 p-4 rounded-lg border border-white/5">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Email Address</label>
                  <Input 
                    placeholder="analyst@syndicate.com" 
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                    className="bg-black/40 border-white/10 font-mono"
                  />
                </div>
                <div className="w-32 space-y-2">
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
                <Button onClick={handleAddUser} disabled={!newEmail || addMutation.isPending} className="font-mono tracking-wider">
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

        {/* AI Stats Section */}
        <AiStatsSection />

        {/* Historical Data Seed Section */}
        <HistoricalDataSection />

        {/* Billing Section */}
        <div className="border-t border-white/10 pt-8">
          <BillingSection />
        </div>
      </div>
    </Layout>
  );
}
