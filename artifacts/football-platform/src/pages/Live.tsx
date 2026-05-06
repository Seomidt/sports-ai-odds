import { useState } from "react";
import { useGetTodayFixtures, useGetFixtureSignals } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLeagueLogo } from "@/lib/leagues";
import { LiveSignalFeed, type LiveSignalItem } from "@/components/LiveSignalFeed";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);

function LiveMatchCard({ fixture }: { fixture: Fixture }) {
  const { data: signalData } = useGetFixtureSignals(
    fixture.fixtureId,
    { phase: "live" },
    {
      query: {
        queryKey: ["signals", fixture.fixtureId, "live", "live-page"],
        staleTime: 15_000,
        refetchInterval: 15_000,
      },
    },
  );
  const signals = (signalData?.signals ?? []) as LiveSignalItem[];

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className="glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-primary/30 shadow-[0_0_14px_rgba(0,255,200,0.07)] flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {fixture.statusElapsed != null ? `${fixture.statusElapsed}'` : fixture.statusShort}
          </span>
        </div>

        <div className="space-y-2.5 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.homeTeamLogo && (
                <img src={fixture.homeTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0 bg-white/90 rounded p-0.5" />
              )}
              <span className="font-semibold text-white truncate text-sm">{fixture.homeTeamName}</span>
            </div>
            <span className="font-mono text-2xl font-bold text-white shrink-0">{fixture.homeGoals ?? 0}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.awayTeamLogo && (
                <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0 bg-white/90 rounded p-0.5" />
              )}
              <span className="font-medium text-white/60 truncate text-sm">{fixture.awayTeamName}</span>
            </div>
            <span className="font-mono text-2xl font-bold text-white/60 shrink-0">{fixture.awayGoals ?? 0}</span>
          </div>
        </div>

        <LiveSignalFeed
          variant="compact"
          signals={signals}
          homeTeam={fixture.homeTeamName}
          awayTeam={fixture.awayTeamName}
          className="mt-4 pt-3 border-t border-primary/15"
        />
      </div>
    </Link>
  );
}

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
          <p className="text-muted-foreground max-w-xl">
            Hver kort viser kun signaler for netop den kamp — opdateres løbende, så du kan se momentum, pres og live value uden støj fra andre opgør.
          </p>
        </header>

        {/* League filter dropdown — only shown when there are multiple leagues */}
        {liveFixtures.length > 1 && (
          <Select
            value={selectedLeague === "all" ? "all" : String(selectedLeague)}
            onValueChange={(v) => setSelectedLeague(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="w-full sm:w-72 bg-white/5 border-white/10 text-white text-sm font-mono rounded-lg focus:ring-primary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0f0f1a] border-white/10 text-white font-mono max-h-[300px]">
              <SelectItem value="all" className="text-white focus:bg-white/10 focus:text-white">
                🌍 All Leagues ({liveFixtures.length})
              </SelectItem>
              {liveFixtures.map((l) => (
                <SelectItem key={l.leagueId} value={String(l.leagueId)} className="text-white focus:bg-white/10 focus:text-white">
                  <span className="inline-flex items-center gap-2">
                    <img src={getLeagueLogo(l.leagueId)} alt="" className="w-4 h-4 object-contain shrink-0 bg-white/90 rounded p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    {l.leagueName ?? `League ${l.leagueId}`} ({l.fixtures.length} live)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                  <img
                    src={getLeagueLogo(league.leagueId) || league.leagueLogo || ""}
                    alt={league.leagueName ?? ""}
                    className="w-5 h-5 object-contain shrink-0 bg-white/90 rounded p-0.5"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">{league.leagueName}</h2>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    {league.fixtures.length} live
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {league.fixtures.map((fixture) => (
                    <LiveMatchCard key={fixture.fixtureId} fixture={fixture} />
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