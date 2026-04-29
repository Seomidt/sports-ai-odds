import { Link } from "wouter";
import {
  ArrowRight, Shield, Zap, LineChart, Brain, Activity,
  Globe, TrendingUp, CheckCircle2, Target, Database,
  BarChart3, Clock, Trophy, RefreshCw, Bell, FlaskConical,
  ChevronRight, XCircle,
} from "lucide-react";

const LEAGUES = [
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "Champions League", "Europa League", "Conference League", "Championship",
  "2. Bundesliga", "Eredivisie", "Primeira Liga", "Belgian Pro League",
  "Superliga", "Allsvenskan", "Süper Lig", "Scottish Premiership",
  "Eliteserien", "Ekstraklasa", "J1 League", "MLS", "Liga MX",
  "A-League Men", "K League 1", "1. Division", "Veikkausliiga", "Bundesliga (Austria)"
];

// Real backtest numbers — Algorithm v3, 4,197 resolved tips
const BACKTEST_STATS = [
  { value: "+23.4u", label: "Draw tips profit", color: "text-teal-400" },
  { value: "85%", label: "Home win hit rate", color: "text-teal-400" },
  { value: "4,197", label: "Tips backtested", color: "text-primary" },
  { value: "27", label: "Leagues tracked", color: "text-primary" },
];

const WHY_US = [
  {
    icon: FlaskConical,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Backtested, not guessed",
    desc: "Every market is tested across 4,197 real tips before it goes live. If the numbers don't add up, the market is disabled — no matter how good it sounds in theory. Double Chance? Disabled. Over/Under? Disabled. Only what works.",
  },
  {
    icon: Brain,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    title: "10 signal dimensions",
    desc: "The algorithm reads form strings, goals scored/conceded per game, clean-sheet rates, league position, head-to-head records, and live odds movement — then decides whether there's genuine edge before placing a tip.",
  },
  {
    icon: RefreshCw,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    title: "It grades itself after every match",
    desc: "After the final whistle, each tip is automatically marked HIT or MISS. The AI writes a self-critique and calibrates future predictions. It doesn't protect its ego — it updates its model.",
  },
  {
    icon: Zap,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "Live every 15 seconds",
    desc: "Once a match kicks off, the platform switches to sprint mode. Score, in-play odds, and signals refresh every 15 seconds. The AI narrates what's happening and flags momentum shifts in real time.",
  },
];

const FEATURES = [
  {
    icon: Target,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Value Odds Dashboard",
    desc: "The main view shows only bets with positive expected value. AI probability is stacked against implied market odds — edge ≥ 5% = Value, ≥ 15% = Strong Value. Noise is filtered out automatically.",
  },
  {
    icon: BarChart3,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    title: "Pre-Match Analysis",
    desc: "Before kickoff, the platform computes signals from standings, H2H records, form, lineups, weather, and market odds. Every tip is traceable — you can see exactly what fired.",
  },
  {
    icon: Globe,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "27 Leagues, fully automated",
    desc: "From Premier League to K League 1 — all 27 leagues sync automatically every day. Fixtures, lineups, standings, odds and predictions are pre-cached so analysis is instant.",
  },
  {
    icon: Trophy,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    title: "Performance Dashboard",
    desc: "Full transparency on how the algorithm performs — per-market hit rates, units won/lost, ROI, and backtest breakdowns. No cherry-picking. Every tip is logged and counted.",
  },
  {
    icon: Bell,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "Follow & Alerts",
    desc: "Bookmark any fixture and get it in your Following feed. The alert engine flags high-value moments automatically based on AI verdict and signal thresholds — so you never miss a window.",
  },
  {
    icon: LineChart,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Odds Movement Tracking",
    desc: "Pre-match odds snapshots and live in-play odds are tracked per fixture. Line moves between snapshots are used as a signal — sharp moves indicate where informed money is going.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Signals are computed before kickoff",
    desc: "Form, H2H, standings, goals per game, clean-sheet rate, weather, and odds movement — all scored and stored before the match starts.",
  },
  {
    n: "02",
    title: "Only high-edge tips are published",
    desc: "The algorithm applies backtest-proven gates. If the signal combination doesn't have a positive track record, no tip is generated for that market.",
  },
  {
    n: "03",
    title: "Live AI narrates the match",
    desc: "Once the whistle blows, live scores, in-play odds and signals update every 15 seconds. Momentum shifts are flagged in real time.",
  },
  {
    n: "04",
    title: "Post-match: every tip is graded",
    desc: "After FT, each tip is automatically checked — HIT or MISS logged, a post-match summary written, and calibration data fed back into the model.",
  },
];

