import { Layout } from "@/components/Layout";
import { TrendingUp, TrendingDown, Minus, Trophy, AlertTriangle, Info } from "lucide-react";

// ── Backtest data (4,197 resolved tips) ─────────────────────────────────────

const ACTIVE_MARKETS = [
  {
    rank: 1,
    name: "Double Chance (High)",
    description: "Home or Draw / Away or Draw — only tipped at high algorithm confidence with odds above 1.55.",
    hitPct: 66.7,
    avgOdds: 1.83,
    units: 19.5,
    tips: 69,
    breakeven: 54.7,
    color: "emerald",
  },
  {
    rank: 2,
    name: "BTTS Yes (High)",
    description: "Both Teams To Score — only tipped when algorithm confidence is high (≥ 62% probability, ≥ 8% edge).",
    hitPct: 63.9,
    avgOdds: 1.74,
    units: 18.7,
    tips: 97,
    breakeven: 57.3,
    color: "emerald",
  },
  {
    rank: 3,
    name: "Match Result",
    description: "Home win, away win, or draw — our highest-odds market. Draw tips are especially profitable at odds 2.50–5.00.",
    hitPct: 44.1,
    avgOdds: 2.87,
    units: 12.4,
    tips: 429,
    breakeven: 34.9,
    color: "emerald",
  },
  {
    rank: 4,
    name: "Asian Handicap",
    description: "Only triggered when home team has a rank difference ≥ 5 and goal difference advantage ≥ 5.",
    hitPct: 47.9,
    avgOdds: 2.25,
    units: 9.9,
    tips: 185,
    breakeven: 44.4,
    color: "emerald",
  },
];

const DISABLED_MARKETS = [
  {
    name: "Over/Under",
    reason: "Even at high confidence, over 2.5 hit 50% at 1.85 odds — that's -8.5 units. Breakeven requires 54%. Disabled.",
    hitPct: 48.8,
    avgOdds: 1.64,
    units: -86,
    tips: 433,
  },
  {
    name: "BTTS (Medium confidence)",
    reason: "57.8% hit rate sounds good, but at 1.68 odds the breakeven is 59.5%. Not enough margin. Filtered out.",
    hitPct: 57.8,
    avgOdds: 1.68,
    units: -8.5,
    tips: 337,
  },
  {
    name: "Corners",
    reason: "11–17% hit rate across all confidence levels. Breakeven is 57%. The model cannot predict corners volume. Disabled.",
    hitPct: 15.3,
    avgOdds: 1.74,
    units: -264,
    tips: 377,
  },
  {
    name: "Win to Nil",
    reason: "Only 16% of tips hit despite tight triggers. At 3.74 avg odds, breakeven is just 26.7% — still too hard to beat.",
    hitPct: 16.4,
    avgOdds: 3.74,
    units: -137,
    tips: 253,
  },
];

const MATCH_RESULT_DETAIL = [
  { side: "Draw", odds: "2.50–3.50", hitPct: 46.2, units: 13.2, positive: true },
  { side: "Draw", odds: "3.50–5.00", hitPct: 30.0, units: 11.8, positive: true },
  { side: "Home Win", odds: "1.50–2.50", hitPct: 58.3, units: 6.8, positive: true },
  { side: "Home Win", odds: "1.00–1.50", hitPct: 72.7, units: -0.6, positive: false },
  { side: "Home Win", odds: "2.50+", hitPct: 20.0, units: -6.1, positive: false },
  { side: "Away Win", odds: "1.50–2.00", hitPct: 58.8, units: 0.3, positive: true },
  { side: "Away Win", odds: "2.00+", hitPct: 25.0, units: -10.8, positive: false },
];

const TOP_LEAGUES = [
  { name: "MLS", hitPct: 62.3, units: 17.5, positive: true },
  { name: "Bundesliga", hitPct: 58.5, units: 15.9, positive: true },
  { name: "Superliga (DK)", hitPct: 66.7, units: 13.2, positive: true },
  { name: "J1 League", hitPct: 68.8, units: 12.9, positive: true },
  { name: "Veikkausliiga", hitPct: 70.0, units: 11.8, positive: true },
  { name: "Allsvenskan", hitPct: 58.4, units: 4.5, positive: true },
  { name: "Eredivisie", hitPct: 56.7, units: 2.0, positive: true },
  { name: "1. Division (DK)", hitPct: 58.3, units: 1.4, positive: true },
  { name: "La Liga", hitPct: 50.0, units: -1.6, positive: false },
  { name: "Serie A", hitPct: 46.4, units: -3.3, positive: false },
  { name: "Ligue 1", hitPct: 42.4, units: -7.4, positive: false },
  { name: "Premier League", hitPct: 46.5, units: -10.1, positive: false },
  { name: "Süper Lig", hitPct: 41.9, units: -11.4, positive: false },
];

