import React from "react";
import { Star, Activity, ArrowUpRight, Clock, TrendingDown } from "lucide-react";

const leagues = [
  {
    name: "Premier League",
    matches: [
      {
        id: "m1",
        home: "Arsenal",
        away: "Chelsea",
        score: "2 - 1",
        status: "LIVE 67'",
        isLive: true,
        signal: "Momentum shift",
        signalType: "positive",
        signalValue: "0.82",
      },
      {
        id: "m2",
        home: "Tottenham",
        away: "Man City",
        score: "vs",
        status: "15:00",
        isLive: false,
        signal: "High-scoring likely",
        signalType: "neutral",
        signalValue: "> 2.5",
      },
      {
        id: "m3",
        home: "Liverpool",
        away: "Brighton",
        score: "0 - 0",
        status: "HT",
        isLive: false,
        signal: "Upset risk",
        signalType: "negative",
        signalValue: "0.71",
      },
    ],
  },
  {
    name: "La Liga",
    matches: [
      {
        id: "m4",
        home: "Real Madrid",
        away: "Barcelona",
        score: "vs",
        status: "Tomorrow 20:45",
        isLive: false,
        signal: "Home advantage",
        signalType: "positive",
        signalValue: "0.68",
      },
      {
        id: "m5",
        home: "Atletico",
        away: "Sevilla",
        score: "1 - 0",
        status: "LIVE 55'",
        isLive: true,
        signal: "Low-scoring likely",
        signalType: "neutral",
        signalValue: "< 1.5",
      },
    ],
  },
  {
    name: "Bundesliga",
    matches: [
      {
        id: "m6",
        home: "Bayern",
        away: "Dortmund",
        score: "vs",
        status: "18:30",
        isLive: false,
        signal: "High volatility",
        signalType: "negative",
        signalValue: "0.85",
      },
      {
        id: "m7",
        home: "Leverkusen",
        away: "Frankfurt",
        score: "2 - 2",
        status: "FT",
        isLive: false,
        signal: "Match ended",
        signalType: "neutral",
        signalValue: "-",
      },
    ],
  },
];

export function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 dark font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              TERMINAL
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Live Market & Match Analysis</p>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">System Status</div>
              <div className="text-sm font-mono text-primary flex items-center gap-2 justify-end">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                ACTIVE
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          {leagues.map((league) => (
            <div key={league.name} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-primary pl-3">
                {league.name}
              </h2>
              <div className="grid gap-2">
                {league.matches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 bg-card border border-border rounded-sm hover:border-primary/50 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-6 w-1/3">
                      <div className="w-20">
                        {match.isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            {match.status}
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {match.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 font-medium text-sm w-full">
                        <span className="text-right flex-1 truncate">{match.home}</span>
                        <span className="font-mono text-muted-foreground px-2 bg-background py-1 rounded border border-border">
                          {match.score}
                        </span>
                        <span className="flex-1 truncate">{match.away}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 w-1/2 justify-end">
                      <div className="flex items-center gap-2">
                        {match.signalType === "positive" && <ArrowUpRight className="w-4 h-4 text-primary" />}
                        {match.signalType === "negative" && <TrendingDown className="w-4 h-4 text-amber-400" />}
                        {match.signalType === "neutral" && <Activity className="w-4 h-4 text-muted-foreground" />}
                        <span className="text-sm text-muted-foreground">{match.signal}</span>
                        <span className="text-sm font-mono font-medium text-white px-2 py-0.5 bg-secondary rounded border border-border">
                          {match.signalValue}
                        </span>
                      </div>
                      <button className="text-muted-foreground hover:text-white transition-colors p-1">
                        <Star className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
