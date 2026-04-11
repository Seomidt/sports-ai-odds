import { useGetTopPickFixtures, useGetFixtureSignals } from "@workspace/api-client-react";
import type { TopPickFixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, TrendingUp, Zap, Target, ChevronRight } from "lucide-react";

function kickoffLabel(kickoff: string | null | undefined): string {
  if (!kickoff) return "--:--";
  const d = new Date(kickoff);
  const time = format(d, "HH:mm");
  if (isToday(d)) return time;
  if (isTomorrow(d)) return `i morgen ${time}`;
  return format(d, "dd/MM HH:mm");
}

function SignalBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count === 0) {
    if (compact) return null;
    return (
      <span className="text-xs font-mono text-muted-foreground/30 bg-white/4 px-2 py-0.5 rounded">
        ingen signaler
      </span>
    );
  }
  const color =
    count >= 4
      ? "text-primary bg-primary/10 border border-primary/20"
      : count >= 2
      ? "text-amber-400 bg-amber-400/10 border border-amber-400/20"
      : "text-violet-400 bg-violet-400/10 border border-violet-400/20";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded ${color}`}>
      <Zap className="w-3 h-3" />
      {count}
    </span>
  );
}

function TopPickCard({ fixture, rank }: { fixture: TopPickFixture; rank: number }) {
  const { data: signalData } = useGetFixtureSignals(
    fixture.fixtureId,
    { phase: "pre" },
    { query: { queryKey: ["signals", fixture.fixtureId, "pre"], staleTime: 5 * 60 * 1000 } }
  );
  const signals = signalData?.signals ?? [];
  const count = fixture.signalCount;

  const borderClass =
    count >= 4
      ? "border-primary/40 shadow-[0_0_24px_rgba(0,255,200,0.07)]"
      : count >= 2
      ? "border-amber-400/30"
      : "border-white/8";

  const rankColor =
    rank === 1 ? "text-primary" : rank === 2 ? "text-amber-400" : "text-violet-400";

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className={`glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border ${borderClass} group`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-bold ${rankColor} opacity-60`}>#{rank}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-mono">
              <Clock className="w-3 h-3" />
              {kickoffLabel(fixture.kickoff)}
            </span>
          </div>
          <SignalBadge count={count} />
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {fixture.homeTeamLogo && (
              <img src={fixture.homeTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className="font-semibold text-white truncate text-sm">{fixture.homeTeamName}</span>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            {fixture.awayTeamLogo && (
              <img src={fixture.awayTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className="font-medium text-white/50 truncate text-sm">{fixture.awayTeamName}</span>
          </div>
        </div>

        {signals.length > 0 && (
          <div className="space-y-1 border-t border-white/5 pt-3">
            {signals.slice(0, 3).map((s) => (
              <div key={s.id} className="text-[11px] text-muted-foreground font-mono truncate">
                · {s.signalLabel}
              </div>
            ))}
            {signals.length > 3 && (
              <div className="text-[11px] text-muted-foreground/40 font-mono">
                +{signals.length - 3} flere signaler
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2">
          {fixture.leagueName && (
            <div className="flex items-center gap-1.5">
              {fixture.leagueLogo && (
                <img src={fixture.leagueLogo} alt="" className="w-3.5 h-3.5 object-contain opacity-50" />
              )}
              <span className="text-[10px] text-muted-foreground/40 font-mono truncate">
                {fixture.leagueName}
              </span>
            </div>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors ml-auto" />
        </div>
      </div>
    </Link>
  );
}

function SmallPickCard({ fixture }: { fixture: TopPickFixture }) {
  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className="glass-card p-4 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-white/5 group flex items-center gap-4">
        <div className="shrink-0 w-14 text-center">
          <div className="text-xs font-mono text-amber-400 font-medium leading-tight">
            {kickoffLabel(fixture.kickoff)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {fixture.homeTeamLogo && (
              <img src={fixture.homeTeamLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
            )}
            <span className="text-sm font-medium text-white truncate">{fixture.homeTeamName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {fixture.awayTeamLogo && (
              <img src={fixture.awayTeamLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
            )}
            <span className="text-sm font-medium text-white/45 truncate">{fixture.awayTeamName}</span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <SignalBadge count={fixture.signalCount} compact />
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
        </div>
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { data, isLoading } = useGetTopPickFixtures({
    query: { queryKey: ["top-picks"], staleTime: 2 * 60 * 1000, refetchInterval: 5 * 60 * 1000 },
  });

  const allFixtures = data?.fixtures ?? [];
  const top = allFixtures.slice(0, 3);
  const rest = allFixtures.slice(3);

  return (
    <Layout>
      <div className="space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h1 className="text-3xl font-bold font-mono tracking-tight text-white">DASHBOARD</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Kommende kampe rangeret efter signal-styrke — mest analyse øverst.
            </p>
          </div>
          {!isLoading && allFixtures.length > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold font-mono text-white">{allFixtures.length}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">kampe</div>
            </div>
          )}
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : allFixtures.length === 0 ? (
          <div className="glass-card p-16 text-center rounded-xl flex flex-col items-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground mb-4 opacity-25" />
            <h3 className="text-lg font-medium text-white mb-1">Ingen kommende kampe</h3>
            <p className="text-muted-foreground text-sm">
              Ingen planlagte kampe inden for de næste 3 dage for de 5 fulgte ligaer.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {top.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Target className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-mono font-bold text-primary tracking-widest uppercase">
                    Top Picks
                  </h2>
                  <div className="flex items-center gap-3 ml-auto text-[10px] font-mono text-muted-foreground/50">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary/60" /> 4+ signaler
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400/60" /> 2–3
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-violet-400/60" /> 1
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {top.map((f, i) => (
                    <TopPickCard key={f.fixtureId} fixture={f} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {rest.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">
                    Øvrige kampe — {rest.length}
                  </h2>
                  <Link href="/pre-match">
                    <span className="text-xs font-mono text-primary/60 hover:text-primary cursor-pointer flex items-center gap-1 transition-colors">
                      Se alle <ChevronRight className="w-3 h-3" />
                    </span>
                  </Link>
                </div>
                <div className="space-y-2">
                  {rest.map((f) => (
                    <SmallPickCard key={f.fixtureId} fixture={f} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
