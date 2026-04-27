import { useState } from "react";
import { useGetTodayFixtures } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, ChevronDown } from "lucide-react";
import { getLeagueFlag } from "@/lib/leagues";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);

export function Live() {
  const { data, isLoading } = useGetTodayFixtures();
  const [selectedLeague, setSelectedLeague] = useState<number | "all">("all");

  const liveFixtures = (data?.leagues ?? [])
    .map((league) => ({
      ...league,
      fixtures: league.fixtures.filter((f) => LIVE_STATUSES.has(f.statusShort ?? "")),
    }))
    .filter((l) => l.fixtures.length > 0)
    .sort((a, b) => (a.leagueName ?? "").localeCompare(b.leagueName ?? ""));

  const visibleLeagues = selectedLeague === "all"
    ? liveFixtures
    : liveFixtures.filter((l) => l.leagueId === selectedLeague);

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
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">LIVE</h1>
          </div>
          <p className="text-muted-foreground">Matches currently in play.</p>
        </header>

        {/* League filter dropdown — only shown when there are multiple leagues */}
        {liveFixtures.length > 1 && (
          <div className="relative w-full sm:w-72">
            <select
              value={selectedLeague === "all" ? "all" : String(selectedLeague)}
              onChange={(e) => setSelectedLeague(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-full appearance-none bg-black/30 border border-white/10 text-white text-sm font-mono rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:border-primary/40 cursor-pointer"
            >
              <option value="all" className="bg-[#0a0f1e]">
                🌍 All Leagues ({liveFixtures.length})
              </option>
              {liveFixtures.map((l) => (
                <option key={l.leagueId} value={String(l.leagueId)} className="bg-[#0a0f1e]">
                  {getLeagueFlag(l.leagueId)} {l.leagueName ?? `League ${l.leagueId}`} ({l.fixtures.length} live)
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
        )}

        {liveFixtures.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
            <Activity className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-white mb-1">No live matches</h3>
            <p className="text-muted-foreground">There are no matches in play right now.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {visibleLeagues.map((league) => (
              <div key={league.leagueId} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                  <span className="text-lg leading-none">{getLeagueFlag(league.leagueId)}</span>
                  {league.leagueLogo && (
                    <img src={league.leagueLogo} alt={league.leagueName ?? ""} className="w-5 h-5 object-contain" />
                  )}
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">{league.leagueName}</h2>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    {league.fixtures.length} live
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {league.fixtures.map((fixture) => (
                    <Link key={fixture.fixtureId} href={`/match/${fixture.fixtureId}`}>
                      <div className="glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-primary/30 shadow-[0_0_14px_rgba(0,255,200,0.07)]">
                        <div className="flex justify-between items-center mb-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            {fixture.statusElapsed != null ? `${fixture.statusElapsed}'` : "LIVE"}
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
                              <span className="font-medium text-white truncate text-sm">{fixture.homeTeamName}</span>
                            </div>
                            <span className="font-mono text-lg font-bold text-primary shrink-0">
                              {fixture.homeGoals ?? "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {fixture.awayTeamLogo && (
                                <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                              )}
                              <span className="font-medium text-white truncate text-sm">{fixture.awayTeamName}</span>
                            </div>
                            <span className="font-mono text-lg font-bold text-primary shrink-0">
                              {fixture.awayGoals ?? "-"}
                            </span>
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
