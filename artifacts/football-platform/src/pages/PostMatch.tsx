import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, CheckCircle2, Radio, Thermometer, Wind, AlertTriangle, Target, XCircle, MinusCircle } from "lucide-react";
import { useState } from "react";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeagueMark } from "@/components/LeagueMark";
import { cn } from "@/lib/utils";

type PostMatchTip = {
  id: number;
  fixtureId: number;
  betType: string;
  recommendation: string;
  trustScore: number;
  marketOdds: number | null;
  outcome: string | null;
  reviewHeadline: string | null;
  confidence: "high" | "medium" | "low" | null;
};

function TipOutcomeStrip({ tips }: { tips: PostMatchTip[] | undefined }) {
  if (!tips || tips.length === 0) return null;
  // Show top tip (highest trust) + outcome summary
  const top = tips[0]!;
  const resolved = tips.filter(t => t.outcome === "hit" || t.outcome === "miss");
  const hits = resolved.filter(t => t.outcome === "hit").length;
  const total = resolved.length;

  return (
    <div className="border-t border-white/[0.06] pt-1.5 mt-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Target className="w-2.5 h-2.5 text-primary/50 shrink-0" />
          <span className="text-[10px] text-white/65 truncate leading-tight">
            {top.recommendation}
            {top.marketOdds ? ` · ${top.marketOdds.toFixed(2)}` : ""}
          </span>
        </div>
        <div className="shrink-0">
          {top.outcome === "hit" && <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />}
          {top.outcome === "miss" && <XCircle className="w-3.5 h-3.5 text-amber-400" />}
          {!top.outcome && total === 0 && <MinusCircle className="w-3.5 h-3.5 text-white/18" />}
        </div>
      </div>
      {total > 1 && (
        <div className="text-[9px] text-muted-foreground/90 mt-0.5 pl-3.5 tabular-nums">
          <span className="text-teal-400/90">{hits}W</span>
          <span className="text-white/15 mx-1">·</span>
          <span className="text-amber-400/90">{total - hits}L</span>
          <span className="text-white/25 ml-1">/ {total}</span>
        </div>
      )}
    </div>
  );
}

interface LeagueSection {
  leagueId: number;
  leagueName: string | null | undefined;
  leagueLogo: string | null | undefined;
  fixtures: Fixture[];
}

