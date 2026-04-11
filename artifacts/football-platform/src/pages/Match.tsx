import { 
  useGetFixture, 
  useGetFixtureSignals, 
  useGetPreAnalysis, 
  useGetLiveAnalysis, 
  useGetPostAnalysis,
  useGetFixtureOdds,
  useGetFixtureLiveOdds,
  useGetFixtureH2H,
  useGetTeamStatistics,
  useGetFixtureOddsMarkets,
  useFollowFixture,
  useUnfollowFixture,
  useGetFollowedFixtures
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { Activity, Star, AlertTriangle, Info, CheckCircle2, ChevronLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useSession } from "@/lib/session";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

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
                <div className="text-5xl md:text-7xl font-mono font-bold text-white tracking-tighter">
                  {fixture.homeGoals ?? '-'} <span className="text-white/20 px-2">:</span> {fixture.awayGoals ?? '-'}
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
              <AnalysisTab fixtureId={id} phase="pre" />
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <AnalysisTab fixtureId={id} phase="live" />
            </TabsContent>
            <TabsContent value="post" className="mt-4">
              <AnalysisTab fixtureId={id} phase="post" />
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

function AnalysisTab({ fixtureId, phase }: { fixtureId: number, phase: 'pre' | 'live' | 'post' }) {
  const sigStale = phase === 'post' ? Infinity : phase === 'live' ? 30_000 : 3 * 60_000;
  const { data: signalsData } = useGetFixtureSignals(fixtureId, { phase }, {
    query: { enabled: !!fixtureId, queryKey: ['signals', fixtureId, phase], staleTime: sigStale, gcTime: phase === 'post' ? Infinity : 10 * 60_000 }
  });

  const { data: preAnalysis, isLoading: isLoadingPre } = useGetPreAnalysis(fixtureId, {
    query: { enabled: phase === 'pre' && !!fixtureId, queryKey: ['preAnalysis', fixtureId], staleTime: 25 * 60_000, gcTime: 30 * 60_000 }
  });
  const { data: liveAnalysis, isLoading: isLoadingLive } = useGetLiveAnalysis(fixtureId, {
    query: { enabled: phase === 'live' && !!fixtureId, queryKey: ['liveAnalysis', fixtureId], staleTime: 30_000, gcTime: 5 * 60_000, refetchInterval: phase === 'live' ? 30_000 : false }
  });
  const { data: postAnalysis, isLoading: isLoadingPost } = useGetPostAnalysis(fixtureId, {
    query: { enabled: phase === 'post' && !!fixtureId, queryKey: ['postAnalysis', fixtureId], staleTime: Infinity, gcTime: Infinity }
  });

  const analysis = phase === 'pre' ? preAnalysis : phase === 'live' ? liveAnalysis : postAnalysis;
  const isLoading = phase === 'pre' ? isLoadingPre : phase === 'live' ? isLoadingLive : isLoadingPost;

  const getSignalColor = (signalKey: string, value: unknown) => {
    if (signalKey.includes('goal') || signalKey.includes('red_card')) return 'text-destructive bg-destructive/10 border-destructive/20';
    if (signalKey.includes('warn') || signalKey.includes('danger') || value === false) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (signalKey.includes('info')) return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
    return 'text-primary bg-primary/10 border-primary/20';
  };

  const getSignalIcon = (signalKey: string) => {
    if (signalKey.includes('goal') || signalKey.includes('red_card')) return AlertTriangle;
    if (signalKey.includes('warn')) return AlertTriangle;
    if (signalKey.includes('info')) return Info;
    return CheckCircle2;
  };

  const favoriteColor = (fav?: string) => {
    if (fav === 'home') return 'text-teal-400 bg-teal-400/10 border-teal-400/20';
    if (fav === 'away') return 'text-teal-400 bg-teal-400/10 border-teal-400/20';
    return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Main AI analysis card */}
      <div className="md:col-span-2 space-y-4">
        <div className="glass-card p-6 rounded-xl min-h-[300px]">
          <h3 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase mb-5 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-primary" />
            AI SYNTHESIS — {phase.toUpperCase()}
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Activity className="w-6 h-6 text-primary animate-pulse" />
            </div>
          ) : analysis?.headline ? (
            <div className="space-y-5">
              {/* Headline */}
              <p className="text-xl font-bold text-white leading-snug">{analysis.headline}</p>

              {/* Phase-specific badges */}
              {phase === 'pre' && (
                <div className="flex flex-wrap gap-2 items-center">
                  {analysis.favorite && (
                    <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full border uppercase ${favoriteColor(analysis.favorite)}`}>
                      Favourite: {analysis.favorite}
                    </span>
                  )}
                  {typeof analysis.confidence === 'number' && (
                    <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                      <span className="text-xs font-mono text-muted-foreground uppercase">Confidence</span>
                      <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-teal-400"
                          style={{ width: `${Math.round(analysis.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-teal-400 tabular-nums">{Math.round(analysis.confidence * 100)}%</span>
                    </div>
                  )}
                </div>
              )}

              {phase === 'live' && (
                <div className="flex flex-wrap gap-2 items-center">
                  {analysis.momentum_verdict && (
                    <span className="text-xs font-mono font-bold px-3 py-1 rounded-full border text-violet-400 bg-violet-400/10 border-violet-400/20 uppercase">
                      Momentum: {analysis.momentum_verdict}
                    </span>
                  )}
                  {analysis.alert_worthy && (
                    <span className="text-xs font-mono font-bold px-3 py-1 rounded-full border text-amber-400 bg-amber-400/10 border-amber-400/20 uppercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Alert-worthy
                    </span>
                  )}
                </div>
              )}

              {phase === 'post' && analysis.deviation_note && (
                <div className="text-xs font-mono text-amber-400 bg-amber-400/5 border border-amber-400/15 px-3 py-2 rounded-lg">
                  {analysis.deviation_note}
                </div>
              )}

              {/* Narrative */}
              <p className="text-muted-foreground leading-relaxed">{analysis.narrative}</p>

              {/* Key factors */}
              {analysis.key_factors && analysis.key_factors.length > 0 && (
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Key Factors</span>
                  <div className="flex flex-wrap gap-2">
                    {analysis.key_factors.map((f, i) => (
                      <span key={i} className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Man of match */}
              {phase === 'post' && analysis.man_of_match && (
                <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-mono text-muted-foreground uppercase">Decisive Player</span>
                  <span className="text-sm font-mono font-bold text-teal-400">{analysis.man_of_match}</span>
                </div>
              )}

              {analysis.cachedAt && (
                <div className="text-[10px] font-mono opacity-30 pt-2">
                  Synthesized {format(new Date(analysis.cachedAt), 'HH:mm:ss')}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground leading-relaxed italic py-8">
              Analysis pending — waiting for sufficient signal data for {phase}-phase model execution.
            </p>
          )}
        </div>
      </div>
      
      {/* Signals sidebar */}
      <div className="space-y-4">
        <h3 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">Detected Signals</h3>
        
        {!signalsData?.signals?.length ? (
          <div className="glass-card p-6 rounded-xl text-center">
            <p className="text-sm text-muted-foreground">No anomalous signals detected.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {signalsData.signals.map((signal) => {
              const Icon = getSignalIcon(signal.signalKey);
              const colors = getSignalColor(signal.signalKey, signal.signalBool);
              
              return (
                <div key={signal.id} className={`p-3.5 rounded-xl border flex items-start gap-3 ${colors}`}>
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm leading-tight mb-1">{signal.signalLabel}</h4>
                    {signal.signalValue !== undefined && signal.signalValue !== null && (
                      <div className="font-mono text-xs opacity-70">VAL: {String(signal.signalValue)}</div>
                    )}
                    <div className="text-[10px] uppercase tracking-wider mt-1.5 opacity-50 font-mono">
                      {format(new Date(signal.triggeredAt || Date.now()), 'HH:mm:ss')}
                    </div>
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

// ─── OddsTab ──────────────────────────────────────────────────────────────────

function OddsTab({ fixtureId, isLive, homeTeam, awayTeam }: { fixtureId: number; isLive: boolean; homeTeam: string; awayTeam: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: preData } = useGetFixtureOdds(fixtureId, { query: { staleTime: 2 * 60_000, gcTime: 10 * 60_000 } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: liveData } = useGetFixtureLiveOdds(fixtureId, { query: { staleTime: 30_000, gcTime: 5 * 60_000, refetchInterval: 30_000 } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: marketsData } = useGetFixtureOddsMarkets(fixtureId, { query: { staleTime: 2 * 60_000, gcTime: 10 * 60_000 } as any });

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: h2hData, isLoading } = useGetFixtureH2H(fixtureId, { query: { staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: homeStats } = useGetTeamStatistics(homeTeamId, { season: 2024 }, { query: { staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: awayStats } = useGetTeamStatistics(awayTeamId, { season: 2024 }, { query: { staleTime: 2 * 60 * 60_000, gcTime: 4 * 60 * 60_000 } as any });

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
