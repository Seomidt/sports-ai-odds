import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Newspaper, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

const LEAGUES = [
  { id: 39,  name: "Premier League",   flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 140, name: "La Liga",          flag: "🇪🇸" },
  { id: 135, name: "Serie A",          flag: "🇮🇹" },
  { id: 78,  name: "Bundesliga",       flag: "🇩🇪" },
  { id: 2,   name: "Champions League", flag: "⭐" },
];

interface NewsArticle {
  id: string;
  teamId: number;
  teamName: string;
  teamLogo: string | null;
  rank: number;
  headline: string;
  body: string;
  fixtureLine: string;
  homeGoals: number | null;
  awayGoals: number | null;
  opponent: string;
  result: "win" | "draw" | "loss" | "upcoming";
  kickoff: string | null;
}

interface NewsResponse {
  articles: NewsArticle[];
  generatedAt: string;
  message?: string;
}

function ResultBadge({ result }: { result: NewsArticle["result"] }) {
  const styles = {
    win:      "text-primary bg-primary/10 border-primary/25",
    draw:     "text-amber-400 bg-amber-400/10 border-amber-400/25",
    loss:     "text-destructive bg-destructive/10 border-destructive/25",
    upcoming: "text-violet-400 bg-violet-400/10 border-violet-400/25",
  };
  const labels = { win: "WIN", draw: "DRAW", loss: "LOSS", upcoming: "NEXT" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${styles[result]}`}>
      {labels[result]}
    </span>
  );
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-4 h-4 text-amber-400" />;
  if (rank === 2) return <TrendingUp className="w-4 h-4 text-primary" />;
  return <Minus className="w-4 h-4 text-violet-400" />;
}

function NewsCard({ article, leagueName }: { article: NewsArticle; leagueName: string }) {
  const dateStr = article.kickoff
    ? format(new Date(article.kickoff), "d MMM")
    : null;

  const rankBg =
    article.rank === 1
      ? "from-amber-400/5 to-transparent border-amber-400/20"
      : article.rank === 2
      ? "from-primary/5 to-transparent border-primary/15"
      : "from-violet-400/5 to-transparent border-violet-400/15";

  return (
    <div className={`glass-card rounded-xl overflow-hidden border bg-gradient-to-br ${rankBg}`}>
      <div className="p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="relative shrink-0">
            {article.teamLogo ? (
              <img
                src={article.teamLogo}
                alt={article.teamName}
                className="w-14 h-14 object-contain rounded-lg bg-white/5 p-1.5"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center">
                <Newspaper className="w-6 h-6 text-muted-foreground/40" />
              </div>
            )}
            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-white/10 flex items-center justify-center">
              <RankIcon rank={article.rank} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                #{article.rank} · {leagueName}
              </span>
              {dateStr && (
                <span className="text-[10px] font-mono text-muted-foreground/40">{dateStr}</span>
              )}
            </div>
            <h2 className="text-base font-bold text-white leading-tight mb-2">
              {article.headline}
            </h2>
            <div className="flex items-center gap-2">
              <ResultBadge result={article.result} />
              {article.fixtureLine && (
                <span className="text-xs font-mono text-muted-foreground/60 truncate">
                  {article.fixtureLine}
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed border-t border-white/5 pt-4">
          {article.body}
        </p>
      </div>
    </div>
  );
}

export function News() {
  const [activeLeague, setActiveLeague] = useState(LEAGUES[0]!);

  const { data, isLoading, isError, refetch } = useQuery<NewsResponse>({
    queryKey: ["news", activeLeague.id],
    queryFn: async () => {
      const res = await fetch(`/api/news?leagueId=${activeLeague.id}`);
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
  });

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-3 mb-1">
            <Newspaper className="w-5 h-5 text-violet-400" />
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">NEWS</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            AI-generated match reports for top teams · powered by recent results
          </p>
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

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground font-mono">Generating news...</p>
          </div>
        ) : isError ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center gap-4">
            <Newspaper className="w-10 h-10 text-muted-foreground opacity-30" />
            <div>
              <h3 className="text-lg font-medium text-white mb-1">Could not load news</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Not enough match data available yet for this league.
              </p>
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 text-primary border border-primary/30 text-sm font-mono font-semibold hover:bg-primary/20 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : !data?.articles?.length ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center gap-4">
            <Newspaper className="w-10 h-10 text-muted-foreground opacity-30" />
            <div>
              <h3 className="text-lg font-medium text-white mb-1">No news available</h3>
              <p className="text-muted-foreground text-sm">
                Standings or recent match data is not yet synced for this league.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.articles.map((article) => (
                <NewsCard key={article.id} article={article} leagueName={activeLeague.name} />
              ))}
            </div>
            {data.generatedAt && (
              <p className="text-[11px] text-muted-foreground/40 font-mono text-right">
                Generated {format(new Date(data.generatedAt), "HH:mm 'on' d MMM")} · Refreshes hourly
              </p>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