export function Home() {
  return (
    <div className="min-h-screen w-full text-white overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 blur-3xl rounded-full pointer-events-none" />

        <div className="z-10 text-center max-w-4xl">
          <div className="inline-flex items-center justify-center p-3 mb-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <img src="/logo.png" alt="Signal Terminal" className="w-20 h-20 object-contain" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono tracking-widest mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            LIVE — {LEAGUES.length} LEAGUES IN PLAY
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 font-mono leading-none">
            SIGNAL<br /><span className="text-primary">TERMINAL</span>
          </h1>

          <p className="text-xl text-muted-foreground mb-4 max-w-2xl mx-auto leading-relaxed">
            AI-powered betting intelligence. Backtested algorithms, live match signals, and full transparency on every tip — so you always know why a bet was placed.
          </p>
          <p className="text-sm text-muted-foreground/60 mb-12 font-mono">
            27 leagues · 4,197 tips backtested · Live every 15 seconds · Self-grading AI
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link href="/login">
              <div className="h-12 px-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer font-mono tracking-wider">
                TRY FREE 14 DAYS <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </Link>
            <Link href="/login">
              <div className="h-12 px-8 flex items-center justify-center rounded-md glass-card text-white font-semibold hover:bg-white/10 transition-colors cursor-pointer font-mono tracking-wider">
                SIGN IN
              </div>
            </Link>
          </div>

          {/* Real backtest stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {BACKTEST_STATS.map((s) => (
              <div key={s.label} className="glass-card rounded-xl p-4 text-center">
                <div className={`text-3xl font-mono font-bold mb-1 ${s.color}`}>{s.value}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── LEAGUES TICKER ──────────────────────────────────────── */}
      <div className="border-y border-white/8 bg-white/3 py-4 overflow-hidden">
        <div className="flex gap-8 animate-[scroll_30s_linear_infinite] whitespace-nowrap" style={{ width: "max-content" }}>
          {[...LEAGUES, ...LEAGUES].map((l, i) => (
            <span key={i} className="text-xs font-mono text-muted-foreground/60 uppercase tracking-widest flex items-center gap-3">
              <span className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ── WHY SIGNAL TERMINAL ─────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Why Signal Terminal</p>
          <h2 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter mb-4">
            NOT TIPS.<br />EVIDENCE.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Most tipsters give you opinions. We give you a backtested algorithm that shows its work — and disables markets that don't perform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {WHY_US.map((f) => (
            <div key={f.title} className={`glass-card rounded-xl p-6 border ${f.border} group hover:scale-[1.01] transition-transform duration-200`}>
              <div className={`inline-flex p-2.5 rounded-lg ${f.bg} mb-4`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <h3 className="text-base font-bold text-white mb-2 font-mono tracking-wide">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── BACKTEST CALLOUT ────────────────────────────────────── */}
      <div className="border-t border-white/8 bg-white/2">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="glass-card rounded-2xl p-8 md:p-12 border border-primary/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
            <div className="relative z-10 grid md:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Algorithm v3 — 4,197 Tips</p>
                <h2 className="text-3xl md:text-4xl font-bold font-mono tracking-tighter mb-4">
                  REAL NUMBERS.<br />NO SPIN.
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Every market is backtested across thousands of resolved tips before launch. If a market loses money in testing, it's disabled — regardless of how popular that bet type is. What's left is what actually works.
                </p>
                <div className="flex flex-wrap gap-3">
                  {["Draw tips +23.4u", "Home win 85% hit rate", "BTTS +8.6u", "AH +5.2u"].map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Match Result — Draw", detail: "Form signals fired · 61% hit rate", units: "+23.4u", hit: true },
                  { label: "Match Result — Home Win", detail: "Away team cold (0W in 5) · 85% hit", units: "+10.4u", hit: true },
                  { label: "BTTS Yes", detail: "Both GFA ≥ 1.2 · odds 1.58–1.85", units: "+8.6u", hit: true },
                  { label: "Double Chance", detail: "Disabled — ALL conditions negative", units: "−55u", hit: false },
                ].map((ex) => (
                  <div key={ex.label} className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{ex.label}</div>
                      <div className="text-sm text-white/60 mt-0.5 font-mono">{ex.detail}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-mono font-bold ${ex.hit ? "text-teal-400" : "text-red-400"}`}>{ex.units}</span>
                      {ex.hit
                        ? <CheckCircle2 className="w-4 h-4 text-teal-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES GRID ───────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Platform Features</p>
          <h2 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter mb-4">
            EVERYTHING IN<br />ONE PLACE
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            From pre-match analysis to live signals to post-match grading — fully automated, 24/7.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className={`glass-card rounded-xl p-6 border ${f.border} group hover:scale-[1.01] transition-transform duration-200`}>
              <div className={`inline-flex p-2.5 rounded-lg ${f.bg} mb-4`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <h3 className="text-base font-bold text-white mb-2 font-mono tracking-wide">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <div className="border-t border-white/8 bg-white/2">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Automated Pipeline</p>
            <h2 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter mb-4">HOW IT WORKS</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              From raw data to AI-graded tips — fully automated from kickoff to final whistle.
            </p>
          </div>

          <div className="space-y-4">
            {STEPS.map((step, i) => (
              <div key={step.n} className="glass-card rounded-xl p-6 flex gap-6 items-start group">
                <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="text-primary font-mono font-bold text-sm">{step.n}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-white mb-1 font-mono">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-primary/30 shrink-0 mt-3 hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── LEAGUES GRID ────────────────────────────────────────── */}
      <div className="border-t border-white/8">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-12">
            <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Coverage</p>
            <h2 className="text-4xl font-bold font-mono tracking-tighter mb-4">27 LEAGUES TRACKED</h2>
            <p className="text-muted-foreground">From the top European divisions to MLS, J1 League, and beyond.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {LEAGUES.map((l) => (
              <span key={l} className="text-xs font-mono px-3 py-1.5 rounded-full glass-card border border-white/8 text-muted-foreground hover:text-white hover:border-primary/30 transition-colors">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ───────────────────────────────────────────── */}
      <div className="border-t border-white/8">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center justify-center p-3 mb-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <img src="/logo.png" alt="Signal Terminal" className="w-12 h-12 object-contain" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter mb-4">
            SEE IF THE EDGE<br />IS REAL
          </h2>
          <p className="text-muted-foreground text-lg mb-4 max-w-xl mx-auto">
            Try Signal Terminal free for 14 days. No credit card needed to get started.
          </p>
          <p className="text-sm text-muted-foreground/50 mb-10 font-mono">
            After the trial: €14.99/month — cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <div className="h-14 px-10 flex items-center justify-center rounded-md bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors cursor-pointer font-mono tracking-wider text-base">
                START FREE TRIAL <ArrowRight className="ml-2 w-5 h-5" />
              </div>
            </Link>
            <Link href="/login">
              <div className="h-14 px-10 flex items-center justify-center rounded-md glass-card text-white font-bold hover:bg-white/10 transition-colors cursor-pointer font-mono tracking-wider text-base">
                SIGN IN
              </div>
            </Link>
          </div>
          <p className="text-xs font-mono text-muted-foreground/50 mt-8 uppercase tracking-widest">
            27 Leagues · Backtested Algorithm · Live 15s · Self-Improving AI
          </p>
        </div>
      </div>

    </div>
  );
}
