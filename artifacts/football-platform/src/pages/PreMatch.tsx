import { useGetTodayFixtures, useGetFixtureSignals, getGetTodayFixturesQueryKey } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, Zap, TrendingUp, Target, CloudRain, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLeagueLogo } from "@/lib/leagues";

function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE dd/MM");
}

const LIVE_STATUSES = new Set(["1H","HT","2H","ET","BT","P","INT","LIVE"]);
const POST_STATUSES = new Set(["FT","AET","PEN","ABD","CANC","AWD","WO"]);
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
  // Hide fixtures that are >2h past kickoff but still NS — stale status
  if (f.kickoff && new Date(f.kickoff).getTime() < Date.now() - 2 * 60 * 60 * 1000) return false;
  return true;
}

function kickoffLabel(kickoff: string | null | undefined): string {
  if (!kickoff) return "--:--";
  const d = new Date(kickoff);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `Today ${time}`;
  if (isTomorrow(d)) return `Tomorrow ${time}`;
  return format(d, "EE dd/MM HH:mm");
}

interface LeagueSection {
  leagueId: number;
  leagueName: string | null | undefined;
  leagueLogo: string | null | undefined;
  fixtures: Fixture[];
}

type StoredTip = {
  id: number;
  fixtureId: number;
  betType: string;
  betSide: string | null;
  recommendation: string;
  trustScore: number;
  aiProbability: number | null;
  impliedProbability: number | null;
  confidence: "high" | "medium" | "low" | null;
  edge: number | null;
  marketOdds: number | null;
  valueRating: string | null;
};

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" | null }) {
  if (!confidence) return null;
  const styles: Record<string, string> = {
    high: "text-teal-300 bg-teal-400/10 border-teal-400/30",
    medium: "text-violet-300 bg-violet-400/10 border-violet-400/25",
    low: "text-amber-400 bg-amber-400/10 border-amber-400/25",
  };
  const labels: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
  return (
    <span
      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${styles[confidence]}`}
      title="Data-derived confidence (edge realism, data completeness, odds stability, league accuracy)"
    >
      {labels[confidence]}
    </span>
  );
}

function WeatherMini({ temp, desc, wind, icon }: { temp: number | null; desc: string; wind: number | null; icon: string | null }) {
  const isAdverse = (wind ?? 0) > 10 ||
    desc.toLowerCase().includes("snow") || desc.toLowerCase().includes("blizzard") ||
    desc.toLowerCase().includes("heavy rain") || desc.toLowerCase().includes("thunderstorm") ||
    desc.toLowerCase().includes("hail") || (temp ?? 15) < -5 || (temp ?? 15) > 36;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
        isAdverse
          ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
          : "text-violet-300 bg-violet-400/10 border-violet-400/20"
      }`}
      title={`${desc} — ${Math.round(temp ?? 0)}°C, vind ${Math.round(wind ?? 0)} m/s`}
    >
      {icon
        ? <img src={`https://openweathermap.org/img/wn/${icon}.png`} className="w-3.5 h-3.5 object-contain" alt="" />
        : <CloudRain className="w-3 h-3" />
      }
      {Math.round(temp ?? 0)}°
      {isAdverse && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
    </span>
  );
}

