import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { Activity, Radio, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type LiveSignalItem = {
  id: number;
  signalKey: string;
  signalLabel: string;
  signalValue: number | null;
  signalBool: boolean | null;
  triggeredAt: string;
};

/** Korte danske tags til “terminal”-look */
const SIGNAL_TAG: Record<string, string> = {
  momentum_shift: "Momentum",
  home_pressure_rising: "Pres",
  away_over_expected_tempo: "Ude-tempo",
  red_card_changed_balance: "Udvisning",
  upset_risk: "Upset-risiko",
  live_edge: "Live value",
  live_value: "Live value",
};

/** Ekstra liv i teksten når signalet er aktivt */
const SIGNAL_KICKER_ACTIVE: Partial<Record<string, string>> = {
  momentum_shift: "Et hold driver kampen — feltet har flyttet sig.",
  home_pressure_rising: "Hjemmeholdet bygger pres; målchancer kan komme.",
  away_over_expected_tempo: "Udeholdet spiller over forventet — farlig kontra-fase.",
  red_card_changed_balance: "Kort har ændret balancen; taktik skifter.",
  upset_risk: "Resultatet matcher ikke forventning — volatility.",
  live_edge: "Mulig kant mod markedet på det viste odds.",
  live_value: "Mulig kant mod markedet på det viste odds.",
};

const SIGNAL_VISUAL: Record<string, { icon: string; active: string; idle: string }> = {
  momentum_shift: {
    icon: "↗",
    active:
      "border-violet-400/45 bg-gradient-to-br from-violet-500/20 via-violet-500/5 to-transparent text-violet-50 shadow-[0_0_24px_-10px_rgba(167,139,250,0.55)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
  home_pressure_rising: {
    icon: "⬆",
    active:
      "border-teal-400/45 bg-gradient-to-br from-teal-500/22 via-teal-500/5 to-transparent text-teal-50 shadow-[0_0_24px_-10px_rgba(45,212,191,0.5)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
  away_over_expected_tempo: {
    icon: "↗",
    active:
      "border-teal-400/40 bg-gradient-to-br from-emerald-500/18 to-transparent text-emerald-50 shadow-[0_0_20px_-10px_rgba(52,211,153,0.45)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
  red_card_changed_balance: {
    icon: "■",
    active:
      "border-red-400/50 bg-gradient-to-br from-red-500/25 to-transparent text-red-50 shadow-[0_0_22px_-8px_rgba(248,113,113,0.45)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
  upset_risk: {
    icon: "⚠",
    active:
      "border-amber-400/50 bg-gradient-to-br from-amber-500/22 to-transparent text-amber-50 shadow-[0_0_22px_-8px_rgba(251,191,36,0.4)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
  live_edge: {
    icon: "◆",
    active:
      "border-primary/55 bg-gradient-to-br from-primary/25 via-amber-500/12 to-transparent text-amber-50 shadow-[0_0_26px_-8px_hsl(43_72%_54%_/0.5)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
  live_value: {
    icon: "◆",
    active:
      "border-primary/55 bg-gradient-to-br from-primary/25 via-amber-500/12 to-transparent text-amber-50 shadow-[0_0_26px_-8px_hsl(43_72%_54%_/0.5)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  },
};

function defaultVisual(isActive: boolean) {
  return {
    icon: "·",
    active: "border-primary/35 bg-primary/12 text-primary-foreground shadow-[0_0_18px_-10px_hsl(43_72%_54%_/0.35)]",
    idle: "border-white/[0.08] bg-white/[0.02] text-white/45",
  }[isActive ? "active" : "idle"];
}

function sortSignals(signals: LiveSignalItem[]): LiveSignalItem[] {
  return [...signals].sort((a, b) => {
    const ab = a.signalBool === true ? 1 : 0;
    const bb = b.signalBool === true ? 1 : 0;
    if (bb !== ab) return bb - ab;
    return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
  });
}

type LiveSignalFeedProps = {
  signals: LiveSignalItem[];
  variant: "compact" | "full";
  homeTeam?: string | null;
  awayTeam?: string | null;
  className?: string;
};

export function LiveSignalFeed({ signals, variant, className }: LiveSignalFeedProps) {
  const sorted = sortSignals(signals);
  const active = sorted.filter((s) => s.signalBool === true);
  const watch = sorted.filter((s) => s.signalBool !== true);

  if (sorted.length === 0) {
    if (variant === "compact") {
      return (
        <div className={cn("text-[10px] font-mono text-muted-foreground/55 flex items-center gap-1.5", className)}>
          <Radio className="w-3 h-3 opacity-50 shrink-0" />
          <span>Live-radar venter på data…</span>
        </div>
      );
    }
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center",
          className,
        )}
      >
        <Activity className="w-6 h-6 text-primary/40 mx-auto mb-2 animate-pulse" />
        <p className="text-sm text-muted-foreground">Signaler opdateres, når kampdata og features er klar.</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">Tjek igen om et øjeblik — typisk inden for et minut efter kickoff.</p>
      </div>
    );
  }

  const maxCompact = 4;
  const showCompact = sorted.slice(0, maxCompact);

  const Row = ({ s, dense }: { s: LiveSignalItem; dense?: boolean }) => {
    const isActive = s.signalBool === true;
    const cfg = SIGNAL_VISUAL[s.signalKey] ?? {
      icon: "●",
      active: defaultVisual(true),
      idle: defaultVisual(false),
    };
    const shell = isActive ? cfg.active : cfg.idle;
    const tag = SIGNAL_TAG[s.signalKey] ?? s.signalKey.replace(/_/g, " ");
    const kicker = isActive ? SIGNAL_KICKER_ACTIVE[s.signalKey] : null;
    const t = new Date(s.triggeredAt);
    const ago =
      Number.isFinite(t.getTime()) ? formatDistanceToNow(t, { addSuffix: true, locale: da }) : "—";

    return (
      <div
        className={cn(
          "rounded-xl border px-3 py-2.5 transition-all",
          shell,
          isActive && "ring-1 ring-inset ring-white/10",
          dense && "py-2 px-2.5 rounded-lg",
        )}
      >
        <div className="flex items-start gap-2.5">
          <span className={cn("text-base font-mono leading-none mt-0.5 shrink-0", isActive ? "opacity-95" : "opacity-50")}>
            {cfg.icon}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-[9px] font-mono font-bold uppercase tracking-[0.14em]",
                  isActive ? "text-primary/90" : "text-muted-foreground/50",
                )}
              >
                {tag}
              </span>
              {isActive && (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-primary uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(43_72%_54%)]" />
                  I spil
                </span>
              )}
              {!isActive && (
                <span className="text-[9px] font-mono text-muted-foreground/45 uppercase tracking-wide">Overvågning</span>
              )}
            </div>
            <p className={cn("text-xs leading-snug", isActive ? "text-white/95 font-medium" : "text-white/55")}>
              {s.signalLabel}
            </p>
            {kicker && isActive && !dense && (
              <p className="text-[11px] text-white/50 leading-relaxed border-l-2 border-primary/25 pl-2 mt-1">{kicker}</p>
            )}
            {s.signalValue != null && Math.abs(s.signalValue) > 0.001 && (
              <p className="text-[10px] font-mono text-muted-foreground/55 tabular-nums">
                Styrke / score: {typeof s.signalValue === "number" ? s.signalValue.toFixed(2) : s.signalValue}
              </p>
            )}
            <p className="text-[9px] font-mono text-muted-foreground/40 pt-0.5">{ago}</p>
          </div>
        </div>
      </div>
    );
  };

  if (variant === "compact") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-[0.12em] text-primary/80">
          <Zap className="w-3 h-3" />
          Live signaler
          {active.length > 0 && (
            <span className="ml-auto text-primary tabular-nums">{active.length} aktive</span>
          )}
        </div>
        <div className="space-y-1.5">
          {showCompact.map((s) => (
            <Row key={s.id} s={s} dense />
          ))}
        </div>
        {sorted.length > maxCompact && (
          <p className="text-[9px] font-mono text-muted-foreground/45 text-center pt-0.5">
            +{sorted.length - maxCompact} mere i kampen
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Live signaler</h3>
            <p className="text-[11px] text-muted-foreground leading-snug max-w-md">
              Kun denne kamp — opdateres løbende mens der spilles. Aktive betyder at modellen ser et tydeligt mønster lige nu.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider">
          <Radio className="w-3.5 h-3.5 text-primary/60" />
          Auto · ca. 15 sek
        </div>
      </div>

      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono font-bold text-primary uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            I spil nu
          </p>
          <div className="grid gap-2 sm:grid-cols-1">
            {active.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}

      {watch.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono font-bold text-muted-foreground/60 uppercase tracking-[0.18em]">
            Baggrund & overvågning
          </p>
          <p className="text-[11px] text-muted-foreground/55 -mt-1 mb-1">
            Ikke “alarm” lige nu, men sådan ser banen ud — nyttigt for at forstå hvor kampen kan bryde.
          </p>
          <div className="grid gap-2">
            {watch.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
