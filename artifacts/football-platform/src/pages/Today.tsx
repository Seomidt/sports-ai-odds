import { useMemo, useState, type ReactNode, type ComponentType } from "react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useGetTodayFixtures } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Newspaper,
  Radio,
  Sparkles,
  Star,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { dismissOnboarding, isOnboardingDismissed } from "@/lib/onboarding";
import { useAuth } from "@/hooks/useAuth";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const POST_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"]);

function isPrematch(f: Fixture) {
  const s = f.statusShort ?? "";
  if (LIVE_STATUSES.has(s) || POST_STATUSES.has(s)) return false;
  if (f.kickoff && new Date(f.kickoff).getTime() < Date.now() - 2 * 60 * 60 * 1000) return false;
  return true;
}

function kickoffShort(kickoff: string | null | undefined): string {
  if (!kickoff) return "—";
  const d = new Date(kickoff);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `Today · ${time}`;
  if (isTomorrow(d)) return `Tomorrow · ${time}`;
  return format(d, "EEE d MMM, HH:mm");
}

interface ValueTip {
  fixtureId: number;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoff: string | null;
  leagueName: string | null;
  label: string;
  probability: number;
  trustScore: number;
  confidence: "high" | "medium" | "low" | null;
}

interface DailySummary {
  yesterdayResults: { wins: number; losses: number; pushes: number; total: number; pending: number };
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  iconClass,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="glass-card rounded-xl border border-white/8 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/6 flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-white/5 ${iconClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-mono font-bold text-white tracking-wide uppercase">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-3">{children}</div>
      {footer && <div className="px-3 pb-3">{footer}</div>}
    </section>
  );
}

