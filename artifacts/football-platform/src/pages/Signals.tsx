import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Zap, Activity, Clock, ArrowRight, TrendingDown, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Layout } from "@/components/Layout";

interface SignalAlert {
  id: number;
  fixtureId: number | null;
  sessionId: string | null;
  signalKey: string | null;
  alertText: string | null;
  isRead: boolean;
  createdAt: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  statusShort: string | null;
  leagueName: string | null;
}

interface FixtureGroup {
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string | null;
  statusShort: string | null;
  signals: SignalAlert[];
  latestAt: Date;
}

function classifySignal(text: string, key: string | null): {
  label: string;
  color: string;
  border: string;
  badge: string;
  iconColor: string;
  icon: typeof Zap;
} {
  const t = text.toLowerCase();
  const k = (key ?? "").toLowerCase();

  if (k === "high_value_tip" || t.includes("high-value tip") || t.includes("value tip")) {
    return {
      label: "Value Tip",
      color: "text-primary",
      border: "border-primary/30",
      badge: "bg-primary/10 text-primary border-primary/25",
      iconColor: "text-primary",
      icon: Zap,
    };
  }
  if (t.includes("dropping") || t.includes("odds drop") || k.includes("odds")) {
    return {
      label: "Odds Drop",
      color: "text-amber-400",
      border: "border-amber-400/30",
      badge: "bg-amber-400/10 text-amber-400 border-amber-400/25",
      iconColor: "text-amber-400",
      icon: TrendingDown,
    };
  }
  if (t.includes("goal") || t.includes("red card") || t.includes("penalty") || t.includes("danger")) {
    return {
      label: "Match Event",
      color: "text-destructive",
      border: "border-destructive/30",
      badge: "bg-destructive/10 text-destructive border-destructive/25",
      iconColor: "text-destructive",
      icon: AlertTriangle,
    };
  }
  return {
    label: "Signal",
    color: "text-primary",
    border: "border-primary/30",
    badge: "bg-primary/10 text-primary border-primary/25",
    iconColor: "text-primary",
    icon: Zap,
  };
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function SignalRow({ signal }: { signal: SignalAlert }) {
  const cls = classifySignal(signal.alertText ?? "", signal.signalKey);
  const Icon = cls.icon;
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cls.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/80 leading-relaxed">{signal.alertText}</p>
      </div>
      <span className="text-[10px] font-mono text-white/30 shrink-0 mt-0.5">
        {timeAgo(signal.createdAt)}
      </span>
    </div>
  );
}

function FixtureCard({ group }: { group: FixtureGroup }) {
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(group.signals.length <= 3);
  const shown = expanded ? group.signals : group.signals.slice(0, 2);
  const hidden = group.signals.length - 2;
  const topSig = group.signals[0]!;
  const cls = classifySignal(topSig.alertText ?? "", topSig.signalKey);

  const isLive =
    group.statusShort &&
    !["NS", "FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO", "TBD"].includes(group.statusShort);

  return (
    <div
      className={`rounded-xl border backdrop-blur-sm transition-colors ${cls.border}`}
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
      }}
    >
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${cls.badge}`}>
                <cls.icon className="w-2.5 h-2.5" />
                {group.signals.length > 1 ? `${group.signals.length} signals` : cls.label}
              </span>
              {isLive && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-primary border border-primary/20 bg-primary/5">
                  <Activity className="w-2.5 h-2.5 animate-pulse" />
                  LIVE
                </span>
              )}
              {group.leagueName && (
                <span className="text-[10px] font-mono text-white/30 truncate">{group.leagueName}</span>
              )}
            </div>
            <p className="text-[14px] font-semibold font-mono text-white/90 leading-tight">
              {group.homeTeamName} vs {group.awayTeamName}
            </p>
          </div>
          <button
            onClick={() => navigate(`/match/${group.fixtureId}`)}
            className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-mono font-semibold uppercase tracking-wider transition-opacity hover:opacity-70 mt-0.5 ${cls.color}`}
          >
            View <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="border-t border-white/5">
          {shown.map((s) => (
            <SignalRow key={s.id} signal={s} />
          ))}
        </div>
      </div>

      {group.signals.length > 2 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-mono text-white/30 hover:text-white/60 transition-colors border-t border-white/5"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> +{hidden} more
            </>
          )}
        </button>
      )}

      {group.signals.length <= 2 && <div className="h-1" />}
    </div>
  );
}

export function Signals() {
  const [hours, setHours] = useState(1);

  const { data, isLoading } = useQuery<{ alerts: SignalAlert[]; hours: number }>({
    queryKey: ["signals-recent", hours],
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      const res = await fetch(`/api/alerts/recent?hours=${hours}`);
      if (!res.ok) return { alerts: [], hours };
      return res.json();
    },
  });

  const groups = useMemo<FixtureGroup[]>(() => {
    const alerts = data?.alerts ?? [];
    const map = new Map<number, FixtureGroup>();
    for (const a of alerts) {
      const fid = a.fixtureId ?? -a.id;
      if (!map.has(fid)) {
        map.set(fid, {
          fixtureId: fid,
          homeTeamName: a.homeTeamName ?? "Unknown",
          awayTeamName: a.awayTeamName ?? "Unknown",
          leagueName: a.leagueName,
          statusShort: a.statusShort,
          signals: [],
          latestAt: new Date(a.createdAt),
        });
      }
      const g = map.get(fid)!;
      g.signals.push(a);
      const t = new Date(a.createdAt);
      if (t > g.latestAt) g.latestAt = t;
    }
    return Array.from(map.values()).sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
  }, [data]);

  const totalCount = data?.alerts?.length ?? 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-mono font-black tracking-tight uppercase text-white">
                Signals
              </h1>
              {totalCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[11px] font-mono font-bold">
                  {totalCount}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              Broadcast signals · last {hours}h
            </p>
          </div>

          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
            {[1, 3, 6, 12].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-3 py-1.5 text-[11px] font-mono rounded-md transition-colors ${
                  hours === h
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl border border-white/5 bg-white/3 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/40 font-mono text-sm">No signals in the last {hours}h</p>
            <p className="text-white/20 font-mono text-xs mt-1">
              Signals appear when odds move or high-value tips are generated
            </p>
          </div>
        )}

        {!isLoading && groups.length > 0 && (
          <div className="space-y-3">
            {groups.map((g) => (
              <FixtureCard key={g.fixtureId} group={g} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
