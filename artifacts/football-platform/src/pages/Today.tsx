import { useMemo, useState, type ReactNode, type ComponentType } from "react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useGetTodayFixtures } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { LeagueMark } from "@/components/LeagueMark";
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
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

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
    <section className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-start gap-3 bg-white/[0.02]">
        <div className={cn("p-2 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]", iconClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-white tracking-[0.12em] uppercase font-sans">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
      {footer && <div className="px-4 pb-4">{footer}</div>}
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
      <div className="space-y-8 max-w-3xl mx-auto">
        <PageHeader
          eyebrow="Today"
          title="What matters right now"
          description={
            <>
              Live games, next kickoffs, and model edges in one calm view.{" "}
              <Link href="/matches" className="text-primary hover:text-primary/85 underline underline-offset-2 decoration-primary/40">
                Matches
              </Link>{" "}
              ·{" "}
              <Link href="/predictions" className="text-primary hover:text-primary/85 underline underline-offset-2 decoration-primary/40">
                Predictions
              </Link>
            </>
          }
          icon={LayoutDashboard}
        />

        {showOnboarding && (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 flex gap-3 shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.05)]">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm font-medium text-white">Quick start</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
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
                className="text-xs font-medium text-primary hover:underline"
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

        <div className="grid gap-5 md:grid-cols-2">
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
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2.5 hover:bg-primary/[0.11] transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                            <span className="text-sm font-medium text-white truncate">
                              {f.homeTeamName} vs {f.awayTeamName}
                            </span>
                          </div>
                          {f.leagueName && (
                            <div className="text-[10px] text-muted-foreground truncate mt-0.5 pl-3.5 font-medium flex items-center gap-1.5 min-w-0">
                              <LeagueMark leagueId={f.leagueId} leagueLogo={f.leagueLogo} size="xs" />
                              <span className="truncate">{f.leagueName}</span>
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
              <div className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer py-2">
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
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">
                            {f.homeTeamName} <span className="text-white/30">vs</span> {f.awayTeamName}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 font-medium flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="tabular-nums shrink-0">{kickoffShort(f.kickoff)}</span>
                            {f.leagueName ? (
                              <>
                                <span className="text-white/20 shrink-0">·</span>
                                <LeagueMark leagueId={f.leagueId} leagueLogo={f.leagueLogo} size="xs" />
                                <span className="truncate">{f.leagueName}</span>
                              </>
                            ) : null}
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
              <div className="flex items-center justify-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer py-2.5 border-t border-white/[0.06] -mb-1">
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
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 hover:bg-white/[0.06] transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-muted-foreground font-medium tabular-nums">#{i + 1}</span>
                          <div className="text-sm font-semibold text-white truncate">{tip.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {tip.homeTeam} vs {tip.awayTeam}
                            {tip.leagueName ? ` · ${tip.leagueName}` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums text-emerald-400">{tip.probability}%</div>
                          {tip.confidence && (
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">{tip.confidence}</div>
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
          <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary/70" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">Yesterday</span>
            </div>
            <div className="flex-1 text-sm text-muted-foreground">
              {yr && yr.total > 0 ? (
                <>
                  <span className="text-white font-semibold tabular-nums">{yrHitRate ?? "—"}%</span> hit rate on value-rated
                  tips ({yr.wins}W · {yr.losses}L
                  {yr.pushes > 0 ? ` · ${yr.pushes}P` : ""}
                  {yr.pending > 0 ? ` · ${yr.pending} pending` : ""}).
                </>
              ) : (
                "No graded value tips yesterday — quiet days happen."
              )}
            </div>
            <Link href="/performance">
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer shrink-0">
                Full performance <ChevronRight className="w-3 h-3" />
              </div>
            </Link>
          </div>
        )}

        <div>
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3">More</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Link href="/following">
              <div className="glass-card rounded-xl p-3.5 hover:ring-1 hover:ring-primary/15 transition-all cursor-pointer h-full group">
                <Star className="w-4 h-4 text-secondary mb-2 opacity-90 group-hover:scale-105 transition-transform" />
                <div className="text-sm font-medium text-white">Watchlist</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {followCount ? `${followCount} saved` : "Follow fixtures"}
                </div>
              </div>
            </Link>
            <Link href="/signals">
              <div className="glass-card rounded-xl p-3.5 hover:ring-1 hover:ring-primary/15 transition-all cursor-pointer h-full group">
                <Zap className="w-4 h-4 text-amber-400 mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-sm font-medium text-white">Signals</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Alerts & feed</div>
              </div>
            </Link>
            <Link href="/standings">
              <div className="glass-card rounded-xl p-3.5 hover:ring-1 hover:ring-primary/15 transition-all cursor-pointer h-full group">
                <Trophy className="w-4 h-4 text-violet-400 mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-sm font-medium text-white">Standings</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Tables</div>
              </div>
            </Link>
            <Link href="/news">
              <div className="glass-card rounded-xl p-3.5 hover:ring-1 hover:ring-primary/15 transition-all cursor-pointer h-full group">
                <Newspaper className="w-4 h-4 text-muted-foreground mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-sm font-medium text-white">News</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Headlines</div>
              </div>
            </Link>
            <Link href="/pre-match">
              <div className="glass-card rounded-xl p-3.5 hover:ring-1 hover:ring-primary/15 transition-all cursor-pointer h-full group">
                <Calendar className="w-4 h-4 text-amber-400/90 mb-2 group-hover:scale-105 transition-transform" />
                <div className="text-sm font-medium text-white">Pre-match</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">By day</div>
              </div>
            </Link>
            <Link href="/pricing">
              <div className="glass-card rounded-xl p-3.5 hover:ring-1 hover:ring-primary/20 transition-all cursor-pointer h-full group border-primary/10">
                <Sparkles className="w-4 h-4 text-primary mb-2 group-hover:scale-105 transition-transform" />
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
