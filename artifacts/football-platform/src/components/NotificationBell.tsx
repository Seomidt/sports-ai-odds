import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, X } from "lucide-react";
import { Link } from "wouter";

// ── Preferences stored in localStorage ──────────────────────────────────────

export interface NotifPrefs {
  muted: boolean;
  types: {
    live_value: boolean;
    odds_drop: boolean;
  };
}

const PREFS_KEY = "notif_prefs_v2";

export function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NotifPrefs>;
      return {
        muted: !!p.muted,
        types: {
          live_value: p.types?.live_value !== false,
          odds_drop: p.types?.odds_drop !== false,
        },
      };
    }
  } catch {}
  return defaultPrefs();
}

export function saveNotifPrefs(prefs: NotifPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function defaultPrefs(): NotifPrefs {
  return {
    muted: false,
    types: { live_value: true, odds_drop: true },
  };
}

// ── Bell component ───────────────────────────────────────────────────────────

interface Alert { id: number; tier?: string | null; signalKey?: string | null; }

const TYPE_LABELS: Record<keyof NotifPrefs["types"], string> = {
  live_value: "Live odds (value)",
  odds_drop:  "Odds fald / linje",
};

const LAST_SEEN_KEY = "notif_last_seen_ts";

function getLastSeenTs(): number {
  try { return parseInt(localStorage.getItem(LAST_SEEN_KEY) ?? "0", 10) || 0; } catch { return 0; }
}
function saveLastSeenTs() {
  try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch {}
}

export function NotificationBell() {
  const [prefs, setPrefs] = useState<NotifPrefs>(getNotifPrefs);
  const [open, setOpen] = useState(false);
  const [lastSeenTs, setLastSeenTs] = useState<number>(getLastSeenTs);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
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

  const unreadCount = (data?.alerts ?? []).filter((a) => {
    if (prefs.muted) return false;
    const key = a.signalKey ?? "";
    if (key === "live_value" && !prefs.types.live_value) return false;
    if (key === "odds_drop" && !prefs.types.odds_drop) return false;
    // Only count alerts newer than when the bell was last opened
    const createdAt = a.createdAt ? new Date(a.createdAt as unknown as string).getTime() : 0;
    if (createdAt <= lastSeenTs) return false;
    return true;
  }).length;

  const handleToggle = useCallback(() => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 256; // w-64
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Open upward if not enough space below (dropdown ~280px tall)
      const openUpward = spaceBelow < 290 && spaceAbove > spaceBelow;

      // Align right edge of dropdown with right edge of button
      let right = window.innerWidth - rect.right;
      // Clamp so dropdown doesn't go off left edge
      if (rect.right - dropdownWidth < 8) right = window.innerWidth - dropdownWidth - 8;

      setDropdownStyle(
        openUpward
          ? { position: "fixed", bottom: window.innerHeight - rect.top + 8, right }
          : { position: "fixed", top: rect.bottom + 8, right }
      );
    }
    if (!open) {
      // Mark all current alerts as seen when opening the bell
      saveLastSeenTs();
      setLastSeenTs(Date.now());
    }
    setOpen((o) => !o);
  }, [open]);

  function toggleMute() {
    setPrefs((p) => ({ ...p, muted: !p.muted }));
  }

  function toggleType(key: keyof NotifPrefs["types"]) {
    setPrefs((p) => ({ ...p, types: { ...p.types, [key]: !p.types[key] } }));
  }

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="w-64 rounded-xl border border-white/15 bg-[#0a0f1e] shadow-2xl z-[9999] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-[11px] font-mono font-bold text-white/70 uppercase tracking-widest">Notifications</span>
        <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white/80 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mute toggle */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
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
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-2">Vis notifikationer for</p>
        {(Object.keys(TYPE_LABELS) as (keyof NotifPrefs["types"])[]).map((key) => (
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
      <div className="px-4 py-3 border-t border-white/10">
        <Link href="/odds-radar" onClick={() => setOpen(false)}>
          <span className="text-[11px] font-mono text-primary/70 hover:text-primary transition-colors cursor-pointer">
            Åbn oddsradar →
          </span>
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
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

      {/* Render outside sidebar/header so overflow:hidden can't clip it */}
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </>
  );
}