export function PostMatch() {
  const [selectedLeague, setSelectedLeague] = useState<number | "all">("all");

  const { data, isLoading } = useQuery<{ leagues: { leagueId: number; leagueName: string | null; leagueLogo: string | null; fixtures: Fixture[] }[] }>({
    queryKey: ["fixtures", "recent"],
    queryFn: () => fetch("/api/fixtures/recent").then((r) => r.json()),
    staleTime: 2 * 60 * 60_000,   // 2 hours — results don't change
    gcTime:   7 * 24 * 60 * 60_000, // keep in memory 7 days
    refetchInterval: false,
  });

  const { data: tipsData } = useQuery<{ tips: Record<number, PostMatchTip[]> }>({
    queryKey: ["analysis", "postmatch-tips"],
    queryFn: () => fetch("/api/analysis/postmatch-tips").then((r) => r.json()),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });

  const all: Fixture[] = (data?.leagues ?? []).flatMap((l) => l.fixtures);
  const postmatch_ready = !isLoading && all.length > 0;
  useScrollRestoration("post-match", postmatch_ready);
  const postmatch = all;

  const byLeague = new Map<number, LeagueSection>();
  for (const f of postmatch) {
    if (!byLeague.has(f.leagueId)) {
      byLeague.set(f.leagueId, { leagueId: f.leagueId, leagueName: f.leagueName, leagueLogo: f.leagueLogo, fixtures: [] });
    }
    byLeague.get(f.leagueId)!.fixtures.push(f);
  }

  const leagues = Array.from(byLeague.values());
  const visibleLeagues = selectedLeague === "all" ? leagues : leagues.filter((l) => l.leagueId === selectedLeague);

  return (
    <Layout>
      <div className="space-y-5 max-w-6xl mx-auto">
        <header className="space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-white">Post-match</h1>
          <p className="text-xs md:text-sm text-muted-foreground leading-snug max-w-2xl">
            Afsluttede kampe (7 dage). Åbn en kamp for at se tip-historik. Markeder: 1X2, BTTS, asiatisk handicap.
          </p>
        </header>

        {leagues.length > 1 && (
          <Select
            value={String(selectedLeague)}
            onValueChange={(v) => setSelectedLeague(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="w-auto min-w-[200px] bg-white/5 border-white/10 text-white text-sm font-mono rounded-lg focus:ring-primary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-mono">
              <SelectItem value="all">
                All leagues ({leagues.length})
              </SelectItem>
              {leagues
                .slice()
                .sort((a, b) => (a.leagueName ?? "").localeCompare(b.leagueName ?? ""))
                .map((l) => (
                  <SelectItem key={l.leagueId} value={String(l.leagueId)}>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <LeagueMark leagueId={l.leagueId} leagueLogo={l.leagueLogo} size="xs" flagOnly />
                      <span className="truncate">
                        {l.leagueName ?? `League ${l.leagueId}`} ({l.fixtures.length})
                      </span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

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
                No finished matches in the last 7 days yet.
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
          <div className="space-y-6">
            {visibleLeagues.map((league) => (
              <div key={league.leagueId} className="space-y-2">
                <div className="flex items-center gap-2 pb-1 border-b border-white/[0.07]">
                  <LeagueMark leagueId={league.leagueId} leagueLogo={league.leagueLogo} size="xs" />
                  <span className="text-[11px] font-semibold text-white/90 tracking-tight truncate font-sans">
                    {league.leagueName ?? `League ${league.leagueId}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground/80 ml-auto tabular-nums">
                    {league.fixtures.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {league.fixtures.map((fixture) => {
                    const homeWon = (fixture.homeGoals ?? 0) > (fixture.awayGoals ?? 0);
                    const awayWon = (fixture.awayGoals ?? 0) > (fixture.homeGoals ?? 0);
                    const hasWeather = !!fixture.weatherDesc;
                    const isAdverseWeather = hasWeather && (
                      (fixture.weatherWind ?? 0) > 10 ||
                      (fixture.weatherDesc ?? "").toLowerCase().includes("snow") ||
                      (fixture.weatherDesc ?? "").toLowerCase().includes("heavy rain") ||
                      (fixture.weatherDesc ?? "").toLowerCase().includes("thunderstorm") ||
                      (fixture.weatherTemp ?? 15) < -5 ||
                      (fixture.weatherTemp ?? 15) > 36
                    );
                    return (
                      <Link key={fixture.fixtureId} href={`/match/${fixture.fixtureId}`}>
                        <div
                          className={cn(
                            "rounded-md border px-2.5 py-2 cursor-pointer transition-all",
                            "border-white/[0.06] bg-white/[0.02] hover:border-white/14 hover:bg-white/[0.04]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[9px] font-mono font-medium text-white/40 tabular-nums">
                              {fixture.statusShort ?? "FT"}
                            </span>
                            <span className="text-[9px] font-mono text-white/35 tabular-nums">
                              {fixture.kickoff ? format(new Date(fixture.kickoff), "HH:mm") : "—"}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2 min-h-[1.35rem]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {fixture.homeTeamLogo && (
                                  <img src={fixture.homeTeamLogo} alt="" className="w-4 h-4 object-contain shrink-0 bg-white/90 rounded-[3px]" />
                                )}
                                <span className={`text-[11px] font-medium truncate ${homeWon ? "text-white" : "text-white/45"}`}>
                                  {fixture.homeTeamName}
                                </span>
                              </div>
                              <span className={`text-sm font-semibold tabular-nums shrink-0 w-5 text-right ${homeWon ? "text-white" : "text-white/40"}`}>
                                {fixture.homeGoals ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 min-h-[1.35rem]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {fixture.awayTeamLogo && (
                                  <img src={fixture.awayTeamLogo} alt="" className="w-4 h-4 object-contain shrink-0 bg-white/90 rounded-[3px]" />
                                )}
                                <span className={`text-[11px] font-medium truncate ${awayWon ? "text-white" : "text-white/45"}`}>
                                  {fixture.awayTeamName}
                                </span>
                              </div>
                              <span className={`text-sm font-semibold tabular-nums shrink-0 w-5 text-right ${awayWon ? "text-white" : "text-white/40"}`}>
                                {fixture.awayGoals ?? 0}
                              </span>
                            </div>
                          </div>
                          <TipOutcomeStrip tips={tipsData?.tips?.[fixture.fixtureId]} />

                          {hasWeather && (
                            <div
                              className={cn(
                                "mt-1.5 pt-1.5 border-t border-white/[0.06] flex items-center gap-1.5 text-[9px]",
                                isAdverseWeather ? "text-amber-400/95" : "text-violet-300/85",
                              )}
                            >
                              {fixture.weatherIcon ? (
                                <img
                                  src={`https://openweathermap.org/img/wn/${fixture.weatherIcon}.png`}
                                  className="w-3 h-3 object-contain shrink-0"
                                  alt=""
                                />
                              ) : (
                                <Thermometer className="w-2.5 h-2.5 shrink-0 opacity-70" />
                              )}
                              <span className="capitalize truncate min-w-0">{fixture.weatherDesc}</span>
                              <span className="shrink-0 ml-auto flex items-center gap-1 tabular-nums">
                                {Math.round(fixture.weatherTemp ?? 0)}°
                                {(fixture.weatherWind ?? 0) > 3 && (
                                  <span className="opacity-70 flex items-center gap-0.5">
                                    <Wind className="w-2.5 h-2.5" />
                                    {Math.round(fixture.weatherWind ?? 0)}
                                  </span>
                                )}
                                {isAdverseWeather && <AlertTriangle className="w-2.5 h-2.5" />}
                              </span>
                            </div>
                          )}
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
