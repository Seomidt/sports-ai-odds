import React from "react";
import { Home, Flame, Star, BarChart2, Settings, Clock, Activity, ArrowUpRight, TrendingDown } from "lucide-react";

const leagues = [
  {
    name: "Premier League",
    matches: [
      { id: "m1", home: "Arsenal", away: "Chelsea", score: "2 - 1", status: "LIVE 67'", isLive: true, signal: "Momentum shift", signalType: "positive", signalValue: "0.82" },
      { id: "m2", home: "Tottenham", away: "Man City", score: "vs", status: "15:00", isLive: false, signal: "High-scoring likely", signalType: "neutral", signalValue: "> 2.5" },
      { id: "m3", home: "Liverpool", away: "Brighton", score: "0 - 0", status: "HT", isLive: false, signal: "Upset risk", signalType: "negative", signalValue: "0.71" },
    ],
  },
  {
    name: "La Liga",
    matches: [
      { id: "m4", home: "Real Madrid", away: "Barcelona", score: "vs", status: "Tomorrow 20:45", isLive: false, signal: "Home advantage", signalType: "positive", signalValue: "0.68" },
      { id: "m5", home: "Atletico", away: "Sevilla", score: "1 - 0", status: "LIVE 55'", isLive: true, signal: "Low-scoring likely", signalType: "neutral", signalValue: "< 1.5" },
    ],
  },
  {
    name: "Bundesliga",
    matches: [
      { id: "m6", home: "Bayern", away: "Dortmund", score: "vs", status: "18:30", isLive: false, signal: "High volatility", signalType: "negative", signalValue: "0.85" },
      { id: "m7", home: "Leverkusen", away: "Frankfurt", score: "2 - 2", status: "FT", isLive: false, signal: "Match ended", signalType: "neutral", signalValue: "-" },
    ],
  },
];

const navItems = [
  { icon: Home, label: "Home", active: true },
  { icon: Flame, label: "Matches", active: false },
  { icon: Star, label: "Following", active: false },
  { icon: BarChart2, label: "Standings", active: false },
  { icon: Settings, label: "Settings", active: false },
];

export function Dashboard() {
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
        <div className="px-3 mt-auto space-y-3">
          <div
            className="p-3 rounded-lg border text-xs"
            style={{ borderColor: "rgba(20,184,166,0.15)", background: "rgba(20,184,166,0.05)" }}
          >
            <div className="text-slate-500 font-mono text-[10px] uppercase tracking-wider mb-1">Signals today</div>
            <div className="text-2xl font-bold text-white font-mono">14</div>
            <div className="text-teal-400 text-[10px] font-mono">9 positive · 5 risk</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">API-Football · Live</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs text-teal-400 font-mono">ACTIVE</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Today's Matches</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">April 10, 2026 · 3 leagues · 7 fixtures</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1.5"
              style={{ color: "#14b8a6", borderColor: "rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.08)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              2 LIVE
            </span>
            <span
              className="text-[10px] font-mono px-2.5 py-1 rounded-full border"
              style={{ color: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", background: "rgba(148,163,184,0.05)" }}
            >
              5 UPCOMING
            </span>
          </div>
        </header>

        <div className="space-y-6">
          {leagues.map((league) => (
            <div key={league.name}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-0.5 h-4 rounded-full bg-teal-400" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{league.name}</h2>
              </div>
              <div className="space-y-2">
                {league.matches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all hover:border-teal-500/20 hover:bg-teal-500/[0.02] group"
                    style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
                  >
                    {/* Status */}
                    <div className="w-28 shrink-0">
                      {match.isLive ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border"
                          style={{ color: "#14b8a6", borderColor: "rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.1)" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                          {match.status}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {match.status}
                        </span>
                      )}
                    </div>

                    {/* Teams + score */}
                    <div className="flex items-center gap-3 flex-1 justify-center">
                      <span className="text-sm font-semibold text-white text-right w-28 truncate">{match.home}</span>
                      <span
                        className="font-mono text-sm font-bold px-3 py-1 rounded-lg border min-w-[60px] text-center"
                        style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: match.isLive ? "#14b8a6" : "#64748b" }}
                      >
                        {match.score}
                      </span>
                      <span className="text-sm font-semibold text-white w-28 truncate">{match.away}</span>
                    </div>

                    {/* Signal */}
                    <div className="flex items-center gap-3 w-56 justify-end shrink-0">
                      <div className="flex items-center gap-2">
                        {match.signalType === "positive" && <ArrowUpRight className="w-3.5 h-3.5 text-teal-400" />}
                        {match.signalType === "negative" && <TrendingDown className="w-3.5 h-3.5 text-amber-400" />}
                        {match.signalType === "neutral" && <Activity className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="text-xs text-slate-400">{match.signal}</span>
                      </div>
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                          match.signalType === "positive"
                            ? "text-teal-400 border-teal-400/20 bg-teal-400/10"
                            : match.signalType === "negative"
                            ? "text-amber-400 border-amber-400/20 bg-amber-400/10"
                            : "text-slate-400 border-slate-600/30 bg-slate-700/20"
                        }`}
                      >
                        {match.signalValue}
                      </span>
                      <button className="text-slate-600 hover:text-teal-400 transition-colors p-1 opacity-0 group-hover:opacity-100">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
