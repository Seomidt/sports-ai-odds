import React, { useState } from "react";
import { Home, Flame, Star, BarChart2, Settings, Clock, Activity, ArrowUpRight, TrendingDown, Bell } from "lucide-react";

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
  { icon: Home, label: "Home", id: "home" },
  { icon: Flame, label: "Live", id: "live" },
  { icon: Star, label: "Following", id: "following" },
  { icon: BarChart2, label: "Standings", id: "standings" },
  { icon: Settings, label: "Settings", id: "settings" },
];

export function Dashboard() {
  const [activeNav, setActiveNav] = useState("home");

  return (
    <div
      className="w-screen h-screen flex flex-col font-sans overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0a0f1e 0%, #0d1a2a 60%, #0a1520 100%)" }}
    >
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
        <div>
          <p className="text-[10px] font-mono text-teal-400 tracking-widest uppercase leading-none">Signal</p>
          <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Terminal</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1.5"
            style={{ color: "#14b8a6", borderColor: "rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.08)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            2 LIVE
          </span>
          <button
            className="relative w-8 h-8 rounded-full flex items-center justify-center border"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}
          >
            <Bell className="w-4 h-4 text-slate-400" />
            <span
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
              style={{ background: "#14b8a6" }}
            />
          </button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="shrink-0 flex gap-2 px-4 py-2">
        <div
          className="flex-1 rounded-xl px-3 py-2 border"
          style={{ borderColor: "rgba(20,184,166,0.12)", background: "rgba(20,184,166,0.06)" }}
        >
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Signals today</p>
          <p className="text-xl font-bold text-white font-mono leading-tight">14</p>
          <p className="text-[10px] text-teal-400 font-mono">9 pos · 5 risk</p>
        </div>
        <div
          className="flex-1 rounded-xl px-3 py-2 border"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Fixtures</p>
          <p className="text-xl font-bold text-white font-mono leading-tight">7</p>
          <p className="text-[10px] text-slate-500 font-mono">3 leagues</p>
        </div>
        <div
          className="flex-1 rounded-xl px-3 py-2 border"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">API</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-[10px] text-teal-400 font-mono">ACTIVE</span>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">Live</p>
        </div>
      </div>

      {/* Section label */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-2 pb-1">
        <h2 className="text-xs font-semibold text-white tracking-tight">Today's Matches</h2>
        <span className="text-[10px] font-mono text-slate-500">Apr 11, 2026</span>
      </div>

      {/* Scrollable match list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="space-y-4 pb-2">
          {leagues.map((league) => (
            <div key={league.name}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-0.5 h-3.5 rounded-full bg-teal-400" />
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{league.name}</h3>
              </div>
              <div className="space-y-1.5">
                {league.matches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-2xl border px-3 py-3"
                    style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
                  >
                    {/* Top row: teams + score */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-1 text-sm font-semibold text-white text-right truncate">{match.home}</span>
                      <span
                        className="font-mono text-sm font-bold px-2.5 py-0.5 rounded-lg border text-center shrink-0"
                        style={{
                          borderColor: "rgba(255,255,255,0.1)",
                          background: "rgba(0,0,0,0.3)",
                          color: match.isLive ? "#14b8a6" : "#64748b",
                          minWidth: "52px",
                        }}
                      >
                        {match.score}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-white truncate">{match.away}</span>
                    </div>

                    {/* Bottom row: status + signal */}
                    <div className="flex items-center justify-between">
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

                      <div className="flex items-center gap-1.5">
                        {match.signalType === "positive" && <ArrowUpRight className="w-3 h-3 text-teal-400" />}
                        {match.signalType === "negative" && <TrendingDown className="w-3 h-3 text-amber-400" />}
                        {match.signalType === "neutral" && <Activity className="w-3 h-3 text-slate-500" />}
                        <span className="text-[11px] text-slate-400 truncate max-w-[110px]">{match.signal}</span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                            match.signalType === "positive"
                              ? "text-teal-400 border-teal-400/20 bg-teal-400/10"
                              : match.signalType === "negative"
                              ? "text-amber-400 border-amber-400/20 bg-amber-400/10"
                              : "text-slate-400 border-slate-600/30 bg-slate-700/20"
                          }`}
                        >
                          {match.signalValue}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom navigation */}
      <nav
        className="shrink-0 flex items-center justify-around px-2 pb-6 pt-2 border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(10,15,30,0.95)", backdropFilter: "blur(12px)" }}
      >
        {navItems.map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            onClick={() => setActiveNav(id)}
            className="flex flex-col items-center gap-1 px-3 py-1"
          >
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                activeNav === id
                  ? "bg-teal-500/15 shadow-[0_0_16px_rgba(20,184,166,0.2)]"
                  : ""
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  activeNav === id ? "text-teal-400" : "text-slate-600"
                }`}
              />
            </div>
            <span
              className={`text-[9px] font-mono tracking-wider transition-colors ${
                activeNav === id ? "text-teal-400" : "text-slate-600"
              }`}
            >
              {label.toUpperCase()}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