export function Today() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDismissed());

  const { data: fixturesData, isLoading: fixturesLoading } = useGetTodayFixtures({
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchInterval: (query) => {
      const fixtures = (query.state.data?.leagues ?? []).flatMap((l) => l.fixtures);
      const hasLive = fixtures.some((f) => LIVE_STATUSES.has(f.statusShort ?? ""));
      return hasLive ? 15_000 : 3 * 60_000;
    },
    refetchIntervalInBackground: true,
  });

  const { data: valueData, isLoading: valueLoading } = useQuery<{ tips: ValueTip[] }>({
    queryKey: ["valueOdds"],
    queryFn: async () => {
      const res = await fetch("/api/analysis/value-odds");
      if (!res.ok) throw new Error("Failed to fetch value odds");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  const { data: summary } = useQuery<DailySummary>({
    queryKey: ["dailySummary"],
    queryFn: async () => {
      const res = await fetch("/api/analysis/daily-summary");
      if (!res.ok) throw new Error("Failed to fetch daily summary");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: followedData } = useQuery<{ fixtureIds: number[] }>({
    queryKey: ["followedFixtures", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch("/api/fixtures/followed");
      if (!res.ok) return { fixtureIds: [] };
      return res.json();
    },
  });

  const allFixtures: Fixture[] = (fixturesData?.leagues ?? []).flatMap((l) => l.fixtures);
  const liveFixtures = allFixtures.filter((f) => LIVE_STATUSES.has(f.statusShort ?? ""));
  const upcoming = useMemo(() => {
    return allFixtures
      .filter(isPrematch)
      .sort((a, b) => {
        const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
        const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
        return ta - tb;
      })
      .slice(0, 6);
  }, [allFixtures]);

  const topPicks = (valueData?.tips ?? []).slice(0, 5);

  const yr = summary?.yesterdayResults;
  const yrHitRate =
    yr && yr.wins + yr.losses + yr.pushes > 0
      ? Math.round((yr.wins / (yr.wins + yr.losses + yr.pushes)) * 100)
      : null;

  const followCount = followedData?.fixtureIds?.length ?? 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest">Today</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            What matters right now
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Live games, what kicks off next, and your best model edges — in one place. Use{" "}
            <Link href="/matches" className="text-primary/80 hover:text-primary underline underline-offset-2">
              Matches
            </Link>{" "}
            for the full fixture list or{" "}
            <Link href="/predictions" className="text-primary/80 hover:text-primary underline underline-offset-2">
              Predictions
            </Link>{" "}
            for the complete grid.
          </p>
        </header>

        {showOnboarding && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 flex gap-3">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm font-medium text-white">Quick start</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open a match to see pre-match, live, and post analysis in one screen.</li>
                <li>Star fixtures you care about — they show up under Watchlist.</li>
                <li>Check Performance when you want proof the model is behaving.</li>
              </ol>
              <button
                type="button"
                onClick={() => {
                  dismissOnboarding();
                  setShowOnboarding(false);
                }}
                className="text-xs font-mono text-primary hover:underline"
              >
                Got it, hide this
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                dismissOnboarding();
                setShowOnboarding(false);
              }}
              className="text-muted-foreground hover:text-white p-1 shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard
            title="Live now"
            subtitle={liveFixtures.length ? `${liveFixtures.length} match${liveFixtures.length === 1 ? "" : "es"} in play` : "Nothing in play at the moment"}
            icon={Radio}
            iconClass="text-primary"
          >
            {fixturesLoading ? (
              <div className="flex justify-center py-8">
                <Activity className="w-6 h-6 text-primary animate-pulse" />
              </div>
            ) : liveFixtures.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                When games go live, they appear here first. You can still browse upcoming kickoffs below.
              </p>
            ) : (
              <ul className="space-y-2">
                {liveFixtures.slice(0, 5).map((f) => (
                  <li key={f.fixtureId}>
                    <Link href={`/match/${f.fixtureId}`}>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 hover:bg-primary/10 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                            <span className="text-sm font-medium text-white truncate">
                              {f.homeTeamName} vs {f.awayTeamName}
                            </span>
                          </div>
                          {f.leagueName && (
                            <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5 pl-3.5">
                              {f.leagueName}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/matches">
              <div className="mt-3 flex items-center justify-center gap-1 text-xs font-mono font-semibold text-primary hover:underline cursor-pointer py-2">
                All matches <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          </SectionCard>

          <SectionCard
            title="Starting soon"
            subtitle="Next kickoffs across your coverage"
            icon={Clock}
            iconClass="text-amber-400"
          >
            {fixturesLoading ? (
              <div className="flex justify-center py-8">
                <Activity className="w-6 h-6 text-primary animate-pulse" />
              </div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No scheduled fixtures in the current window.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((f) => (
                  <li key={f.fixtureId}>
                    <Link href={`/match/${f.fixtureId}`}>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 hover:bg-white/6 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">
                            {f.homeTeamName} <span className="text-white/30">vs</span> {f.awayTeamName}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            {kickoffShort(f.kickoff)}
                            {f.leagueName ? ` · ${f.leagueName}` : ""}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Top model edges"
          subtitle="Highest-confidence picks — tap for full breakdown"
          icon={Target}
          iconClass="text-teal-400"
          footer={
            <Link href="/predictions">
              <div className="flex items-center justify-center gap-1 text-xs font-mono font-semibold text-primary hover:underline cursor-pointer py-2 border-t border-white/6 -mb-1">
                See all predictions <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          }
        >
          {valueLoading ? (
            <div className="flex justify-center py-10">
              <Activity className="w-6 h-6 text-primary animate-pulse" />
            </div>
          ) : topPicks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No predictions available yet — check back after the next data sync.</p>
          ) : (
            <ul className="space-y-2">
              {topPicks.map((tip, i) => (
                <li key={tip.fixtureId}>
                  <Link href={`/match/${tip.fixtureId}`}>
                    <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-3 hover:bg-white/6 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-mono text-muted-foreground">#{i + 1}</span>
                          <div className="text-sm font-semibold text-white truncate">{tip.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {tip.homeTeam} vs {tip.awayTeam}
                            {tip.leagueName ? ` · ${tip.leagueName}` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-mono font-bold text-teal-300">{tip.probability}%</div>
                          {tip.confidence && (
                            <div className="text-[9px] font-mono text-muted-foreground uppercase">{tip.confidence}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {summary && (
          <div className="glass-card rounded-xl border border-white/8 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">Yesterday</span>
            </div>
            <div className="flex-1 text-sm text-muted-foreground">
              {yr && yr.total > 0 ? (
                <>
                  <span className="text-white font-mono font-semibold">{yrHitRate ?? "—"}%</span> hit rate on value-rated
                  tips ({yr.wins}W · {yr.losses}L
                  {yr.pushes > 0 ? ` · ${yr.pushes}P` : ""}
                  {yr.pending > 0 ? ` · ${yr.pending} pending` : ""}).
                </>
              ) : (
                "No graded value tips yesterday — quiet days happen."
              )}
            </div>
            <Link href="/performance">
              <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-primary hover:underline cursor-pointer shrink-0">
                Full performance <ChevronRight className="w-3 h-3" />
              </div>
            </Link>
          </div>
        )}

        <div>
          <h3 className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mb-3">More</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Link href="/following">
              <div className="glass-card rounded-lg border border-white/8 p-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
                <Star className="w-4 h-4 text-secondary mb-2" />
                <div className="text-sm font-medium text-white">Watchlist</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {followCount ? `${followCount} saved` : "Follow fixtures"}
                </div>
              </div>
            </Link>
            <Link href="/signals">
              <div className="glass-card rounded-lg border border-white/8 p-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
                <Zap className="w-4 h-4 text-amber-400 mb-2" />
                <div className="text-sm font-medium text-white">Signals</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Alerts & feed</div>
              </div>
            </Link>
            <Link href="/standings">
              <div className="glass-card rounded-lg border border-white/8 p-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
                <Trophy className="w-4 h-4 text-violet-400 mb-2" />
                <div className="text-sm font-medium text-white">Standings</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Tables</div>
              </div>
            </Link>
            <Link href="/news">
              <div className="glass-card rounded-lg border border-white/8 p-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
                <Newspaper className="w-4 h-4 text-muted-foreground mb-2" />
                <div className="text-sm font-medium text-white">News</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Headlines</div>
              </div>
            </Link>
            <Link href="/pre-match">
              <div className="glass-card rounded-lg border border-white/8 p-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
                <Calendar className="w-4 h-4 text-amber-400/80 mb-2" />
                <div className="text-sm font-medium text-white">Pre-match</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">By day</div>
              </div>
            </Link>
            <Link href="/pricing">
              <div className="glass-card rounded-lg border border-white/8 p-3 hover:bg-white/5 transition-colors cursor-pointer h-full">
                <Sparkles className="w-4 h-4 text-primary mb-2" />
                <div className="text-sm font-medium text-white">Plan</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Upgrade</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