function colorFor(color: string) {
  if (color === "emerald") return { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", badge: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" };
  return { text: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20", badge: "bg-red-400/15 text-red-300 border-red-400/30" };
}

function UnitBadge({ units }: { units: number }) {
  const pos = units >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border ${
      pos
        ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/20"
        : "bg-red-400/10 text-red-300 border-red-400/20"
    }`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pos ? "+" : ""}{units.toFixed(1)}u
    </span>
  );
}

function HitBar({ hitPct, breakeven }: { hitPct: number; breakeven?: number }) {
  return (
    <div className="relative h-1.5 bg-white/5 rounded-full overflow-visible w-full">
      <div
        className={`h-full rounded-full transition-all ${hitPct >= (breakeven ?? 50) ? "bg-emerald-400" : "bg-red-400"}`}
        style={{ width: `${Math.min(hitPct, 100)}%` }}
      />
      {breakeven != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-white/30"
          style={{ left: `${breakeven}%` }}
          title={`Breakeven: ${breakeven}%`}
        />
      )}
    </div>
  );
}

export function Performance() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-mono text-white tracking-tight">Algorithm Performance</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Based on 4,197 resolved tips. Shows which markets the algorithm actively tips — and why others are disabled.
          </p>
        </div>

        {/* Breakeven explainer */}
        <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-200/80">
            <span className="font-semibold text-blue-300">What is breakeven?</span> At odds of 2.00, you need to be right 50% of the time just to break even. At 3.00, only 33%. High hit rate doesn't mean profit — it has to beat the breakeven for those specific odds. The white line in each bar marks the breakeven threshold.
          </p>
        </div>

        {/* Active markets */}
        <section>
          <h2 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-widest mb-4">Active Markets</h2>
          <div className="space-y-3">
            {ACTIVE_MARKETS.map((m) => {
              const c = colorFor(m.color);
              return (
                <div key={m.name} className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono font-bold w-5 text-center ${c.text}`}>#{m.rank}</span>
                      <div>
                        <p className="font-semibold text-white text-sm">{m.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <UnitBadge units={m.units} />
                      <span className="text-xs text-muted-foreground">{m.tips} tips</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center mb-3">
                    <div>
                      <p className={`text-lg font-bold font-mono ${c.text}`}>{m.hitPct}%</p>
                      <p className="text-xs text-muted-foreground">Hit rate</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold font-mono text-white">{m.avgOdds.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Avg odds</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold font-mono text-muted-foreground">{m.breakeven}%</p>
                      <p className="text-xs text-muted-foreground">Breakeven</p>
                    </div>
                  </div>
                  <HitBar hitPct={m.hitPct} breakeven={m.breakeven} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Match result breakdown */}
        <section>
          <h2 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-widest mb-4">Match Result — By Odds Range</h2>
          <div className="rounded-xl border border-white/5 bg-white/2 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-muted-foreground font-mono">
                  <th className="px-4 py-3 text-left">Side</th>
                  <th className="px-4 py-3 text-left">Odds range</th>
                  <th className="px-4 py-3 text-right">Hit rate</th>
                  <th className="px-4 py-3 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {MATCH_RESULT_DETAIL.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{row.side}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{row.odds}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{row.hitPct}%</td>
                    <td className="px-4 py-3 text-right">
                      <UnitBadge units={row.units} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-white/5 bg-amber-400/5 border-t-amber-400/10">
              <p className="text-xs text-amber-300/80">
                <span className="font-semibold">Key insight:</span> Draw tips at odds 2.50–5.00 are our most profitable sub-market (+25 units combined). Home wins at odds above 2.50 lose money — the algorithm filters them out.
              </p>
            </div>
          </div>
        </section>

        {/* League performance */}
        <section>
          <h2 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-widest mb-4">Performance by League</h2>
          <div className="rounded-xl border border-white/5 bg-white/2 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-muted-foreground font-mono">
                  <th className="px-4 py-3 text-left">League</th>
                  <th className="px-4 py-3 text-right">Hit rate</th>
                  <th className="px-4 py-3 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {TOP_LEAGUES.map((l, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                      {l.positive
                        ? <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />
                      }
                      {l.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{l.hitPct}%</td>
                    <td className="px-4 py-3 text-right">
                      <UnitBadge units={l.units} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Disabled markets */}
        <section>
          <h2 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-widest mb-4">Disabled Markets</h2>
          <div className="space-y-3">
            {DISABLED_MARKETS.map((m) => (
              <div key={m.name} className="rounded-xl border border-red-400/15 bg-red-400/5 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white/70 text-sm line-through decoration-red-400/50">{m.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.reason}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <UnitBadge units={m.units} />
                    <span className="text-xs text-muted-foreground">{m.tips} tips</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 font-mono">
                  <span>Hit rate: <span className="text-red-300">{m.hitPct}%</span></span>
                  <span>Avg odds: {m.avgOdds.toFixed(2)}</span>
                  <span>Breakeven: {(100 / m.avgOdds).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <div className="rounded-xl border border-white/5 bg-white/2 p-4 flex gap-3">
          <Minus className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            All data is from real resolved tips. "Units" = profit/loss per 1-unit stake (e.g. +19.5 means 19.5x your stake in profit across all tips). Markets are re-evaluated as new data accumulates. Last backtest: April 2026 on 4,197 resolved tips across 27 leagues.
          </p>
        </div>

      </div>
    </Layout>
  );
}
