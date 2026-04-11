import { useGetTodayFixtures } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, CheckCircle2, Radio } from "lucide-react";

const POST_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"]);

interface LeagueSection {
  leagueId: number;
  leagueName: string | null | undefined;
  leagueLogo: string | null | undefined;
  fixtures: Fixture[];
}

export function PostMatch() {
  const { data, isLoading } = useGetTodayFixtures();

  const all: Fixture[] = (data?.leagues ?? []).flatMap((l) => l.fixtures);
  const postmatch = all
    .filter((f) => POST_STATUSES.has(f.statusShort ?? ""))
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return tb - ta;
    });

  const byLeague = new Map<number, LeagueSection>();
  for (const f of postmatch) {
    if (!byLeague.has(f.leagueId)) {
      byLeague.set(f.leagueId, { leagueId: f.leagueId, leagueName: f.leagueName, leagueLogo: f.leagueLogo, fixtures: [] });
    }
    byLeague.get(f.leagueId)!.fixtures.push(f);
  }

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2">POST-MATCH</h1>
          <p className="text-muted-foreground">Finished fixtures — post-match analysis and signals.</p>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : postmatch.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center gap-4">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground opacity-30" />
            <div>
              <h3 className="text-lg font-medium text-white mb-1">No finished fixtures yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Results from today's matches will appear here once games are completed.
              </p>
              <Link href="/live">
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-mono font-semibold hover:bg-primary/20 transition-colors">
                  <Radio className="w-3.5 h-3.5" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Watch live matches
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {Array.from(byLeague.values()).map((league) => (
              <div key={league.leagueId} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                  {league.leagueLogo && (
                    <img src={league.leagueLogo} alt="" className="w-5 h-5 object-contain" />
                  )}
                  <span className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    {league.leagueName ?? `League ${league.leagueId}`}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    {league.fixtures.length} {league.fixtures.length === 1 ? "match" : "matches"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {league.fixtures.map((fixture) => {
                    const homeWon = (fixture.homeGoals ?? 0) > (fixture.awayGoals ?? 0);
                    const awayWon = (fixture.awayGoals ?? 0) > (fixture.homeGoals ?? 0);
                    return (
                      <Link key={fixture.fixtureId} href={`/match/${fixture.fixtureId}`}>
                        <div className="glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-white/5">
                          <div className="flex justify-between items-center mb-4">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-white/5 px-2.5 py-1 rounded font-mono">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              {fixture.statusShort ?? "FT"}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {fixture.kickoff ? format(new Date(fixture.kickoff), "HH:mm") : "--:--"}
                            </span>
                          </div>
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {fixture.homeTeamLogo && (
                                  <img src={fixture.homeTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                                )}
                                <span className={`font-medium truncate text-sm ${homeWon ? "text-white" : "text-muted-foreground"}`}>
                                  {fixture.homeTeamName}
                                </span>
                              </div>
                              <span className={`font-mono text-lg font-bold shrink-0 ${homeWon ? "text-white" : "text-muted-foreground"}`}>
                                {fixture.homeGoals ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {fixture.awayTeamLogo && (
                                  <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                                )}
                                <span className={`font-medium truncate text-sm ${awayWon ? "text-white" : "text-muted-foreground"}`}>
                                  {fixture.awayTeamName}
                                </span>
                              </div>
                              <span className={`font-mono text-lg font-bold shrink-0 ${awayWon ? "text-white" : "text-muted-foreground"}`}>
                                {fixture.awayGoals ?? 0}
                              </span>
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
