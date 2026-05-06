import { useGetTodayFixtures, useGetFixtureSignals, getGetTodayFixturesQueryKey } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, Zap, TrendingUp, CloudRain, AlertTriangle, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useMemo } from "react";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeagueMark } from "@/components/LeagueMark";
import { cn } from "@/lib/utils";

function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE dd/MM");
}

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const POST_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO"]);
const SPECIAL_STATUS_LABEL: Record<string, string> = {
  PST: "Postponed",
  CANC: "Cancelled",
  ABD: "Abandoned",
  SUSP: "Suspended",
  TBD: "TBD",
};

function isPrematch(f: Fixture) {
  const s = f.statusShort ?? "";
  if (LIVE_STATUSES.has(s) || POST_STATUSES.has(s)) return false;
  if (f.kickoff && new Date(f.kickoff).getTime() < Date.now() - 2 * 60 * 60 * 1000) return false;
  return true;
}

function kickoffShort(kickoff: string | null | undefined): string {
  if (!kickoff) return "—";
  const d = new Date(kickoff);
  return format(d, "HH:mm");
}

interface LeagueSection {
  leagueId: number;
  leagueName: string | null | undefined;
  leagueLogo: string | null | undefined;
  fixtures: Fixture[];
}

interface DerivedMarket {
  market: string;
  side: string;
  label: string;
  probability: number;
}

type MarketFilter = "all" | "match_result" | "over_under_25" | "btts" | "double_chance";

const FILTER_TABS: { id: MarketFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "match_result", label: "1X2" },
  { id: "over_under_25", label: "O/U 2.5" },
  { id: "btts", label: "BTTS" },
  { id: "double_chance", label: "1X / X2" },
];

function prioritizeAllMarkets(markets: DerivedMarket[]): DerivedMarket[] {
  const sorted = [...markets].sort((a, b) => b.probability - a.probability);
  const preferredOrder = ["match_result", "over_under_25", "btts", "double_chance"];
  const picked: DerivedMarket[] = [];

  for (const market of preferredOrder) {
    const candidate =
      market === "match_result"
        ? sorted.find((m) => m.market === market && m.side !== "draw" && !picked.includes(m)) ??
          sorted.find((m) => m.market === market && !picked.includes(m))
        : sorted.find((m) => m.market === market && !picked.includes(m));
    if (candidate) picked.push(candidate);
  }

  // Fill remaining slots by strongest remaining lines, while avoiding too many draw picks.
  for (const m of sorted) {
    if (picked.includes(m)) continue;
    if (m.market === "match_result" && m.side === "draw" && picked.some((x) => x.market === "match_result" && x.side === "draw")) {
      continue;
    }
    picked.push(m);
  }
  return picked;
}

function filterMarkets(markets: DerivedMarket[], filter: MarketFilter): DerivedMarket[] {
  if (filter === "all") return prioritizeAllMarkets(markets);
  return markets.filter((m) => m.market === filter).sort((a, b) => b.probability - a.probability);
}

function marketPillClass(market: string): string {
  switch (market) {
    case "match_result":
      return "bg-teal-400/12 text-teal-300 border-teal-400/25";
    case "over_under_25":
      return "bg-violet-400/12 text-violet-200 border-violet-400/25";
    case "btts":
      return "bg-amber-400/12 text-amber-200 border-amber-400/25";
    case "double_chance":
    case "win_or_draw":
      return "bg-sky-400/14 text-sky-200 border-sky-400/35";
    default:
      return "bg-white/5 text-muted-foreground border-white/10";
  }
}

function WeatherMini({ temp, desc, wind, icon }: { temp: number | null; desc: string; wind: number | null; icon: string | null }) {
  const isAdverse =
    (wind ?? 0) > 10 ||
    desc.toLowerCase().includes("snow") ||
    desc.toLowerCase().includes("blizzard") ||
    desc.toLowerCase().includes("heavy rain") ||
    desc.toLowerCase().includes("thunderstorm") ||
    desc.toLowerCase().includes("hail") ||
    (temp ?? 15) < -5 ||
    (temp ?? 15) > 36;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-mono px-1 py-0.5 rounded border shrink-0",
        isAdverse ? "text-amber-400/90 bg-amber-400/8 border-amber-400/25" : "text-muted-foreground/70 bg-white/[0.04] border-white/8",
      )}
      title={`${desc} — ${Math.round(temp ?? 0)}°C`}
    >
      {icon ? (
        <img src={`https://openweathermap.org/img/wn/${icon}.png`} className="w-3 h-3 object-contain" alt="" />
      ) : (
        <CloudRain className="w-2.5 h-2.5 opacity-60" />
      )}
      {Math.round(temp ?? 0)}°
      {isAdverse && <AlertTriangle className="w-2 h-2 text-amber-400" />}
    </span>
  );
}

