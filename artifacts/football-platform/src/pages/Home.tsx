import { Link } from "wouter";
import {
  ArrowRight, Shield, Zap, LineChart, Brain, Activity,
  Globe, TrendingUp, CheckCircle2, Star, Target, Database,
  BarChart3, Users, Clock, Eye, Layers, ChevronRight, Trophy,
  RefreshCw, BookOpen, Bell
} from "lucide-react";

const LEAGUES = [
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "Champions League", "Europa League", "Conference League", "Championship",
  "2. Bundesliga", "Eredivisie", "Primeira Liga", "Belgian Pro League",
  "Superliga", "Allsvenskan", "Süper Lig", "Scottish Premiership",
  "Eliteserien", "Ekstraklasa", "J1 League", "MLS", "Liga MX",
  "A-League Men", "K League 1", "1. Division", "Veikkausliiga", "Bundesliga (Austria)"
];

const STATS = [
  { value: "27", label: "Leagues Tracked" },
  { value: "15s", label: "Live Update Rate" },
  { value: "3", label: "AI Tips Per Match" },
  { value: "100%", label: "Automated Analysis" },
];

const FEATURES = [
  {
    icon: Brain,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    title: "AI Betting Intelligence",
    desc: "Claude Haiku generates 3 structured tips per fixture — match result, over/under 2.5, and BTTS — each with a trust score from 1–10, value rating, and detailed reasoning based on form, H2H, odds movement, and signal data.",
  },
  {
    icon: Zap,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "Live Signal Engine",
    desc: "When matches kick off, the system switches to 15-second sprint mode. Score, minute, in-play odds and live signals are fed directly to the AI, generating real-time match narrative and momentum verdicts.",
  },
  {
    icon: Target,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Value Odds Dashboard",
    desc: "The main view highlights only the bets with positive expected value. AI probability is compared against implied market odds — edge ≥ 5% = Value, ≥ 15% = Strong Value. Overpriced tips are filtered out automatically.",
  },
  {
    icon: RefreshCw,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    title: "Self-Improving AI",
    desc: "After each match ends, the AI reviews its own tips against the final result. HIT or MISS is logged, a post-match summary is generated, and the calibration data feeds back into future signal weighting.",
  },
  {
    icon: BarChart3,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Pre-Match Analysis",
    desc: "Before kickoff, the platform computes signals from standings, head-to-head records, form, injury data, lineups, squad depth, and market odds. Features are scored and stored so every tip is traceable.",
  },
  {
    icon: Globe,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "27 Leagues, All Automated",
    desc: "From the Premier League to K League 1 — all 27 leagues sync automatically every day at 5:00 AM. Fixtures, lineups, standings, odds and predictions are pre-cached so analysis is instant when you open a match.",
  },
  {
    icon: LineChart,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    title: "Odds Tracking",
    desc: "Pre-match odds snapshots and live in-play odds are tracked per fixture with bookmaker source. Odds movement between snapshots is used as a signal — sharp line moves indicate informed money.",
  },
  {
    icon: Trophy,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    title: "Standings & Statistics",
    desc: "Full league tables for all 27 competitions with goals, form, goal difference and column tooltips. Top scorers, assist leaders and discipline charts are updated continuously throughout the season.",
  },
  {
    icon: Database,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Historical Data Engine",
    desc: "Multiple seasons of historical fixture data can be seeded into the database from admin. The AI uses H2H records, team season stats and past match patterns as core inputs for its pre-match predictions.",
  },
  {
    icon: Bell,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    title: "Follow & Alerts",
    desc: "Bookmark any fixture and get it surfaced in your Following feed. The alert engine monitors live match conditions and flags alert-worthy moments automatically based on AI verdict and signal thresholds.",
  },
  {
    icon: Users,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    title: "Admin Panel & User Control",
    desc: "Invite-only access model with full admin panel. Manage users and roles, monitor AI token usage, track API request counts and daily averages, seed historical data, and view AI accuracy over time.",
  },
  {
    icon: Shield,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/20",
    title: "Secure, Restricted Access",
    desc: "Built on Clerk authentication with role-based access. Users require admin approval before accessing the platform — ideal for syndicates, private clubs, and professional analyst teams.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Fixtures are synced automatically",
    desc: "Every morning at 05:00, the system fetches all fixtures across 27 leagues, including lineups, odds, predictions, H2H data and injury reports.",
  },
  {
    n: "02",
    title: "AI signals are computed",
    desc: "Before each match, dozens of signals are scored — form momentum, home/away advantage, odds movement, H2H win rates, squad depth, and more.",
  },
  {
    n: "03",
    title: "Tips are generated with value ratings",
    desc: "Claude Haiku reads the full signal context and outputs 3 structured betting tips per fixture, each with a trust score, recommendation, and edge calculation.",
  },
  {
    n: "04",
    title: "Live AI narrates the match",
    desc: "Once the whistle blows, live scores, in-play odds and signals update every 15 seconds. The AI generates a real-time headline and momentum verdict.",
  },
  {
    n: "05",
    title: "Post-match grading & improvement",
    desc: "After FT, the AI reviews each tip against the final result, writes a self-critique, and logs HIT/MISS. This data improves future calibration.",
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
            Professional AI sports intelligence. Real-time betting signals, live match analysis, and self-improving prediction models — built for analysts and syndicates.
          </p>
          <p className="text-sm text-muted-foreground/60 mb-12 font-mono">
            27 leagues · 15-second live updates · Claude AI · Automated grading
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link href="/sign-up">
              <div className="h-12 px-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer font-mono tracking-wider">
                GET ACCESS <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </Link>
            <Link href="/sign-in">
              <div className="h-12 px-8 flex items-center justify-center rounded-md glass-card text-white font-semibold hover:bg-white/10 transition-colors cursor-pointer font-mono tracking-wider">
                SIGN IN
              </div>
            </Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="glass-card rounded-xl p-4 text-center">
                <div className="text-3xl font-mono font-bold text-primary mb-1">{s.value}</div>
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

      {/* ── WHAT IT DOES ────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Platform Features</p>
          <h2 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter mb-4">
            EVERYTHING YOU NEED<br />TO EDGE THE MARKET
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            A complete data pipeline — from fixture sync to AI tips to post-match grading — running fully automated, 24/7.
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
              From raw fixture data to AI-graded tips — fully automated from kickoff to final whistle.
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

      {/* ── AI ACCURACY CALLOUT ─────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="glass-card rounded-2xl p-8 md:p-12 border border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
          <div className="relative z-10 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">AI Self-Grading</p>
              <h2 className="text-3xl md:text-4xl font-bold font-mono tracking-tighter mb-4">
                THE AI GRADES<br />ITS OWN TIPS
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                After every final whistle, each tip is automatically reviewed. The AI checks whether its recommendation was a HIT or MISS, writes a post-match narrative, and flags what it got right — or wrong. Over time, this improves signal weighting and trust score calibration.
              </p>
              <div className="flex flex-wrap gap-3">
                {["HIT tracking", "MISS analysis", "Trust score calibration", "Bet type accuracy breakdown"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-400">
                    <CheckCircle2 className="w-3 h-3" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Match Result tip", outcome: "HIT", score: 8, color: "text-teal-400 bg-teal-400/10 border-teal-400/30" },
                { label: "Over 2.5 Goals", outcome: "HIT", score: 7, color: "text-teal-400 bg-teal-400/10 border-teal-400/30" },
                { label: "BTTS — Yes", outcome: "MISS", score: 5, color: "text-red-400 bg-red-400/10 border-red-400/30" },
              ].map((ex) => (
                <div key={ex.label} className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{ex.label}</div>
                    <div className="text-sm font-bold text-white mt-0.5 font-mono">Trust Score: {ex.score}/10</div>
                  </div>
                  <span className={`text-xs font-mono font-bold px-3 py-1 rounded border ${ex.color}`}>{ex.outcome}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── LEAGUES GRID ────────────────────────────────────────── */}
      <div className="border-t border-white/8 bg-white/2">
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

      {/* ── FOR WHO ─────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <p className="text-xs font-mono text-primary uppercase tracking-widest mb-3">Access</p>
          <h2 className="text-4xl font-bold font-mono tracking-tighter mb-4">BUILT FOR PROFESSIONALS</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: Target,
              color: "text-primary",
              title: "Independent Analysts",
              desc: "Get AI-generated pre-match intelligence and live narrative for every tracked fixture without building your own data pipeline.",
            },
            {
              icon: Users,
              color: "text-violet-400",
              title: "Betting Syndicates",
              desc: "Restricted access, role-based invites, and centralised signal tracking make it easy to run analysis for a team.",
            },
            {
              icon: Eye,
              color: "text-teal-400",
              title: "Sports Data Professionals",
              desc: "Full API data, odds tracking, H2H history, squad depth, injuries, top scorers — everything in one place.",
            },
          ].map((c) => (
            <div key={c.title} className="glass-card rounded-xl p-7 border border-white/8 text-center">
              <div className="inline-flex p-3 rounded-xl bg-white/5 mb-5">
                <c.icon className={`w-6 h-6 ${c.color}`} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3 font-mono">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FINAL CTA ───────────────────────────────────────────── */}
      <div className="border-t border-white/8">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center justify-center p-3 mb-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <img src="/logo.png" alt="Signal Terminal" className="w-12 h-12 object-contain" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-mono tracking-tighter mb-4">
            START READING<br />THE SIGNALS
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            Access is by invitation only. Request access and an admin will approve your account.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up">
              <div className="h-14 px-10 flex items-center justify-center rounded-md bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors cursor-pointer font-mono tracking-wider text-base">
                REQUEST ACCESS <ArrowRight className="ml-2 w-5 h-5" />
              </div>
            </Link>
            <Link href="/sign-in">
              <div className="h-14 px-10 flex items-center justify-center rounded-md glass-card text-white font-bold hover:bg-white/10 transition-colors cursor-pointer font-mono tracking-wider text-base">
                SIGN IN
              </div>
            </Link>
          </div>
          <p className="text-xs font-mono text-muted-foreground/50 mt-8 uppercase tracking-widest">
            27 Leagues · AI-Powered · Self-Improving · Live 15s
          </p>
        </div>
      </div>

    </div>
  );
}
