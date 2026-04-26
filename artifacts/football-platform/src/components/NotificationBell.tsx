import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, X } from "lucide-react";
import { Link } from "wouter";

// ── Preferences stored in localStorage ──────────────────────────────────────

export interface NotifPrefs {
  muted: boolean;
  types: {
    live_value: boolean;
    high_value_tip: boolean;
    odds_drop: boolean;
    match_event: boolean;
  };
}

const PREFS_KEY = "notif_prefs_v1";

export function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch {}
  return defaultPrefs();
}

export function saveNotifPrefs(prefs: NotifPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function defaultPrefs(): NotifPrefs {
  return {
    muted: false,
    types: { live_value: true, high_value_tip: true, odds_drop: true, match_event: true },
  };
}

// ── Bell component ───────────────────────────────────────────────────────────

interface Alert { id: number; tier?: string | null; signalKey?: string | null; }

const TYPE_LABELS: Record<string, string> = {
  live_value:     "Live Value",
  high_value_tip: "Value Tips",
  odds_drop:      "Odds Drop",
  match_event:    "Match Events",
};

export function NotificationBell() {
  const [prefs, setPrefs] = useState<NotifPrefs>(getNotifPrefs);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Persist prefs on change
  useEffect(() => { saveNotifPrefs(prefs); }, [prefs]);

  const { data } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["notifUnread"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/unread");
      if (!res.ok) return { alerts: [] };
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // Count alerts that match active type prefs
  const unreadCount = (data?.alerts ?? []).filter((a) => {
    if (prefs.muted) return false;
    const key = a.signalKey ?? "";
    if (key === "live_value" && !prefs.types.live_value) return false;
    if (key === "high_value_tip" && !prefs.types.high_value_tip) return false;
    if (key === "odds_drop" && !prefs.types.odds_drop) return false;
    if ((key === "goal" || key === "red_card" || key === "match_event") && !prefs.types.match_event) return false;
    return true;
  }).length;

  function toggleMute() {
    setPrefs((p) => ({ ...p, muted: !p.muted }));
  }

  function toggleType(key: keyof NotifPrefs["types"]) {
    setPrefs((p) => ({ ...p, types: { ...p.types, [key]: !p.types[key] } }));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Notifikationer"
      >
        {prefs.muted
          ? <BellOff className="w-4 h-4" />
          : <Bell className="w-4 h-4" />
        }
        {!prefs.muted && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-[9px] font-mono font-bold text-black flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-64 rounded-xl border border-white/10 bg-[#0d1220] shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-[11px] font-mono font-bold text-white/70 uppercase tracking-widest">Notifications</span>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/70 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mute toggle */}
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-[12px] text-white/60 font-mono">
              {prefs.muted ? "Notifikationer er slået fra" : "Notifikationer aktive"}
            </span>
            <button
              onClick={toggleMute}
              className={`w-9 h-5 rounded-full transition-colors relative ${prefs.muted ? "bg-white/10" : "bg-primary/70"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${prefs.muted ? "left-0.5" : "left-4"}`} />
            </button>
          </div>

          {/* Type toggles */}
          <div className="px-4 py-2 space-y-1">
            <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-2">Vis notifikationer for</p>
            {(Object.keys(TYPE_LABELS) as Array<keyof NotifPrefs["types"]>).map((key) => (
              <div key={key} className="flex items-center justify-between py-1.5">
                <span className={`text-[12px] font-mono transition-colors ${prefs.muted ? "text-white/25" : "text-white/60"}`}>
                  {TYPE_LABELS[key]}
                </span>
                <button
                  onClick={() => !prefs.muted && toggleType(key)}
                  disabled={prefs.muted}
                  className={`w-8 h-4 rounded-full transition-colors relative ${prefs.muted ? "opacity-30 cursor-not-allowed" : ""} ${prefs.types[key] && !prefs.muted ? "bg-primary/70" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${prefs.types[key] ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Link to Signals page */}
          <div className="px-4 py-3 border-t border-white/5">
            <Link href="/signals" onClick={() => setOpen(false)}>
              <span className="text-[11px] font-mono text-primary/70 hover:text-primary transition-colors cursor-pointer">
                Se alle signals →
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
