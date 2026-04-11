import { useGetTodayFixtures } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock } from "lucide-react";

export function Dashboard() {
  const { data, isLoading } = useGetTodayFixtures();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Activity className="w-8 h-8 text-primary animate-pulse" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2">OPERATIONAL OVERVIEW</h1>
          <p className="text-muted-foreground">Active and upcoming fixtures across monitored leagues.</p>
        </header>

        {data?.leagues?.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
            <Activity className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-white mb-1">No Active Signals</h3>
            <p className="text-muted-foreground">No fixtures detected in the current operational window.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {data?.leagues?.map((league) => (
              <div key={league.leagueId} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                  {league.leagueLogo && (
                    <img src={league.leagueLogo} alt={league.leagueName} className="w-6 h-6 object-contain" />
                  )}
                  <h2 className="text-xl font-bold text-white uppercase tracking-wider">{league.leagueName}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {league.fixtures.map((fixture) => {
                    const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE"].includes(fixture.statusShort || "");
                    
                    return (
                      <Link key={fixture.fixtureId} href={`/match/${fixture.fixtureId}`}>
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
                                  <Clock className="w-3.5 h-3.5" />
                                  {fixture.statusShort}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {fixture.kickoff ? format(new Date(fixture.kickoff), 'HH:mm') : '--:--'}
                            </span>
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
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
