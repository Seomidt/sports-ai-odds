import React from "react";
import { Home, Flame, Star, BarChart2, Settings, TrendingUp, BarChart3, ShieldCheck, Zap, Activity } from "lucide-react";

const navItems = [
  { icon: Home, label: "Home", active: false },
  { icon: Flame, label: "Matches", active: true },
  { icon: Star, label: "Following", active: false },
  { icon: BarChart2, label: "Standings", active: false },
  { icon: Settings, label: "Settings", active: false },
];

const pressureHome = [60, 40, 80, 95];
const pressureAway = [50, 65, 30, 20];

function MetricBar({ homeVal, awayVal, maxVal, color }: { homeVal: number; awayVal: number; maxVal: number; color: string }) {
  const homePct = (homeVal / maxVal) * 100;
  const awayPct = (awayVal / maxVal) * 100;
  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden flex justify-end">
        <div className="h-full rounded-full" style={{ width: `${homePct}%`, background: color }} />
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full bg-slate-600" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

export function MatchLive() {
  return (
    <div
      className="min-h-screen flex font-sans"
      style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #0d1a2a 60%, #0a1520 100%)" }}
    >
      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col py-6 px-3 border-r border-white/5">
        <div className="mb-8 px-3">
          <span className="text-xs font-mono text-teal-400 tracking-widest uppercase">Signal</span>
          <div className="text-lg font-bold text-white tracking-tight">Terminal</div>
        </div>
        <nav className="space-y-1 flex-1">
          {navItems.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-[0_0_12px_rgba(20,184,166,0.15)]"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="px-3 mt-auto">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">API-Football · Live</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-xs text-teal-400 font-mono">ACTIVE</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6 space-y-4">

        {/* Scoreboard */}
        <div
          className="rounded-xl border p-5"
          style={{
            background: "rgba(20,184,166,0.05)",
            borderColor: "rgba(20,184,166,0.2)",
            boxShadow: "0 0 32px rgba(20,184,166,0.08)"
          }}
        >
          <div className="flex items-center justify-between">
            {/* Home */}
            <div className="flex flex-col items-center gap-1 w-40">
              <span className="text-lg font-bold text-white">Arsenal</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">HOME</span>
            </div>

            {/* Score center */}
            <div className="flex flex-col items-center">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1 rounded-full border mb-3"
                style={{ color: "#14b8a6", borderColor: "rgba(20,184,166,0.4)", background: "rgba(20,184,166,0.1)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                LIVE · 67'
              </span>
              <div className="text-5xl font-mono font-bold tracking-tighter text-white">
                2 <span className="text-slate-600 text-3xl mx-1">–</span> 1
              </div>
              <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-mono">Premier League</div>
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-1 w-40">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">Chelsea</span>
                <span
                  className="w-3 h-4 rounded-sm"
                  title="Red Card 38'"
                  style={{ background: "#ef4444" }}
                />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">AWAY</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">

          {/* Left: metrics + pressure */}
          <div className="col-span-2 space-y-4">

            {/* Momentum + xG */}
            <div className="grid grid-cols-2 gap-4">
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Momentum</span>
                </div>
                <div className="flex justify-between items-end font-mono">
                  <span className="text-2xl font-bold text-teal-400">0.72</span>
                  <span className="text-sm text-slate-500">0.31</span>
                </div>
                <MetricBar homeVal={72} awayVal={31} maxVal={100} color="linear-gradient(90deg,#14b8a6,#06b6d4)" />
                <div className="flex justify-between text-[10px] text-slate-600 font-mono pt-0.5">
                  <span>ARS</span><span>CHE</span>
                </div>
              </div>

              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">xG</span>
                </div>
                <div className="flex justify-between items-end font-mono">
                  <span className="text-2xl font-bold text-teal-400">2.4</span>
                  <span className="text-sm text-slate-500">0.9</span>
                </div>
                <MetricBar homeVal={2.4} awayVal={0.9} maxVal={3.5} color="linear-gradient(90deg,#14b8a6,#06b6d4)" />
                <div className="flex justify-between text-[10px] text-slate-600 font-mono pt-0.5">
                  <span>ARS</span><span>CHE</span>
                </div>
              </div>
            </div>

            {/* Pressure Index */}
            <div
              className="rounded-xl border p-5"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-teal-400" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Pressure Index · 15m Windows</h3>
                <div className="ml-auto flex items-center gap-3 text-[10px] font-mono">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-teal-500 inline-block" /> ARS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-600 inline-block" /> CHE</span>
                </div>
              </div>
              <div className="h-28 flex items-end gap-1.5">
                {pressureHome.map((val, i) => (
                  <React.Fragment key={i}>
                    <div className="flex-1 flex flex-col justify-end gap-1 h-full">
                      <div
                        className="w-full rounded-t-md transition-all"
                        style={{ height: `${val}%`, background: "linear-gradient(180deg,#14b8a6,rgba(20,184,166,0.4))" }}
                      />
                      <div className="text-[9px] text-center text-slate-600 font-mono">{i * 15 + 15}'</div>
                    </div>
                    <div className="flex-1 flex flex-col justify-end gap-1 h-full">
                      <div
                        className="w-full rounded-t-md bg-slate-700/60"
                        style={{ height: `${pressureAway[i]}%` }}
                      />
                      <div className="text-[9px] text-center text-slate-600 font-mono">{i * 15 + 15}'</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* AI Analysis */}
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: "rgba(20,184,166,0.2)", background: "rgba(20,184,166,0.05)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[10px] font-mono text-teal-400 uppercase tracking-wider">AI Live Analysis</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Arsenal are dominating with sustained pressure after Chelsea's red card in the 38th minute. xG gap has widened significantly. Chelsea have retreated into a low block, limiting central penetration but conceding wide crosses.
              </p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Upset risk */}
            <div
              className="rounded-xl border p-4 flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-1">Upset Risk</div>
                <div className="text-2xl font-mono font-bold text-white">0.18</div>
                <div
                  className="text-[10px] font-mono px-2 py-0.5 rounded border mt-1 inline-block"
                  style={{ color: "#14b8a6", borderColor: "rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.1)" }}
                >
                  LOW
                </div>
              </div>
              <ShieldCheck className="w-8 h-8 text-teal-400/30" />
            </div>

            {/* Card impact — red is correct here: it's a red card event */}
            <div
              className="rounded-xl border p-4 flex items-center justify-between"
              style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}
            >
              <div>
                <div className="text-[10px] text-red-400 uppercase tracking-wider font-mono mb-1">Card Impact</div>
                <div className="text-sm font-medium text-white">High tactical weight</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Chelsea 10-man since 38'</div>
              </div>
              <span className="w-4 h-5 rounded-sm bg-red-500 shrink-0" />
            </div>

            {/* Active signals */}
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-teal-400" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Active Signals</h3>
              </div>
              {[
                { text: "Red card changed attacking balance", active: true },
                { text: "Arsenal pressure rising last 10 min", active: true },
                { text: "Match state consistent with pre-match model", active: false },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: s.active ? "#14b8a6" : "#475569" }}
                  />
                  <span className={`text-xs leading-relaxed ${s.active ? "text-slate-200" : "text-slate-500"}`}>{s.text}</span>
                </div>
              ))}
            </div>

            {/* Match events */}
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Match Events</h3>
              <div className="space-y-2">
                {[
                  { min: "67'", text: "Goal · Arsenal", type: "goal" },
                  { min: "41'", text: "Goal · Chelsea", type: "goal" },
                  { min: "38'", text: "Red Card · Chelsea", type: "card" },
                  { min: "23'", text: "Goal · Arsenal", type: "goal" },
                ].map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-2.5 rounded-lg border text-xs"
                    style={{
                      borderColor: e.type === "card" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)",
                      background: e.type === "card" ? "rgba(239,68,68,0.05)" : "rgba(0,0,0,0.15)"
                    }}
                  >
                    <span
                      className="font-mono shrink-0 text-[10px] px-1.5 py-0.5 rounded border"
                      style={{
                        color: e.type === "card" ? "#ef4444" : "#94a3b8",
                        borderColor: e.type === "card" ? "rgba(239,68,68,0.3)" : "rgba(148,163,184,0.15)",
                        background: e.type === "card" ? "rgba(239,68,68,0.1)" : "rgba(0,0,0,0.2)"
                      }}
                    >
                      {e.min}
                    </span>
                    <span className={e.type === "card" ? "text-red-400 font-medium" : "text-slate-300"}>
                      {e.text}
                    </span>
                    {e.type === "card" && <span className="w-2 h-3 rounded-sm bg-red-500 shrink-0 ml-auto" />}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
