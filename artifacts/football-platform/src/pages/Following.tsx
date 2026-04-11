import { useGetFollowedFixtures, useGetFixture, useGetUnreadAlerts, useMarkAlertRead, useExplainAlert } from "@workspace/api-client-react";
import type { Alert } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity, Bell, Info, ShieldAlert, Star, CheckCircle2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function FixtureCard({ id }: { id: number }) {
  const { data: fixtureData, isLoading } = useGetFixture(id, {
    query: { enabled: !!id, queryKey: ['fixture', id] }
  });

  if (isLoading) return <div className="glass-card h-32 rounded-xl flex items-center justify-center"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>;
  if (!fixtureData?.fixture) return null;

  const { fixture } = fixtureData;
  const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE"].includes(fixture.statusShort || "");

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className={`glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border ${isLive ? 'border-primary/30' : 'border-white/5'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                LIVE {fixture.statusElapsed}'
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-white/5 px-2 py-1 rounded">
                {fixture.statusShort}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fixture.homeTeamLogo && <img src={fixture.homeTeamLogo} className="w-6 h-6 object-contain" />}
              <span className="font-medium text-white truncate max-w-[120px]">{fixture.homeTeamName}</span>
            </div>
            <span className="font-mono text-lg font-bold text-white">{fixture.homeGoals ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fixture.awayTeamLogo && <img src={fixture.awayTeamLogo} className="w-6 h-6 object-contain" />}
              <span className="font-medium text-white truncate max-w-[120px]">{fixture.awayTeamName}</span>
            </div>
            <span className="font-mono text-lg font-bold text-white">{fixture.awayGoals ?? '-'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Following() {
  const { sessionId } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: followedData, isLoading: isLoadingFollowed } = useGetFollowedFixtures({
    request: { headers: { 'x-session-id': sessionId } },
    query: {
      queryKey: ['followedFixtures', sessionId],
      enabled: !!sessionId,
    }
  });

  const { data: alertsData } = useGetUnreadAlerts({
    query: { refetchInterval: 30000, queryKey: ['unreadAlerts'] },
    request: { headers: { 'x-session-id': sessionId } }
  });

  const markReadMutation = useMarkAlertRead({
    request: { headers: { 'x-session-id': sessionId } }
  });
  const explainMutation = useExplainAlert();
  const [explainingAlertId, setExplainingAlertId] = useState<number | null>(null);

  const handleMarkRead = async (id: number) => {
    try {
      await markReadMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ['unreadAlerts'] });
    } catch (e) {
      console.error(e);
    }
  };

  const handleExplain = async (alert: Alert) => {
    setExplainingAlertId(alert.id);
    try {
      const res = await explainMutation.mutateAsync({
        data: {
          signalKey: alert.signalKey,
          signalLabel: alert.alertText,
          matchName: `Fixture ${alert.fixtureId}`
        }
      });
      toast({
        title: "AI Explanation",
        description: res.alertText,
      });
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to explain alert",
        variant: "destructive"
      });
    } finally {
      setExplainingAlertId(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2 flex items-center">
            <Star className="w-8 h-8 mr-3 text-secondary" />
            FOLLOWED FIXTURES
          </h1>
          <p className="text-muted-foreground">Monitored targets and real-time alerts.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Active Targets</h2>
            {isLoadingFollowed ? (
              <div className="flex items-center justify-center h-32">
                <Activity className="w-8 h-8 text-primary animate-pulse" />
              </div>
            ) : !followedData?.fixtureIds?.length ? (
              <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
                <Star className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-white mb-1">No Targets Followed</h3>
                <p className="text-muted-foreground">Star fixtures on the dashboard to track them here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {followedData.fixtureIds.map(id => (
                  <FixtureCard key={id} id={id} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
              <Bell className="w-5 h-5 mr-2 text-primary" />
              UNREAD ALERTS
              {alertsData?.alerts?.length ? (
                <span className="ml-3 bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-mono">{alertsData.alerts.length}</span>
              ) : null}
            </h2>

            {!alertsData?.alerts?.length ? (
              <div className="glass-card p-8 text-center rounded-xl">
                <p className="text-sm text-muted-foreground">No unread alerts.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alertsData.alerts.map(alert => (
                  <div key={alert.id} className="glass-card p-4 rounded-xl border border-primary/20 bg-primary/5">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-1 rounded">MATCH {alert.fixtureId}</span>
                      <span className="text-xs text-muted-foreground font-mono">{format(new Date(alert.createdAt || Date.now()), 'HH:mm:ss')}</span>
                    </div>
                    <p className="text-sm text-white mb-4">{alert.alertText}</p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => handleExplain(alert)} disabled={explainingAlertId === alert.id}>
                        {explainingAlertId === alert.id ? <Activity className="w-4 h-4 mr-1 animate-pulse" /> : <Info className="w-4 h-4 mr-1" />} Explain
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleMarkRead(alert.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Ack
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
