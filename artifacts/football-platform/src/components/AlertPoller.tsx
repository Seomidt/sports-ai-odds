import { useEffect, useRef, useState, useCallback } from "react";
import type { Alert as BaseAlert } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Zap, X, ArrowRight, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getNotifPrefs } from "./NotificationBell";
import { useAuth } from "@/hooks/useAuth";

type Alert = BaseAlert & { tier?: string | null };

const STORAGE_KEY = "signal_terminal_seen_alerts";
const AUTO_DISMISS_MS = 10_000;

function getSeenIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<number>) {
  try {
    const arr = Array.from(ids).slice(-200);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

interface SignalAlertProps {
  alert: Alert;
  count: number;
  onDismiss: (id: number) => void;
}

const SIGNAL_COLORS: Record<string, { border: string; glow: string; badge: string; icon: string }> = {
  default: {
    border: "border-primary/40",
    glow: "shadow-[0_0_30px_rgba(0,255,200,0.12)]",
    badge: "bg-primary/15 text-primary border-primary/30",
    icon: "text-primary",
  },
  warning: {
    border: "border-amber-400/40",
    glow: "shadow-[0_0_30px_rgba(251,191,36,0.10)]",
    badge: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    icon: "text-amber-400",
  },
  danger: {
    border: "border-destructive/40",
    glow: "shadow-[0_0_30px_rgba(239,68,68,0.10)]",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    icon: "text-destructive",
  },
};

function resolveStyle(alertText: string) {
  const t = alertText.toLowerCase();
  if (t.includes("red card") || t.includes("goal") || t.includes("penalty") || t.includes("danger")) {
    return SIGNAL_COLORS.danger!;
  }
  if (t.includes("warn") || t.includes("pressure") || t.includes("momentum") || t.includes("shift")) {
    return SIGNAL_COLORS.warning!;
  }
  return SIGNAL_COLORS.default!;
}

function SignalAlert({ alert, count, onDismiss }: SignalAlertProps) {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const style = resolveStyle(alert.alertText ?? "");

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const auto = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(auto);
    };
  }, []);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(alert.id), 350);
  }, [alert.id, onDismiss]);

  const matchLabel =
    alert.homeTeamName && alert.awayTeamName
      ? `${alert.homeTeamName} vs ${alert.awayTeamName}`
      : `Match ${alert.fixtureId}`;

  const accentColor = style.badge.includes("primary")
    ? "bg-gradient-to-r from-transparent via-primary/60 to-transparent"
    : style.badge.includes("amber")
    ? "bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
    : "bg-gradient-to-r from-transparent via-destructive/60 to-transparent";

  const barColor = style.badge.includes("primary")
    ? "bg-primary/60"
    : style.badge.includes("amber")
    ? "bg-amber-400/60"
    : "bg-destructive/60";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border backdrop-blur-xl transition-all duration-350 ease-out ${style.border} ${style.glow} ${
        visible && !exiting ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
      }`}
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
        transitionProperty: "opacity, transform",
      }}
    >
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${accentColor}`} />

      <div className="p-4 pr-10">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border ${style.badge}`}>
            <Zap className="w-3 h-3" />
            Signal
          </span>
          {count > 1 && (
            <span className="text-[10px] font-mono text-muted-foreground/50 bg-white/6 border border-white/10 px-1.5 py-0.5 rounded">
              {count} bookmakers
            </span>
          )}
          <span className="text-[11px] font-mono text-muted-foreground/60 ml-auto">LIVE</span>
          <Activity className={`w-3 h-3 ${style.icon} animate-pulse`} />
        </div>

        <p className="text-[13px] font-semibold text-white/90 font-mono mb-1 leading-tight">
          {matchLabel}
        </p>

        <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
          {alert.alertText}
        </p>

        <button
          onClick={() => { dismiss(); navigate(`/match/${alert.fixtureId}`); }}
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold tracking-wider uppercase transition-colors ${style.icon} hover:opacity-80`}
        >
          View match <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground/40 hover:text-white/70 transition-colors"
        aria-label="Luk"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="absolute bottom-0 left-0 h-[2px] bg-white/10 w-full overflow-hidden">
        <div
          className={`h-full ${barColor}`}
          style={{ animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
        />
      </div>
    </div>
  );
}

export function AlertPoller() {
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const seenIdsRef = useRef<Set<number>>(getSeenIds());
  // Key = fixtureId, value = { alert (latest), count (how many bookmakers), id (for dismiss) }
  const [activeByFixture, setActiveByFixture] = useState<
    Map<number, { alert: Alert; count: number }>
  >(new Map());
  const { data } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["criticalBroadcastAlerts"],
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      const res = await fetch("/api/alerts/unread");
      if (!res.ok) return { alerts: [] };
      return res.json();
    },
  });

  useEffect(() => {
    const prefs = getNotifPrefs();

    // Respect mute and type preferences
    const alerts: Alert[] = (data?.alerts ?? []).filter((a) => {
      if (a.tier !== "critical") return false;
      if (prefs.muted) return false;
      const key = a.signalKey ?? "";
      if (key === "live_value" && !prefs.types.live_value) return false;
      if (key === "odds_drop" && !prefs.types.odds_drop) return false;
      return true;
    });
    let changed = false;

    setActiveByFixture(prev => {
      const next = new Map(prev);
      for (const alert of alerts) {
        if (seenIdsRef.current.has(alert.id)) {
          // Already seen — but still count it if same fixture is active
          if (next.has(alert.fixtureId ?? -1)) {
            const entry = next.get(alert.fixtureId ?? -1)!;
            if (alert.id !== entry.alert.id) {
              next.set(alert.fixtureId ?? -1, { alert: entry.alert, count: entry.count + 1 });
              changed = true;
            }
          }
          continue;
        }
        seenIdsRef.current.add(alert.id);
        changed = true;
        const fid = alert.fixtureId ?? -1;
        const existing = next.get(fid);
        if (existing) {
          // Same fixture already showing — just bump count
          next.set(fid, { alert: alert, count: existing.count + 1 });
        } else {
          // New fixture — add if under 3 concurrent
          if (next.size < 3) {
            next.set(fid, { alert, count: 1 });
          }
        }
      }
      return changed ? next : prev;
    });

    if (alerts.some(a => !seenIdsRef.current.has(a.id) || true)) {
      saveSeenIds(seenIdsRef.current);
    }
  }, [data]);

  const dismiss = useCallback((fixtureId: number) => {
    setActiveByFixture(prev => {
      const next = new Map(prev);
      next.delete(fixtureId);
      return next;
    });
  }, []);

  if (authLoading || !isSignedIn) return null;
  if (activeByFixture.size === 0) return null;

  return (
    <>
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80 pointer-events-none">
        {Array.from(activeByFixture.entries()).map(([fid, { alert, count }]) => (
          <div key={fid} className="pointer-events-auto">
            <SignalAlert
              alert={alert}
              count={count}
              onDismiss={() => dismiss(fid)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
