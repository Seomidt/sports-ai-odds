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
import { format } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, Component, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function Match() {
  const [, params] = useRoute("/match/:id");
  const id = Number(params?.id);
  const { sessionId } = useSession();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/dashboard");
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
    queryKey: ['followedFixtures', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await fetch('/api/fixtures/followed', {
        headers: { 'x-session-id': sessionId },
      });
      if (!res.ok) throw new Error('Failed to fetch followed fixtures');
      return res.json();
    },
  });

  const isFollowed = followedData?.fixtureIds?.includes(id) ?? false;

  const toggleFollow = async () => {
    try {
      const method = isFollowed ? 'DELETE' : 'POST';
      const res = await fetch(`/api/fixtures/${id}/follow`, {
        method,
        headers: { 'x-session-id': sessionId },
      });
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
        <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono mb-4">
          <button onClick={handleBack} className="flex items-center hover:text-white transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4 mr-1" />
            RETURN
          </button>
          <span>/</span>
          <span>{fixture.leagueName}</span>
          <span>/</span>
          <span>ID: {fixture.fixtureId}</span>
        </div>

        {/* Header Card */}
        <div className="glass-card rounded-xl p-8 relative overflow-hidden border-t-2 border-t-primary/50">
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
                <div className={`px-3 py-1 rounded border font-mono ${
                  isPostponed || isCancelled
                    ? "bg-amber-400/10 border-amber-400/30 text-amber-400"
                    : "bg-white/5 border-white/10 text-muted-foreground"
                }`}>
                  <span className="text-sm font-bold tracking-widest">
                    {STATUS_LABEL[fixture.statusShort ?? ""] ?? fixture.statusShort ?? "NS"}
                  </span>
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
                {fixture.homeTeamLogo && <img src={fixture.homeTeamLogo} className="w-24 h-24 object-contain drop-shadow-2xl" />}
                <span className="text-xl font-bold text-white text-center">{fixture.homeTeamName}</span>
              </div>
              
              <div className="flex flex-col items-center justify-center w-1/3">
                <div className="flex items-center justify-center gap-2 text-5xl md:text-7xl font-mono font-bold text-white tracking-tighter whitespace-nowrap">
                  <span>{fixture.homeGoals ?? '-'}</span>
                  <span className="text-white/20">:</span>
                  <span>{fixture.awayGoals ?? '-'}</span>
                </div>
                {fixture.kickoff && !isLive && fixture.statusShort === 'NS' && (
                  <span className="mt-4 text-muted-foreground font-mono">{format(new Date(fixture.kickoff), 'MMM dd, HH:mm')}</span>
                )}
              </div>

              <div className="flex flex-col items-center gap-4 w-1/3">
                {fixture.awayTeamLogo && <img src={fixture.awayTeamLogo} className="w-24 h-24 object-contain drop-shadow-2xl" />}
                <span className="text-xl font-bold text-white text-center">{fixture.awayTeamName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs section for Analysis + Odds */}
        <div className="mt-8">
          <Tabs defaultValue={isLive ? "live" : (fixture.statusShort === "FT" || fixture.statusShort === "AET" || fixture.statusShort === "PEN") ? "post" : "pre"} className="w-full">
            <TabsList className="bg-black/40 border border-white/10 p-1 flex-wrap h-auto gap-1">
              <TabsTrigger value="pre" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">PRE-MATCH</TabsTrigger>
              <TabsTrigger value="live" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">IN-PLAY</TabsTrigger>
              <TabsTrigger value="post" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">POST-MATCH</TabsTrigger>
              <TabsTrigger value="odds" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">ODDS</TabsTrigger>
              <TabsTrigger value="h2h" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">H2H</TabsTrigger>
              <TabsTrigger value="intel" className="data-[state=active]:bg-violet-400/20 data-[state=active]:text-violet-300 font-mono text-xs tracking-wider uppercase">INTEL</TabsTrigger>
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
                <BettingIntelTab fixtureId={id} />
              )}
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <LiveAnalysisTab fixtureId={id} />
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

