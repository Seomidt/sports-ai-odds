import { Layout } from "@/components/Layout";
import { useState } from "react";

const LEAGUES = [
  { id: 39,  name: "Premier League",   season: 2024 },
  { id: 140, name: "La Liga",          season: 2024 },
  { id: 135, name: "Serie A",          season: 2024 },
  { id: 78,  name: "Bundesliga",       season: 2024 },
  { id: 2,   name: "Champions League", season: 2024 },
];

export function Standings() {
  const [activeLeague, setActiveLeague] = useState(LEAGUES[0]!);

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2">
            LEAGUE STANDINGS
          </h1>
          <p className="text-muted-foreground">Current tables for monitored competitions.</p>
        </header>

        <div className="flex flex-wrap gap-2">
          {LEAGUES.map((league) => (
            <button
              key={league.id}
              onClick={() => setActiveLeague(league)}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold tracking-wider uppercase transition-all border ${
                activeLeague.id === league.id
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-black/20 text-muted-foreground border-white/10 hover:text-white hover:border-white/20"
              }`}
            >
              {league.name}
            </button>
          ))}
        </div>

        <div className="glass-card rounded-xl overflow-hidden min-h-[600px]">
          <api-sports-widget
            key={activeLeague.id}
            data-type="standings"
            data-league={activeLeague.id}
            data-season={activeLeague.season}
          />
        </div>
      </div>
    </Layout>
  );
}
