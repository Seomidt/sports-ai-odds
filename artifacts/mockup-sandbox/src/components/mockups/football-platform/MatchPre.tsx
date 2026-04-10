import React from "react";
import { Clock, ShieldCheck, Crosshair, FileText } from "lucide-react";

export function MatchPre() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 dark font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="pb-6 border-b border-border flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <span className="px-2 py-0.5 border border-border rounded font-mono text-xs">LA LIGA</span>
              <Clock className="w-3 h-3" />
              <span className="font-mono">Tomorrow 20:45</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Real Madrid <span className="text-muted-foreground font-normal mx-2">vs</span> Barcelona</h1>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Model Favorite</div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="font-bold text-primary">Real Madrid</span>
              <span className="font-mono text-xs text-primary/70 ml-2">CONF: 0.68</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Signals List */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-primary pl-3">
                Pre-Match Signals
              </h3>
              
              <div className="space-y-3">
                {[
                  { label: "Home team form advantage", value: "RMA 0.82 vs BAR 0.71", hit: "74%", n: "38", type: "positive" },
                  { label: "High-scoring fixture likely", value: "Both avg > 2.1 goals", hit: "68%", n: "52", type: "neutral" },
                  { label: "Set piece threat", value: "RMA 38% goals from SP", hit: "61%", n: "29", type: "positive" },
                  { label: "Away weakness index", value: "BAR 0.44 weakness", hit: "55%", n: "18", type: "negative" }
                ].map((s, i) => (
                  <div key={i} className="group p-3 border border-border rounded bg-background hover:border-primary/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {s.type === 'positive' && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        {s.type === 'neutral' && <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                        {s.type === 'negative' && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        <span className="font-medium text-sm">{s.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono ml-3.5">{s.value}</div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <div className="text-xs text-muted-foreground">
                        <span className="text-foreground font-mono font-medium">{s.hit}</span> holds true
                        <br />
                        <span className="opacity-50">({s.n} matches)</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Preview */}
            <div className="bg-secondary/30 border border-border p-5 rounded-sm flex gap-4">
              <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-mono text-muted-foreground mb-2">SYNTHESIS</h4>
                <p className="text-sm leading-relaxed text-foreground/90">
                  Real Madrid enter this clash as slight favorites on the back of superior home form and a stronger set-piece record. Barcelona's away weakness index has been flagged by the model over their last 5 away fixtures. Expect a tight first half with Real Madrid capitalizing on set-piece opportunities.
                </p>
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Form & H2H */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Team Form (Last 5)</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">RMA</span>
                    <div className="flex gap-1">
                      {['W', 'W', 'D', 'W', 'W'].map((r, i) => (
                        <span key={i} className={`w-6 h-6 flex items-center justify-center text-[10px] font-mono font-bold rounded-sm ${r === 'W' ? 'bg-primary/20 text-primary border border-primary/30' : r === 'D' ? 'bg-muted text-muted-foreground border border-border' : 'bg-destructive/20 text-destructive border border-destructive/30'}`}>{r}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">BAR</span>
                    <div className="flex gap-1">
                      {['W', 'L', 'W', 'W', 'D'].map((r, i) => (
                        <span key={i} className={`w-6 h-6 flex items-center justify-center text-[10px] font-mono font-bold rounded-sm ${r === 'W' ? 'bg-primary/20 text-primary border border-primary/30' : r === 'D' ? 'bg-muted text-muted-foreground border border-border' : 'bg-destructive/20 text-destructive border border-destructive/30'}`}>{r}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-border">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">H2H (Last 5)</h4>
                <div className="text-sm font-mono flex items-center gap-2">
                  <span className="text-primary font-bold">3</span> - <span>1</span> - <span>1</span>
                  <span className="text-xs font-sans text-muted-foreground ml-2">(RMA favor)</span>
                </div>
              </div>
            </div>

            {/* Absences */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key Absences</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span>Bellingham (RMA)</span>
                  <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">DOUBT</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Pedri (BAR)</span>
                  <span className="text-xs font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">OUT</span>
                </li>
              </ul>
            </div>

            {/* Watch Factors */}
            <div className="bg-card border border-border rounded-sm p-5 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Factors to Watch</h4>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-start gap-2">
                  <Crosshair className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>Real Madrid set-piece efficiency vs Barca zonal marking</span>
                </li>
                <li className="flex items-start gap-2">
                  <Crosshair className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>Midfield transition speed in first 15 mins</span>
                </li>
                <li className="flex items-start gap-2">
                  <Crosshair className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>Impact of Bellingham absence on xG generation</span>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