function ValueBadge({ rating }: { rating: string | null }) {
  if (!rating || rating === "overpriced") return null;
  const styles: Record<string, string> = {
    strong_value: "text-primary bg-primary/10 border border-primary/20",
    value: "text-teal-400 bg-teal-400/10 border border-teal-400/20",
    fair: "text-violet-400 bg-violet-400/10 border border-violet-400/20",
  };
  const labels: Record<string, string> = {
    strong_value: "Strong Value",
    value: "Value",
    fair: "Fair",
  };
  const cls = styles[rating];
  if (!cls) return null;
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${cls}`}>
      {labels[rating]}
    </span>
  );
}

function TipPreview({ fixtureId, allTips }: { fixtureId: number; allTips: Record<number, StoredTip[]> | undefined }) {
  const tips = allTips?.[fixtureId] ?? [];
  const matchTip = tips.find((t) => t.betType === "match_result") ?? tips[0];
  if (!matchTip) return null;

  const aiPct = matchTip.aiProbability != null ? Math.round(matchTip.aiProbability * 100) : null;
  const impliedFromOdds = matchTip.marketOdds != null && matchTip.marketOdds > 1 ? 1 / matchTip.marketOdds : null;
  const impliedProb = matchTip.impliedProbability ?? impliedFromOdds;
  const implPct = impliedProb != null ? Math.round(impliedProb * 100) : null;
  const edgePp = matchTip.aiProbability != null && impliedProb != null
    ? (matchTip.aiProbability - impliedProb) * 100
    : null;

  return (
    <div className="border-t border-white/5 pt-2.5 mt-1 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[11px] font-mono font-semibold text-white/80 truncate">
            {matchTip.recommendation}
            {matchTip.marketOdds ? ` · ${matchTip.marketOdds.toFixed(2)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {edgePp != null ? (
            <span
              className={`text-[10px] font-mono font-bold tabular-nums ${
                edgePp >= 15 ? "text-teal-300" :
                edgePp >= 5 ? "text-teal-400" :
                edgePp >= -5 ? "text-violet-400" :
                "text-amber-400"
              }`}
              title="Edge in percentage points (model probability − implied probability)"
            >
              {edgePp >= 0 ? "+" : ""}{edgePp.toFixed(1)}pp
            </span>
          ) : null}
          <ConfidenceBadge confidence={matchTip.confidence} />
          <ValueBadge rating={matchTip.valueRating} />
        </div>
      </div>
      {(aiPct != null || implPct != null) && (
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground pl-5">
          {aiPct != null && <span>AI <span className="text-white/80 tabular-nums">{aiPct}%</span></span>}
          {implPct != null && <span>Market <span className="text-white/60 tabular-nums">{implPct}%</span></span>}
        </div>
      )}
    </div>
  );
}

