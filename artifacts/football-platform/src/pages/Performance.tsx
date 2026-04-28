import { Layout } from "@/components/Layout";
import { TrendingUp, TrendingDown, Minus, Trophy, AlertTriangle, Info } from "lucide-react";

// ── Backtest data (4,197 resolved tips) ─────────────────────────────────────

const ACTIVE_MARKETS = [
  {
    rank: 1,
    name: "Match Result — Draw",
    description: "Only tipped when form signals fire: both teams drawing recently, home team cold (0W in 5), or API agrees. Rank/points proximity alone is NOT used — backtested at 13% hit rate.",
    hitPct: 61.1,
    avgOdds: 3.82,
    units: 23.4,
    tips: 18,
    breakeven: 26.2,
    color: "emerald",
  },
  {
    rank: 2,
    name: "Match Result — Home Win",
    description: "Only tipped when supporting signals agree: away team on 0 wins in 5 (88.2% hit), or home dominant by rank+points+form. Hard cap at 2.50 odds — above that hit rate collapses.",
    hitPct: 85.0,
    avgOdds: 1.63,
    units: 10.4,
    tips: 37,
    breakeven: 61.3,
    color: "emerald",
  },
  {
    rank: 3,
    name: "BTTS Yes",
    description: "Both teams score — only tipped when both attack averages ≥ 1.2, neither team has a clean-sheet rate above 35%, and odds fall in the profitable 1.58–1.85 window.",
    hitPct: 86.7,
    avgOdds: 1.69,
    units: 8.6,
    tips: 15,
    breakeven: 59.2,
    color: "emerald",
  },
  {
    rank: 4,
    name: "Asian Handicap",
    description: "Home handicap — only when home has rank+points advantage, combined attack average ≥ 2.2, and odds 1.75–2.55. Low scoring matches are filtered out.",
    hitPct: 63.2,
    avgOdds: 1.91,
    units: 5.2,
    tips: 19,
    breakeven: 52.2,
    color: "emerald",
  },
];

const DISABLED_MARKETS = [
  {
    name: "Double Chance",
    reason: "Backtested every combination — ALL negative. 1X at 1.23 avg odds needs 81% hit rate; we achieve 58%. Breakeven is impossible to clear with these compressed odds.",
    hitPct: 58.2,
    avgOdds: 1.38,
    units: -55,
    tips: 323,
  },
  {
    name: "Over/Under",
    reason: "Negative across every stat condition and odds bucket. Over 2.5 at best odds hit 50% — breakeven requires 54%. Combined -86 units across 433 tips.",
    hitPct: 48.8,
    avgOdds: 1.64,
    units: -86,
    tips: 433,
  },
  {
    name: "BTTS (wrong conditions)",
    reason: "57.8% hit rate sounds good, but at 1.68 avg odds the breakeven is 59.5%. Only profitable when both teams have strong attack + low clean-sheet rate AND odds 1.58–1.85.",
    hitPct: 57.8,
    avgOdds: 1.68,
    units: -8.5,
    tips: 337,
  },
  {
    name: "Corners",
    reason: "21% hit rate across all confidence levels at 1.74 avg odds (breakeven 57%). Algorithm cannot predict corner volume above bookmaker pricing.",
    hitPct: 21.0,
    avgOdds: 1.74,
    units: -94,
    tips: 159,
  },
  {
    name: "Win to Nil",
    reason: "Only 16% of tips hit despite tight triggers. At 3.74 avg odds, breakeven is just 26.7% — still not achievable.",
    hitPct: 16.4,
    avgOdds: 3.74,
    units: -137,
    tips: 253,
  },
];

const MATCH_RESULT_DETAIL = [
  { side: "Draw — both draw-prone form", odds: "3.00–5.00", hitPct: 61.1, units: 23.4, positive: true },
  { side: "Draw — home 0 wins in 5", odds: "3.00–5.00", hitPct: 66.7, units: 24.0, positive: true },
  { side: "Draw — API agrees (35-50%)", odds: "3.00–4.50", hitPct: 43.1, units: 28.9, positive: true },
  { side: "Home Win — away 0W in 5", odds: "1.60–2.50", hitPct: 88.2, units: 10.4, positive: true },
  { side: "Home Win — rank+pts+form agree", odds: "1.50–2.50", hitPct: 85.0, units: 6.9, positive: true },
  { side: "Home Win", odds: "2.50+", hitPct: 20.0, units: -4.8, positive: false },
  { side: "Draw — close by rank/pts only", odds: "3.00–5.00", hitPct: 13.0, units: -11.8, positive: false },
  { side: "Away Win", odds: "2.00+", hitPct: 36.8, units: -3.9, positive: false },
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
