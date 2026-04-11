import { 
  useGetFixture, 
  useGetFixtureSignals, 
  useGetPreAnalysis, 
  useGetLiveAnalysis, 
  useGetPostAnalysis,
  useFollowFixture,
  useUnfollowFixture,
  useGetFollowedFixtures
} from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { Activity, Star, AlertTriangle, Info, CheckCircle2, ChevronLeft } from "lucide-react";
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

        {/* Tabs section for Analysis */}
        <div className="mt-8">
          <Tabs defaultValue={isLive ? "live" : fixture.statusShort === "FT" ? "post" : "pre"} className="w-full">
            <TabsList className="bg-black/40 border border-white/10 p-1">
              <TabsTrigger value="pre" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">PRE-MATCH</TabsTrigger>
              <TabsTrigger value="live" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">IN-PLAY</TabsTrigger>
              <TabsTrigger value="post" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase">POST-MATCH</TabsTrigger>
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
          </Tabs>
        </div>

      </div>
    </Layout>
  );
}

function AnalysisTab({ fixtureId, phase }: { fixtureId: number, phase: 'pre' | 'live' | 'post' }) {
  const { data: signalsData } = useGetFixtureSignals(fixtureId, { phase }, { query: { enabled: !!fixtureId, queryKey: ['signals', fixtureId, phase] } });
  
  const { data: preAnalysis, isLoading: isLoadingPre } = useGetPreAnalysis(fixtureId, { query: { enabled: phase === 'pre' && !!fixtureId, queryKey: ['preAnalysis', fixtureId] }});
  const { data: liveAnalysis, isLoading: isLoadingLive } = useGetLiveAnalysis(fixtureId, { query: { enabled: phase === 'live' && !!fixtureId, queryKey: ['liveAnalysis', fixtureId] }});
  const { data: postAnalysis, isLoading: isLoadingPost } = useGetPostAnalysis(fixtureId, { query: { enabled: phase === 'post' && !!fixtureId, queryKey: ['postAnalysis', fixtureId] }});

  const analysis = phase === 'pre' ? preAnalysis : phase === 'live' ? liveAnalysis : postAnalysis;
  const isLoading = phase === 'pre' ? isLoadingPre : phase === 'live' ? isLoadingLive : isLoadingPost;

  const getSignalColor = (signalKey: string, value: any) => {
    if (signalKey.includes('goal') || signalKey.includes('red_card')) return 'text-destructive bg-destructive/10 border-destructive/20';
    if (signalKey.includes('warn') || signalKey.includes('danger') || value === false) return 'text-secondary bg-secondary/10 border-secondary/20';
    if (signalKey.includes('info')) return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
    return 'text-primary bg-primary/10 border-primary/20';
  };

  const getSignalIcon = (signalKey: string) => {
    if (signalKey.includes('goal') || signalKey.includes('red_card')) return AlertTriangle;
    if (signalKey.includes('warn')) return AlertTriangle;
    if (signalKey.includes('info')) return Info;
    return CheckCircle2;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <div className="glass-card p-6 rounded-xl min-h-[300px]">
          <h3 className="text-lg font-mono font-bold text-white mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-primary" />
            AI SYNTHESIS
          </h3>
          {isLoading ? (
             <div className="flex items-center justify-center py-12">
               <Activity className="w-6 h-6 text-primary animate-pulse" />
             </div>
          ) : analysis ? (
            <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {analysis.text}
              {analysis.cachedAt && (
                <div className="mt-6 text-xs font-mono opacity-50">
                  Last synthesized: {format(new Date(analysis.cachedAt), 'HH:mm:ss')}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap italic">
              Analysis generation pending... Waiting for sufficient data points for {phase} phase model execution.
            </p>
          )}
        </div>
      </div>
      
      <div className="space-y-4">
        <h3 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase mb-4">Detected Signals</h3>
        
        {!signalsData?.signals?.length ? (
          <div className="glass-card p-4 rounded-xl text-center">
            <p className="text-sm text-muted-foreground">No anomalous signals detected.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signalsData.signals.map((signal) => {
              const Icon = getSignalIcon(signal.signalKey);
              const colors = getSignalColor(signal.signalKey, signal.signalBool);
              
              return (
                <div key={signal.id} className={`p-4 rounded-xl border flex items-start gap-3 ${colors}`}>
                  <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm mb-1">{signal.signalLabel}</h4>
                    {signal.signalValue !== undefined && signal.signalValue !== null && (
                      <div className="font-mono text-xs opacity-80">VALUE: {signal.signalValue}</div>
                    )}
                    <div className="text-[10px] uppercase tracking-wider mt-2 opacity-60 font-mono">
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
