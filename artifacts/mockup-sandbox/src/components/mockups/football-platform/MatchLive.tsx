import React from "react";
import { Activity, ShieldAlert, BarChart3, TrendingUp, AlertTriangle } from "lucide-react";

export function MatchLive() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 dark font-sans">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Left Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Header Scoreboard */}
          <div className="p-6 bg-card border border-border rounded-sm flex items-center justify-between">
            <div className="flex flex-col items-center gap-2">
              <span className="text-lg font-bold">Arsenal</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Home</span>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-xs font-mono text-primary flex items-center gap-2 mb-2 bg-primary/10 px-3 py-1 rounded border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                67'
              </div>
              <div className="text-5xl font-mono font-bold tracking-tighter">
                2 <span className="text-muted-foreground font-sans text-3xl mx-2">-</span> 1
              </div>
              <div className="text-xs text-muted-foreground mt-2">Premier League</div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="text-lg font-bold flex items-center gap-2">
                Chelsea
                <span className="w-3 h-4 bg-destructive rounded-sm" title="Red Card (38')" />
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Away</span>
            </div>
          </div>

          {/* Core Metrics */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Momentum */}
            <div className="p-5 bg-card border border-border rounded-sm space-y-4">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Momentum</span>
              </div>
              <div className="flex justify-between items-end font-mono">
                <span className="text-2xl text-primary font-bold">0.72</span>
                <span className="text-xl">0.31</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: "70%" }} />
                <div className="h-full bg-white/20" style={{ width: "30%" }} />
              </div>
            </div>

            {/* xG */}
            <div className="p-5 bg-card border border-border rounded-sm space-y-4">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><BarChart3 className="w-4 h-4" /> Expected Goals (xG)</span>
              </div>
              <div className="flex justify-between items-end font-mono">
                <span className="text-2xl text-primary font-bold">2.4</span>
                <span className="text-xl">0.9</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: "73%" }} />
                <div className="h-full bg-white/20" style={{ width: "27%" }} />
              </div>
            </div>

          </div>

          {/* Pressure Index Chart */}
          <div className="p-5 bg-card border border-border rounded-sm space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-primary pl-3">
              Pressure Index (15m Windows)
            </h3>
            <div className="h-32 flex items-end gap-2 pt-4">
              {[60, 40, 80, 95].map((val, i) => (
                <div key={`home-${i}`} className="flex-1 flex flex-col justify-end gap-1 h-full">
                  <div className="w-full bg-primary/80 hover:bg-primary transition-colors rounded-t-sm" style={{ height: `${val}%` }} />
                  <div className="text-[10px] text-center text-muted-foreground font-mono">{i * 15 + 15}'</div>
                </div>
              ))}
              <div className="w-px h-full bg-border mx-2" />
              {[50, 65, 30, 20].map((val, i) => (
                <div key={`away-${i}`} className="flex-1 flex flex-col justify-end gap-1 h-full">
                  <div className="w-full bg-white/20 hover:bg-white/40 transition-colors rounded-t-sm" style={{ height: `${val}%` }} />
                  <div className="text-[10px] text-center text-muted-foreground font-mono">{i * 15 + 15}'</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Summary */}
          <div className="p-5 bg-secondary/50 border border-primary/20 rounded-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <h3 className="text-xs font-mono text-primary mb-2 flex items-center gap-2">
              <Activity className="w-3 h-3" />
              LIVE ANALYSIS
            </h3>
            <p className="text-sm text-foreground leading-relaxed">
              Arsenal are dominating with sustained pressure after Chelsea's red card in the 38th minute. xG gap has widened significantly. Chelsea have retreated into a low block, limiting central penetration but conceding wide crosses.
            </p>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-6">
          
          {/* Risk & Impact */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            <div className="p-4 bg-card border border-border rounded-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Upset Risk Score</div>
                <div className="text-lg font-mono font-bold text-white">0.18 <span className="text-xs font-sans text-muted-foreground font-normal">LOW</span></div>
              </div>
              <ShieldAlert className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-destructive mb-1">Card Impact</div>
                <div className="text-sm font-medium text-white">High tactical weight</div>
              </div>
              <div className="w-4 h-5 bg-destructive rounded-sm" />
            </div>
          </div>

          {/* Signals */}
          <div className="p-5 bg-card border border-border rounded-sm space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active Signals</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <div className="text-sm">Red card changed attacking balance</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <div className="text-sm">Arsenal pressure rising last 10 min</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
                <div className="text-sm text-muted-foreground">Match state consistent with pre-match expectation</div>
              </div>
            </div>
          </div>

          {/* Event Feed */}
          <div className="p-5 bg-card border border-border rounded-sm space-y-4 flex-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Match Events</h3>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-border">
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="font-mono text-xs w-10 text-right md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2 bg-background z-10 px-1 border border-border rounded text-muted-foreground">
                  61'
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-sm border border-border bg-card">
                  <div className="font-bold text-sm">Goal (Arsenal)</div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:even:flex-row-reverse group">
                <div className="font-mono text-xs w-10 text-right md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2 bg-background z-10 px-1 border border-border rounded text-muted-foreground">
                  41'
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-sm border border-border bg-card">
                  <div className="font-bold text-sm">Goal (Chelsea)</div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:even:flex-row-reverse group">
                <div className="font-mono text-xs w-10 text-right md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2 bg-destructive/20 z-10 px-1 border border-destructive/50 rounded text-destructive">
                  38'
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-sm border border-destructive/30 bg-destructive/10">
                  <div className="font-bold text-sm text-destructive flex items-center gap-2">
                    <span className="w-2 h-3 bg-destructive rounded-sm" /> Red Card (Chelsea)
                  </div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="font-mono text-xs w-10 text-right md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2 bg-background z-10 px-1 border border-border rounded text-muted-foreground">
                  23'
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-sm border border-border bg-card">
                  <div className="font-bold text-sm">Goal (Arsenal)</div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
