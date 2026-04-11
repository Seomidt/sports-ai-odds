import { useGetTodayFixtures, useGetFixtureSignals } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, TrendingUp, Zap, Radio } from "lucide-react";

const PRE_STATUSES = new Set(["NS", "TBD", ""]);
const LIVE_STATUSES = new Set(["1H","HT","2H","ET","BT","P","INT","LIVE"]);
const POST_STATUSES = new Set(["FT","AET","PEN","ABD","CANC","AWD","WO"]);

function isPrematch(f: Fixture) {
  const s = f.statusShort ?? "";
  return !LIVE_STATUSES.has(s) && !POST_STATUSES.has(s);
}

function SignalScoreBadge({ count }: { count: number }) {
  if (count === 0) return (
    <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
      0 signaler
    </span>
  );
  const color = count >= 4 ? "text-primary bg-primary/10 border border-primary/20" :
                count >= 2 ? "text-amber-400 bg-amber-400/10 border border-amber-400/20" :
                "text-violet-400 bg-violet-400/10 border border-violet-400/20";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded ${color}`}>
      <Zap className="w-3 h-3" />
      {count} {count === 1 ? "signal" : "signaler"}
    </span>
  );
}

function PrematchCard({ fixture }: { fixture: Fixture }) {
  const { data: signalData } = useGetFixtureSignals(
    fixture.fixtureId,
    { phase: "pre" },
    { query: { queryKey: ["signals", fixture.fixtureId, "pre"], staleTime: 5 * 60 * 1000 } }
  );

  const preSignals = signalData?.signals ?? [];

  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className={`glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border ${
        preSignals.length >= 4 ? "border-primary/30" :
        preSignals.length >= 2 ? "border-amber-400/25" :
        "border-white/5"
      }`}>
        <div className="flex justify-between items-center mb-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded font-mono">
            <Clock className="w-3 h-3" />
            {fixture.kickoff ? format(new Date(fixture.kickoff), "HH:mm") : "--:--"}
          </span>
          <SignalScoreBadge count={preSignals.length} />
        </div>

        <div className="space-y-2.5 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {fixture.homeTeamLogo && (
              <img src={fixture.homeTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className="font-medium text-white truncate text-sm">{fixture.homeTeamName}</span>
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            {fixture.awayTeamLogo && (
              <img src={fixture.awayTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
            )}
            <span className="font-medium text-muted-foreground truncate text-sm">{fixture.awayTeamName}</span>
          </div>
        </div>

        {preSignals.length > 0 && (
          <div className="space-y-1 border-t border-white/5 pt-3 mt-1">
            {preSignals.slice(0, 2).map((s) => (
              <div key={s.id} className="text-[11px] text-muted-foreground font-mono truncate">
                · {s.signalLabel}
              </div>
            ))}
            {preSignals.length > 2 && (
              <div className="text-[11px] text-muted-foreground/60 font-mono">
                +{preSignals.length - 2} mere...
              </div>
            )}
          </div>
        )}

        {fixture.leagueName && (
          <div className="flex items-center gap-1.5 mt-3">
            {fixture.leagueLogo && (
              <img src={fixture.leagueLogo} alt="" className="w-3.5 h-3.5 object-contain" />
            )}
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
              {fixture.leagueName}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function LiveCard({ fixture }: { fixture: Fixture }) {
  return (
    <Link href={`/match/${fixture.fixtureId}`}>
      <div className="glass-card p-5 rounded-xl cursor-pointer transition-all hover:bg-white/5 border border-primary/30 shadow-[0_0_18px_rgba(0,255,200,0.06)]">
        <div className="flex justify-between items-center mb-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {fixture.statusElapsed != null ? `${fixture.statusElapsed}'` : "LIVE"}
          </span>
          {fixture.leagueLogo && (
            <img src={fixture.leagueLogo} alt="" className="w-4 h-4 object-contain opacity-60" />
          )}
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {fixture.homeTeamLogo && <img src={fixture.homeTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />}
              <span className="font-medium text-white truncate text-sm">{fixture.homeTeamName}</span>
            </div>
            <span className="font-mono text-lg font-bold text-primary shrink-0">{fixture.homeGoals ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {fixture.awayTeamLogo && <img src={fixture.awayTeamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />}
              <span className="font-medium text-white/70 truncate text-sm">{fixture.awayTeamName}</span>
            </div>
            <span className="font-mono text-lg font-bold text-primary shrink-0">{fixture.awayGoals ?? '-'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Dashboard() {
  const { data, isLoading } = useGetTodayFixtures();

  const allFixtures = (data?.leagues ?? []).flatMap((l) => l.fixtures);

  const liveFixtures = allFixtures
    .filter((f) => LIVE_STATUSES.has(f.statusShort ?? ""))
    .sort((a, b) => (a.statusElapsed ?? 0) - (b.statusElapsed ?? 0));

  const prematch = allFixtures
    .filter(isPrematch)
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });

  return (
    <Layout>
      <div className="space-y-10">
        <header>
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">DASHBOARD</h1>
          </div>
          <p className="text-muted-foreground">
            Overblik over live og kommende kampe med detekterede signaler.
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : (
          <>
            {/* Live section */}
            {liveFixtures.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Radio className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-mono font-bold text-primary tracking-widest uppercase">
                    Live Nu — {liveFixtures.length} {liveFixtures.length === 1 ? 'kamp' : 'kampe'}
                  </h2>
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {liveFixtures.map((f) => <LiveCard key={f.fixtureId} fixture={f} />)}
                </div>
              </div>
            )}

            {/* Prematch section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">
                  Kommende — {prematch.length} {prematch.length === 1 ? 'kamp' : 'kampe'}
                </h2>
                <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary/70" /> 4+ signaler
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400/70" /> 2–3
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet-400/70" /> 1
                  </span>
                </div>
              </div>

              {prematch.length === 0 ? (
                <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                  <h3 className="text-lg font-medium text-white mb-1">Ingen kommende kampe</h3>
                  <p className="text-muted-foreground">Ingen prematch data i det nuværende vindue.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {prematch.map((fixture) => (
                    <PrematchCard key={fixture.fixtureId} fixture={fixture} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
