import { 
  useGetFixture, 
  useGetFixtureSignals,
  useGetFixtureOdds,
  useGetFixtureLiveOdds,
  useGetFixtureH2H,
  useGetTeamStatistics,
  useGetFixtureOddsMarkets,
  useFollowFixture,
  useUnfollowFixture,
  useGetFollowedFixtures,
  getGetFixtureOddsQueryKey,
  getGetFixtureLiveOddsQueryKey,
  getGetFixtureOddsMarketsQueryKey,
  getGetFixtureH2HQueryKey,
  getGetTeamStatisticsQueryKey,
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { Activity, Star, AlertTriangle, Info, CheckCircle2, ChevronLeft, Target, TrendingUp, TrendingDown, Minus, X, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useSession } from "@/lib/session";
import { format } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";

export function Match() {
  const [, params] = useRoute("/match/:id");
  const id = Number(params?.id);
  const { sessionId } = useSession();
  const queryClient = useQueryClient();

  const { data: fixtureData, isLoading: isLoadingFixture } = useGetFixture(id, { 
    query: { enabled: !!id, queryKey: ['fixture', id] } 
  });
  
  const { data: followedData } = useGetFollowedFixtures({
    request: { headers: { 'x-session-id': sessionId } },
    query: {
      queryKey: ['followedFixtures', sessionId],
      enabled: !!sessionId,
    }
  });

  const isFollowed = followedData?.fixtureIds?.includes(id);
  const followMutation = useFollowFixture({ request: { headers: { 'x-session-id': sessionId } }});
  const unfollowMutation = useUnfollowFixture({ request: { headers: { 'x-session-id': sessionId } }});

  const toggleFollow = async () => {
    try {
      if (isFollowed) {
        await unfollowMutation.mutateAsync({ id });
      } else {
        await followMutation.mutateAsync({ id });
      }
      await queryClient.invalidateQueries({ queryKey: ['followedFixtures', sessionId] });
    } catch {
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
  const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE"].includes(fixture.statusShort || "");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono mb-4">
          <Link href="/dashboard" className="flex items-center hover:text-white transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4 mr-1" />
            RETURN
          </Link>
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
            <div className="flex items-center justify-center gap-4 mb-8">
              {isLive ? (
                <div className="flex items-center gap-2 px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-bold tracking-widest">LIVE {fixture.statusElapsed}'</span>
                </div>
              ) : (
                <div className="px-3 py-1 rounded bg-white/5 border border-white/10 text-muted-foreground">
                  <span className="text-sm font-bold tracking-widest">{fixture.statusShort}</span>
                </div>
              )}
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
          <Tabs defaultValue={isLive ? "live" : fixture.statusShort === "FT" ? "post" : "pre"} className="w-full">
            <TabsList className="bg-black/40 border border-white/10 p-1 flex-wrap h-auto gap-1">
              <TabsTrigger value="pre" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">PRE-MATCH</TabsTrigger>
              <TabsTrigger value="live" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">IN-PLAY</TabsTrigger>
              <TabsTrigger value="post" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">POST-MATCH</TabsTrigger>
              <TabsTrigger value="odds" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">ODDS</TabsTrigger>
              <TabsTrigger value="h2h" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">H2H</TabsTrigger>
            </TabsList>
            
            <TabsContent value="pre" className="mt-4">
              <BettingIntelTab fixtureId={id} />
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <LiveAnalysisTab fixtureId={id} />
            </TabsContent>
            <TabsContent value="post" className="mt-4">
              <PostReviewTab fixtureId={id} />
            </TabsContent>
            <TabsContent value="odds" className="mt-4">
              <OddsTab fixtureId={id} isLive={isLive} homeTeam={fixture.homeTeamName ?? "Home"} awayTeam={fixture.awayTeamName ?? "Away"} />
            </TabsContent>
            <TabsContent value="h2h" className="mt-4">
              <H2HTab fixtureId={id} homeTeamId={fixture.homeTeamId!} awayTeamId={fixture.awayTeamId!} homeTeam={fixture.homeTeamName ?? "Home"} awayTeam={fixture.awayTeamName ?? "Away"} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Head-to-Head history widget */}
        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">
            HEAD TO HEAD HISTORY
          </h2>
          <div className="glass-card rounded-xl overflow-hidden">
            <api-sports-widget
              data-type="h2h"
              data-h2h={`${fixture.homeTeamId}-${fixture.awayTeamId}`}
            />
          </div>
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

function TipCard({ tip, betTypeLabel }: { tip: BettingTip; betTypeLabel: string }) {
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
            </div>
          )}
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-2xl font-mono font-bold tabular-nums ${tip.trustScore >= 7 ? 'text-teal-400' : tip.trustScore >= 5 ? 'text-amber-400' : 'text-white/40'}`}>
              {tip.trustScore}
            </span>
            <span className="text-xs text-muted-foreground font-mono">/10</span>
          </div>
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
        <div className="glass-card p-8 rounded-xl text-center space-y-2">
          <Target className="w-8 h-8 text-white/20 mx-auto" />
          <p className="text-muted-foreground text-sm">
            {data?.message ?? "Betting tip not yet available — signal data is still being computed."}
          </p>
          <p className="text-xs text-muted-foreground font-mono opacity-60">
            Tips are generated once sufficient pre-match data is available (odds + form + H2H).
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
            <TipCard key={tip.id} tip={tip} betTypeLabel={betTypeLabel(tip.betType)} />
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
      ) : liveAnalysis?.headline ? (
        <div className="space-y-4">
          <p className="text-xl font-bold text-white leading-snug">{liveAnalysis.headline}</p>
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
          <p className="text-muted-foreground leading-relaxed">{liveAnalysis.narrative}</p>
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

function PostReviewTab({ fixtureId }: { fixtureId: number }) {
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

  const outcomeConfig = {
    hit: { label: 'HIT', color: 'text-teal-400 bg-teal-400/10 border-teal-400/30', icon: CheckCircle2 },
    miss: { label: 'MISS', color: 'text-red-400 bg-red-400/10 border-red-400/30', icon: X },
    partial: { label: 'PARTIAL', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30', icon: Minus },
  };

  const betTypeLabel = (t: string) => {
    if (t === 'match_result') return 'Match Result';
    if (t === 'over_under') return 'Goals Market';
    if (t === 'btts') return 'Both Teams to Score';
    return t;
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="glass-card p-10 rounded-xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="glass-card p-8 rounded-xl text-center space-y-2">
          <Target className="w-8 h-8 text-white/20 mx-auto" />
          <p className="text-muted-foreground text-sm">
            {data?.message ?? "No prediction was made for this fixture."}
          </p>
        </div>
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

// ─── OddsTab ──────────────────────────────────────────────────────────────────

function OddsTab({ fixtureId, isLive, homeTeam, awayTeam }: { fixtureId: number; isLive: boolean; homeTeam: string; awayTeam: string }) {
  const { data: preData } = useGetFixtureOdds(fixtureId, { query: { queryKey: getGetFixtureOddsQueryKey(fixtureId), staleTime: 2 * 60_000, gcTime: 10 * 60_000 } });
  const { data: liveData } = useGetFixtureLiveOdds(fixtureId, { query: { queryKey: getGetFixtureLiveOddsQueryKey(fixtureId), staleTime: 30_000, gcTime: 5 * 60_000, refetchInterval: 30_000 } });
  const { data: marketsData } = useGetFixtureOddsMarkets(fixtureId, { query: { queryKey: getGetFixtureOddsMarketsQueryKey(fixtureId), staleTime: 2 * 60_000, gcTime: 10 * 60_000 } });

  const snap = preData?.odds ?? null;
  const liveOdds = liveData?.liveOdds ?? [];
  const latestLive = liveOdds[0] ?? null;
  const markets = marketsData?.oddsMarkets?.[0]?.markets as Record<string, Array<{ value: string; odd: string }>> | null | undefined;

  const oddsCell = (val: number | null | undefined) => {
    if (val == null) return <span className="text-muted-foreground font-mono text-sm">—</span>;
    return <span className="font-mono text-sm text-teal-400 font-bold tabular-nums">{val.toFixed(2)}</span>;
  };

  const renderMarket = (name: string, values: Array<{ value: string; odd: string }>) => (
    <div key={name} className="glass-card p-4 rounded-xl">
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">{name}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex flex-col items-center bg-white/5 rounded-lg px-3 py-2 min-w-[70px]">
            <span className="text-[10px] font-mono text-muted-foreground uppercase truncate max-w-[80px]">{v.value}</span>
            <span className="font-mono text-sm text-teal-400 font-bold">{v.odd}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (!snap && !latestLive && !markets) {
    return (
      <div className="glass-card p-8 rounded-xl text-center">
        <p className="text-muted-foreground text-sm">Odds not yet available — data syncs 6 hours before kickoff.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1X2 Pre-match */}
      {snap && (
        <div className="glass-card p-5 rounded-xl">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
            Match Winner — {snap.bookmaker ?? "Pre-match"}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1 truncate">{homeTeam}</div>
              {oddsCell(snap.homeWin)}
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Draw</div>
              {oddsCell(snap.draw)}
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1 truncate">{awayTeam}</div>
              {oddsCell(snap.awayWin)}
            </div>
          </div>

          {/* Additional markets */}
          {(snap.btts != null || snap.overUnder25 != null || snap.handicapHome != null) && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {snap.btts != null && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] font-mono text-violet-400 uppercase mb-1">BTTS</div>
                  <span className="font-mono text-sm font-bold text-violet-400">{snap.btts.toFixed(2)}</span>
                </div>
              )}
              {snap.overUnder25 != null && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] font-mono text-violet-400 uppercase mb-1">Over 2.5</div>
                  <span className="font-mono text-sm font-bold text-violet-400">{snap.overUnder25.toFixed(2)}</span>
                </div>
              )}
              {snap.handicapHome != null && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] font-mono text-violet-400 uppercase mb-1">Handicap H</div>
                  <span className="font-mono text-sm font-bold text-violet-400">{snap.handicapHome.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Live odds */}
      {isLive && latestLive && (
        <div className="glass-card p-5 rounded-xl border border-amber-400/20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">Live Odds — {latestLive.bookmaker}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-amber-400/5 border border-amber-400/10 rounded-xl p-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1 truncate">{homeTeam}</div>
              <span className="font-mono text-sm text-amber-400 font-bold tabular-nums">{latestLive.homeWin?.toFixed(2) ?? "—"}</span>
            </div>
            <div className="bg-amber-400/5 border border-amber-400/10 rounded-xl p-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Draw</div>
              <span className="font-mono text-sm text-amber-400 font-bold tabular-nums">{latestLive.draw?.toFixed(2) ?? "—"}</span>
            </div>
            <div className="bg-amber-400/5 border border-amber-400/10 rounded-xl p-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1 truncate">{awayTeam}</div>
              <span className="font-mono text-sm text-amber-400 font-bold tabular-nums">{latestLive.awayWin?.toFixed(2) ?? "—"}</span>
            </div>
          </div>
          {liveOdds.length > 1 && (
            <div className="mt-3 text-xs font-mono text-muted-foreground text-center">
              {liveOdds.length} snapshots captured since kickoff
            </div>
          )}
        </div>
      )}

      {/* All markets */}
      {markets && Object.keys(markets).length > 0 && (
        <div>
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">All Markets</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(markets).map(([name, values]) => renderMarket(name, values))}
          </div>
        </div>
      )}
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
  const { data: homeStats } = useGetTeamStatistics(homeTeamId, { season: 2024 }, { query: { queryKey: getGetTeamStatisticsQueryKey(homeTeamId, { season: 2024 }), staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } });
  const { data: awayStats } = useGetTeamStatistics(awayTeamId, { season: 2024 }, { query: { queryKey: getGetTeamStatisticsQueryKey(awayTeamId, { season: 2024 }), staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } });

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
