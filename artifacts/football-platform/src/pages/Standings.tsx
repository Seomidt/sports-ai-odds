import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetStandings, getGetStandingsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity, TrendingUp, TrendingDown, Minus, Search, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const LEAGUE_LOGO = (id: number) => `https://media.api-sports.io/football/leagues/${id}.png`;

interface LeagueEntry {
  leagueId: number;
  leagueName: string;
  season: string;
  teams: string;
}

function FormBadge({ char }: { char: string }) {
  const color =
    char === "W" ? "text-primary bg-primary/15 border-primary/30" :
    char === "L" ? "text-destructive bg-destructive/15 border-destructive/30" :
    "text-amber-400 bg-amber-400/15 border-amber-400/30";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold font-mono border ${color}`}>
      {char}
    </span>
  );
}

function TrendIcon({ diff }: { diff: number }) {
  if (diff > 0) return <TrendingUp className="w-3 h-3 text-primary" />;
  if (diff < 0) return <TrendingDown className="w-3 h-3 text-destructive" />;
  return <Minus className="w-3 h-3 text-muted-foreground/40" />;
}

function StandingsTable({ leagueId }: { leagueId: number }) {
  const { data, isLoading } = useGetStandings(leagueId, {
    query: { queryKey: getGetStandingsQueryKey(leagueId), staleTime: 10 * 60_000, gcTime: 30 * 60_000, refetchInterval: 15 * 60_000 },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-6 h-6 text-primary animate-pulse" />
      </div>
    );
  }

  const rows = data?.standings ?? [];

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground font-mono gap-3">
        <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        <p className="text-sm">Standings not yet synchronized</p>
      </div>
    );
  }

  const COL_TIPS: Record<string, string> = {
    P: "Played — total matches played",
    W: "Won — matches won",
    D: "Drawn — matches drawn",
    L: "Lost — matches lost",
    GF: "Goals For — goals scored",
    GA: "Goals Against — goals conceded",
    "+/-": "Goal Difference (GF minus GA)",
    FORM: "Last 5 results: W=Win, D=Draw, L=Loss (most recent first)",
    PTS: "Points (Win=3, Draw=1, Loss=0)",
  };

  function ColTh({ label, align = "center", className = "" }: { label: string; align?: "left" | "center" | "right"; className?: string }) {
    return (
      <th className={`text-${align} py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest ${className}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help border-b border-dashed border-muted-foreground/30">{label}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-mono max-w-48">
            {COL_TIPS[label] ?? label}
          </TooltipContent>
        </Tooltip>
      </th>
    );
  }

  return (
    <TooltipProvider>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            <th className="text-left py-3 pl-4 pr-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-8">#</th>
            <th className="text-left py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest">Team</th>
            <ColTh label="P" className="w-8" />
            <ColTh label="W" className="w-8" />
            <ColTh label="D" className="w-8" />
            <ColTh label="L" className="w-8" />
            <ColTh label="GF" className="w-12" />
            <ColTh label="GA" className="w-12" />
            <ColTh label="+/-" className="w-10" />
            <ColTh label="FORM" align="left" />
            <ColTh label="PTS" className="w-12" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rank = row.rank ?? 0;
            const isTop4 = rank <= 4;
            const isTop6 = rank <= 6 && rank > 4;
            const isBottom3 = rank > rows.length - 3;
            const formChars = (row.form ?? "").slice(-5).split("").reverse();

            const rankBorderColor = isTop4
              ? "border-l-2 border-l-primary/60"
              : isTop6
              ? "border-l-2 border-l-amber-400/50"
              : isBottom3
              ? "border-l-2 border-l-destructive/50"
              : "border-l-2 border-l-transparent";

            return (
              <tr
                key={row.teamId}
                className={`border-b border-white/4 hover:bg-white/3 transition-colors ${rankBorderColor} ${idx === 0 ? "bg-primary/3" : ""}`}
              >
                <td className="py-3 pl-4 pr-2">
                  <span className="font-mono text-sm font-semibold text-muted-foreground/70">{rank}</span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {row.teamLogo && (
                      <img src={row.teamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
                    )}
                    <span className="font-medium text-white truncate max-w-[130px]">{row.teamName}</span>
                    <TrendIcon diff={row.goalsDiff ?? 0} />
                  </div>
                </td>
                <td className="py-3 px-2 text-center font-mono text-muted-foreground/80 text-xs">{row.played}</td>
                <td className="py-3 px-2 text-center font-mono text-xs text-primary/80">{row.won}</td>
                <td className="py-3 px-2 text-center font-mono text-xs text-amber-400/70">{row.drawn}</td>
                <td className="py-3 px-2 text-center font-mono text-xs text-destructive/70">{row.lost}</td>
                <td className="py-3 px-2 text-center font-mono text-xs text-muted-foreground/70">{row.goalsFor}</td>
                <td className="py-3 px-2 text-center font-mono text-xs text-muted-foreground/70">{row.goalsAgainst}</td>
                <td className="py-3 px-2 text-center font-mono text-xs">
                  <span className={(row.goalsDiff ?? 0) > 0 ? "text-primary/80" : (row.goalsDiff ?? 0) < 0 ? "text-destructive/70" : "text-muted-foreground/50"}>
                    {(row.goalsDiff ?? 0) > 0 ? "+" : ""}{row.goalsDiff}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex gap-1">
                    {formChars.map((c, i) => <FormBadge key={i} char={c} />)}
                  </div>
                </td>
                <td className="py-3 pr-4 pl-2 text-center">
                  <span className="font-mono font-bold text-sm text-white">{row.points}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex gap-6 px-4 py-3 border-t border-white/6 mt-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
          <div className="w-3 h-3 rounded-sm bg-primary/30 border border-primary/50" />
          UCL / Top
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
          <div className="w-3 h-3 rounded-sm bg-amber-400/20 border border-amber-400/40" />
          Europe
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
          <div className="w-3 h-3 rounded-sm bg-destructive/20 border border-destructive/40" />
          Relegation
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

export function Standings() {
  const [activeLeagueId, setActiveLeagueId] = useState<number>(39);
  const [activeLeagueName, setActiveLeagueName] = useState<string>("Premier League");
  const [search, setSearch] = useState("");

  const { data: leaguesData, isLoading: leaguesLoading } = useQuery<{ leagues: LeagueEntry[] }>({
    queryKey: ["standings-leagues"],
    queryFn: () => fetch(`${BASE}/api/standings/leagues`).then(r => r.json()),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const leagues = leaguesData?.leagues ?? [];
  const filtered = leagues.filter(l =>
    l.leagueName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-1">
            STANDINGS
          </h1>
          <p className="text-muted-foreground text-sm">
            Live tables for all tracked leagues · {leagues.length} leagues · updates every 15 min
          </p>
        </header>

        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search leagues..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-muted-foreground/40 font-mono focus:outline-none focus:border-primary/40"
            />
          </div>

          {leaguesLoading ? (
            <div className="flex justify-center py-4">
              <Activity className="w-5 h-5 text-primary animate-pulse" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filtered.map(league => (
                <button
                  key={league.leagueId}
                  onClick={() => { setActiveLeagueId(league.leagueId); setActiveLeagueName(league.leagueName); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all border ${
                    activeLeagueId === league.leagueId
                      ? "bg-primary/20 border-primary/40 text-white"
                      : "bg-black/20 border-white/8 text-muted-foreground hover:text-white hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <img
                    src={LEAGUE_LOGO(league.leagueId)}
                    alt=""
                    className="w-5 h-5 object-contain shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="text-xs font-mono font-semibold truncate leading-tight">{league.leagueName}</span>
                </button>
              ))}
              {filtered.length === 0 && !leaguesLoading && (
                <p className="col-span-full text-center text-xs text-muted-foreground/50 font-mono py-4">
                  No leagues found
                </p>
              )}
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/6">
            <img
              src={LEAGUE_LOGO(activeLeagueId)}
              alt=""
              className="w-6 h-6 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="font-mono font-bold text-sm text-white tracking-wide">{activeLeagueName}</span>
          </div>
          <StandingsTable key={activeLeagueId} leagueId={activeLeagueId} />
        </div>
      </div>
    </Layout>
  );
}
