import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Zap, TrendingDown, X, ArrowRight } from "lucide-react";
import { useSession } from "@/lib/session";

interface Alert {
  id: number;
  fixtureId: number | null;
  signalKey: string | null;
  alertText: string | null;
  createdAt: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
}

const STORAGE_KEY = "top_signal_dismissed";
const PRIORITY_MAX_AGE_MS = 15 * 60 * 1000;

function getDismissed(): Set<number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return new Set(JSON.parse(raw ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}
function addDismissed(id: number) {
  try {
    const s = getDismissed();
    s.add(id);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s).slice(-100)));
  } catch {}
}

function isPriority(a: Alert): boolean {
  const ageMs = Date.now() - new Date(a.createdAt).getTime();
  if (ageMs > PRIORITY_MAX_AGE_MS) return false;

  const t = (a.alertText ?? "").toLowerCase();
  const k = (a.signalKey ?? "").toLowerCase();

  if (k === "high_value_tip" || t.includes("high-value tip")) return true;

  const match = t.match(/(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)/);
  if (match) {
    const from = parseFloat(match[1]!);
    const to = parseFloat(match[2]!);
    if (from > 0) {
      const drop = Math.abs((from - to) / from);
      if (drop >= 0.08) return true;
    }
  }

  return false;
}

export function TopSignalBanner() {
  const { sessionId } = useSession();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState<Set<number>>(getDismissed);
  const [visible, setVisible] = useState(false);

  const { data } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["topSignalBanner", sessionId],
    enabled: !!sessionId,
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      const res = await fetch("/api/alerts/unread", {
        headers: { "x-session-id": sessionId },
      });
      if (!res.ok) return { alerts: [] };
      return res.json();
    },
  });

  const top = useMemo<Alert | null>(() => {
    const alerts: Alert[] = data?.alerts ?? [];
    const candidates = alerts.filter((a) => !dismissed.has(a.id) && isPriority(a));
    if (!candidates.length) return null;
    candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return candidates[0] ?? null;
  }, [data, dismissed]);

  useEffect(() => {
    if (top) {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [top?.id]);

  const dismiss = () => {
    if (!top) return;
    addDismissed(top.id);
    setDismissed(getDismissed());
    setVisible(false);
  };

  if (!top) return null;

  const isOddsDrop =
    (top.signalKey ?? "").toLowerCase().includes("odds") ||
    (top.alertText ?? "").toLowerCase().includes("dropping");

  const matchLabel =
    top.homeTeamName && top.awayTeamName
      ? `${top.homeTeamName} vs ${top.awayTeamName}`
      : `Match ${top.fixtureId}`;

  const ageMin = Math.round((Date.now() - new Date(top.createdAt).getTime()) / 60000);

  return (
    <div
      className={`transition-all duration-300 ease-out overflow-hidden ${
        visible ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <div
        className={`mx-0 border-b flex items-center gap-3 px-4 md:px-8 py-2.5 ${
          isOddsDrop
            ? "border-amber-400/20 bg-amber-400/6"
            : "border-primary/20 bg-primary/6"
        }`}
      >
        {isOddsDrop ? (
          <TrendingDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        ) : (
          <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
        )}

        <p className="flex-1 text-[12px] font-mono text-white/80 truncate">
          <span className={`font-bold mr-1.5 ${isOddsDrop ? "text-amber-400" : "text-primary"}`}>
            {matchLabel}
          </span>
          {top.alertText}
        </p>

        <span className="text-[10px] font-mono text-white/30 shrink-0">{ageMin}m ago</span>

        <button
          onClick={() => {
            navigate("/signals");
            dismiss();
          }}
          className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-opacity hover:opacity-70 ${
            isOddsDrop ? "text-amber-400" : "text-primary"
          }`}
        >
          Signals <ArrowRight className="w-2.5 h-2.5" />
        </button>

        <button
          onClick={dismiss}
          className="shrink-0 text-white/25 hover:text-white/60 transition-colors ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
