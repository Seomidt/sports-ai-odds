import { useEffect, useRef, useState, useCallback } from "react";
import { useGetUnreadAlerts } from "@workspace/api-client-react";
import type { Alert } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Zap, X, ArrowRight, Activity } from "lucide-react";

const STORAGE_KEY = "signal_terminal_seen_alerts";
const AUTO_DISMISS_MS = 9_000;

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
    // Keep only last 200 IDs to prevent unbounded growth
    const arr = Array.from(ids).slice(-200);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

interface SignalAlertProps {
  alert: Alert;
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

function SignalAlert({ alert, onDismiss }: SignalAlertProps) {
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
      : `Kamp ${alert.fixtureId}`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border backdrop-blur-xl transition-all duration-350 ease-out ${style.border} ${style.glow} ${
        visible && !exiting
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-8"
      }`}
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
        transitionProperty: "opacity, transform",
      }}
    >
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${style.badge.includes("primary") ? "bg-gradient-to-r from-transparent via-primary/60 to-transparent" : style.badge.includes("amber") ? "bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" : "bg-gradient-to-r from-transparent via-destructive/60 to-transparent"}`} />

      <div className="p-4 pr-10">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border ${style.badge}`}>
            <Zap className="w-3 h-3" />
            Signal
          </span>
          <span className="text-[11px] font-mono text-muted-foreground/60 ml-auto">
            LIVE
          </span>
          <Activity className={`w-3 h-3 ${style.icon} animate-pulse`} />
        </div>

        {/* Match label */}
        <p className="text-[13px] font-semibold text-white/90 font-mono mb-1 leading-tight">
          {matchLabel}
        </p>

        {/* Alert text */}
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
          {alert.alertText}
        </p>

        {/* Action */}
        <button
          onClick={() => { dismiss(); navigate(`/match/${alert.fixtureId}`); }}
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold tracking-wider uppercase transition-colors ${style.icon} hover:opacity-80`}
        >
          Se kamp <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground/40 hover:text-white/70 transition-colors"
        aria-label="Luk"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-[2px] bg-white/10 w-full overflow-hidden">
        <div
          className={`h-full ${style.badge.includes("primary") ? "bg-primary/60" : style.badge.includes("amber") ? "bg-amber-400/60" : "bg-destructive/60"}`}
          style={{
            animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

export function AlertPoller() {
  const seenIdsRef = useRef<Set<number>>(getSeenIds());
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);

  const { data } = useGetUnreadAlerts({
    query: {
      refetchInterval: 30_000,
      staleTime: 25_000,
      queryKey: ["globalUnreadAlerts"],
    },
  });

  useEffect(() => {
    const alerts: Alert[] = data?.alerts ?? [];
    const newAlerts: Alert[] = [];

    for (const alert of alerts) {
      if (seenIdsRef.current.has(alert.id)) continue;
      seenIdsRef.current.add(alert.id);
      newAlerts.push(alert);
    }

    if (newAlerts.length > 0) {
      saveSeenIds(seenIdsRef.current);
      setActiveAlerts((prev) => [...prev, ...newAlerts].slice(-5)); // max 5 at once
    }
  }, [data]);

  const dismiss = useCallback((id: number) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  if (activeAlerts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80 pointer-events-none">
        {activeAlerts.map((alert) => (
          <div key={alert.id} className="pointer-events-auto">
            <SignalAlert alert={alert} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </>
  );
}
