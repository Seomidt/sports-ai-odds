import { useGetTodayFixtures, useGetFixtureSignals } from "@workspace/api-client-react";
import type { Fixture } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Activity, Clock, TrendingUp, Zap } from "lucide-react";

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

export function Dashboard() {
  const { data, isLoading } = useGetTodayFixtures();

  const prematch = (data?.leagues ?? [])
    .flatMap((l) => l.fixtures)
    .filter(isPrematch)
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
      return ta - tb;
    });

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold font-mono tracking-tight text-white">DASHBOARD</h1>
          </div>
          <p className="text-muted-foreground">
            Kommende kampe rangeret efter antal detekterede signaler.
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : prematch.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-xl flex flex-col items-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-white mb-1">Ingen kommende kampe</h3>
            <p className="text-muted-foreground">Ingen prematch data i det nuværende vindue.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary/70" /> 4+ signaler
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400/70" /> 2–3 signaler
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400/70" /> 1 signal
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {prematch.map((fixture) => (
                <PrematchCard key={fixture.fixtureId} fixture={fixture} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
