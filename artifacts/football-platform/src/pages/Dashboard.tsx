import { useGetTopPickFixtures, useGetFixtureSignals } from "@workspace/api-client-react";
import type { TopPickFixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isToday, isTomorrow } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, TrendingUp, Zap, Target, ChevronRight, Radio } from "lucide-react";

const LIVE_STATUSES = new Set(["1H","HT","2H","ET","BT","P","INT","LIVE"]);

function isFixtureLive(f: TopPickFixture) {
  return f.isLive === true || LIVE_STATUSES.has(f.statusShort ?? "");
}

function kickoffLabel(kickoff: string | null | undefined, statusShort: string | null | undefined): string {
  if (LIVE_STATUSES.has(statusShort ?? "")) {
    const labels: Record<string,string> = { "1H":"1. halvleg","HT":"Pause","2H":"2. halvleg","ET":"Forlænget","BT":"Pause ET","P":"Straffe","INT":"Pause","LIVE":"Live" };
    return labels[statusShort ?? ""] ?? "Live";
  }
  if (!kickoff) return "--:--";
  const d = new Date(kickoff);
  const time = format(d, "HH:mm");
  if (isToday(d)) return time;
  if (isTomorrow(d)) return `i morgen ${time}`;
  return format(d, "dd/MM HH:mm");
}

