import { 
  useGetFixture, 
  useGetFixtureSignals, 
  useGetPreAnalysis, 
  useGetLiveAnalysis, 
  useGetPostAnalysis,
  useGetFixtureOdds,
  useGetFixtureLiveOdds,
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
            <TabsList className="bg-black/40 border border-white/10 p-1">
              <TabsTrigger value="pre" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">PRE-MATCH</TabsTrigger>
              <TabsTrigger value="live" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">IN-PLAY</TabsTrigger>
              <TabsTrigger value="post" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">POST-MATCH</TabsTrigger>
              <TabsTrigger value="odds" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">ODDS</TabsTrigger>
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
  const { data: signalsData } = useGetFixtureSignals(fixtureId, { phase }, { query: { enabled: !!fixtureId, queryKey: ['signals', fixtureId, phase] } });
  
  const { data: preAnalysis, isLoading: isLoadingPre } = useGetPreAnalysis(fixtureId, { query: { enabled: phase === 'pre' && !!fixtureId, queryKey: ['preAnalysis', fixtureId] }});
  const { data: liveAnalysis, isLoading: isLoadingLive } = useGetLiveAnalysis(fixtureId, { query: { enabled: phase === 'live' && !!fixtureId, queryKey: ['liveAnalysis', fixtureId], refetchInterval: phase === 'live' ? 30_000 : false } });
  const { data: postAnalysis, isLoading: isLoadingPost } = useGetPostAnalysis(fixtureId, { query: { enabled: phase === 'post' && !!fixtureId, queryKey: ['postAnalysis', fixtureId] }});

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