function TrustGauge({ score }: { score: number }) {
  const color = score >= 7 ? 'text-teal-400' : score >= 5 ? 'text-amber-400' : 'text-red-400';
  const bgColor = score >= 7 ? 'bg-teal-400' : score >= 5 ? 'bg-amber-400' : 'bg-red-400';
  const label = score >= 8 ? 'STRONG' : score >= 6 ? 'MODERATE' : score >= 4 ? 'WEAK' : 'VERY WEAK';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Trust Score</span>
        <span className={`text-xs font-mono font-bold ${color} uppercase`}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded-sm transition-all ${i < score ? bgColor : 'bg-white/10'}`}
            />
          ))}
        </div>
        <span className={`text-lg font-mono font-bold tabular-nums ${color}`}>{score}<span className="text-xs text-muted-foreground">/10</span></span>
      </div>
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

function TipCard({ tip, betTypeLabel, bookmaker }: { tip: BettingTip; betTypeLabel: string; bookmaker?: string | null }) {
  const isValue = tip.valueRating === 'value' || tip.valueRating === 'strong_value';
  const borderColor = isValue ? 'border-teal-400/30' : 'border-white/10';

  return (
    <div className={`glass-card p-5 rounded-xl border ${borderColor} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              {betTypeLabel}
            </span>
            <ValueBadge rating={tip.valueRating} />
          </div>
          <div className="text-xl font-bold text-white leading-tight">
            {tip.recommendation}
          </div>
          {tip.marketOdds != null && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-muted-foreground uppercase">Odds</span>
              <span className="font-mono text-lg font-bold text-teal-400 tabular-nums">{tip.marketOdds.toFixed(2)}</span>
              {bookmaker && (
                <span className="text-[10px] font-mono text-muted-foreground bg-white/5 border border-white/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                  {bookmaker}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {tip.edge != null && (
            <div className={`px-2 py-0.5 rounded text-xs font-mono font-bold tabular-nums border ${
              tip.edge >= 0.15 ? 'text-teal-300 bg-teal-400/10 border-teal-400/30' :
              tip.edge >= 0.05 ? 'text-teal-400 bg-teal-400/10 border-teal-400/20' :
              tip.edge >= -0.05 ? 'text-violet-400 bg-violet-400/10 border-violet-400/20' :
              'text-amber-400 bg-amber-400/10 border-amber-400/20'
            }`}>
              {tip.edge >= 0 ? '+' : ''}{(tip.edge * 100).toFixed(1)}% edge
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`text-2xl font-mono font-bold tabular-nums ${tip.trustScore >= 7 ? 'text-teal-400' : tip.trustScore >= 5 ? 'text-amber-400' : 'text-white'}`}>
              {tip.trustScore}
            </span>
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-xs text-muted-foreground font-mono">/10</span>
              <HelpTooltip side="left" iconClassName="w-3 h-3">
                <p className="font-bold text-white mb-1">AI Edge Analysis</p>
                <p className="text-muted-foreground/80 mb-1">edge = (AI probability × odds) − 1</p>
                {tip.aiProbability != null && tip.marketOdds != null && (
                  <p className="text-teal-400 font-mono text-xs mb-1">({(tip.aiProbability * 100).toFixed(0)}% × {tip.marketOdds.toFixed(2)}) − 1 = {tip.edge != null ? (tip.edge >= 0 ? '+' : '') + (tip.edge * 100).toFixed(1) + '%' : '—'}</p>
                )}
                <p className="text-muted-foreground/80">≥15% = Strong Value · ≥5% = Value</p>
                <p className="text-muted-foreground/80">0–5% = Fair Price · &lt;0% = Overpriced</p>
              </HelpTooltip>
            </div>
          </div>
          {tip.aiProbability != null && (
            <div className="text-[10px] font-mono text-muted-foreground/50">
              {(tip.aiProbability * 100).toFixed(0)}% prob
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-sm ${
              i < tip.trustScore
                ? (tip.trustScore >= 7 ? 'bg-teal-400' : tip.trustScore >= 5 ? 'bg-amber-400' : 'bg-white/30')
                : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      <p className="text-sm text-white/70 leading-relaxed">{tip.reasoning}</p>
    </div>
  );
}

function BettingIntelTab({ fixtureId }: { fixtureId: number }) {
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

  const tips = data?.tips ?? [];

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
    if (t === 'no_bet') return 'No Bet';
    return t;
  };

  const bestTip = tips.reduce<BettingTip | null>((best, tip) => {
    if (!best) return tip;
    const bestValueScore = best.valueRating === 'strong_value' ? 3 : best.valueRating === 'value' ? 2 : best.valueRating === 'fair' ? 1 : 0;
    const tipValueScore = tip.valueRating === 'strong_value' ? 3 : tip.valueRating === 'value' ? 2 : tip.valueRating === 'fair' ? 1 : 0;
    if (tipValueScore > bestValueScore) return tip;
    if (tipValueScore === bestValueScore && tip.trustScore > best.trustScore) return tip;
    return best;
  }, null);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="glass-card p-10 rounded-xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
        </div>
      ) : tips.length === 0 ? (
        <div className="glass-card p-8 rounded-xl border border-white/5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AI analysis in progress</p>
              <p className="text-xs text-muted-foreground font-mono">Picks generate automatically — no action needed</p>
            </div>
          </div>
          <div className="border-t border-white/5 pt-4 space-y-2.5">
            {[
              { label: "Odds data", desc: "Market prices from tracked bookmakers" },
              { label: "Form & H2H", desc: "Last 5 matches + head-to-head history" },
              { label: "Signal engine", desc: "Pattern detection across 20+ indicators" },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                <div>
                  <span className="text-xs font-mono text-white/70">{label}</span>
                  <span className="text-xs text-muted-foreground/50 ml-2">{desc}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/40 font-mono">
            Picks are ready once all data sources are synced — typically a few hours before kickoff.
          </p>
        </div>
      ) : (
        <>
          {bestTip && (bestTip.valueRating === 'value' || bestTip.valueRating === 'strong_value') && (
            <div className="glass-card p-4 rounded-xl border border-teal-400/20 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-400/10 border border-teal-400/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <div className="text-xs font-mono text-teal-400 uppercase tracking-wider">Best Value Pick</div>
                <div className="text-sm font-bold text-white">{bestTip.recommendation} @ {bestTip.marketOdds?.toFixed(2)}</div>
              </div>
            </div>
          )}

          {tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} betTypeLabel={betTypeLabel(tip.betType)} bookmaker={bookmaker} />
          ))}

          {tips[0] && (
            <div className="text-[10px] font-mono text-muted-foreground/40 text-center">
              Generated {format(new Date(tips[0].createdAt), 'MMM dd, HH:mm')} · For informational purposes only
            </div>
          )}

          {accData && accData.reviewed > 0 && (
            <div className="glass-card p-4 rounded-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">AI Track Record</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs font-mono text-muted-foreground">Hit Rate</div>
                  <div className={`text-sm font-mono font-bold tabular-nums ${(accData.hitRate ?? 0) >= 55 ? 'text-teal-400' : 'text-amber-400'}`}>
                    {accData.hitRate ?? '—'}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-muted-foreground">Tips Reviewed</div>
                  <div className="text-sm font-mono font-bold text-white tabular-nums">{accData.hits}/{accData.reviewed}</div>
                </div>
              </div>
            </div>
          )}
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

function LiveAnalysisTab({ fixtureId }: { fixtureId: number }) {
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

  return (
    <div className="glass-card p-6 rounded-xl min-h-[280px]">
      <h3 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase mb-5 flex items-center">
        <Activity className="w-4 h-4 mr-2 text-primary" />
        LIVE ANALYSIS
      </h3>
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
        </div>
      ) : liveAnalysis ? (
        <div className="space-y-4">
          {liveAnalysis.headline ? (
            <p className="text-xl font-bold text-white leading-snug">{liveAnalysis.headline}</p>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="w-4 h-4 animate-pulse text-primary" />
              <span className="text-sm italic">Generating live analysis…</span>
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
                Alert-worthy
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
        <p className="text-muted-foreground italic py-8 text-center">Live analysis pending — waiting for in-play signal data.</p>
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">Trust</span>
                    <span className="text-xs font-mono font-bold text-primary">{review.trustScore}/10</span>
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
  const hasData = bestValue != null || rows.some(r => getVal(r) != null);
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
            {bestValue?.toFixed(2) ?? "—"}
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
  const { data: liveData } = useGetFixtureLiveOdds(fixtureId, { query: { queryKey: getGetFixtureLiveOddsQueryKey(fixtureId), staleTime: 30_000, gcTime: 5 * 60_000, refetchInterval: 30_000 } });
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
  prediction: { homeWinPercent: number | null; drawPercent: number | null; awayWinPercent: number | null; goalsHome: number | null; goalsAway: number | null; adviceText: string | null; winner: string | null } | null;
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
        <div className="glass-card p-5 rounded-xl space-y-4">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-violet-400" />
            Algorithm Forecast
          </div>
          <div className="space-y-3">
            <PredictionBar label={`${homeTeam} Win`} pct={data.prediction.homeWinPercent} color="text-teal-400" />
            <PredictionBar label="Draw" pct={data.prediction.drawPercent} color="text-violet-400" />
            <PredictionBar label={`${awayTeam} Win`} pct={data.prediction.awayWinPercent} color="text-amber-400" />
          </div>
          {(data.prediction.goalsHome != null || data.prediction.goalsAway != null) && (
            <div className="flex items-center justify-center gap-4 pt-2 border-t border-white/5">
              <div className="text-center">
                <div className="text-xs font-mono text-muted-foreground">Predicted Score</div>
                <div className="font-mono text-lg font-bold text-white tabular-nums mt-0.5">
                  {data.prediction.goalsHome?.toFixed(1) ?? '?'} – {data.prediction.goalsAway?.toFixed(1) ?? '?'}
                </div>
              </div>
            </div>
          )}
          {data.prediction.adviceText && (
            <div className="border-t border-white/5 pt-3">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Recommendation</div>
              <p className="text-sm text-white/80 font-mono">{data.prediction.adviceText}</p>
            </div>
          )}
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
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-teal-400" />
            League Top Scorers
          </div>
          <div className="space-y-1.5">
            {data!.topScorers.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground/40 w-4 shrink-0">{i + 1}</span>
                  <span className="text-xs font-mono text-white truncate">{p.playerName ?? 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-white tabular-nums">{p.goals ?? 0}G</span>
                  {p.assists != null && <span className="text-xs font-mono text-teal-400/70 tabular-nums">{p.assists}A</span>}
                  {p.appearances != null && <span className="text-[10px] font-mono text-muted-foreground/40">{p.appearances} apps</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data?.topAssists?.length ?? 0) > 0 && (
        <div className="glass-card p-5 rounded-xl space-y-3">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-violet-400" />
            League Top Assists
          </div>
          <div className="space-y-1.5">
            {data!.topAssists.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground/40 w-4 shrink-0">{i + 1}</span>
                  <span className="text-xs font-mono text-white truncate">{p.playerName ?? 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-violet-400 tabular-nums">{p.assists ?? 0}A</span>
                  {p.goals != null && <span className="text-[10px] font-mono text-muted-foreground/40">{p.goals}G</span>}
                  {p.appearances != null && <span className="text-[10px] font-mono text-muted-foreground/40">{p.appearances} apps</span>}
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
            {[{ trophies: data?.homeTrophies ?? [], team: homeTeam, count: totalHomeTrophies }, { trophies: data?.awayTrophies ?? [], team: awayTeam, count: totalAwayTrophies }].map(({ trophies, team, count }) => (
              <div key={team}>
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase mb-2">{team} <span className="text-amber-400 ml-1">{count} titler</span></div>
                {trophies.length === 0 ? (
                  <div className="text-xs text-muted-foreground/40 font-mono">No data</div>
                ) : (
                  <div className="space-y-1">
                    {trophies.slice(0, 6).map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-white/70 truncate">{t.leagueName ?? '—'}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-mono font-bold ${t.place === '1st' || t.place?.toLowerCase().includes('winner') ? 'text-amber-400' : 'text-muted-foreground/50'}`}>{t.place}</span>
                          <span className="text-[9px] font-mono text-muted-foreground/30">{t.season}</span>
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
    </div>
  );
}