function ScorePill({ home, away }: { home: number | null | undefined; away: number | null | undefined }) {
  if (home == null || away == null) return null;
  const homeWin = home > away;
  const awayWin = away > home;
  return (
    <div className="flex items-center gap-1 font-mono font-bold text-sm">
      <span className={homeWin ? "text-primary" : awayWin ? "text-destructive/70" : "text-white/60"}>{home}</span>
      <span className="text-white/20">–</span>
      <span className={awayWin ? "text-primary" : homeWin ? "text-destructive/70" : "text-white/60"}>{away}</span>
    </div>
  );
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
  const live = isFixtureLive(fixture);
  const { data: signalData } = useGetFixtureSignals(
    fixture.fixtureId,
    { phase: live ? "live" : "pre" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { queryKey: ["signals", fixture.fixtureId, live ? "live" : "pre"], staleTime: live ? 30_000 : 3 * 60_000, gcTime: 10 * 60_000 } as any }
  );
  const count = fixture.signalCount;

  const borderClass = live
    ? "border-primary/30 shadow-[0_0_28px_rgba(0,255,200,0.09)]"
    : count >= 4
    ? "border-primary/40 shadow-[0_0_24px_rgba(0,255,200,0.07)]"
    : count >= 2
    ? "border-amber-400/30"
    : "border-white/8";

  const rankColor =
    rank === 1 ? "text-primary" : rank === 2 ? "text-amber-400" : "text-violet-400";

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className={`glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border ${borderClass} group`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-primary bg-primary/10 border border-primary/25 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {kickoffLabel(fixture.kickoff, fixture.statusShort)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-400 bg-amber-400/8 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3" />
                {kickoffLabel(fixture.kickoff, fixture.statusShort)}
              </span>
            )}
            {!live && <SignalBadge count={count} />}
          </div>
          <span className={`text-xs font-mono font-bold ${rankColor} opacity-40`}>#{rank}</span>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            {fixture.homeTeamLogo && <img src={fixture.homeTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />}
            <span className="font-semibold text-white text-sm truncate flex-1">{fixture.homeTeamName}</span>
            {live && <ScorePill home={fixture.homeGoals} away={null} />}
          </div>
          <div className="flex items-center gap-2">
            {fixture.awayTeamLogo && <img src={fixture.awayTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />}
            <span className="font-semibold text-white/50 text-sm truncate flex-1">{fixture.awayTeamName}</span>
            {live && <ScorePill home={null} away={fixture.awayGoals} />}
          </div>
        </div>

        {live && (
          <div className="flex items-center gap-2 mb-3">
            <ScorePill home={fixture.homeGoals} away={fixture.awayGoals} />
            {count > 0 && <SignalBadge count={count} compact />}
          </div>
        )}

        {signalData?.signals?.slice(0, 2).map((s, i) => (
          <div key={i} className="text-[11px] text-muted-foreground/60 font-mono leading-relaxed line-clamp-1 mb-0.5">
            · {s.signalLabel}
          </div>
        ))}

        <div className="flex items-center justify-between mt-3 pt-2">
          {fixture.leagueName && (
            <div className="flex items-center gap-1.5">
              {fixture.leagueLogo && <img src={fixture.leagueLogo} alt="" className="w-3.5 h-3.5 object-contain opacity-50" />}
              <span className="text-[10px] text-muted-foreground/40 font-mono truncate">{fixture.leagueName}</span>
            </div>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors ml-auto" />
        </div>
      </div>
    </Link>
  );
}

function SmallPickCard({ fixture }: { fixture: TopPickFixture }) {
  const live = isFixtureLive(fixture);
  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className="glass-card p-4 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-white/5 group flex items-center gap-4">
        <div className="shrink-0 w-16 text-center">
          {live ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {fixture.statusShort}
            </span>
          ) : (
            <div className="text-xs font-mono text-amber-400 font-medium leading-tight">
              {kickoffLabel(fixture.kickoff, fixture.statusShort)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {fixture.homeTeamLogo && <img src={fixture.homeTeamLogo} alt="" className="w-4 h-4 object-contain shrink-0" />}
            <span className="text-sm font-medium text-white truncate">{fixture.homeTeamName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {fixture.awayTeamLogo && <img src={fixture.awayTeamLogo} alt="" className="w-4 h-4 object-contain shrink-0" />}
            <span className="text-sm font-medium text-white/45 truncate">{fixture.awayTeamName}</span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {live && fixture.homeGoals != null && fixture.awayGoals != null && (
            <ScorePill home={fixture.homeGoals} away={fixture.awayGoals} />
          )}
          <SignalBadge count={fixture.signalCount} compact />
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
        </div>
      </div>
    </Link>
  );
}

export function Dashboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetTopPickFixtures({
    query: { queryKey: ["top-picks"], staleTime: 60_000, gcTime: 10 * 60_000, refetchInterval: 90_000 } as any,
  });

  const allFixtures = data?.fixtures ?? [];
  const liveFixtures = allFixtures.filter(isFixtureLive);
  const prematchFixtures = allFixtures.filter((f) => !isFixtureLive(f));

  const topLive = liveFixtures.slice(0, 3);
  const restLive = liveFixtures.slice(3);
  const topPrematch = prematchFixtures.slice(0, 3);
  const restPrematch = prematchFixtures.slice(3);

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
              Kampe rangeret efter signal-styrke — live og kommende.
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
            <h3 className="text-lg font-medium text-white mb-1">Ingen kampe at vise</h3>
            <p className="text-muted-foreground text-sm">
              Ingen planlagte eller live kampe inden for de næste 3 dage.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* ── Live fixtures ── */}
            {topLive.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Radio className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-mono font-bold text-primary tracking-widest uppercase flex items-center gap-2">
                    Live Nu
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  </h2>
                  <span className="text-[11px] font-mono text-muted-foreground/50 ml-auto">{liveFixtures.length} kampe i gang</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {topLive.map((f, i) => (
                    <TopPickCard key={f.fixtureId} fixture={f} rank={i + 1} />
                  ))}
                </div>
                {restLive.length > 0 && (
                  <div className="space-y-2">
                    {restLive.map((f) => (
                      <SmallPickCard key={f.fixtureId} fixture={f} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Prematch fixtures ── */}
            {topPrematch.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Target className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-mono font-bold text-primary tracking-widest uppercase">
                    Kommende Top Picks
                  </h2>
                  <div className="flex items-center gap-3 ml-auto text-[10px] font-mono text-muted-foreground/50">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary/60" /> 4+ signaler
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400/60" /> 2–3
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {topPrematch.map((f, i) => (
                    <TopPickCard key={f.fixtureId} fixture={f} rank={i + 1} />
                  ))}
                </div>
                {restPrematch.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">
                      Øvrige kampe — {restPrematch.length}
                    </h2>
                    <div className="space-y-2">
                      {restPrematch.map((f) => (
                        <SmallPickCard key={f.fixtureId} fixture={f} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
