import { 
  useGetFixture, 
  useGetFixtureSignals,
  useGetFixtureOdds,
  useGetFixtureLiveOdds,
  useGetFixtureH2H,
  useGetTeamStatistics,
  useGetFixtureOddsMarkets,
  getGetFixtureOddsQueryKey,
  getGetFixtureLiveOddsQueryKey,
  getGetFixtureOddsMarketsQueryKey,
  getGetFixtureH2HQueryKey,
  getGetTeamStatisticsQueryKey,
  type FixtureEvent,
  type FixtureStats,
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { Activity, Star, AlertTriangle, Info, CheckCircle2, ChevronLeft, ChevronDown, Target, TrendingUp, TrendingDown, Minus, X, Zap, HelpCircle, Wind, Thermometer, CloudRain, Shield, Users, Award, UserX, Trophy, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Link } from "wouter";
import { useSession } from "@/lib/session";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useState, Component, useCallback, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function Match() {
  const [, params] = useRoute("/match/:id");
  const id = Number(params?.id);
  const { sessionId } = useSession();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/today");
    }
  }, [navigate]);

  const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
  const { data: fixtureData, isLoading: isLoadingFixture } = useGetFixture(id, { 
    query: { 
      enabled: !!id, 
      queryKey: ['fixture', id],
      staleTime: 15_000,
      refetchInterval: (query) => {
        const status = (query.state.data as any)?.fixture?.statusShort as string | undefined;
        return status && LIVE_STATUSES.has(status) ? 15_000 : false;
      },
      refetchIntervalInBackground: true,
    } 
  });
  
  const { toast } = useToast();

  const { data: followedData, refetch: refetchFollowed } = useQuery<{ fixtureIds: number[] }>({
    queryKey: ['followedFixtures', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch('/api/fixtures/followed');
      if (!res.ok) throw new Error('Failed to fetch followed fixtures');
      return res.json();
    },
  });

  const isFollowed = followedData?.fixtureIds?.includes(id) ?? false;

  const toggleFollow = async () => {
    try {
      const method = isFollowed ? 'DELETE' : 'POST';
      const res = await fetch(`/api/fixtures/${id}/follow`, { method });
      if (!res.ok) throw new Error('Follow request failed');
      await refetchFollowed();
    } catch {
      toast({ title: 'Could not update follow status', variant: 'destructive' });
    }
  };

  if (isLoadingFixture) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Activity className="w-8 h-8 text-primary animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!fixtureData?.fixture) return <Layout><div>Match not found</div></Layout>;

  const { fixture } = fixtureData;
  const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE", "SUSP", "INT", "BT"].includes(fixture.statusShort || "");
  const isPostponed = fixture.statusShort === "PST";
  const isCancelled = fixture.statusShort === "CANC" || fixture.statusShort === "ABD";
  const STATUS_LABEL: Record<string, string> = {
    NS: "Upcoming", TBD: "TBD",
    "1H": "1st Half", HT: "Half Time", "2H": "2nd Half",
    ET: "Extra Time", BT: "Break", P: "Penalties",
    SUSP: "Suspended", INT: "Interrupted", LIVE: "Live",
    FT: "Full Time", AET: "After Extra Time", PEN: "Penalties",
    ABD: "Abandoned", CANC: "Cancelled", AWD: "Awarded", WO: "Walkover",
    PST: "Postponed",
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <span className="text-white/15">·</span>
          <span className="truncate text-xs font-medium text-muted-foreground/90">{fixture.leagueName}</span>
        </div>

        {/* Header Card */}
        <div className="glass-card rounded-2xl p-6 md:p-8 relative overflow-hidden ring-1 ring-primary/20 shadow-[0_0_0_1px_hsl(43_72%_54%_/_.12)_inset]">
          <div className="absolute top-0 right-0 p-4">
            <button 
              onClick={toggleFollow}
              className={`p-2 rounded-md transition-colors ${isFollowed ? 'bg-secondary/20 text-secondary' : 'bg-white/5 text-muted-foreground hover:text-white'}`}
            >
              <Star className="w-5 h-5" fill={isFollowed ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-4 mb-8 flex-wrap">
              {isLive ? (
                <div className="flex items-center gap-2 px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-bold tracking-widest">LIVE {fixture.statusElapsed}'</span>
                </div>
              ) : (
                <div
                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold tracking-wide ${
                    isPostponed || isCancelled
                      ? "bg-amber-400/10 border-amber-400/30 text-amber-400"
                      : "bg-white/[0.04] border-white/10 text-muted-foreground"
                  }`}
                >
                  {STATUS_LABEL[fixture.statusShort ?? ""] ?? fixture.statusShort ?? "NS"}
                </div>
              )}
              {fixture.weatherDesc ? (
                <WeatherBadge
                  temp={fixture.weatherTemp ?? null}
                  desc={fixture.weatherDesc}
                  wind={fixture.weatherWind ?? null}
                  icon={fixture.weatherIcon ?? null}
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between w-full max-w-3xl">
              <div className="flex flex-col items-center gap-4 w-1/3">
                {fixture.homeTeamLogo && <img src={fixture.homeTeamLogo} className="w-24 h-24 object-contain drop-shadow-2xl bg-white/90 rounded-xl p-1" />}
                <span className="text-xl font-bold text-white text-center">{fixture.homeTeamName}</span>
              </div>
              
              <div className="flex flex-col items-center justify-center w-1/3">
                <div className="flex items-center justify-center gap-2 text-5xl md:text-7xl font-semibold text-white tabular-nums tracking-tight whitespace-nowrap">
                  <span>{fixture.homeGoals ?? '-'}</span>
                  <span className="text-white/20">:</span>
                  <span>{fixture.awayGoals ?? '-'}</span>
                </div>
                {fixture.kickoff && !isLive && fixture.statusShort === 'NS' && (
                  <span className="mt-4 text-muted-foreground text-sm tabular-nums">{format(new Date(fixture.kickoff), "MMM dd, HH:mm")}</span>
                )}
              </div>

              <div className="flex flex-col items-center gap-4 w-1/3">
                {fixture.awayTeamLogo && <img src={fixture.awayTeamLogo} className="w-24 h-24 object-contain drop-shadow-2xl bg-white/90 rounded-xl p-1" />}
                <span className="text-xl font-bold text-white text-center">{fixture.awayTeamName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs section for Analysis + Odds */}
        <div className="mt-8">
          <Tabs defaultValue={isLive ? "live" : (fixture.statusShort === "FT" || fixture.statusShort === "AET" || fixture.statusShort === "PEN") ? "post" : "pre"} className="w-full">
            <TabsList className="bg-white/[0.03] border border-white/[0.08] p-1.5 flex-wrap h-auto gap-1 rounded-xl">
              <TabsTrigger
                value="pre"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)] text-xs font-semibold tracking-[0.1em] uppercase rounded-lg px-3 py-2"
              >
                Pre-match
              </TabsTrigger>
              <TabsTrigger
                value="live"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)] text-xs font-semibold tracking-[0.1em] uppercase rounded-lg px-3 py-2"
              >
                In-play
              </TabsTrigger>
              <TabsTrigger
                value="post"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)] text-xs font-semibold tracking-[0.1em] uppercase rounded-lg px-3 py-2"
              >
                Post-match
              </TabsTrigger>
              <TabsTrigger
                value="odds"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)] text-xs font-semibold tracking-[0.1em] uppercase rounded-lg px-3 py-2"
              >
                Odds
              </TabsTrigger>
              <TabsTrigger
                value="h2h"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)] text-xs font-semibold tracking-[0.1em] uppercase rounded-lg px-3 py-2"
              >
                H2H
              </TabsTrigger>
              <TabsTrigger
                value="intel"
                className="data-[state=active]:bg-secondary/18 data-[state=active]:text-violet-200 data-[state=active]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)] text-xs font-semibold tracking-[0.1em] uppercase rounded-lg px-3 py-2"
              >
                Intel
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="pre" className="mt-4">
              {(isPostponed || isCancelled) ? (
                <div className="glass-card rounded-xl p-10 flex flex-col items-center text-center border border-amber-400/15">
                  <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center mb-4">
                    <span className="text-amber-400 text-xl">!</span>
                  </div>
                  <h3 className="text-base font-semibold text-amber-400 font-mono mb-2">
                    {isPostponed ? "Match Postponed" : "Match Cancelled"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {isPostponed
                      ? "This match has been postponed by the league or clubs. No pre-match analysis is available."
                      : "This match has been cancelled. No pre-match analysis is available."}
                  </p>
                </div>
              ) : (
                <BettingIntelTab
                  fixtureId={id}
                  homeTeamId={fixture.homeTeamId ?? 0}
                  awayTeamId={fixture.awayTeamId ?? 0}
                  homeTeam={fixture.homeTeamName ?? "Home"}
                  awayTeam={fixture.awayTeamName ?? "Away"}
                  dbPrediction={(fixtureData?.prediction as IntelPrediction | null | undefined) ?? null}
                />
              )}
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <LiveAnalysisTab
                fixtureId={id}
                homeTeam={fixture.homeTeamName ?? "Hjemme"}
                awayTeam={fixture.awayTeamName ?? "Ude"}
              />
            </TabsContent>
            <TabsContent value="post" className="mt-4">
              <PostReviewTab
                fixtureId={id}
                events={fixtureData?.events ?? []}
                stats={fixtureData?.stats ?? []}
                homeTeamId={fixture.homeTeamId ?? 0}
                awayTeamId={fixture.awayTeamId ?? 0}
                homeTeamName={fixture.homeTeamName ?? "Home"}
                awayTeamName={fixture.awayTeamName ?? "Away"}
              />
            </TabsContent>
            <TabsContent value="odds" className="mt-4">
              <OddsErrorBoundary>
                <OddsTab fixtureId={id} isLive={isLive} homeTeam={fixture.homeTeamName ?? "Home"} awayTeam={fixture.awayTeamName ?? "Away"} />
              </OddsErrorBoundary>
            </TabsContent>
            <TabsContent value="h2h" className="mt-4">
              <H2HTab fixtureId={id} homeTeamId={fixture.homeTeamId!} awayTeamId={fixture.awayTeamId!} homeTeam={fixture.homeTeamName ?? "Home"} awayTeam={fixture.awayTeamName ?? "Away"} />
            </TabsContent>
            <TabsContent value="intel" className="mt-4">
              <IntelTab
                fixtureId={id}
                homeTeamId={fixture.homeTeamId ?? 0}
                awayTeamId={fixture.awayTeamId ?? 0}
                homeTeam={fixture.homeTeamName ?? "Home"}
                awayTeam={fixture.awayTeamName ?? "Away"}
              />
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </Layout>
  );
}

// ─── Betting Intel (Pre-match) ────────────────────────────────────────────────

interface BettingTip {
  id: number;
  fixtureId: number;
  homeTeam: string | null;
  awayTeam: string | null;
  recommendation: string;
  betType: string;
  betSide: string | null;
  trustScore: number;
  aiProbability: number | null;
  impliedProbability: number | null;
  confidence: "high" | "medium" | "low" | null;
  edge: number | null;
  reasoning: string;
  marketOdds: number | null;
  valueRating: string | null;
  outcome: string | null;
  reviewHeadline: string | null;
  reviewSummary: string | null;
  accuracyNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

function WeatherBadge({ temp, desc, wind, icon }: { temp: number | null; desc: string; wind: number | null; icon: string | null }) {
  const isAdverse = (wind ?? 0) > 10 ||
    desc.toLowerCase().includes("snow") ||
    desc.toLowerCase().includes("heavy rain") ||
    desc.toLowerCase().includes("thunderstorm") ||
    desc.toLowerCase().includes("hail") ||
    desc.toLowerCase().includes("blizzard") ||
    (temp ?? 15) < -5 ||
    (temp ?? 15) > 36;

  const baseClass = isAdverse
    ? "flex items-center gap-2 px-3 py-1 rounded border text-amber-400 bg-amber-400/10 border-amber-400/30"
    : "flex items-center gap-2 px-3 py-1 rounded border text-violet-300 bg-violet-400/10 border-violet-400/20";

  return (
    <div className={baseClass} title={`${desc} — ${Math.round(temp ?? 0)}°C, vind ${Math.round(wind ?? 0)} m/s`}>
      {icon
        ? <img src={`https://openweathermap.org/img/wn/${icon}.png`} className="w-5 h-5 object-contain" alt={desc} />
        : (wind ?? 0) > 10 ? <Wind className="w-4 h-4" /> : <CloudRain className="w-4 h-4" />
      }
      <span className="text-xs font-mono font-bold tracking-wider">
        {Math.round(temp ?? 0)}°C
        {(wind ?? 0) > 5 && <span className="ml-1 opacity-70">{Math.round(wind ?? 0)}m/s</span>}
      </span>
      {isAdverse && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
    </div>
  );
}

function WeatherSourceHint({ desc }: { desc: string }) {
  return (
    <div className="mt-2 text-xs text-muted-foreground font-mono">
      Weather: {desc}
    </div>
  );
}

function ValueBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const config: Record<string, { label: string; color: string; bg: string; border: string }> = {
    strong_value: { label: 'STRONG VALUE', color: 'text-teal-300', bg: 'bg-teal-400/10', border: 'border-teal-400/30' },
    value: { label: 'VALUE', color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
    fair: { label: 'FAIR PRICE', color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
    overpriced: { label: 'OVERPRICED', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  };
  const c = config[rating] ?? config.fair!;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${c.color} ${c.bg} border ${c.border}`}>
      {c.label}
    </span>
  );
}

function ConfidenceBadgeLarge({ confidence }: { confidence: "high" | "medium" | "low" | null }) {
  if (!confidence) return null;
  const styles: Record<string, string> = {
    high: 'text-teal-300 bg-teal-400/10 border-teal-400/30',
    medium: 'text-violet-300 bg-violet-400/10 border-violet-400/25',
    low: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  };
  const labels: Record<string, string> = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
  return (
    <span
      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${styles[confidence]}`}
      title="Data-derived confidence (edge realism, data completeness, odds stability, league accuracy)"
    >
      {labels[confidence]}
    </span>
  );
}

function oddsFromSnap(snap: { homeWin?: number | null; draw?: number | null; awayWin?: number | null; btts?: number | null; overUnder25?: number | null; handicapHome?: number | null } | null | undefined, betType: string, betSide: string | null): number | null {
  if (!snap) return null;
  const side = betSide ?? "";
  if (betType === "match_result") {
    if (side === "home") return snap.homeWin ?? null;
    if (side === "draw") return snap.draw ?? null;
    if (side === "away") return snap.awayWin ?? null;
  }
  if (betType === "over_under" || betType === "over_under_2_5") {
    if (side.includes("over25") || side === "over") return snap.overUnder25 ?? null;
  }
  if (betType === "btts" && side === "yes") return snap.btts ?? null;
  if (betType === "asian_handicap" && side === "home") return snap.handicapHome ?? null;
  return null;
}

// Trust score: 0-100 scale with progress bar and trend arrow
function TrustBadge({ score, confidence }: { score: number | null; confidence?: "high" | "medium" | "low" | null }) {
  if (score == null) return null;
  const clamped = Math.max(1, Math.min(9, Math.round(score)));
  const pct = Math.round((clamped / 9) * 100);
  const color = pct >= 70 ? 'text-teal-300' : pct >= 50 ? 'text-violet-300' : 'text-amber-400';
  const barColor = pct >= 70 ? 'bg-teal-400/70' : pct >= 50 ? 'bg-violet-400/70' : 'bg-amber-400/70';
  const trend = confidence === 'high' ? { icon: '▲', cls: 'text-teal-400' }
    : confidence === 'low' ? { icon: '▼', cls: 'text-amber-400' }
    : null;
  return (
    <div className="flex flex-col items-end gap-1.5" title="Trust score 0–100 baseret på sandsynlighedsstyrke og datakvalitet">
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums leading-none ${color}`}>{pct}</span>
        <span className="text-[10px] font-mono text-white/30">trust</span>
        {trend && <span className={`text-[10px] font-bold ${trend.cls}`}>{trend.icon}</span>}
      </div>
      <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TipCard({ tip, betTypeLabel, bookmaker, snap }: { tip: BettingTip; betTypeLabel: string; bookmaker?: string | null; snap?: { homeWin?: number | null; draw?: number | null; awayWin?: number | null; btts?: number | null; overUnder25?: number | null; handicapHome?: number | null } | null }) {
  const isValue = tip.valueRating === 'value' || tip.valueRating === 'strong_value';
  const borderColor = isValue ? 'border-teal-400/30' : 'border-white/10';
  const resolvedMarketOdds = tip.marketOdds ?? oddsFromSnap(snap, tip.betType, tip.betSide);
  const impliedFromOdds = resolvedMarketOdds != null && resolvedMarketOdds > 1 ? 1 / resolvedMarketOdds : null;
  const impliedProb = tip.impliedProbability ?? impliedFromOdds;
  const implPct = impliedProb != null ? Math.round(impliedProb * 100) : null;

  return (
    <div className={`glass-card p-5 rounded-xl border ${borderColor} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              {betTypeLabel}
            </span>
            <ValueBadge rating={tip.valueRating} />
          </div>
          <div className="text-xl font-bold text-white leading-tight">
            {tip.recommendation}
          </div>
          {resolvedMarketOdds != null && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-muted-foreground uppercase">Odds</span>
              <span className="font-mono text-lg font-bold text-teal-400 tabular-nums">{resolvedMarketOdds.toFixed(2)}</span>
              {bookmaker && (
                <span className="text-[10px] font-mono text-muted-foreground bg-white/5 border border-white/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                  {bookmaker}
                </span>
              )}
            </div>
          )}
          {implPct != null && (
            <div className="text-[11px] font-mono text-muted-foreground pt-1">
              Market <span className="text-white/60 tabular-nums font-bold">{implPct}%</span>
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <TrustBadge score={tip.trustScore} confidence={tip.confidence} />
        </div>
      </div>

      <p className="text-sm text-white/70 leading-relaxed">{tip.reasoning}</p>
    </div>
  );
}

interface PrematchSynthesis {
  headline: string;
  summary: string;
  keyFactors: string[];
  bestBet: string | null;
  bestBetOdds: number | null;
  generatedAt: string;
}

interface PredComparison {
  form:    { home: string; away: string };
  att:     { home: string; away: string };
  def:     { home: string; away: string };
  poisson_distribution: { home: string; away: string };
  h2h:     { home: string; away: string };
  goals:   { home: string; away: string };
  total:   { home: string; away: string };
}
interface PredLast5 {
  played: number;
  form: string | null;
  att: string | null;
  def: string | null;
  goals: { for: { total: number; average: string }; against: { total: number; average: string } };
}
interface IntelPrediction {
  homeWinPct: number | null;
  drawPct: number | null;
  awayWinPct: number | null;
  goalsHome: number | null;
  goalsAway: number | null;
  underOver: string | null;
  winOrDraw: boolean | null;
  advice: string | null;
  winner: string | null;       // predicted winner team name or "Draw"
  winnerComment: string | null;
  comparison: PredComparison | null;
  last5Home: PredLast5 | null;
  last5Away: PredLast5 | null;
}

/** True if API-Football snapshot has anything worth rendering (avoids empty objects / all-null rows). */
function predictionHasData(p: IntelPrediction | null | undefined): boolean {
  if (!p) return false;
  const h = p.homeWinPct ?? 0;
  const d = p.drawPct ?? 0;
  const a = p.awayWinPct ?? 0;
  if (h > 0 || d > 0 || a > 0) return true;
  if (p.advice && p.advice.trim().length > 0) return true;
  if (p.winner && String(p.winner).trim().length > 0) return true;
  const gh = p.goalsHome ?? 0;
  const ga = p.goalsAway ?? 0;
  if (gh > 0 || ga > 0) return true;
  if (p.comparison && typeof p.comparison === "object" && Object.keys(p.comparison).length > 0) return true;
  if (p.last5Home || p.last5Away) return true;
  return false;
}

interface IntelData {
  prediction: IntelPrediction | null;
  homeCoach: { name: string | null } | null;
  awayCoach: { name: string | null } | null;
  homeSidelined: Array<{ playerName: string | null; reason: string | null }>;
  awaySidelined: Array<{ playerName: string | null; reason: string | null }>;
  topScorers: Array<{ playerName: string | null; teamId: number | null; goals: number | null; assists: number | null }>;
}

const MARKET_LABEL_MAP: Record<string, string> = {
  match_result: 'Kampresultat', over_under_25: 'Over/Under 2.5',
  btts: 'Begge scorer', double_chance: 'Double Chance', win_or_draw: 'Win or Draw',
};

function deriveMarketsClient(pred: IntelPrediction, homeTeam: string, awayTeam: string) {
  const markets: { market: string; label: string; probability: number }[] = [];
  const h = pred.homeWinPct ?? 0;
  const d = pred.drawPct ?? 0;
  const a = pred.awayWinPct ?? 0;

  // Match result
  if (h > 0) markets.push({ market: 'match_result', label: `${homeTeam} vinder`, probability: Math.round(h) });
  if (d > 0) markets.push({ market: 'match_result', label: 'Uafgjort', probability: Math.round(d) });
  if (a > 0) markets.push({ market: 'match_result', label: `${awayTeam} vinder`, probability: Math.round(a) });

  // Over/Under 2.5 (Poisson-based)
  const gh = pred.goalsHome ?? 0;
  const ga = pred.goalsAway ?? 0;
  if (gh > 0 || ga > 0) {
    const overProb = Math.min(92, Math.max(25, Math.round(50 + (gh + ga - 2.5) * 18)));
    const adjusted = pred.underOver?.startsWith('+') ? Math.min(92, overProb + 8)
      : pred.underOver?.startsWith('-') ? Math.max(25, overProb - 8)
      : overProb;
    markets.push({ market: 'over_under_25', label: 'Over 2.5 mål', probability: adjusted });
    markets.push({ market: 'over_under_25', label: 'Under 2.5 mål', probability: 100 - adjusted });
  }

  // BTTS
  if (gh > 0 && ga > 0) {
    const bttsYes = Math.round((1 - Math.exp(-gh)) * (1 - Math.exp(-ga)) * 100);
    markets.push({ market: 'btts', label: 'Begge hold scorer', probability: bttsYes });
    markets.push({ market: 'btts', label: 'Ikke begge scorer', probability: 100 - bttsYes });
  }

  // Double Chance
  if (h > 0 && d > 0) markets.push({ market: 'double_chance', label: `${homeTeam} eller uafgjort`, probability: Math.min(99, Math.round(h + d)) });
  if (a > 0 && d > 0) markets.push({ market: 'double_chance', label: `${awayTeam} eller uafgjort`, probability: Math.min(99, Math.round(a + d)) });

  // Win or Draw
  if (pred.winOrDraw === true && h > 0 && d > 0)
    markets.push({ market: 'win_or_draw', label: `${homeTeam} vinder eller uafgjort`, probability: Math.min(99, Math.round(h + d)) });

  return markets.sort((x, y) => y.probability - x.probability);
}

type OddsSnapLite = {
  homeWin?: number | null;
  draw?: number | null;
  awayWin?: number | null;
  btts?: number | null;
  overUnder25?: number | null;
  bookmaker?: string | null;
};

function impliedPctFromDecimal(odd: number | null | undefined): number | null {
  if (odd == null || !Number.isFinite(odd) || odd <= 1) return null;
  return Math.round((1 / odd) * 1000) / 10;
}

/** Match API-Football derived lines to our odds snapshot; edge = model% − implied% (before margin removal — indicative only). */
function buildPredictionValueRows(
  markets: { market: string; label: string; probability: number }[],
  snap: OddsSnapLite | null | undefined,
  homeTeam: string,
  awayTeam: string,
): Array<{
  label: string;
  marketKey: string;
  modelPct: number;
  decimalOdds: number;
  impliedPct: number;
  edgePp: number;
}> {
  if (!snap) return [];
  const rows: Array<{
    label: string;
    marketKey: string;
    modelPct: number;
    decimalOdds: number;
    impliedPct: number;
    edgePp: number;
  }> = [];

  for (const m of markets) {
    let odd: number | null | undefined;
    if (m.market === "match_result") {
      if (m.label === `${homeTeam} vinder`) odd = snap.homeWin;
      else if (m.label === "Uafgjort") odd = snap.draw;
      else if (m.label === `${awayTeam} vinder`) odd = snap.awayWin;
    } else if (m.market === "over_under_25" && m.label.startsWith("Over")) {
      odd = snap.overUnder25;
    } else if (m.market === "btts" && m.label.includes("Begge hold")) {
      odd = snap.btts;
    }
    if (odd == null || !Number.isFinite(odd) || odd <= 1) continue;
    const implied = impliedPctFromDecimal(odd);
    if (implied == null) continue;
    const edgeRaw = m.probability - implied;
    const edgePp = Math.round(edgeRaw * 10) / 10;
    rows.push({
      label: m.label,
      marketKey: m.market,
      modelPct: m.probability,
      decimalOdds: odd,
      impliedPct: implied,
      edgePp,
    });
  }
  return rows.sort((a, b) => b.edgePp - a.edgePp);
}

function BettingIntelTab({
  fixtureId,
  homeTeamId,
  awayTeamId,
  homeTeam,
  awayTeam,
  dbPrediction = null,
}: {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  /** From GET /fixtures/:id — always reflects DB even if /intel cache is stale */
  dbPrediction?: IntelPrediction | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ tips: BettingTip[]; tip: BettingTip | null; message?: string }>({
    queryKey: ['bettingTip', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/${fixtureId}/betting-tip`);
      if (!res.ok) throw new Error('Failed to fetch betting tip');
      return res.json();
    },
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: synthesisData, isLoading: isSynthesisLoading } = useQuery<{ synthesis: PrematchSynthesis | null; message?: string }>({
    queryKey: ['prematchSynthesis', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/${fixtureId}/prematch-synthesis`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
  });

  const { data: intelData, isLoading: isIntelLoading, isFetching: isIntelFetching } = useQuery<IntelData>({
    queryKey: ['intel', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/fixtures/${fixtureId}/intel`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

  const { mutate: runPredictionSync, ...syncPredictions } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/fixtures/${fixtureId}/predictions/sync`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? "Sync failed");
      return body as { ok: boolean; hasPrediction: boolean };
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: ["fixture", fixtureId] });
      await queryClient.invalidateQueries({ queryKey: ["intel", fixtureId] });
      await queryClient.invalidateQueries({ queryKey: ["bettingTip", fixtureId] });
      await queryClient.invalidateQueries({ queryKey: ["prematchSynthesis", fixtureId] });
      if (!body.hasPrediction) {
        toast({
          title: "Ingen API-prediction",
          description: "API-Football returnerede intet for denne kamp (ses ofte i små ligaer).",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Could not sync", description: e.message, variant: "destructive" });
    },
  });

  const { data: oddsData } = useGetFixtureOdds(fixtureId, { query: { queryKey: getGetFixtureOddsQueryKey(fixtureId), staleTime: 10 * 60_000 } });
  const bookmaker = oddsData?.odds?.bookmaker ?? null;

  const { data: accData } = useQuery<{ hitRate: number | null; reviewed: number; hits: number }>({
    queryKey: ['aiAccuracy'],
    queryFn: async () => {
      const res = await fetch('/api/analysis/accuracy');
      if (!res.ok) throw new Error('Failed to fetch accuracy');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const MARKET_ORDER: Record<string, number> = { match_result: 0, over_under_2_5: 1, over_under: 1, btts: 2 };
  const tips = (data?.tips ?? []).slice().sort((a, b) =>
    (MARKET_ORDER[a.betType] ?? 99) - (MARKET_ORDER[b.betType] ?? 99)
  );

  const betTypeLabelFn = (t: string) => {
    if (t === 'match_result') return 'Match Result';
    if (t === 'over_under') return 'Goals Market';
    if (t === 'btts') return 'Both Teams to Score';
    if (t === 'corners') return 'Corners Market';
    if (t === 'asian_handicap') return 'Asian Handicap';
    if (t === 'total_cards') return 'Cards Market';
    if (t === 'double_chance') return 'Double Chance';
    if (t === 'draw_no_bet') return 'Draw No Bet';
    if (t === 'win_to_nil') return 'Win to Nil';
    if (t === 'first_half_goals') return '1st Half Goals';
    if (t === 'correct_score') return 'Correct Score';
    if (t === 'first_team_score') return 'First Team to Score';
    if (t === 'no_bet') return 'No Bet';
    return t;
  };

  const synthesis = synthesisData?.synthesis ?? null;
  const rawPred = intelData?.prediction ?? dbPrediction ?? null;
  const pred = predictionHasData(rawPred) ? rawPred : null;
  const homeSidelined = intelData?.homeSidelined ?? [];
  const awaySidelined = intelData?.awaySidelined ?? [];
  const homeTopScorer = intelData?.topScorers?.find(p => p.teamId === homeTeamId);
  const awayTopScorer = intelData?.topScorers?.find(p => p.teamId === awayTeamId);

  const derivedMarkets = useMemo(() => {
    if (!pred) return [];
    return deriveMarketsClient(pred, homeTeam, awayTeam);
  }, [pred, homeTeam, awayTeam]);

  const valueVsOddsRows = useMemo(() => {
    if (!pred || derivedMarkets.length === 0) return [];
    return buildPredictionValueRows(derivedMarkets, oddsData?.odds ?? null, homeTeam, awayTeam);
  }, [pred, derivedMarkets, oddsData?.odds, homeTeam, awayTeam]);

  const bestValueHighlight = useMemo(() => {
    const positive = valueVsOddsRows.filter((r) => r.edgePp >= 3);
    if (positive.length === 0) return null;
    return positive[0];
  }, [valueVsOddsRows]);

  const showEmptyPreMatch =
    !isIntelLoading &&
    !pred &&
    tips.length === 0 &&
    homeSidelined.length === 0 &&
    awaySidelined.length === 0 &&
    !homeTopScorer &&
    !awayTopScorer;

  const autoSyncAttemptedRef = useRef(false);
  useEffect(() => {
    autoSyncAttemptedRef.current = false;
  }, [fixtureId]);

  useEffect(() => {
    if (isIntelLoading) return;
    if (pred) return;
    if (tips.length > 0) return;
    if (autoSyncAttemptedRef.current) return;
    if (syncPredictions.isPending) return;
    autoSyncAttemptedRef.current = true;
    runPredictionSync();
  }, [fixtureId, isIntelLoading, pred, tips.length, runPredictionSync, syncPredictions.isPending]);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="glass-card p-10 rounded-xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
        </div>
      ) : (
        <>
          {isIntelLoading && !intelData && (
            <div className="glass-card p-8 rounded-xl border border-white/8 flex flex-col items-center gap-3">
              <Activity className="w-7 h-7 text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground font-mono text-center">Loading match data…</p>
            </div>
          )}

          {/* ── Match Synthesis (only when tips exist) ── */}
          {tips.length > 0 && (isSynthesisLoading && !synthesis ? (
            <div className="glass-card p-4 rounded-xl border border-violet-400/15 flex items-center gap-3">
              <Activity className="w-4 h-4 text-violet-400 animate-pulse shrink-0" />
              <span className="text-xs font-mono text-muted-foreground">Generating match briefing…</span>
            </div>
          ) : synthesis ? (
            <div className="glass-card rounded-xl border border-violet-400/20 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/6 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-mono text-violet-400 uppercase tracking-widest">Match Briefing</span>
                <span className="ml-auto text-[9px] font-mono text-muted-foreground/30">
                  {format(new Date(synthesis.generatedAt), 'HH:mm')}
                </span>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-base font-bold text-white leading-snug">{synthesis.headline}</p>
                {synthesis.summary && (
                  <p className="text-sm text-white/65 leading-relaxed">{synthesis.summary}</p>
                )}
                {synthesis.keyFactors.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {synthesis.keyFactors.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400/50 mt-1.5 shrink-0" />
                        <span className="text-xs text-white/55 leading-relaxed">{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null)}

          {/* ── API-Football Prediction Panel ── */}
          {pred && (
            <div className="glass-card rounded-xl overflow-hidden border border-violet-400/15">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-violet-400/70" />
                <span className="text-xs font-mono text-violet-400/80 uppercase tracking-widest">API-Football Prediction</span>
              </div>
              <div className="p-4 space-y-4">

                {/* Advice headline */}
                {pred.advice && (
                  <div className="space-y-1.5">
                    <div className="text-base font-bold text-white">{pred.advice}</div>
                    {pred.winner && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border text-amber-300/80 bg-amber-400/8 border-amber-400/20 uppercase tracking-wider">
                        ⚡ {pred.winner}
                      </span>
                    )}
                    {pred.winnerComment && pred.winnerComment !== pred.advice && (
                      <div className="text-xs font-mono text-muted-foreground/60">{pred.winnerComment}</div>
                    )}
                  </div>
                )}

                {/* Win probability bar */}
                {(pred.homeWinPct != null || pred.drawPct != null || pred.awayWinPct != null) && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                      <span>{homeTeam}</span>
                      <span>Draw</span>
                      <span>{awayTeam}</span>
                    </div>
                    <div className="flex items-center h-7 rounded overflow-hidden w-full">
                      {(pred.homeWinPct ?? 0) > 0 && (
                        <div className="h-full flex items-center justify-center bg-teal-400/20 border-r border-teal-400/30 min-w-[2.5rem]" style={{ flex: pred.homeWinPct ?? 0 }}>
                          <span className="text-xs font-mono font-bold text-teal-300 px-1">{pred.homeWinPct}%</span>
                        </div>
                      )}
                      {(pred.drawPct ?? 0) > 0 && (
                        <div className="h-full flex items-center justify-center border-r border-amber-400/40 min-w-[2.5rem]" style={{ flex: pred.drawPct ?? 0, backgroundColor: "rgba(251,191,36,0.28)" }}>
                          <span className="text-xs font-mono font-bold text-amber-300 px-1">{pred.drawPct}%</span>
                        </div>
                      )}
                      {(pred.awayWinPct ?? 0) > 0 && (
                        <div className="h-full flex items-center justify-center bg-violet-400/20 min-w-[2.5rem]" style={{ flex: pred.awayWinPct ?? 0 }}>
                          <span className="text-xs font-mono font-bold text-violet-300 px-1">{pred.awayWinPct}%</span>
                        </div>
                      )}
                    </div>
                    {/* Extra info row */}
                    <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50 flex-wrap">
                      {pred.goalsHome != null && pred.goalsAway != null && (
                        <span>Predicted score: {pred.goalsHome.toFixed(1)}–{pred.goalsAway.toFixed(1)}</span>
                      )}
                      {pred.underOver != null && (
                        <span className="border-l border-white/10 pl-3">
                          {pred.underOver.startsWith('-') ? `Under ${pred.underOver.replace('-', '')}` : `Over ${pred.underOver.replace('+', '')}`} goals
                        </span>
                      )}
                      {pred.winOrDraw != null && (
                        <span className="border-l border-white/10 pl-3">{pred.winOrDraw ? `${homeTeam} Win or Draw` : `${awayTeam} or Draw`}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Comparison metrics */}
                {pred.comparison && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">Team Comparison</div>
                    {([
                      { key: 'total',   label: 'Overall' },
                      { key: 'form',    label: 'Form' },
                      { key: 'att',     label: 'Attack' },
                      { key: 'def',     label: 'Defence' },
                      { key: 'poisson_distribution', label: 'Poisson' },
                      { key: 'h2h',     label: 'H2H' },
                    ] as const).map(({ key, label }) => {
                      const metric = pred.comparison?.[key as keyof PredComparison];
                      if (!metric) return null;
                      const hVal = parseFloat(metric.home);
                      const aVal = parseFloat(metric.away);
                      if (isNaN(hVal) || isNaN(aVal)) return null;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-muted-foreground/40 w-14 shrink-0 text-right">{label}</span>
                          <div className="flex-1 flex items-center h-3.5 rounded overflow-hidden">
                            <div className="h-full bg-teal-400/25 border-r border-teal-400/20" style={{ width: `${hVal}%` }} />
                            <div className="h-full bg-violet-400/25" style={{ width: `${aVal}%` }} />
                          </div>
                          <div className="flex items-center gap-1 text-[9px] font-mono shrink-0">
                            <span className="text-teal-300 tabular-nums w-8 text-right">{Math.round(hVal)}%</span>
                            <span className="text-muted-foreground/20">·</span>
                            <span className="text-violet-300 tabular-nums w-8">{Math.round(aVal)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Last 5 */}
                {(pred.last5Home || pred.last5Away) && (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: homeTeam, data: pred.last5Home, color: 'teal' },
                      { label: awayTeam, data: pred.last5Away, color: 'violet' },
                    ].map(({ label, data, color }) => data ? (
                      <div key={label} className="bg-white/3 rounded-lg p-2.5 space-y-1">
                        <div className={`text-[9px] font-mono text-${color}-400/60 uppercase tracking-wider truncate`}>{label} — Last 5</div>
                        {data.form && (
                          <div className="flex gap-0.5">
                            {data.form.split('').slice(0, 5).map((r, i) => (
                              <span key={i} className={`text-[10px] font-mono font-bold px-1 py-0.5 rounded ${r === 'W' ? 'bg-teal-400/20 text-teal-300' : r === 'D' ? 'bg-amber-400/20 text-amber-300' : 'bg-red-400/20 text-red-400'}`}>{r}</span>
                            ))}
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-white/50">
                          {data.goals.for.total} scored · {data.goals.against.total} conceded
                        </div>
                        {data.att && data.def && (
                          <div className="text-[9px] font-mono text-muted-foreground/40">
                            Att {data.att} · Def {data.def}
                          </div>
                        )}
                      </div>
                    ) : null)}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── Injuries + Top Scorers Panel ── */}
          {(homeSidelined.length > 0 || awaySidelined.length > 0 || homeTopScorer || awayTopScorer) && (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-teal-400/70" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Squad Info</span>
              </div>
              <div className="p-4 space-y-3">
                {/* Top scorers */}
                {(homeTopScorer || awayTopScorer) && (
                  <div className="grid grid-cols-2 gap-2">
                    {homeTopScorer && (
                      <div className="bg-white/3 rounded-lg p-2.5 space-y-0.5">
                        <div className="text-[9px] font-mono text-teal-400/60 uppercase tracking-wider truncate">{homeTeam} — Top Scorer</div>
                        <div className="text-xs font-mono text-white truncate">{homeTopScorer.playerName}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-mono text-teal-400">{homeTopScorer.goals ?? 0} mål</span>
                          {homeTopScorer.assists != null && <span className="text-xs font-mono text-violet-400/70">{homeTopScorer.assists} ass</span>}
                        </div>
                      </div>
                    )}
                    {awayTopScorer && (
                      <div className="bg-white/3 rounded-lg p-2.5 space-y-0.5">
                        <div className="text-[9px] font-mono text-violet-400/60 uppercase tracking-wider truncate">{awayTeam} — Top Scorer</div>
                        <div className="text-xs font-mono text-white truncate">{awayTopScorer.playerName}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-mono text-teal-400">{awayTopScorer.goals ?? 0} mål</span>
                          {awayTopScorer.assists != null && <span className="text-xs font-mono text-violet-400/70">{awayTopScorer.assists} ass</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Injuries */}
                {(homeSidelined.length > 0 || awaySidelined.length > 0) && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {[{ label: homeTeam, players: homeSidelined }, { label: awayTeam, players: awaySidelined }].map(({ label, players }) =>
                      players.length > 0 ? (
                        <div key={label} className="space-y-1">
                          <div className="text-[9px] font-mono text-red-400/60 uppercase tracking-wider flex items-center gap-1">
                            <UserX className="w-3 h-3" />{label} — Out
                          </div>
                          {players.slice(0, 4).map((p, i) => (
                            <div key={i} className="text-[10px] font-mono text-white/50 truncate">
                              {p.playerName ?? 'Unknown'}
                              {p.reason && <span className="text-white/25 ml-1">({p.reason})</span>}
                            </div>
                          ))}
                          {players.length > 4 && (
                            <div className="text-[9px] font-mono text-muted-foreground/30">+{players.length - 4} more</div>
                          )}
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── All Derived Market Predictions ── */}
          {pred && derivedMarkets.length > 0 && (
            <div className="glass-card rounded-xl overflow-hidden border border-teal-400/10">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-teal-400/70" />
                <span className="text-xs font-mono text-teal-400/80 uppercase tracking-widest">Alle Predictions</span>
              </div>
              <div className="divide-y divide-white/5">
                {derivedMarkets.map((m, i) => {
                  const col = m.probability >= 72 ? 'text-teal-300' : m.probability >= 60 ? 'text-violet-300' : 'text-white/50';
                  const barCol = m.probability >= 72 ? 'bg-teal-400/60' : m.probability >= 60 ? 'bg-violet-400/60' : 'bg-white/15';
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-mono text-muted-foreground/35 uppercase tracking-wider mb-0.5">
                          {MARKET_LABEL_MAP[m.market] ?? m.market}
                        </div>
                        <div className={`text-sm font-semibold ${col}`}>{m.label}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barCol}`} style={{ width: `${m.probability}%` }} />
                        </div>
                        <span className={`text-sm font-bold font-mono tabular-nums ${col} w-10 text-right`}>
                          {m.probability}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Model vs odds: indicative edge (usable signal) ── */}
          {pred && valueVsOddsRows.length > 0 && (
            <div className="glass-card rounded-xl overflow-hidden border border-primary/20">
              <div className="px-5 py-3 border-b border-white/6 flex items-start gap-2 flex-wrap">
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-mono text-primary uppercase tracking-widest">Model vs odds</span>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Sammenligner API-Football sandsynlighed med det seneste odds-snapshot (1X2, over 2.5, BTTS).{" "}
                    <span className="text-white/70">Edge</span> = model % minus markedets simple implied % (før margen-fjernelse) — til overblik, ikke som garanti.
                    {oddsData?.odds?.bookmaker && (
                      <span className="block mt-1 text-muted-foreground/80">Bookmaker: {oddsData.odds.bookmaker}</span>
                    )}
                  </p>
                </div>
              </div>
              {bestValueHighlight && (
                <div className="mx-4 mt-3 mb-1 rounded-lg border border-teal-400/25 bg-teal-400/5 px-3 py-2 text-xs text-teal-200/90">
                  <span className="font-semibold text-teal-300">Stærkest signal: </span>
                  {bestValueHighlight.label}
                  <span className="text-muted-foreground"> · </span>
                  model {bestValueHighlight.modelPct}% vs marked ~{bestValueHighlight.impliedPct}%
                  <span className="font-mono font-bold text-teal-300"> ({bestValueHighlight.edgePp >= 0 ? "+" : ""}
                  {bestValueHighlight.edgePp} pp)</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/8 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Udfald</th>
                      <th className="px-3 py-2 font-medium text-right">Model</th>
                      <th className="px-3 py-2 font-medium text-right">Odds</th>
                      <th className="px-3 py-2 font-medium text-right">Marked ~</th>
                      <th className="px-4 py-2 font-medium text-right">Edge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valueVsOddsRows.map((r) => {
                      const edgeColor =
                        r.edgePp >= 5 ? "text-teal-300" : r.edgePp >= 2 ? "text-emerald-400/90" : r.edgePp <= -5 ? "text-red-400/80" : "text-muted-foreground";
                      return (
                        <tr key={`${r.marketKey}-${r.label}`} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-2.5 text-white/90 max-w-[200px]">
                            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">
                              {MARKET_LABEL_MAP[r.marketKey] ?? r.marketKey}
                            </div>
                            <div className="font-medium leading-snug">{r.label}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white/90">{r.modelPct}%</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-primary">{r.decimalOdds.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{r.impliedPct}%</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${edgeColor}`}>
                            {r.edgePp >= 0 ? "+" : ""}
                            {r.edgePp} pp
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tip Cards ── */}
          {tips.length > 0 ? (
            <>
              {tips.map((tip) => (
                <TipCard key={tip.id} tip={tip} betTypeLabel={betTypeLabelFn(tip.betType)} bookmaker={bookmaker} snap={oddsData?.odds} />
              ))}
              <div className="text-[10px] font-mono text-muted-foreground/40 text-center">
                Generated {format(new Date(tips[0].createdAt), 'MMM dd, HH:mm')} · For informational purposes only
              </div>
            </>
          ) : syncPredictions.isPending && !pred && tips.length === 0 ? (
            <div className="glass-card p-8 rounded-xl border border-primary/20 flex flex-col items-center gap-3 text-center">
              <Activity className="w-7 h-7 text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">Henter og opdaterer prediction automatisk…</p>
            </div>
          ) : showEmptyPreMatch ? (
            <div className="glass-card p-6 rounded-xl border border-white/10 space-y-2">
              <h3 className="text-sm font-semibold text-white">Ingen prediction tilgængelig</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Der er endnu ikke gemt en brugbar API-Football prediction for denne kamp. Brug fanerne{" "}
                <span className="text-white/80">Odds</span> og <span className="text-white/80">H2H</span> for rå data.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Live Analysis Tab ────────────────────────────────────────────────────────

interface LiveAnalysis {
  phase: string;
  headline: string;
  narrative: string;
  key_factors?: string[];
  momentum_verdict?: string;
  alert_worthy?: boolean;
  cachedAt?: string;
}

interface LiveSignal {
  id: number;
  fixtureId: number;
  phase: string;
  signalKey: string;
  signalLabel: string;
  signalValue: number | null;
  signalBool: boolean | null;
  triggeredAt: string;
}

const SIGNAL_CONFIG: Record<string, { icon: string; color: string }> = {
  momentum_shift:           { icon: '↗', color: 'text-violet-300 border-violet-400/25 bg-violet-400/8' },
  home_pressure_rising:     { icon: '⬆', color: 'text-teal-300 border-teal-400/25 bg-teal-400/8' },
  away_over_expected_tempo: { icon: '↗', color: 'text-teal-300 border-teal-400/25 bg-teal-400/8' },
  red_card_changed_balance: { icon: '■', color: 'text-red-400 border-red-400/30 bg-red-400/8' },
  upset_risk:               { icon: '⚠', color: 'text-amber-400 border-amber-400/30 bg-amber-400/8' },
  live_edge:                { icon: '◆', color: 'text-teal-300 border-teal-400/30 bg-teal-400/10' },
  live_value:               { icon: '◆', color: 'text-teal-300 border-teal-400/30 bg-teal-400/10' },
};

function LiveAnalysisTab({ fixtureId, homeTeam, awayTeam }: { fixtureId: number; homeTeam: string; awayTeam: string }) {
  const { data: liveAnalysis, isLoading } = useQuery<LiveAnalysis | null>({
    queryKey: ['liveAnalysis', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/${fixtureId}/live`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!fixtureId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
  });

  const { data: signalsData } = useGetFixtureSignals(
    fixtureId,
    { phase: 'live' },
    { query: { queryKey: ['signals', fixtureId, 'live'], staleTime: 15_000, refetchInterval: 15_000 } }
  );
  const liveSignals: LiveSignal[] = (signalsData?.signals ?? []) as LiveSignal[];
  const activeSignals = liveSignals.filter(s => s.signalBool);

  const { data: liveOddsData } = useGetFixtureLiveOdds(
    fixtureId,
    { query: { queryKey: getGetFixtureLiveOddsQueryKey(fixtureId), staleTime: 15_000, refetchInterval: 15_000 } }
  );
  const snapshots = liveOddsData?.liveOdds ?? [];
  const latest = snapshots[0] ?? null;
  const earliest = snapshots.length > 1 ? snapshots[snapshots.length - 1] : null;

  type OddsField = 'homeWin' | 'draw' | 'awayWin';
  const oddsChange = (field: OddsField) => {
    if (!latest || !earliest) return null;
    const cur = (latest as Record<string, number | null>)[field] ?? null;
    const old = (earliest as Record<string, number | null>)[field] ?? null;
    if (!cur || !old) return { cur, old: null, diff: null };
    return { cur, old, diff: parseFloat((cur - old).toFixed(2)) };
  };

  const oddsItems: { label: string; field: OddsField }[] = [
    { label: homeTeam, field: 'homeWin' },
    { label: 'Uafgjort', field: 'draw' },
    { label: awayTeam, field: 'awayWin' },
  ];

  return (
    <div className="space-y-4">

      {/* ── AI live analysis ── */}
      <div className="glass-card p-6 rounded-xl min-h-[180px]">
        <h3 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase mb-5 flex items-center">
          <Activity className="w-4 h-4 mr-2 text-primary" />
          LIVE ANALYSE
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Activity className="w-6 h-6 text-primary animate-pulse" />
          </div>
        ) : liveAnalysis ? (
          <div className="space-y-4">
            {liveAnalysis.headline ? (
              <p className="text-xl font-bold text-white leading-snug">{liveAnalysis.headline}</p>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="w-4 h-4 animate-pulse text-primary" />
                <span className="text-sm italic">Genererer live analyse…</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {liveAnalysis.momentum_verdict && (
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full border text-violet-400 bg-violet-400/10 border-violet-400/20 uppercase">
                  {liveAnalysis.momentum_verdict}
                </span>
              )}
              {liveAnalysis.alert_worthy && (
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full border text-amber-400 bg-amber-400/10 border-amber-400/20 uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Bemærkelsesværdig
                </span>
              )}
            </div>
            {liveAnalysis.narrative && (
              <p className="text-muted-foreground leading-relaxed">{liveAnalysis.narrative}</p>
            )}
            {liveAnalysis.key_factors && liveAnalysis.key_factors.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                {liveAnalysis.key_factors.map((f: string, i: number) => (
                  <span key={i} className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded">{f}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground italic py-8 text-center">Live analyse afventer — venter på kampdata.</p>
        )}
      </div>

      {/* ── Odds Ændring ── */}
      {latest && (
        <div className="glass-card rounded-xl border border-amber-400/15 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">Odds Ændring</span>
            {snapshots.length > 1 && (
              <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">{snapshots.length} snapshots</span>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/5">
            {oddsItems.map(({ label, field }) => {
              const ch = oddsChange(field);
              if (!ch) return null;
              const isDown = ch.diff != null && ch.diff < 0;
              const isUp = ch.diff != null && ch.diff > 0;
              return (
                <div key={field} className="px-3 py-4 text-center">
                  <div className="text-[10px] font-mono text-muted-foreground/50 mb-1 truncate">{label}</div>
                  <div className={`text-xl font-bold font-mono tabular-nums ${isDown ? 'text-teal-400' : isUp ? 'text-amber-400' : 'text-white'}`}>
                    {ch.cur?.toFixed(2) ?? '—'}
                  </div>
                  {ch.old != null && ch.diff != null && ch.diff !== 0 && (
                    <div className={`text-[10px] font-mono mt-1 flex items-center justify-center gap-0.5 ${isDown ? 'text-teal-400' : 'text-amber-400'}`}>
                      <span>{isDown ? '▼' : '▲'}</span>
                      <span>{Math.abs(ch.diff).toFixed(2)}</span>
                    </div>
                  )}
                  {ch.old != null && ch.diff === 0 && (
                    <div className="text-[10px] font-mono text-white/20 mt-1">–</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Live signaler ── */}
      {activeSignals.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest px-1">Live Signaler</h3>
          {activeSignals.map((s) => {
            const cfg = SIGNAL_CONFIG[s.signalKey] ?? { icon: '·', color: 'text-white/60 border-white/10 bg-white/5' };
            return (
              <div key={s.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.color}`}>
                <span className="text-base font-mono leading-none mt-0.5 shrink-0">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 leading-snug">{s.signalLabel}</p>
                  {s.signalValue != null && (
                    <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                      Styrke: {typeof s.signalValue === 'number' ? s.signalValue.toFixed(2) : s.signalValue}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ─── Post Match Review Tab ────────────────────────────────────────────────────

interface PostReviewTabProps {
  fixtureId: number;
  events: FixtureEvent[];
  stats: FixtureStats[];
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
}

function StatBar({ label, home, away }: { label: string; home: number | null | undefined; away: number | null | undefined }) {
  const h = home ?? 0;
  const a = away ?? 0;
  const total = h + a;
  if (total === 0) return null;
  const hPct = Math.round((h / total) * 100);
  const aPct = 100 - hPct;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-muted-foreground">
        <span className="text-teal-400 font-bold">{h}</span>
        <span className="text-white/40 uppercase tracking-wider text-[10px]">{label}</span>
        <span className="text-violet-300 font-bold">{a}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="bg-teal-400/60 transition-all" style={{ width: `${hPct}%` }} />
        <div className="bg-violet-400/60 transition-all" style={{ width: `${aPct}%` }} />
      </div>
    </div>
  );
}

function PossessionBar({ home, away }: { home: number | null | undefined; away: number | null | undefined }) {
  if (home == null && away == null) return null;
  const h = home ?? 50;
  const a = away ?? 50;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono text-muted-foreground">
        <span className="text-teal-400 font-bold">{h}%</span>
        <span className="text-white/40 uppercase tracking-wider text-[10px]">Possession</span>
        <span className="text-violet-300 font-bold">{a}%</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        <div className="bg-teal-400/70 transition-all" style={{ width: `${h}%` }} />
        <div className="bg-violet-400/70 transition-all" style={{ width: `${a}%` }} />
      </div>
    </div>
  );
}

function PostReviewTab({ fixtureId, events, stats, homeTeamId, awayTeamId, homeTeamName, awayTeamName }: PostReviewTabProps) {
  const { data, isLoading } = useQuery<{ reviews: BettingTip[]; review: BettingTip | null; message?: string }>({
    queryKey: ['postReview', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/${fixtureId}/post-review`);
      if (!res.ok) throw new Error('Failed to fetch post review');
      return res.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const reviews = data?.reviews ?? [];
  const homeStat = stats.find(s => s.teamId === homeTeamId);
  const awayStat = stats.find(s => s.teamId === awayTeamId);
  const hasStats = !!homeStat || !!awayStat;

  const keyEvents = events.filter(e =>
    e.type === "Goal" || e.type === "Card" || e.type === "subst"
  );

  const eventIcon = (ev: FixtureEvent) => {
    if (ev.type === "Goal") {
      if (ev.detail?.includes("Penalty")) return <span className="text-[10px] font-bold font-mono text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded">PEN</span>;
      if (ev.detail?.includes("Own Goal")) return <span className="text-[10px] font-bold font-mono text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">OG</span>;
      return <span className="w-3.5 h-3.5 rounded-full bg-white inline-block shrink-0" />;
    }
    if (ev.type === "Card") {
      return ev.detail?.includes("Red")
        ? <span className="w-2.5 h-3.5 rounded-sm bg-red-500 inline-block shrink-0" />
        : <span className="w-2.5 h-3.5 rounded-sm bg-yellow-400 inline-block shrink-0" />;
    }
    if (ev.type === "subst") return <span className="text-[10px] font-bold font-mono text-white/40 bg-white/10 px-1.5 py-0.5 rounded">SUB</span>;
    return null;
  };

  const outcomeConfig = {
    hit: { label: 'HIT', color: 'text-teal-400 bg-teal-400/10 border-teal-400/30', icon: CheckCircle2 },
    miss: { label: 'MISS', color: 'text-red-400 bg-red-400/10 border-red-400/30', icon: X },
    partial: { label: 'PARTIAL', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30', icon: Minus },
  };

  const betTypeLabel = (t: string) => {
    if (t === 'match_result') return 'Match Result';
    if (t === 'over_under') return 'Goals Market';
    if (t === 'btts') return 'Both Teams to Score';
    if (t === 'corners') return 'Corners Market';
    if (t === 'asian_handicap') return 'Asian Handicap';
    if (t === 'total_cards') return 'Cards Market';
    if (t === 'double_chance') return 'Double Chance';
    if (t === 'draw_no_bet') return 'Draw No Bet';
    if (t === 'win_to_nil') return 'Win to Nil';
    if (t === 'first_half_goals') return '1st Half Goals';
    if (t === 'correct_score') return 'Correct Score';
    if (t === 'first_team_score') return 'First Team to Score';
    return t;
  };

  const { data: playerStatsData } = useQuery<{ playerStats: Array<{ teamId: number; playerName: string | null; goals: number | null; assists: number | null; rating: number | null; minutesPlayed: number | null; offsides: number | null; shotsTotal: number | null; shotsOnGoal: number | null; totalPasses: number | null; keyPasses: number | null; duelsTotal: number | null; duelsWon: number | null; dribbleAttempts: number | null; dribbleSuccess: number | null; foulsCommitted: number | null; foulsDrawn: number | null; yellowCards: number | null; redCards: number | null; penaltyScored: number | null; penaltyMissed: number | null }> }>({
    queryKey: ['playerStats', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/fixtures/${fixtureId}/player-stats`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const playerStats = playerStatsData?.playerStats ?? [];
  const homePlayerStats = playerStats.filter(p => p.teamId === homeTeamId);
  const awayPlayerStats = playerStats.filter(p => p.teamId === awayTeamId);

  return (
    <div className="space-y-4">
      {/* Match Events Timeline */}
      {keyEvents.length > 0 && (
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Match Events</div>
          <div className="space-y-2">
            {keyEvents.map((ev, i) => {
              const isHome = ev.teamId === homeTeamId;
              return (
                <div key={i} className={`flex items-center gap-3 text-sm ${isHome ? "flex-row" : "flex-row-reverse"}`}>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground shrink-0 w-10 justify-center">
                    {ev.minute != null ? `${ev.minute}'` : ""}
                    {ev.extraMinute ? `+${ev.extraMinute}` : ""}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">{eventIcon(ev)}</div>
                  <div className={`text-xs ${ev.type === "Goal" ? "text-white font-semibold" : "text-white/60"} truncate ${isHome ? "text-left" : "text-right"}`}>
                    {ev.playerName}
                    {ev.assistName && ev.type === "Goal" && (
                      <span className="text-white/40 ml-1.5 font-normal">({ev.assistName})</span>
                    )}
                    {ev.type === "subst" && ev.assistName && (
                      <span className="text-white/40 ml-1.5 font-normal">out</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Comparison */}
      {hasStats && (
        <div className="glass-card p-5 rounded-xl space-y-4">
          <div className="flex justify-between text-xs font-mono font-bold">
            <span className="text-teal-400 truncate">{homeTeamName}</span>
            <span className="text-white/30 uppercase tracking-wider text-[10px]">Stats</span>
            <span className="text-violet-300 truncate text-right">{awayTeamName}</span>
          </div>
          <PossessionBar home={homeStat?.ballPossession} away={awayStat?.ballPossession} />
          <StatBar label="Shots on Target" home={homeStat?.shotsOnGoal} away={awayStat?.shotsOnGoal} />
          <StatBar label="Total Shots" home={homeStat?.totalShots} away={awayStat?.totalShots} />
          <StatBar label="Corners" home={homeStat?.cornerKicks} away={awayStat?.cornerKicks} />
          <StatBar label="Fouls" home={homeStat?.fouls} away={awayStat?.fouls} />
          {(homeStat?.expectedGoals != null || awayStat?.expectedGoals != null) && (
            <StatBar label="xG" home={homeStat?.expectedGoals} away={awayStat?.expectedGoals} />
          )}
        </div>
      )}

      {/* Player Stats */}
      {(homePlayerStats.length > 0 || awayPlayerStats.length > 0) && (
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" />
            Player Performance
          </div>
          {[{ label: homeTeamName, players: homePlayerStats }, { label: awayTeamName, players: awayPlayerStats }].map(({ label, players }) => (
            players.length > 0 && (
              <div key={label}>
                <div className="text-xs font-mono text-white/50 uppercase mb-2">{label}</div>
                <div className="space-y-1.5">
                  {players.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
                      <span className="font-mono text-white/80 truncate flex-1">{p.playerName ?? "Unknown"}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {p.goals != null && p.goals > 0 && (
                          <span className="font-mono text-white font-bold">{p.goals}G</span>
                        )}
                        {p.assists != null && p.assists > 0 && (
                          <span className="font-mono text-teal-400">{p.assists}A</span>
                        )}
                        {p.rating != null && (
                          <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${p.rating >= 7.5 ? 'bg-teal-400/20 text-teal-300' : p.rating >= 6.5 ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-white/50'}`}>
                            {p.rating.toFixed(1)}
                          </span>
                        )}
                        {p.minutesPlayed != null && (
                          <span className="font-mono text-muted-foreground/50 text-[10px]">{p.minutesPlayed}'</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* AI Prediction Reviews */}
      {isLoading ? (
        <div className="glass-card p-10 rounded-xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
        </div>
      ) : reviews.length === 0 ? (
        keyEvents.length === 0 && !hasStats ? (
          <div className="glass-card p-8 rounded-xl text-center space-y-2">
            <Target className="w-8 h-8 text-white/20 mx-auto" />
            <p className="text-muted-foreground text-sm">
              {data?.message ?? "No match data available yet — data is being fetched in the background."}
            </p>
          </div>
        ) : (
          <div className="glass-card p-5 rounded-xl border border-white/5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">AI Signal</p>
            <p className="text-sm text-muted-foreground">No pre-match prediction was made for this fixture.</p>
          </div>
        )
      ) : (
        <>
          {reviews.map((review) => (
            <div key={review.id} className="glass-card p-5 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{betTypeLabel(review.betType)}</div>
                {review.outcome && outcomeConfig[review.outcome as keyof typeof outcomeConfig] && (() => {
                  const cfg = outcomeConfig[review.outcome as keyof typeof outcomeConfig];
                  const Icon = cfg.icon;
                  return (
                    <span className={`flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded-full border uppercase shrink-0 ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {cfg.label}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-lg font-bold text-white">{review.recommendation}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ConfidenceBadgeLarge confidence={review.confidence} />
                    {(() => {
                      const impliedFromOdds = review.marketOdds != null && review.marketOdds > 1 ? 1 / review.marketOdds : null;
                      const impliedProb = review.impliedProbability ?? impliedFromOdds;
                      const edgePp = review.aiProbability != null && impliedProb != null
                        ? (review.aiProbability - impliedProb) * 100
                        : null;
                      if (edgePp == null) return null;
                      return (
                        <span className={`text-xs font-mono font-bold tabular-nums ${
                          edgePp >= 5 ? 'text-teal-400' :
                          edgePp >= -5 ? 'text-violet-400' :
                          'text-amber-400'
                        }`}>
                          {edgePp >= 0 ? '+' : ''}{edgePp.toFixed(1)}pp
                        </span>
                      );
                    })()}
                    {review.marketOdds != null && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className="text-xs font-mono text-muted-foreground">Odds</span>
                        <span className="text-xs font-mono font-bold text-teal-400">{review.marketOdds.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-sm text-white/60 leading-relaxed border-t border-white/5 pt-3">{review.reasoning}</p>
            </div>
          ))}

          {reviews.find(r => r.reviewHeadline) && (() => {
            const review = reviews.find(r => r.reviewHeadline)!;
            return (
              <div className="glass-card p-5 rounded-xl space-y-3">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Match Review</div>
                <p className="text-base font-bold text-white">{review.reviewHeadline}</p>
                {review.reviewSummary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{review.reviewSummary}</p>
                )}
                {review.accuracyNote && (
                  <div className="border-t border-white/5 pt-3">
                    <div className="text-xs font-mono text-muted-foreground uppercase mb-1.5">Signal Accuracy</div>
                    <p className="text-xs text-white/70 font-mono leading-relaxed">{review.accuracyNote}</p>
                  </div>
                )}
                {review.reviewedAt && (
                  <div className="text-[10px] font-mono text-muted-foreground/40">
                    Reviewed {format(new Date(review.reviewedAt), 'MMM dd, HH:mm')}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─── OddsTab error boundary ───────────────────────────────────────────────────

class OddsErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="glass-card p-8 rounded-xl text-center space-y-2">
          <p className="text-amber-400 text-xs font-mono uppercase tracking-wider">Odds could not be displayed</p>
          <p className="text-muted-foreground text-xs font-mono">{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── OddsTab ──────────────────────────────────────────────────────────────────

type OddsSnap = {
  bookmaker?: string | null;
  homeWin?: number | null;
  draw?: number | null;
  awayWin?: number | null;
  btts?: number | null;
  overUnder25?: number | null;
  handicapHome?: number | null;
  snappedAt?: string;
};

type BestOdds = {
  home?: { value: number; bookmaker: string } | null;
  draw?: { value: number; bookmaker: string } | null;
  away?: { value: number; bookmaker: string } | null;
} | null;

function OddsAccordionRow({
  label, bestValue, bestBookmaker, rows, getVal, isBestFn,
}: {
  label: string;
  bestValue: number | null | undefined;
  bestBookmaker: string | null | undefined;
  rows: OddsSnap[];
  getVal: (r: OddsSnap) => number | null | undefined;
  isBestFn: (bm: string | null | undefined, val: number | null | undefined) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const fallbackValue = rows.map(r => getVal(r)).find(v => v != null) ?? null;
  const displayValue = bestValue ?? fallbackValue;
  const hasData = displayValue != null;
  if (!hasData) return null;
  return (
    <div className="border-b border-white/6 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/3 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          <span className="text-xs font-mono font-semibold text-white/80 uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
          <span className="font-mono text-base font-bold text-teal-400 tabular-nums">
            {displayValue?.toFixed(2) ?? "—"}
          </span>
          {bestBookmaker && (
            <div className="text-[9px] font-mono text-teal-400/50 uppercase mt-0.5">{bestBookmaker}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1">
          {rows.map((row, i) => {
            const val = getVal(row);
            if (val == null) return null;
            const best = isBestFn(row.bookmaker, val);
            return (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-[11px] font-mono text-muted-foreground/70 uppercase tracking-wide">
                  {row.bookmaker ?? "Unknown"}
                </span>
                <span className={`font-mono text-sm font-bold tabular-nums ${best ? "text-teal-400" : "text-white/60"}`}>
                  {val.toFixed(2)}
                  {best && <span className="ml-1 text-[9px] text-teal-400/60">★</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OddsMarketRow({ name, entries }: { name: string; entries: { bookmaker: string; values: Array<{ value: string; odd: string }> }[] }) {
  const [open, setOpen] = useState(false);
  const firstValues = entries[0]?.values ?? [];
  const firstBest = firstValues.length > 0
    ? firstValues.reduce((b, v) => (!b || parseFloat(v.odd) > parseFloat(b.odd)) ? v : b, firstValues[0]!)
    : null;
  return (
    <div className="border-b border-white/6 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/3 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          <span className="text-xs font-mono font-semibold text-white/80 uppercase tracking-wide">{name}</span>
        </div>
        {firstBest && (
          <span className="text-[11px] font-mono text-muted-foreground/50 truncate max-w-[120px]">
            {firstBest.value} · {firstBest.odd}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3">
          {entries.map((entry, ei) => (
            <div key={ei} className="mb-2">
              {entries.length > 1 && (
                <div className="text-[9px] font-mono text-muted-foreground/40 uppercase mb-1.5">{entry.bookmaker}</div>
              )}
              <div className="flex flex-wrap gap-2">
                {(entry.values ?? []).map((v, i) => (
                  <div key={i} className="flex flex-col items-center bg-white/5 rounded-lg px-3 py-2 min-w-[70px]">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase truncate max-w-[80px]">{v.value}</span>
                    <span className="font-mono text-sm text-teal-400 font-bold">{v.odd}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OddsTab({ fixtureId, isLive, homeTeam, awayTeam }: { fixtureId: number; isLive: boolean; homeTeam: string; awayTeam: string }) {
  const { data: preData } = useGetFixtureOdds(fixtureId, { query: { queryKey: getGetFixtureOddsQueryKey(fixtureId), staleTime: 2 * 60_000, gcTime: 10 * 60_000 } });
  const { data: liveData } = useGetFixtureLiveOdds(fixtureId, { query: { queryKey: getGetFixtureLiveOddsQueryKey(fixtureId), staleTime: 15_000, gcTime: 5 * 60_000, refetchInterval: 15_000 } });
  const { data: marketsData } = useGetFixtureOddsMarkets(fixtureId, { query: { queryKey: getGetFixtureOddsMarketsQueryKey(fixtureId), staleTime: 2 * 60_000, gcTime: 10 * 60_000 } });

  const allOdds: OddsSnap[] = (preData as any)?.allOdds ?? (preData?.odds ? [preData.odds] : []);
  const bestOdds: BestOdds = (preData as any)?.bestOdds ?? null;
  const snap = preData?.odds ?? null;
  const liveOdds = liveData?.liveOdds ?? [];
  const latestLive = liveOdds[0] ?? null;

  const allMarketEntries = marketsData?.oddsMarkets ?? [];
  const mergedMarkets: Record<string, { bookmaker: string; values: Array<{ value: string; odd: string }> }[]> = {};
  for (const entry of allMarketEntries) {
    const bm = (entry.bookmaker as string) ?? "Unknown";
    const mkt = entry.markets as Record<string, Array<{ value: string; odd: string }>>;
    if (!mkt) continue;
    for (const [name, values] of Object.entries(mkt)) {
      if (!mergedMarkets[name]) mergedMarkets[name] = [];
      mergedMarkets[name]!.push({ bookmaker: bm, values });
    }
  }

  const isBestHome = (bm: string | null | undefined, val: number | null | undefined) =>
    val != null && bestOdds?.home?.bookmaker === bm && Math.abs((bestOdds.home?.value ?? 0) - val) < 0.001;
  const isBestDraw = (bm: string | null | undefined, val: number | null | undefined) =>
    val != null && bestOdds?.draw?.bookmaker === bm && Math.abs((bestOdds.draw?.value ?? 0) - val) < 0.001;
  const isBestAway = (bm: string | null | undefined, val: number | null | undefined) =>
    val != null && bestOdds?.away?.bookmaker === bm && Math.abs((bestOdds.away?.value ?? 0) - val) < 0.001;

  const hasAnyOdds = allOdds.length > 0 || snap != null || Object.keys(mergedMarkets).length > 0;

  if (!hasAnyOdds && !latestLive) {
    return (
      <div className="glass-card p-8 rounded-xl text-center">
        <p className="text-muted-foreground text-sm">Odds not yet available — data syncs 6 hours before kickoff.</p>
      </div>
    );
  }

  // Priority market categories from odds_markets
  const PRIORITY_GROUPS: { label: string; keywords: string[]; color: string }[] = [
    { label: "Goals", keywords: ["goals over/under", "both teams score", "over/under", "goal line"], color: "text-teal-400" },
    { label: "Match Winner", keywords: ["double chance", "draw no bet", "european handicap", "handicap result", "win to nil", "win both halves"], color: "text-violet-400" },
    { label: "Corners", keywords: ["corner"], color: "text-amber-400" },
    { label: "Cards", keywords: ["card", "booking", "yellow", "red card"], color: "text-amber-400" },
    { label: "Half Time", keywords: ["first half", "second half", "half time", "ht/ft", "1st half"], color: "text-violet-400" },
    { label: "Player Markets", keywords: ["scorer", "assist", "shot", "player"], color: "text-muted-foreground" },
  ];

  type MarketEntry = { bookmaker: string; values: Array<{ value: string; odd: string }> };

  const groupedMarkets: Record<string, { color: string; markets: [string, MarketEntry[]][] }> = {};
  for (const [name, entries] of Object.entries(mergedMarkets)) {
    const n = name.toLowerCase();
    const group = PRIORITY_GROUPS.find(g => g.keywords.some(k => n.includes(k)));
    const groupLabel = group?.label ?? "Other";
    const groupColor = group?.color ?? "text-muted-foreground";
    if (!groupedMarkets[groupLabel]) groupedMarkets[groupLabel] = { color: groupColor, markets: [] };
    groupedMarkets[groupLabel]!.markets.push([name, entries]);
  }
  const groupOrder = ["Goals", "Match Winner", "Corners", "Cards", "Half Time", "Player Markets", "Other"];

  return (
    <div className="space-y-4">
      {/* Live odds — show whenever we have snapshots, not just when isLive */}
      {latestLive && (
        <div className={`glass-card rounded-xl overflow-hidden ${isLive ? "border border-amber-400/20" : "border border-white/8"}`}>
          <div className="px-4 py-3 border-b border-white/6 flex items-center gap-2">
            {isLive && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
            <span className={`text-[10px] font-mono uppercase tracking-widest ${isLive ? "text-amber-400" : "text-muted-foreground"}`}>
              {isLive ? "Live Odds" : "In-Play Snapshot"} — {latestLive.bookmaker}
            </span>
            {liveOdds.length > 1 && (
              <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">{liveOdds.length} snapshots</span>
            )}
          </div>
          {[
            { label: homeTeam, val: latestLive.homeWin },
            { label: "Draw", val: latestLive.draw },
            { label: awayTeam, val: latestLive.awayWin },
          ].map(({ label, val }) => (
            <div key={label} className="border-b border-white/6 last:border-0 flex items-center justify-between px-4 py-3.5">
              <span className="text-xs font-mono font-semibold text-white/80 uppercase tracking-wide truncate max-w-[60%]">{label}</span>
              <span className={`font-mono text-base font-bold tabular-nums ${isLive ? "text-amber-400" : "text-teal-400"}`}>{val?.toFixed(2) ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* 1X2 pre-match — best bookmaker comparison */}
      {allOdds.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Match Winner — 1X2</span>
            <span className="text-[9px] font-mono text-muted-foreground/40">{allOdds.length} bookmakers</span>
          </div>
          <OddsAccordionRow label={homeTeam} bestValue={bestOdds?.home?.value} bestBookmaker={bestOdds?.home?.bookmaker} rows={allOdds} getVal={r => r.homeWin} isBestFn={isBestHome} />
          <OddsAccordionRow label="Draw" bestValue={bestOdds?.draw?.value} bestBookmaker={bestOdds?.draw?.bookmaker} rows={allOdds} getVal={r => r.draw} isBestFn={isBestDraw} />
          <OddsAccordionRow label={awayTeam} bestValue={bestOdds?.away?.value} bestBookmaker={bestOdds?.away?.bookmaker} rows={allOdds} getVal={r => r.awayWin} isBestFn={isBestAway} />
          {/* BTTS / Over 2.5 / Handicap from snapshots */}
          {snap?.overUnder25 != null && (
            <div className="border-b border-white/6 last:border-0 flex items-center justify-between px-4 py-3.5">
              <span className="text-xs font-mono font-semibold text-white/70 uppercase tracking-wide">Over 2.5 Goals</span>
              <span className="font-mono text-base font-bold text-violet-400 tabular-nums">{snap.overUnder25.toFixed(2)}</span>
            </div>
          )}
          {snap?.btts != null && (
            <div className="border-b border-white/6 last:border-0 flex items-center justify-between px-4 py-3.5">
              <span className="text-xs font-mono font-semibold text-white/70 uppercase tracking-wide">BTTS Yes</span>
              <span className="font-mono text-base font-bold text-violet-400 tabular-nums">{snap.btts.toFixed(2)}</span>
            </div>
          )}
          {snap?.handicapHome != null && (
            <div className="border-b border-white/6 last:border-0 flex items-center justify-between px-4 py-3.5">
              <span className="text-xs font-mono font-semibold text-white/70 uppercase tracking-wide">Asian Handicap H</span>
              <span className="font-mono text-base font-bold text-violet-400 tabular-nums">{snap.handicapHome.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Categorised markets */}
      {groupOrder.map(groupLabel => {
        const group = groupedMarkets[groupLabel];
        if (!group || group.markets.length === 0) return null;
        return (
          <div key={groupLabel} className="glass-card rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
              <span className={`text-[10px] font-mono uppercase tracking-widest ${group.color}`}>{groupLabel}</span>
              <span className="text-[9px] font-mono text-muted-foreground/40">{group.markets.length} markets</span>
            </div>
            {group.markets.map(([name, entries]) => (
              <OddsMarketRow key={name} name={name} entries={entries} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── H2HTab ───────────────────────────────────────────────────────────────────

function H2HTab({ fixtureId, homeTeamId, awayTeamId, homeTeam, awayTeam }: {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const { data: h2hData, isLoading } = useGetFixtureH2H(fixtureId, { query: { queryKey: getGetFixtureH2HQueryKey(fixtureId), staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } });
  const { data: homeStats } = useGetTeamStatistics(homeTeamId, { season: 2025 }, { query: { queryKey: getGetTeamStatisticsQueryKey(homeTeamId, { season: 2025 }), staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } });
  const { data: awayStats } = useGetTeamStatistics(awayTeamId, { season: 2025 }, { query: { queryKey: getGetTeamStatisticsQueryKey(awayTeamId, { season: 2025 }), staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } });

  const h2hRows = h2hData?.h2h ?? [];
  const h2hStats = (h2hData as any)?.stats ?? null;
  const homeSeasonStats = homeStats?.statistics?.[0] ?? null;
  const awaySeasonStats = awayStats?.statistics?.[0] ?? null;

  const resultBadge = (hg: number | null | undefined, ag: number | null | undefined, isHomeTeam: boolean) => {
    if (hg == null || ag == null) return null;
    const homeWon = hg > ag;
    const draw = hg === ag;
    if (draw) return <span className="text-[10px] font-mono font-bold text-violet-400 bg-violet-400/10 border border-violet-400/20 px-1.5 py-0.5 rounded">D</span>;
    if (isHomeTeam ? homeWon : !homeWon) return <span className="text-[10px] font-mono font-bold text-teal-400 bg-teal-400/10 border border-teal-400/20 px-1.5 py-0.5 rounded">W</span>;
    return <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">L</span>;
  };

  const statRow = (label: string, homeVal: string | number | null | undefined, awayVal: string | number | null | undefined) => (
    <div className="grid grid-cols-3 gap-2 text-center py-2 border-b border-white/5 last:border-0">
      <div className="text-sm font-mono font-bold text-teal-400">{homeVal ?? "—"}</div>
      <div className="text-[10px] font-mono text-muted-foreground uppercase self-center">{label}</div>
      <div className="text-sm font-mono font-bold text-teal-400">{awayVal ?? "—"}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Season stats comparison */}
      {(homeSeasonStats || awaySeasonStats) && (
        <div className="glass-card p-5 rounded-xl">
          <div className="grid grid-cols-3 gap-2 text-center mb-4 pb-3 border-b border-white/5">
            <div className="text-xs font-mono font-bold text-white truncate">{homeTeam}</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">2024/25 Season</div>
            <div className="text-xs font-mono font-bold text-white truncate">{awayTeam}</div>
          </div>
          {statRow("Played", homeSeasonStats?.playedTotal, awaySeasonStats?.playedTotal)}
          {statRow("Wins", homeSeasonStats?.winsTotal, awaySeasonStats?.winsTotal)}
          {statRow("Goals For", homeSeasonStats?.goalsForTotal, awaySeasonStats?.goalsForTotal)}
          {statRow("Goals Against", homeSeasonStats?.goalsAgainstTotal, awaySeasonStats?.goalsAgainstTotal)}
          {statRow("Avg Scored", homeSeasonStats?.goalsForAvgTotal?.toFixed(2), awaySeasonStats?.goalsForAvgTotal?.toFixed(2))}
          {statRow("Avg Conceded", homeSeasonStats?.goalsAgainstAvgTotal?.toFixed(2), awaySeasonStats?.goalsAgainstAvgTotal?.toFixed(2))}
          {statRow("Clean Sheets", homeSeasonStats?.cleanSheetsTotal, awaySeasonStats?.cleanSheetsTotal)}
          {statRow("Win Streak", homeSeasonStats?.biggestWinStreak, awaySeasonStats?.biggestWinStreak)}
          {homeSeasonStats?.form && (
            <div className="grid grid-cols-3 gap-2 text-center pt-3">
              <div className="flex gap-0.5 justify-center">
                {[...((homeSeasonStats.form ?? "").slice(-5))].map((c, i) => (
                  <span key={i} className={`text-[9px] font-mono font-bold w-4 h-4 rounded flex items-center justify-center ${c === "W" ? "bg-teal-400/20 text-teal-400" : c === "D" ? "bg-violet-400/20 text-violet-400" : "bg-amber-400/20 text-amber-400"}`}>{c}</span>
                ))}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase self-center">Form</div>
              <div className="flex gap-0.5 justify-center">
                {[...((awaySeasonStats?.form ?? "").slice(-5))].map((c, i) => (
                  <span key={i} className={`text-[9px] font-mono font-bold w-4 h-4 rounded flex items-center justify-center ${c === "W" ? "bg-teal-400/20 text-teal-400" : c === "D" ? "bg-violet-400/20 text-violet-400" : "bg-amber-400/20 text-amber-400"}`}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* H2H aggregate stats */}
      {h2hStats && h2hStats.matchCount > 0 && (
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">H2H Averages</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {h2hStats.matchCount} matches
              {h2hStats.xgMatchCount > 0 && h2hStats.xgMatchCount < h2hStats.matchCount && (
                <span className="ml-1">· xG from {h2hStats.xgMatchCount}</span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-white">{h2hStats.avgGoals ?? "—"}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">Avg Goals</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-violet-300">
                {h2hStats.bttsRate != null ? `${Math.round(h2hStats.bttsRate * 100)}%` : "—"}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">BTTS</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-amber-300">
                {h2hStats.over25Rate != null ? `${Math.round(h2hStats.over25Rate * 100)}%` : "—"}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">Over 2.5</div>
            </div>
          </div>
          {(h2hStats.avgXg != null || h2hStats.avgShots != null || h2hStats.avgCorners != null) && (
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/5">
              <div className="text-center">
                <div className="text-sm font-mono font-bold text-teal-400">{h2hStats.avgXg ?? "—"}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">Avg xG</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-mono font-bold text-teal-400">{h2hStats.avgShots ?? "—"}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">Avg Shots</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-mono font-bold text-teal-400">{h2hStats.avgCorners ?? "—"}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">Avg Corners</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* H2H historical results */}
      <div>
        <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
          Head-to-Head History
        </h3>
        {isLoading ? (
          <div className="glass-card p-8 rounded-xl text-center">
            <Activity className="w-5 h-5 text-primary animate-pulse mx-auto" />
          </div>
        ) : h2hRows.length === 0 ? (
          <div className="glass-card p-8 rounded-xl text-center">
            <p className="text-muted-foreground text-sm">No H2H data yet — syncs automatically for upcoming fixtures.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {h2hRows.map((match) => {
              const hg = match.homeGoals;
              const ag = match.awayGoals;
              const ourHomeTeamIsActualHome = match.homeTeamId === homeTeamId;
              return (
                <div key={match.id} className="glass-card p-4 rounded-xl flex items-center gap-3">
                  <div className="text-[10px] font-mono text-muted-foreground w-16 shrink-0">
                    {match.kickoff ? format(new Date(match.kickoff), 'dd MMM yy') : '—'}
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-center min-w-0">
                    <div className="text-xs font-mono text-white truncate">{match.homeTeamName}</div>
                    <div className="font-mono text-sm font-bold text-white">
                      {hg ?? "?"} — {ag ?? "?"}
                    </div>
                    <div className="text-xs font-mono text-white truncate">{match.awayTeamName}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {resultBadge(hg, ag, ourHomeTeamIsActualHome)}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground w-20 text-right shrink-0 truncate">
                    {match.leagueName ?? ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Intel Tab ────────────────────────────────────────────────────────────────

interface IntelData {
  prediction: IntelPrediction | null;
  homeCoach: { name: string | null; nationality: string | null; age: number | null } | null;
  awayCoach: { name: string | null; nationality: string | null; age: number | null } | null;
  homeSidelined: Array<{ playerName: string | null; type: string | null; startDate: string | null; endDate: string | null }>;
  awaySidelined: Array<{ playerName: string | null; type: string | null; startDate: string | null; endDate: string | null }>;
  homeTrophies: Array<{ leagueName: string | null; place: string | null; season: string | null }>;
  awayTrophies: Array<{ leagueName: string | null; place: string | null; season: string | null }>;
  topScorers: Array<{ playerName: string | null; teamId: number | null; goals: number | null; assists: number | null; appearances: number | null; rating: number | null }>;
  topAssists: Array<{ playerName: string | null; teamId: number | null; goals: number | null; assists: number | null; appearances: number | null }>;
}

function PredictionBar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold ${color}`}>{pct != null ? `${Math.round(pct)}%` : '—'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color.replace('text-', 'bg-')}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function IntelTab({ fixtureId, homeTeamId: _homeTeamId, awayTeamId: _awayTeamId, homeTeam, awayTeam }: {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const { data, isLoading } = useQuery<IntelData>({
    queryKey: ['intel', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/fixtures/${fixtureId}/intel`);
      if (!res.ok) throw new Error('Failed to fetch intel');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-10 rounded-xl flex items-center justify-center">
        <Activity className="w-6 h-6 text-primary animate-pulse" />
      </div>
    );
  }

  const hasAnyData = data && (data.prediction || data.homeCoach || data.awayCoach || (data.homeSidelined?.length > 0) || (data.awaySidelined?.length > 0) || (data.topScorers?.length > 0));

  if (!hasAnyData) {
    return (
      <div className="glass-card p-10 rounded-xl text-center space-y-2">
        <Shield className="w-8 h-8 text-white/20 mx-auto" />
        <p className="text-muted-foreground text-sm">Team intelligence syncs automatically for upcoming fixtures.</p>
        <p className="text-xs text-muted-foreground/50 font-mono">Coaches, injuries, predictions, and league standings are populated by the data pipeline.</p>
      </div>
    );
  }

  const totalHomeTrophies = data?.homeTrophies?.filter(t => t.place === '1st' || t.place?.toLowerCase().includes('winner')).length ?? 0;
  const totalAwayTrophies = data?.awayTrophies?.filter(t => t.place === '1st' || t.place?.toLowerCase().includes('winner')).length ?? 0;

  return (
    <div className="space-y-4">
      {data?.prediction && (
        <div className="glass-card rounded-xl overflow-hidden border border-violet-400/15">
          <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-400/70" />
            <span className="text-xs font-mono text-violet-400/80 uppercase tracking-widest">API-Football Prediction</span>
          </div>
          <div className="p-5 space-y-4">
            {data.prediction.advice && (
              <div className="space-y-0.5">
                <div className="text-base font-bold text-white">{data.prediction.advice}</div>
                {data.prediction.winnerComment && data.prediction.winnerComment !== data.prediction.advice && (
                  <div className="text-xs font-mono text-muted-foreground/60">{data.prediction.winnerComment}</div>
                )}
              </div>
            )}
            {/* Win probability bars */}
            <div className="space-y-2">
              <PredictionBar label={`${homeTeam} Win`} pct={data.prediction.homeWinPct} color="text-teal-400" />
              <PredictionBar label="Draw" pct={data.prediction.drawPct} color="text-amber-400" />
              <PredictionBar label={`${awayTeam} Win`} pct={data.prediction.awayWinPct} color="text-violet-400" />
            </div>
            {/* Extra prediction details */}
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50 flex-wrap border-t border-white/5 pt-3">
              {data.prediction.goalsHome != null && data.prediction.goalsAway != null && (
                <span>Predicted score: {data.prediction.goalsHome.toFixed(1)}–{data.prediction.goalsAway.toFixed(1)}</span>
              )}
              {data.prediction.underOver != null && (
                <span className="border-l border-white/10 pl-3">
                  {data.prediction.underOver.startsWith('-')
                    ? `Under ${data.prediction.underOver.replace('-', '')}`
                    : `Over ${data.prediction.underOver.replace('+', '')}`} goals
                </span>
              )}
            </div>
            {/* Comparison metrics */}
            {data.prediction.comparison && (
              <div className="space-y-1.5 border-t border-white/5 pt-3">
                <div className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-2">Team Comparison</div>
                {([
                  { key: 'total',   label: 'Overall' },
                  { key: 'form',    label: 'Form' },
                  { key: 'att',     label: 'Attack' },
                  { key: 'def',     label: 'Defence' },
                  { key: 'poisson_distribution', label: 'Poisson' },
                  { key: 'h2h',     label: 'H2H' },
                ] as const).map(({ key, label }) => {
                  const metric = (data.prediction?.comparison as Record<string, { home: string; away: string } | undefined> | null)?.[key];
                  if (!metric) return null;
                  const hVal = parseFloat(metric.home);
                  const aVal = parseFloat(metric.away);
                  if (isNaN(hVal) || isNaN(aVal)) return null;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-muted-foreground/40 w-14 shrink-0 text-right">{label}</span>
                      <div className="flex-1 flex items-center h-3 rounded overflow-hidden">
                        <div className="h-full bg-teal-400/25 border-r border-teal-400/20" style={{ width: `${hVal}%` }} />
                        <div className="h-full bg-violet-400/25" style={{ width: `${aVal}%` }} />
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-mono shrink-0">
                        <span className="text-teal-300 tabular-nums w-8 text-right">{Math.round(hVal)}%</span>
                        <span className="text-muted-foreground/20">·</span>
                        <span className="text-violet-300 tabular-nums w-8">{Math.round(aVal)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Last 5 */}
            {(data.prediction.last5Home || data.prediction.last5Away) && (
              <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
                {[
                  { label: homeTeam, d: data.prediction.last5Home, color: 'teal' },
                  { label: awayTeam, d: data.prediction.last5Away, color: 'violet' },
                ].map(({ label, d, color }) => d ? (
                  <div key={label} className="bg-white/3 rounded-lg p-2.5 space-y-1">
                    <div className={`text-[9px] font-mono text-${color}-400/60 uppercase tracking-wider truncate`}>{label} — Last 5</div>
                    {d.form && (
                      <div className="flex gap-0.5">
                        {d.form.split('').slice(0, 5).map((r: string, i: number) => (
                          <span key={i} className={`text-[10px] font-mono font-bold px-1 py-0.5 rounded ${r === 'W' ? 'bg-teal-400/20 text-teal-300' : r === 'D' ? 'bg-amber-400/20 text-amber-300' : 'bg-red-400/20 text-red-400'}`}>{r}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] font-mono text-white/50">
                      {d.goals.for.total} scored · {d.goals.against.total} conceded
                    </div>
                  </div>
                ) : null)}
              </div>
            )}
          </div>
        </div>
      )}

      {(data?.homeCoach || data?.awayCoach) && (
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-violet-400" />
            Coaches
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[{ coach: data.homeCoach, team: homeTeam }, { coach: data.awayCoach, team: awayTeam }].map(({ coach, team }) => (
              <div key={team} className="space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase">{team}</div>
                {coach ? (
                  <>
                    <div className="text-sm font-bold text-white">{coach.name ?? '—'}</div>
                    <div className="text-[10px] font-mono text-muted-foreground/60">
                      {[coach.nationality, coach.age ? `Age ${coach.age}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground/40 font-mono">No data</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {((data?.homeSidelined?.length ?? 0) > 0 || (data?.awaySidelined?.length ?? 0) > 0) && (
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <UserX className="w-3.5 h-3.5 text-amber-400" />
            Sidelined / Injured
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[{ players: data?.homeSidelined ?? [], team: homeTeam }, { players: data?.awaySidelined ?? [], team: awayTeam }].map(({ players, team }) => (
              <div key={team}>
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase mb-2">{team}</div>
                {players.length === 0 ? (
                  <div className="text-xs text-muted-foreground/40 font-mono">None reported</div>
                ) : (
                  <div className="space-y-1.5">
                    {players.map((p, i) => (
                      <div key={i} className="flex items-start justify-between gap-2">
                        <span className="text-xs text-white/80 font-mono">{p.playerName ?? 'Unknown'}</span>
                        <div className="text-right shrink-0">
                          {p.type && <div className="text-[10px] font-mono text-amber-400">{p.type}</div>}
                          {p.endDate && <div className="text-[9px] font-mono text-muted-foreground/50">Until {p.endDate}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(data?.topScorers?.length ?? 0) > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/6 flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">League Top Scorers</span>
          </div>
          {/* Column headers */}
          <div className="px-5 py-2 flex items-center justify-between border-b border-white/4 bg-white/2">
            <div className="flex items-center gap-3">
              <span className="w-4 shrink-0" />
              <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">Player</span>
            </div>
            <div className="flex items-center gap-4 shrink-0 pr-1">
              <span className="text-[9px] font-mono text-teal-400/60 uppercase tracking-wider w-6 text-right">Mål</span>
              <span className="text-[9px] font-mono text-violet-400/60 uppercase tracking-wider w-5 text-right">Ass</span>
              <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider w-8 text-right">Kam</span>
            </div>
          </div>
          <div>
            {data!.topScorers.slice(0, 10).map((p, i) => (
              <div key={i} className="px-5 flex items-center justify-between gap-2 py-2.5 border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground/40 w-4 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="text-xs font-mono text-white truncate">{p.playerName ?? 'Ukendt'}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-mono font-bold text-teal-400 tabular-nums w-6 text-right">{p.goals ?? 0}</span>
                  <span className="text-xs font-mono text-violet-400/80 tabular-nums w-5 text-right">{p.assists ?? '—'}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums w-8 text-right">{p.appearances ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data?.topAssists?.length ?? 0) > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/6 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">League Top Assists</span>
          </div>
          {/* Column headers */}
          <div className="px-5 py-2 flex items-center justify-between border-b border-white/4 bg-white/2">
            <div className="flex items-center gap-3">
              <span className="w-4 shrink-0" />
              <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">Player</span>
            </div>
            <div className="flex items-center gap-4 shrink-0 pr-1">
              <span className="text-[9px] font-mono text-violet-400/60 uppercase tracking-wider w-6 text-right">Ass</span>
              <span className="text-[9px] font-mono text-teal-400/60 uppercase tracking-wider w-5 text-right">Mål</span>
              <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider w-8 text-right">Kam</span>
            </div>
          </div>
          <div>
            {data!.topAssists.slice(0, 10).map((p, i) => (
              <div key={i} className="px-5 flex items-center justify-between gap-2 py-2.5 border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground/40 w-4 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="text-xs font-mono text-white truncate">{p.playerName ?? 'Ukendt'}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-mono font-bold text-violet-400 tabular-nums w-6 text-right">{p.assists ?? 0}</span>
                  <span className="text-xs font-mono text-teal-400/80 tabular-nums w-5 text-right">{p.goals ?? '—'}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums w-8 text-right">{p.appearances ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {((data?.homeTrophies?.length ?? 0) > 0 || (data?.awayTrophies?.length ?? 0) > 0) && (
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            Honours
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[{ trophies: data?.homeTrophies, label: homeTeam }, { trophies: data?.awayTrophies, label: awayTeam }].map(({ trophies, label }) => (
              <div key={label} className="space-y-2">
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</div>
                {(trophies ?? []).slice(0, 8).map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Trophy className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-white/80 leading-tight truncate">{t.leagueName ?? '—'}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/50">{t.place ?? '—'} · {t.season ?? '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}