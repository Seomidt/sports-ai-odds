import React from "react";
import { Home, Flame, Star, BarChart2, Settings, Clock, Users, Zap, Target, ShieldOff } from "lucide-react";

const DOMAIN = "f5283cda-3068-4b31-af98-6213cef5cb89-00-23zbpbknceiq2.spock.replit.dev";

const signals = [
  { label: "Home team form advantage", value: "RMA 0.82 vs BAR 0.71", hit: 74, n: 38, type: "teal" },
  { label: "High-scoring fixture likely", value: "Both avg > 2.1 goals", hit: 68, n: 52, type: "amber" },
  { label: "Set piece threat", value: "RMA 38% goals from SP", hit: 61, n: 29, type: "teal" },
  { label: "Away weakness index", value: "BAR 0.44 weakness", hit: 55, n: 18, type: "amber" },
];

const rmaForm = ["W", "W", "D", "W", "W"];
const barForm = ["W", "L", "W", "W", "D"];

function ConfidenceRing({ value }: { value: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const filled = circ * value;
  const gap = circ - filled;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx="48" cy="48" r={r} fill="none"
        stroke="url(#teal-grad)" strokeWidth="8"
        strokeDasharray={`${filled} ${gap}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <defs>
        <linearGradient id="teal-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <text x="48" y="44" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="monospace">
        {Math.round(value * 100)}%
      </text>
      <text x="48" y="60" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="sans-serif">
        CONF
      </text>
    </svg>
  );
}

function HitRingMini({ hit, type }: { hit: number; type: string }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const filled = circ * (hit / 100);
  const color = type === "teal" ? "#14b8a6" : "#f59e0b";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="monospace">
        {hit}%
      </text>
    </svg>
  );
}

function FormDot({ result }: { result: string }) {
  const color =
    result === "W" ? "bg-teal-500/20 border border-teal-500/40 text-teal-400" :
    result === "L" ? "bg-red-500/20 border border-red-500/40 text-red-400" :
    "bg-slate-600/40 border border-slate-500/40 text-slate-400";
  return (
    <span className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold rounded-full font-mono ${color}`}>
      {result}
    </span>
  );
}

const navItems = [
  { icon: Home, label: "Home", active: false },
  { icon: Flame, label: "Matches", active: true },
  { icon: Star, label: "Following", active: false },
  { icon: BarChart2, label: "Standings", active: false },
  { icon: Settings, label: "Settings", active: false },
];

export function MatchPre() {
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
      <main className="flex-1 overflow-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#14b8a6", borderColor: "rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.08)" }}
              >
                LA LIGA
              </span>
              <Clock className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-400 font-mono">Tomorrow · 20:45</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Real Madrid <span className="text-slate-500 font-normal mx-2 text-xl">vs</span> Barcelona
            </h1>
          </div>

          {/* Confidence ring */}
          <div
            className="flex flex-col items-center gap-1 p-4 rounded-xl border"
            style={{
              background: "rgba(20,184,166,0.05)",
              borderColor: "rgba(20,184,166,0.2)",
              boxShadow: "0 0 24px rgba(20,184,166,0.1)"
            }}
          >
            <ConfidenceRing value={0.68} />
            <div className="text-xs font-bold text-white">Real Madrid</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Model Favorite</div>
          </div>
        </div>

        {/* Signals */}
        <div
          className="rounded-xl border p-5 space-y-3"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-teal-400" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Pre-Match Signals</h2>
          </div>
          <div className="space-y-2">
            {signals.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3 rounded-lg border transition-colors hover:bg-white/[0.02]"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}
              >
                <HitRingMini hit={s.hit} type={s.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{s.label}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{s.value}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xs font-mono font-bold ${s.type === "teal" ? "text-teal-400" : "text-amber-400"}`}>
                    {s.hit}% holds true
                  </div>
                  <div className="text-[10px] text-slate-600">({s.n} matches)</div>
                </div>
                {/* Hit rate bar */}
                <div className="w-20 shrink-0">
                  <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.hit}%`,
                        background: s.type === "teal"
                          ? "linear-gradient(90deg, #14b8a6, #06b6d4)"
                          : "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-3 gap-4">

          {/* Team form */}
          <div
            className="col-span-1 rounded-xl border p-4 space-y-4"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Form · Last 5</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 mb-2 font-mono">RMA</div>
                <div className="flex gap-1.5">{rmaForm.map((r, i) => <FormDot key={i} result={r} />)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-2 font-mono">BAR</div>
                <div className="flex gap-1.5">{barForm.map((r, i) => <FormDot key={i} result={r} />)}</div>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5">
              <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">H2H Last 5</div>
              <div className="text-sm font-mono text-white">
                <span className="text-teal-400 font-bold">3</span>
                <span className="text-slate-600 mx-1">-</span>
                <span>1</span>
                <span className="text-slate-600 mx-1">-</span>
                <span>1</span>
                <span className="text-[10px] text-slate-600 ml-2">(RMA favor)</span>
              </div>
            </div>
          </div>

          {/* Absences */}
          <div
            className="rounded-xl border p-4 space-y-4"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Key Absences</h3>
            </div>
            <div className="space-y-3">
              <div
                className="flex items-center justify-between p-2.5 rounded-lg border"
                style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.05)" }}
              >
                <div>
                  <div className="text-sm font-medium text-white">Bellingham</div>
                  <div className="text-[10px] text-slate-500 font-mono">RMA · Forward</div>
                </div>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded border"
                  style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.1)" }}
                >
                  DOUBT
                </span>
              </div>
              <div
                className="flex items-center justify-between p-2.5 rounded-lg border"
                style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.05)" }}
              >
                <div>
                  <div className="text-sm font-medium text-white">Pedri</div>
                  <div className="text-[10px] text-slate-500 font-mono">BAR · Midfielder</div>
                </div>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded border"
                  style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.1)" }}
                >
                  OUT
                </span>
              </div>
            </div>
          </div>

          {/* Key factors + synthesis */}
          <div
            className="rounded-xl border p-4 space-y-3 flex flex-col"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-teal-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Key Factors</h3>
            </div>
            <ul className="space-y-2 text-sm text-slate-300 flex-1">
              {[
                "Set-piece efficiency vs Barca zonal marking",
                "Midfield transition speed in first 15 mins",
                "Bellingham absence impact on xG"
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                    style={{ background: "#14b8a6" }}
                  />
                  <span className="text-xs leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
            <div
              className="mt-auto p-3 rounded-lg border text-xs text-slate-400 leading-relaxed"
              style={{ borderColor: "rgba(20,184,166,0.15)", background: "rgba(20,184,166,0.05)" }}
            >
              <span className="text-teal-400 font-mono text-[10px] block mb-1">AI SYNTHESIS</span>
              Real Madrid enter as favorites on superior home form and set-piece record. Barcelona's away weakness index flagged over last 5 away fixtures.
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
