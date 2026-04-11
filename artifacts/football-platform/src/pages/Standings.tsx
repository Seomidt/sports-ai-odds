import { useState } from "react";
import { useGetStandings } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

const LEAGUES = [
  { id: 39,  name: "Premier League",   flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", season: 2024 },
  { id: 140, name: "La Liga",          flag: "🇪🇸", season: 2024 },
  { id: 135, name: "Serie A",          flag: "🇮🇹", season: 2024 },
  { id: 78,  name: "Bundesliga",       flag: "🇩🇪", season: 2024 },
  { id: 2,   name: "Champions League", flag: "⭐", season: 2024 },
];

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

function StandingsTable({ leagueId, season }: { leagueId: number; season: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetStandings(leagueId, {
    query: { staleTime: 10 * 60_000, gcTime: 30 * 60_000, refetchInterval: 15 * 60_000 } as any,
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
        <p className="text-sm">Stillinger endnu ikke synkroniseret</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            <th className="text-left py-3 pl-4 pr-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-8">#</th>
            <th className="text-left py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest">Hold</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-8">K</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-8">V</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-8">U</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-8">T</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-12">MF</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-12">MM</th>
            <th className="text-center py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-10">+/-</th>
            <th className="text-left py-3 px-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest">Form</th>
            <th className="text-center py-3 pr-4 pl-2 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-widest w-12">Pts</th>
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
          Champions League
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
          <div className="w-3 h-3 rounded-sm bg-amber-400/20 border border-amber-400/40" />
          Europa League
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
          <div className="w-3 h-3 rounded-sm bg-destructive/20 border border-destructive/40" />
          Nedrykning
        </div>
      </div>
    </div>
  );
}

export function Standings() {
  const [activeLeague, setActiveLeague] = useState(LEAGUES[0]!);

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-1">
            STILLINGER
          </h1>
          <p className="text-muted-foreground text-sm">Live tabeller for overvågede turneringer · opdateres hvert 15. min</p>
        </header>

        <div className="flex flex-wrap gap-2">
          {LEAGUES.map((league) => (
            <button
              key={league.id}
              onClick={() => setActiveLeague(league)}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold tracking-wider uppercase transition-all border ${
                activeLeague.id === league.id
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-black/20 text-muted-foreground border-white/10 hover:text-white hover:border-white/20"
              }`}
            >
              {league.flag} {league.name}
            </button>
          ))}
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          <StandingsTable key={activeLeague.id} leagueId={activeLeague.id} season={activeLeague.season} />
        </div>
      </div>
    </Layout>
  );
}