function PreMatchCard({ fixture, allTips }: { fixture: Fixture; allTips: Record<number, StoredTip[]> | undefined }) {
  const { data: signalData } = useGetFixtureSignals(
    fixture.fixtureId,
    { phase: "pre" },
    { query: { queryKey: ["signals", fixture.fixtureId, "pre"], staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 } }
  );
  const signals = signalData?.signals ?? [];

  const hasTip = !!(allTips?.[fixture.fixtureId]?.length);
  const borderClass = signals.length >= 4
    ? "border-primary/40 shadow-[0_0_20px_rgba(0,255,200,0.06)]"
    : signals.length >= 2
    ? "border-amber-400/25"
    : hasTip
    ? "border-violet-400/20"
    : "border-white/6";

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className={`glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border ${borderClass} group`}>
        <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded font-mono">
              <Clock className="w-3 h-3 shrink-0" />
              {kickoffLabel(fixture.kickoff)}
            </span>
            <WeatherMini
              temp={fixture.weatherTemp ?? null}
              desc={fixture.weatherDesc ?? "Weather pending"}
              wind={fixture.weatherWind ?? null}
              icon={fixture.weatherIcon ?? null}
            />
          </div>
          {SPECIAL_STATUS_LABEL[fixture.statusShort ?? ""] ? (
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded">
              {SPECIAL_STATUS_LABEL[fixture.statusShort!]}
            </span>
          ) : signals.length > 0 ? (
            <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded ${
              signals.length >= 4
                ? "text-primary bg-primary/10 border border-primary/20"
                : signals.length >= 2
                ? "text-amber-400 bg-amber-400/10 border border-amber-400/20"
                : "text-violet-400 bg-violet-400/10 border border-violet-400/20"
            }`}>
              <Zap className="w-3 h-3" />
              {signals.length} {signals.length === 1 ? "signal" : "signals"}
            </span>
          ) : null}
        </div>

        <div className="space-y-2.5 mb-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.homeTeamLogo && (
                <img src={fixture.homeTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0 bg-white/90 rounded p-0.5" />
              )}
              <span className="font-semibold text-white truncate text-sm">{fixture.homeTeamName}</span>
            </div>
            <span className="font-mono text-base font-bold text-muted-foreground/40 shrink-0">vs</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.awayTeamLogo && (
                <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0 bg-white/90 rounded p-0.5" />
              )}
              <span className="font-medium text-white/50 truncate text-sm">{fixture.awayTeamName}</span>
            </div>
          </div>
        </div>

        <TipPreview fixtureId={fixture.fixtureId} allTips={allTips} />

        {signals.length > 0 && (
          <div className="border-t border-white/5 pt-3 mt-2.5 space-y-1">
            {signals.slice(0, 2).map((s) => (
              <div key={s.id} className="text-[11px] text-muted-foreground font-mono truncate">
                · {s.signalLabel}
              </div>
            ))}
            {signals.length > 2 && (
              <div className="text-[11px] text-muted-foreground/40 font-mono">
                +{signals.length - 2} more...
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function PreMatch() {
  const [selectedLeague, setSelectedLeague] = useState<number | "all">("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGetTodayFixtures({
    query: { queryKey: getGetTodayFixturesQueryKey(), staleTime: 60_000, gcTime: 5 * 60_000, refetchInterval: 3 * 60_000 },
  });

  const { data: tipsData } = useQuery<{ tips: Record<number, StoredTip[]> }>({
    queryKey: ["analysis", "prematch-tips"],
    queryFn: async () => {
      const res = await fetch("/api/analysis/prematch-tips");
      if (!res.ok) throw new Error("Failed to fetch tips");
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  const all: Fixture[] = (data?.leagues ?? []).flatMap((l) => l.fixtures);
  const prematch = all
    .filter(isPrematch)
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });

  // Compute unique days from all prematch fixtures (local timezone)
  const days: string[] = Array.from(
    new Set(prematch.map((f) => f.kickoff ? dayKey(new Date(f.kickoff)) : null).filter(Boolean) as string[])
  ).sort();

  // Default to first available day
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : (days[0] ?? null);

  // Reset league filter when day changes
  useEffect(() => { setSelectedLeague("all"); }, [activeDay]);

  useScrollRestoration("pre-match", !isLoading && all.length > 0);

  // Filter by selected day
  const dayFixtures = activeDay
    ? prematch.filter((f) => f.kickoff && dayKey(new Date(f.kickoff)) === activeDay)
    : prematch;

  // Group by league
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


  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-3 mb-1">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">PRE-MATCH</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Upcoming fixtures with algorithm tips — Match Result (form-filtered), BTTS &amp; Asian Handicap. <a href="/performance" className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors text-xs font-mono">View backtest →</a>
          </p>
        </header>

        {/* Day tabs */}
        {!isLoading && days.length > 0 && (
          <div
            ref={tabsRef}
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4"
            style={{ scrollbarWidth: "none" }}
          >
            {days.map((d) => {
              const count = prematch.filter((f) => f.kickoff && dayKey(new Date(f.kickoff)) === d).length;
              const isActive = d === activeDay;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`shrink-0 flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg border text-xs font-mono font-bold transition-colors ${
                    isActive
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-white/3 border-white/8 text-white/50 hover:text-white/80 hover:bg-white/5"
                  }`}
                >
                  <span>{dayLabel(d)}</span>
                  <span className={`text-[10px] font-normal tabular-nums ${isActive ? "text-primary/70" : "text-white/30"}`}>
                    {count} fixtures
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* League filter */}
        {leagues.length > 1 && (
          <Select
            value={String(selectedLeague)}
            onValueChange={(v) => setSelectedLeague(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="w-auto min-w-[200px] bg-white/5 border-white/10 text-white text-sm font-mono rounded-lg focus:ring-primary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0f0f1a] border-white/10 text-white font-mono">
              <SelectItem value="all" className="text-white focus:bg-white/10 focus:text-white">
                🌍 All Leagues ({leagues.length})
              </SelectItem>
              {leagues
                .slice()
                .sort((a, b) => (a.leagueName ?? "").localeCompare(b.leagueName ?? ""))
                .map((l) => (
                  <SelectItem key={l.leagueId} value={String(l.leagueId)} className="text-white focus:bg-white/10 focus:text-white">
                    <span className="inline-flex items-center gap-2">
                      <img src={getLeagueLogo(l.leagueId)} alt="" className="w-4 h-4 object-contain shrink-0 bg-white/90 rounded p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      {l.leagueName ?? `League ${l.leagueId}`} ({l.fixtures.length})
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
        ) : dayFixtures.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center gap-4">
            <Clock className="w-10 h-10 text-muted-foreground opacity-30" />
            <div>
              <h3 className="text-lg font-medium text-white mb-1">No upcoming fixtures</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Fixtures in tracked leagues are either live or finished.
              </p>
              <Link href="/live">
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-mono font-semibold hover:bg-primary/20 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  View live matches
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {visibleLeagues.map((league) => (
              <div key={league.leagueId} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-white/8">
                  {league.leagueLogo && (
                    <img src={league.leagueLogo} alt="" className="w-5 h-5 object-contain bg-white/90 rounded p-0.5" />
                  )}
                  <span className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    {league.leagueName ?? `League ${league.leagueId}`}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    {league.fixtures.length} {league.fixtures.length === 1 ? "fixture" : "fixtures"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {league.fixtures.map((fixture) => (
                    <PreMatchCard key={fixture.fixtureId} fixture={fixture} allTips={tipsData?.tips} />
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