import { useGetTodayFixtures, useGetFixtureSignals, getGetTodayFixturesQueryKey } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, Zap, TrendingUp, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const LIVE_STATUSES = new Set(["1H","HT","2H","ET","BT","P","INT","LIVE"]);
const POST_STATUSES = new Set(["FT","AET","PEN","ABD","CANC","AWD","WO"]);

function isPrematch(f: Fixture) {
  const s = f.statusShort ?? "";
  return !LIVE_STATUSES.has(s) && !POST_STATUSES.has(s);
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
  marketOdds: number | null;
  valueRating: string | null;
};

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

  return (
    <div className="border-t border-white/5 pt-2.5 mt-1 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Target className="w-3 h-3 text-primary shrink-0" />
        <span className="text-[11px] font-mono font-semibold text-white/80 truncate">
          {matchTip.recommendation}
          {matchTip.marketOdds ? ` · ${matchTip.marketOdds.toFixed(2)}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground/50">
          T{matchTip.trustScore}/10
        </span>
        <ValueBadge rating={matchTip.valueRating} />
      </div>
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
        <div className="flex justify-between items-center mb-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded font-mono">
            <Clock className="w-3 h-3 shrink-0" />
            {kickoffLabel(fixture.kickoff)}
          </span>
          {signals.length > 0 ? (
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
          ) : (
            <span className="text-xs font-mono text-muted-foreground/30 bg-white/3 px-2 py-0.5 rounded">
              no signals
            </span>
          )}
        </div>

        <div className="space-y-2.5 mb-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.homeTeamLogo && (
                <img src={fixture.homeTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
              )}
              <span className="font-semibold text-white truncate text-sm">{fixture.homeTeamName}</span>
            </div>
            <span className="font-mono text-base font-bold text-muted-foreground/40 shrink-0">vs</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.awayTeamLogo && (
                <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
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

  const byLeague = new Map<number, LeagueSection>();
  for (const f of prematch) {
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

  const totalWithTips = prematch.filter((f) => tipsData?.tips?.[f.fixtureId]?.length).length;

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <div className="flex items-center gap-3 mb-1">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">PRE-MATCH</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            All upcoming fixtures with pre-match analysis and signals.
            {totalWithTips > 0 && (
              <span className="ml-2 text-primary/70 font-mono">{totalWithTips} with AI picks</span>
            )}
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : prematch.length === 0 ? (
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
            {Array.from(byLeague.values()).map((league) => (
              <div key={league.leagueId} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-white/8">
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
