import { useGetTodayFixtures } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, CheckCircle2, Zap } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
// PST (Postponed) and SUSP (Suspended) treated as finished — never show in prematch
const POST_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "CANC", "AWD", "WO", "PST", "SUSP"]);

type Phase = "live" | "prematch" | "postmatch";

function getPhase(statusShort: string | null | undefined): Phase {
  if (!statusShort || statusShort === "NS" || statusShort === "TBD") return "prematch";
  if (LIVE_STATUSES.has(statusShort)) return "live";
  if (POST_STATUSES.has(statusShort)) return "postmatch";
  return "prematch";
}

const STATUS_LABEL: Record<string, string> = {
  NS: "Upcoming", TBD: "TBD",
  "1H": "1st Half", HT: "Half Time", "2H": "2nd Half",
  ET: "Extra Time", BT: "Break", P: "Penalties",
  SUSP: "Suspended", INT: "Interrupted", LIVE: "Live",
  FT: "Full Time", AET: "AET", PEN: "Penalties",
  ABD: "Abandoned", CANC: "Cancelled", AWD: "Awarded", WO: "Walkover",
  PST: "Postponed",
};

function LiveBadge({ elapsed }: { elapsed?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
      {elapsed != null ? `${elapsed}'` : "LIVE"}
    </span>
  );
}

function PrematchBadge({ kickoff }: { kickoff?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded font-mono">
      <Clock className="w-3 h-3 shrink-0" />
      {kickoff ? format(new Date(kickoff), "HH:mm") : "--:--"}
    </span>
  );
}

function PostMatchBadge({ statusShort }: { statusShort?: string | null }) {
  const isCancelled = statusShort === "PST" || statusShort === "CANC" || statusShort === "ABD";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded font-mono ${
      isCancelled ? "text-amber-400 bg-amber-400/10" : "text-muted-foreground bg-white/5"
    }`}>
      <CheckCircle2 className="w-3 h-3 shrink-0" />
      {STATUS_LABEL[statusShort ?? ""] ?? statusShort ?? "FT"}
    </span>
  );
}

function FixtureCard({ fixture }: { fixture: Fixture }) {
  const phase = getPhase(fixture.statusShort);

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div
        className={`glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border ${
          phase === "live"
            ? "border-primary/40 shadow-[0_0_12px_rgba(0,255,200,0.06)]"
            : phase === "prematch"
            ? "border-amber-400/15"
            : "border-white/5"
        }`}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            {phase === "live" && <LiveBadge elapsed={fixture.statusElapsed} />}
            {phase === "prematch" && <PrematchBadge kickoff={fixture.kickoff} />}
            {phase === "postmatch" && <PostMatchBadge statusShort={fixture.statusShort} />}
          </div>
          {fixture.leagueName && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              {fixture.leagueLogo && (
                <img src={fixture.leagueLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
              )}
              <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[90px]">
                {fixture.leagueName}
              </span>
            </div>
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
            <span className={`font-mono text-lg font-bold shrink-0 ${phase === "live" ? "text-primary" : "text-white"}`}>
              {fixture.homeGoals ?? (phase === "postmatch" ? "0" : "-")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {fixture.awayTeamLogo && (
                <img src={fixture.awayTeamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
              )}
              <span className="font-medium text-white truncate text-sm">{fixture.awayTeamName}</span>
            </div>
            <span className={`font-mono text-lg font-bold shrink-0 ${phase === "live" ? "text-primary" : "text-white"}`}>
              {fixture.awayGoals ?? (phase === "postmatch" ? "0" : "-")}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

interface LeagueSection {
  leagueId: number;
  leagueName: string | null | undefined;
  leagueLogo: string | null | undefined;
  fixtures: Fixture[];
}

function FixtureGrid({ fixtures }: { fixtures: Fixture[] }) {
  const byLeague = new Map<number, LeagueSection>();
  for (const f of fixtures) {
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

  return (
    <div className="space-y-8">
      {Array.from(byLeague.values()).map((league) => (
        <div key={league.leagueId}>
          <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-white/10">
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
            {league.fixtures.map((f) => (
              <FixtureCard key={f.fixtureId} fixture={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Tab = "live" | "prematch" | "postmatch";

interface TabDef {
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: "live", label: "LIVE", Icon: Zap },
  { id: "prematch", label: "PREMATCH", Icon: Clock },
  { id: "postmatch", label: "FINISHED", Icon: CheckCircle2 },
];

function EmptyState({ phase }: { phase: Tab }) {
  const messages: Record<Tab, { title: string; sub: string }> = {
    live: { title: "No live matches", sub: "There are no matches in play right now." },
    prematch: { title: "No upcoming fixtures", sub: "No scheduled fixtures in the current window." },
    postmatch: { title: "No finished fixtures", sub: "No matches have been completed yet today." },
  };
  const msg = messages[phase];
  return (
    <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
      <Activity className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
      <h3 className="text-base font-semibold text-white mb-1">{msg.title}</h3>
      <p className="text-sm text-muted-foreground">{msg.sub}</p>
    </div>
  );
}

export function Fixtures() {
  const { data, isLoading } = useGetTodayFixtures({
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchInterval: (query) => {
      const fixtures = (query.state.data?.leagues ?? []).flatMap((l) => l.fixtures);
      const hasLive = fixtures.some((f) => LIVE_STATUSES.has(f.statusShort ?? ""));
      return hasLive ? 15_000 : 3 * 60_000;
    },
    refetchIntervalInBackground: true,
  });
  const [activeTab, setActiveTab] = useState<Tab>("live");
  const [liveLeagueFilter, setLiveLeagueFilter] = useState<string>("all");

  const allFixtures: Fixture[] = (data?.leagues ?? []).flatMap((league) => league.fixtures);

  const sorted = [...allFixtures].sort((a, b) => {
    const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return ta - tb;
  });

  const allLive = sorted.filter((f) => getPhase(f.statusShort) === "live");

  // Unique leagues present in live fixtures — for the dropdown
  const liveLeagues = Array.from(
    new Map(allLive.map((f) => [f.leagueId, { id: f.leagueId, name: f.leagueName }])).values()
  );

  const filteredLive =
    liveLeagueFilter === "all"
      ? allLive
      : allLive.filter((f) => String(f.leagueId) === liveLeagueFilter);

  const byPhase: Record<Tab, Fixture[]> = {
    live: filteredLive,
    prematch: sorted.filter((f) => getPhase(f.statusShort) === "prematch"),
    postmatch: sorted.filter((f) => getPhase(f.statusShort) === "postmatch"),
  };

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-1">FIXTURES</h1>
          <p className="text-muted-foreground text-sm">Pre-match · Live · Finished — updates automatically.</p>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : (
          <>
            <div className="flex gap-0 border-b border-white/10">
              {TABS.map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                const count = byPhase[id].length;

                const accentClass =
                  id === "live"
                    ? isActive
                      ? "text-primary border-primary"
                      : "text-primary/50 border-transparent hover:border-primary/30"
                    : id === "prematch"
                    ? isActive
                      ? "text-amber-400 border-amber-400"
                      : "text-amber-400/50 border-transparent hover:border-amber-400/30"
                    : isActive
                    ? "text-white border-white/60"
                    : "text-muted-foreground border-transparent hover:border-white/20";

                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-mono font-medium border-b-2 transition-colors ${accentClass}`}
                  >
                    {id === "live" && count > 0 ? (
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {label}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                        isA