function CompactPreRow({
  fixture,
  markets,
  marketFilter,
}: {
  fixture: Fixture;
  markets: DerivedMarket[];
  marketFilter: MarketFilter;
}) {
  const { data: signalData } = useGetFixtureSignals(fixture.fixtureId, { phase: "pre" }, {
    query: { queryKey: ["signals", fixture.fixtureId, "pre"], staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  });
  const signals = signalData?.signals ?? [];
  const filtered = filterMarkets(markets, marketFilter);
  const display = filtered.slice(0, 6);
  const hasPred = markets.length > 0;

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div
        className={cn(
          "group rounded-md border px-2 py-1.5 cursor-pointer transition-all hover:bg-white/[0.035] hover:border-white/12",
          signals.length >= 3 ? "border-primary/22 bg-primary/[0.03]" : "border-white/[0.06] bg-white/[0.015]",
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-0.5 shrink-0 w-[2.75rem] sm:w-12 justify-end sm:justify-start">
            <span className="text-[10px] font-mono font-medium text-white/55 tabular-nums">{kickoffShort(fixture.kickoff)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-wrap sm:flex-nowrap">
              {fixture.homeTeamLogo && (
                <img src={fixture.homeTeamLogo} alt="" className="w-3.5 h-3.5 object-contain shrink-0 bg-white/90 rounded-[3px]" />
              )}
              <span className="text-[11px] sm:text-xs font-medium text-white/95 truncate max-w-[42%] sm:max-w-none">{fixture.homeTeamName}</span>
              <span className="text-[9px] text-white/20 shrink-0 px-0.5">–</span>
              {fixture.awayTeamLogo && (
                <img src={fixture.awayTeamLogo} alt="" className="w-3.5 h-3.5 object-contain shrink-0 bg-white/90 rounded-[3px]" />
              )}
              <span className="text-[11px] sm:text-xs text-white/70 truncate max-w-[42%] sm:max-w-none">{fixture.awayTeamName}</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <WeatherMini
              temp={fixture.weatherTemp ?? null}
              desc={fixture.weatherDesc ?? ""}
              wind={fixture.weatherWind ?? null}
              icon={fixture.weatherIcon ?? null}
            />
            {signals.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-primary px-1 py-0.5 rounded border border-primary/18 bg-primary/[0.06]">
                <Zap className="w-2.5 h-2.5" />
                {signals.length}
              </span>
            )}
          </div>
        </div>

        {SPECIAL_STATUS_LABEL[fixture.statusShort ?? ""] ? (
          <div className="mt-1 pl-[2.75rem] sm:pl-12 text-[9px] font-mono text-amber-400/90">{SPECIAL_STATUS_LABEL[fixture.statusShort!]}</div>
        ) : hasPred && display.length > 0 ? (
          <div className="mt-1 pl-[2.75rem] sm:pl-12 flex flex-wrap gap-0.5">
            {display.map((m, i) => (
              <span
                key={`${m.market}-${m.side}-${i}`}
                className={cn(
                  "inline-flex items-center gap-0.5 max-w-[100%] rounded px-1 py-0.5 text-[9px] font-mono border truncate leading-tight",
                  marketPillClass(m.market),
                )}
                title={m.label}
              >
                <span className="truncate">{m.label}</span>
                <span className="tabular-nums font-semibold shrink-0 opacity-90">{m.probability}%</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function PreMatch() {
  const [selectedLeague, setSelectedLeague] = useState<number | "all">("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const tabsRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGetTodayFixtures({
    query: { queryKey: getGetTodayFixturesQueryKey(), staleTime: 60_000, gcTime: 5 * 60_000, refetchInterval: 3 * 60_000 },
  });

  const { data: predMarketsData } = useQuery<{ markets: Record<number, DerivedMarket[]> }>({
    queryKey: ["analysis", "prematch-predictions"],
    queryFn: async () => {
      const res = await fetch("/api/analysis/prematch-predictions");
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  const allMarkets = predMarketsData?.markets;

  const all: Fixture[] = (data?.leagues ?? []).flatMap((l) => l.fixtures);
  const prematch = all
    .filter(isPrematch)
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });

  const days: string[] = Array.from(
    new Set(prematch.map((f) => (f.kickoff ? dayKey(new Date(f.kickoff)) : null)).filter(Boolean) as string[]),
  ).sort();

  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : (days[0] ?? null);

  useEffect(() => {
    setSelectedLeague("all");
  }, [activeDay]);

  useScrollRestoration("pre-match", !isLoading && all.length > 0);

  const dayFixtures = activeDay ? prematch.filter((f) => f.kickoff && dayKey(new Date(f.kickoff)) === activeDay) : prematch;

  const byLeague = new Map<number, LeagueSection>();
  for (const f of dayFixtures) {
    if (!byLeague.has(f.leagueId)) {
      byLeague.set(f.leagueId, {
        leagueId: f.leagueId,
        leagueName: f.leagueName,
        leagueLogo: f.leagueLogo,
        fixtures: [],
      });
    }
    byLeague.get(f.leagueId)!.fixtures.push(f);
  }

  const leagues = Array.from(byLeague.values());
  const visibleLeagues = selectedLeague === "all" ? leagues : leagues.filter((l) => l.leagueId === selectedLeague);

  const marketSummary = useMemo(() => {
    let withPred = 0;
    if (!allMarkets) return { withPred: 0 };
    for (const f of dayFixtures) {
      const m = allMarkets[f.fixtureId];
      if (m?.length) withPred++;
    }
    return { withPred };
  }, [allMarkets, dayFixtures]);

  return (
    <Layout>
      <div className="space-y-4 max-w-6xl mx-auto">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-white">Pre-match</h1>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground leading-snug">
            All market types on each fixture. Filter by market to remove noise.
            {!isLoading && <span className="text-muted-foreground/60 ml-1">({marketSummary.withPred}/{dayFixtures.length})</span>}
          </p>
        </header>

        {!isLoading && days.length > 0 && (
          <div
            ref={tabsRef}
            className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
          >
            {days.map((d) => {
              const count = prematch.filter((f) => f.kickoff && dayKey(new Date(f.kickoff)) === d).length;
              const isActive = d === activeDay;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-md border text-[11px] font-mono font-semibold transition-colors",
                    isActive ? "bg-primary/15 border-primary/35 text-primary" : "bg-white/[0.03] border-white/10 text-white/45 hover:text-white/70",
                  )}
                >
                  {dayLabel(d)} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider shrink-0">
            <Filter className="w-3 h-3" />
            Markets
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTER_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMarketFilter(t.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-mono font-medium border transition-colors",
                  marketFilter === t.id
                    ? "bg-white/12 border-white/25 text-white"
                    : "bg-transparent border-white/10 text-muted-foreground hover:text-white/80 hover:border-white/15",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {leagues.length > 1 && (
            <div className="sm:ml-auto w-full sm:w-auto">
              <Select
                value={String(selectedLeague)}
                onValueChange={(v) => setSelectedLeague(v === "all" ? "all" : Number(v))}
              >
                <SelectTrigger className="h-9 w-full sm:w-[220px] bg-white/5 border-white/10 text-white text-xs font-mono rounded-md">
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
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Activity className="w-7 h-7 text-primary animate-pulse" />
          </div>
        ) : dayFixtures.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground opacity-30 mx-auto mb-2" />
            <h3 className="text-sm font-medium text-white mb-1">No upcoming fixtures</h3>
            <Link href="/live">
              <span className="text-xs font-mono text-primary hover:underline cursor-pointer">View live →</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleLeagues.map((league) => (
              <div key={league.leagueId}>
                <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-white/[0.07]">
                  <LeagueMark leagueId={league.leagueId} leagueLogo={league.leagueLogo} size="xs" />
                  <span className="text-[11px] font-semibold text-white/90 tracking-tight truncate font-sans">
                    {league.leagueName ?? `League ${league.leagueId}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground/80 ml-auto tabular-nums">{league.fixtures.length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {league.fixtures.map((fixture) => (
                    <CompactPreRow
                      key={fixture.fixtureId}
                      fixture={fixture}
                      markets={allMarkets?.[fixture.fixtureId] ?? []}
                      marketFilter={marketFilter}
                    />
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
