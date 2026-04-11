import { useGetTodayFixtures } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock } from "lucide-react";

const PRE_STATUSES = new Set(["NS", "TBD", ""]);

function isPrematch(f: Fixture) {
  const s = f.statusShort ?? "";
  return PRE_STATUSES.has(s) || (!["1H","HT","2H","ET","BT","P","INT","LIVE","FT","AET","PEN","ABD","CANC","AWD","WO"].includes(s));
}

interface LeagueSection {
  leagueId: number;
  leagueName: string | null | undefined;
  leagueLogo: string | null | undefined;
  fixtures: Fixture[];
}

export function PreMatch() {
  const { data, isLoading } = useGetTodayFixtures();

  const all: Fixture[] = (data?.leagues ?? []).flatMap((l) => l.fixtures);
  const prematch = all
    .filter(isPrematch)
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });

  const byLeague = new Map<number, LeagueSection>();
  for (const f of prematch) {
    if (!byLeague.has(f.leagueId)) {
      byLeague.set(f.leagueId, { leagueId: f.leagueId, leagueName: f.leagueName, leagueLogo: f.leagueLogo, fixtures: [] });
    }
    byLeague.get(f.leagueId)!.fixtures.push(f);
  }

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2">FØR KAMP</h1>
          <p className="text-muted-foreground">Kommende kampe — prematch analyse tilgængelig.</p>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : prematch.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
            <Clock className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-white mb-1">Ingen kommende kampe</h3>
            <p className="text-muted-foreground">Ingen planlagte kampe i det nuværende vindue.</p>
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
                    {league.fixtures.length} {league.fixtures.length === 1 ? "kamp" : "kampe"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {league.fixtures.map((fixture) => (
                    <Link key={fixture.fixtureId} href={`/match/${fixture.fixtureId}`}>
                      <div className="glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-amber-400/15">
                        <div className="flex justify-between items-center mb-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded font-mono">
                            <Clock className="w-3 h-3 shrink-0" />
                            {fixture.kickoff ? format(new Date(fixture.kickoff), "HH:mm") : "--:--"}
                          </span>
                          {fixture.leagueLogo && (
                            <img src={fixture.leagueLogo} alt="" className="w-4 h-4 object-contain" />
                          )}
                        </div>
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {fixture.homeTeamLogo && (
                                <img src={fixture.homeTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                              )}
                              <span className="font-medium text-white truncate text-sm">{fixture.homeTeamName}</span>
                            </div>
                            <span className="font-mono text-base font-bold text-muted-foreground shrink-0">-</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {fixture.awayTeamLogo && (
                                <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                              )}
                              <span className="font-medium text-white truncate text-sm">{fixture.awayTeamName}</span>
                            </div>
                            <span className="font-mono text-base font-bold text-muted-foreground shrink-0">-</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
