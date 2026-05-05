import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { HelpTooltip } from "@/components/HelpTooltip";
import { supabase } from "@/lib/supabase";
import {
  Activity, TrendingUp, Zap, ChevronRight, ChevronDown,
  Target, Flame, Trophy, TrendingDown, BarChart3, CalendarCheck, Star,
  CheckCircle2, XCircle, MinusCircle, HelpCircle
} from "lucide-react";

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

interface ValueTip {
  id: number;
  fixtureId: number;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoff: string | null;
  leagueName: string | null;
  recommendation: string;
  betType: string;
  betSide: string | null;
  trustScore: number;
  aiProbability: number | null;
  impliedProbability: number | null;
  confidence: "high" | "medium" | "low" | null;
  edge: number | null;
  reasoning: string;
  marketOdds: number | null;
  valueRating: string | null;
  valueScore: number;
  combinedScore: number;
  createdAt: string;
  // API-Football prediction fields
  winnerComment: string | null;
  underOver: string | null;
  winOrDraw: boolean | null;
  comparison: Record<string, { home: string; away: string }> | null;
}

interface TipSummary {
  id: number;
  fixtureId: number;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoff: string | null;
  leagueName: string | null;
  recommendation: string;
  betType: string;
  trustScore: number;
  marketOdds: number | null;
  valueRating: string | null;
  edge: number | null;
  aiProbability: number | null;
  impliedProbability: number | null;
  confidence: "high" | "medium" | "low" | null;
  winnerComment: string | null;
  underOver: string | null;
}

interface YesterdayTip extends TipSummary {
  outcome: string | null;
  reviewHeadline: string | null;
}

interface YesterdayUncovered {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  leagueName: string | null;
  statusShort: string | null;
}

interface DailySummary {
  todayPicks: TipSummary[];
  yesterdayTips: YesterdayTip[];
  yesterdayUncovered: YesterdayUncovered[];
  yesterdayResults: { wins: number; losses: number; pushes: number; total: number; pending: number };
  streak: { current: number; type: "win" | "loss" | "none"; badge: "warming" | "hot" | "elite" | null };
  roi: { total: number; totalBets: number; netReturn: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const betTypeLabel = (t: string) => {
  if (t === 'match_result') return 'Match Result';
  if (t === 'over_under') return 'Goals Market';
  if (t === 'btts') return 'Both Teams Score';
  if (t === 'corners') return 'Corners Market';
  if (t === 'asian_handicap') return 'Asian Handicap';
  if (t === 'total_cards') return 'Cards Market';
  if (t === 'double_chance') return 'Double Chance';
  if (t === 'draw_no_bet') return 'Draw No Bet';
  if (t === 'win_to_nil') return 'Win to Nil';
  if (t === 'first_half_goals') return '1st Half Goals';
  if (t === 'no_bet') return 'No Bet';
  return t;
};

const BADGE_CONFIG = {
  warming: { label: '3+ WIN STREAK', icon: Flame, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  hot:     { label: '7+ WIN STREAK', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30' },
  elite:   { label: 'ELITE STREAK',  icon: Trophy, color: 'text-teal-300',  bg: 'bg-teal-400/10',  border: 'border-teal-400/30' },
};

function OutcomeIcon({ outcome }: { outcome: string | null }) {
  if (outcome === 'hit') return <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />;
  if (outcome === 'miss') return <XCircle className="w-4 h-4 text-amber-400 shrink-0" />;
  if (outcome === 'partial') return <MinusCircle className="w-4 h-4 text-violet-400 shrink-0" />;
  return <MinusCircle className="w-4 h-4 text-white/20 shrink-0" />;
}

function ValueBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const config: Record<string, { label: string; color: string; bg: string; border: string }> = {
    strong_value: { label: 'STRONG VALUE', color: 'text-teal-300', bg: 'bg-teal-400/10', border: 'border-teal-400/30' },
    value:        { label: 'VALUE',        color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
    fair:         { label: 'FAIR PRICE',   color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
    overpriced:   { label: 'OVERPRICED',   color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  };
  const c = config[rating] ?? config.fair!;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${c.color} ${c.bg} border ${c.border}`}>
      {c.label}
    </span>
  );
}

// ─── StreakRoiCard ────────────────────────────────────────────────────────────

type BadgeCfg = { label: string; icon: React.ElementType; color: string; bg: string; border: string };
type StreakState = { current: number; type: "win" | "loss" | "none"; badge: "warming" | "hot" | "elite" | null };
type RoiState = { total: number; totalBets: number; netReturn: number };

function StreakRoiCard({ streak, roi, badge }: { streak: StreakState; roi: RoiState; badge: BadgeCfg | null }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div className="glass-card rounded-xl p-4 border border-white/8 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {streak.type === 'win' ? (
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          ) : streak.type === 'loss' ? (
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Star className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Streak & ROI</span>

          <button
            onClick={() => setTooltipOpen(o => !o)}
            className="text-white/50 active:text-white/90 transition-colors -ml-1 p-0.5"
            aria-label="Hvad er dette?"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {badge && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider border ${badge.color} ${badge.bg} ${badge.border}`}>
              <badge.icon className="w-2.5 h-2.5" />
              {badge.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {streak.current > 0 && streak.type !== 'none' ? (
            <div className="text-right">
              <span className={`text-xl font-bold font-mono tabular-nums ${streak.type === 'win' ? 'text-teal-400' : 'text-amber-400'}`}>
                {streak.current}
              </span>
              <span className={`text-xs font-mono ml-1 ${streak.type === 'win' ? 'text-teal-400/70' : 'text-amber-400/70'}`}>
                {streak.type === 'win'
                  ? (streak.current === 1 ? 'win' : 'wins')
                  : (streak.current === 1 ? 'loss' : 'losses')}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50 font-mono">No streak</span>
          )}

          {roi.totalBets > 0 && (
            <div className="text-right">
              <span className={`text-xl font-bold font-mono tabular-nums ${roi.total >= 0 ? 'text-teal-400' : 'text-amber-400'}`}>
                {roi.total >= 0 ? '+' : ''}{roi.total}%
              </span>
              <span className="text-xs text-muted-foreground/50 font-mono ml-1">ROI</span>
              <div className="text-[10px] text-muted-foreground/40 font-mono">{roi.totalBets} bets</div>
            </div>
          )}
        </div>
      </div>

      {tooltipOpen && (
        <div className="mt-3 pt-3 border-t border-white/6 space-y-2">
          <div className="flex gap-3">
            <div className="flex-1 bg-white/3 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">Streak</div>
              <p className="text-xs text-white/60 leading-relaxed">
                Antal på hinanden følgende hit eller miss i AI's seneste gennemgåede tips. En vinstreak viser at modellen rammer rigtigt i træk.
              </p>
            </div>
            <div className="flex-1 bg-white/3 rounded-lg px-3 py-2.5">
              <div className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-wider mb-1">ROI</div>
              <p className="text-xs text-white/60 leading-relaxed">
                Return on Investment over alle <span className="text-white/80 font-mono">{roi.totalBets}</span> gennemgåede tips. Beregnes som om du sætter 1 enhed per tip til de viste odds. +18% = 18 øre profit per krone satset.
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/30 font-mono">Baseret på AI's egne post-match reviews. Kun til reference.</p>
        </div>
      )}
    </div>
  );
}

// ─── DailyLoopBar ────────────────────────────────────────────────────────────

function DailyLoopBar({ summary }: { summary: DailySummary }) {
  const { todayPicks, yesterdayTips, yesterdayUncovered = [], yesterdayResults, streak, roi } = summary;
  const [todayOpen, setTodayOpen] = useState(false);
  const [yesterdayOpen, setYesterdayOpen] = useState(false);

  const yr = yesterdayResults;
  const yrResolved = yr.wins + yr.losses + yr.pushes;
  const yrHitRate = yrResolved > 0 ? Math.round((yr.wins / yrResolved) * 100) : null;
  const edgePpFor = (tip: TipSummary) => {
    const implied = tip.impliedProbability ?? (tip.marketOdds && tip.marketOdds > 1 ? 1 / tip.marketOdds : null);
    return tip.aiProbability != null && implied != null ? (tip.aiProbability - implied) * 100 : null;
  };
  const edgeRankFor = (tip: TipSummary) => edgePpFor(tip) ?? (tip.edge != null ? tip.edge * 100 : Number.NEGATIVE_INFINITY);
  const topPick = todayPicks.reduce<TipSummary | null>((best, tip) => {
    if (!best) return tip;
    return edgeRankFor(tip) > edgeRankFor(best) ? tip : best;
  }, null);
  const badge = streak.badge ? BADGE_CONFIG[streak.badge] : null;

  return (
    <div className="space-y-3 mb-8">
      {/* Row 1: Today + Yesterday side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Highest Edge Picks */}
        <div className="glass-card rounded-xl border border-white/8 overflow-hidden">
          <button
            onClick={() => setTodayOpen(o => !o)}
            className="w-full text-left p-4 hover:bg-white/3 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-widest">Highest Edge</span>
                <span className="text-[9px] font-mono text-muted-foreground/40">1–7 dage</span>
              </div>
              {todayPicks.length > 0 && (
                todayOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
              )}
            </div>
            {todayPicks.length === 0 ? (
              <div className="text-sm text-muted-foreground/50">Ingen value picks de næste 7 dage</div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold font-mono text-white tabular-nums">{todayPicks.length}</span>
                  <span className="text-xs text-muted-foreground font-mono">best value picks</span>
                </div>
                {topPick && !todayOpen && (
                  <div className="text-xs text-muted-foreground/70 truncate">
                    Top: <span className="text-white/80">{topPick.recommendation}</span>
                    {(() => {
                      const pp = edgePpFor(topPick);
                      return pp != null ? <span className="text-teal-400 font-mono ml-1">{pp >= 0 ? '+' : ''}{pp.toFixed(1)}pp</span> : null;
                    })()}
                    {topPick.marketOdds != null && topPick.aiProbability == null && (
                      <span className="text-teal-400 font-mono ml-1">@ {topPick.marketOdds.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </button>

          {/* Expanded highest edge list */}
          {todayOpen && todayPicks.length > 0 && (
            <div className="border-t border-white/5 divide-y divide-white/5">
              {todayPicks.map(tip => (
                <Link key={tip.id} href={`/match/${tip.fixtureId}`}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground/50 uppercase">{betTypeLabel(tip.betType)}</span>
                        <ValueBadge rating={tip.valueRating} />
                      </div>
                      <div className="text-sm font-semibold text-white truncate">{tip.recommendation}</div>
                      {tip.winnerComment && (
                        <div className="text-[10px] text-teal-300/60 font-mono italic truncate mt-0.5">
                          {tip.winnerComment}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground/60 truncate mt-0.5">
                        {tip.homeTeam} vs {tip.awayTeam}
                        {tip.kickoff && (
                          <span className="ml-1.5 opacity-60">
                            {format(new Date(tip.kickoff), 'EEE d MMM, HH:mm')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(() => {
                        const pp = edgePpFor(tip);
                        if (pp != null) {
                          return (
                            <span className={`font-mono text-sm font-bold tabular-nums ${
                              pp >= 5 ? 'text-teal-400' :
                              pp >= -5 ? 'text-violet-400' :
                              'text-amber-400'
                            }`}>
                              {pp >= 0 ? '+' : ''}{pp.toFixed(1)}pp
                            </span>
                          );
                        }
                        if (tip.marketOdds != null) {
                          return <span className="font-mono text-sm font-bold text-teal-400">{tip.marketOdds.toFixed(2)}</span>;
                        }
                        return null;
                      })()}
                      {tip.confidence && (
                        <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded border uppercase tracking-wider ${
                          tip.confidence === 'high' ? 'text-teal-300 bg-teal-400/10 border-teal-400/30' :
                          tip.confidence === 'medium' ? 'text-violet-300 bg-violet-400/10 border-violet-400/25' :
                          'text-amber-400 bg-amber-400/10 border-amber-400/25'
                        }`}>
                          {tip.confidence}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Yesterday */}
        {(() => {
          const hasAny = yr.total > 0 || yesterdayTips.length > 0 || yesterdayUncovered.length > 0;
          return (
            <div className="glass-card rounded-xl border border-white/8 overflow-hidden">
              <button
                onClick={() => setYesterdayOpen(o => !o)}
                className="w-full text-left p-4 hover:bg-white/3 transition-colors"
                disabled={!hasAny}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Yesterday</span>
                    <span onClick={e => e.stopPropagation()}>
                      <HelpTooltip side="bottom">
                        <p className="leading-relaxed">
                          Tracker kun tips med <span className="text-teal-300">Value</span> eller <span className="text-teal-300">Strong Value</span> rating (edge ≥ 5pp) — det er de bets vi rent faktisk anbefaler at spille.
                        </p>
                      </HelpTooltip>
                    </span>
                  </div>
                  {hasAny && (
                    yesterdayOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                  )}
                </div>
                {!hasAny ? (
                  <div className="text-sm text-muted-foreground/50">No results from yesterday</div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className={`text-3xl font-bold font-mono tabular-nums ${yrHitRate != null && yrHitRate >= 50 ? 'text-teal-400' : 'text-amber-400'}`}>
                        {yrHitRate != null ? `${yrHitRate}%` : '—'}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">hit rate</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] font-mono">
                      <span className="text-teal-400">{yr.wins}W</span>
                      <span className="text-white/20">·</span>
                      <span className="text-amber-400">{yr.losses}L</span>
                      {yr.pushes > 0 && (
                        <>
                          <span className="text-white/20">·</span>
                          <span className="text-violet-400">{yr.pushes}P</span>
                        </>
                      )}
                      {yr.pending > 0 && (
                        <>
                          <span className="text-white/20">·</span>
                          <span className="text-white/40">{yr.pending} pending</span>
                        </>
                      )}
                      <span className="text-white/20 ml-1">of {yr.total}</span>
                      {yesterdayUncovered.length > 0 && (
                        <span className="text-white/25 ml-1">· {yesterdayUncovered.length} no coverage</span>
                      )}
                    </div>
                  </>
                )}
              </button>

              {/* Expanded yesterday's tips + uncovered */}
              {yesterdayOpen && (yesterdayTips.length > 0 || yesterdayUncovered.length > 0) && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {yesterdayTips.map(tip => (
                    <Link key={tip.id} href={`/match/${tip.fixtureId}`}>
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors cursor-pointer">
                        <OutcomeIcon outcome={tip.outcome} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground/50 font-mono uppercase mb-0.5">{betTypeLabel(tip.betType)}</div>
                          <div className="text-sm font-semibold text-white truncate">{tip.recommendation}</div>
                          <div className="text-xs text-muted-foreground/60 truncate mt-0.5">
                            {tip.homeTeam} vs {tip.awayTeam}
                          </div>
                          {tip.reviewHeadline && (
                            <div className="text-[11px] text-muted-foreground/40 truncate mt-0.5 italic">{tip.reviewHeadline}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {tip.marketOdds != null && (
                            <span className="font-mono text-xs text-muted-foreground/60">{tip.marketOdds.toFixed(2)}</span>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25" />
                        </div>
                      </div>
                    </Link>
                  ))}

                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Row 2: Streak & ROI (full width) */}
      <StreakRoiCard streak={streak} roi={roi} badge={badge} />
    </div>
  );
}

function OddsAendringPreview() {
  return (
    <div className="glass-card rounded-xl border border-white/8 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">Odds Ændring</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">Live bevægelser</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground/50 font-mono px-1">
          Odds-bevægelser vises live under den kamp du kigger på — gå ind på en kamp for at se ændringer i realtid.
        </p>
        {[
          { label: "Hjemme vinder", from: "2.10", to: "1.85", dir: "down" },
          { label: "Uafgjort", from: "3.40", to: "3.60", dir: "up" },
          { label: "Ude vinder", from: "3.80", to: "4.20", dir: "up" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs bg-white/3 rounded-lg px-3 py-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dir === 'down' ? 'bg-teal-400' : 'bg-amber-400'}`} />
            <span className="text-white/50 flex-1">{item.label}</span>
            <span className="font-mono text-muted-foreground/40 line-through text-[10px]">{item.from}</span>
            <span className={`font-mono font-bold text-[11px] ${item.dir === 'down' ? 'text-teal-400' : 'text-amber-400'}`}>
              {item.dir === 'down' ? '▼' : '▲'} {item.to}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ValueOddsCard ────────────────────────────────────────────────────────────

// Trust score: 0-100 scale with progress bar and trend arrow
function TrustBadge({ score, confidence }: { score: number | null; confidence?: "high" | "medium" | "low" | null }) {
  if (score == null) return null;
  const clamped = Math.max(1, Math.min(9, Math.round(score)));
  const pct = Math.round((clamped / 9) * 100);
  const color = pct >= 70 ? 'text-teal-300' : pct >= 50 ? 'text-violet-300' : 'text-amber-400';
  const barColor = pct >= 70 ? 'bg-teal-400/70' : pct >= 50 ? 'bg-violet-400/70' : 'bg-amber-400/70';
  const trend = confidence === 'high' ? { icon: '▲', cls: 'text-teal-400' }
    : confidence === 'low' ? { icon: '▼', cls: 'text-amber-400' }
    : null;
  return (
    <div className="flex flex-col items-end gap-1.5" title="Trust score 0–100 baseret på sandsynlighedsstyrke og datakvalitet">
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums leading-none ${color}`}>{pct}</span>
        <span className="text-[10px] font-mono text-white/30">trust</span>
        {trend && <span className={`text-[10px] font-bold ${trend.cls}`}>{trend.icon}</span>}
      </div>
      <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ValueOddsCard({ tip, rank }: { tip: ValueTip; rank: number }) {
  const isTopValue = tip.valueRating === 'strong_value' || tip.valueRating === 'value';
  const borderClass = isTopValue
    ? 'border-teal-400/30 shadow-[0_0_20px_rgba(0,255,200,0.06)]'
    : 'border-white/8';
  const rankColor = rank <= 3 ? 'text-teal-400' : rank <= 6 ? 'text-amber-400' : 'text-violet-400';

  const impliedFromOdds = tip.marketOdds != null && tip.marketOdds > 1 ? 1 / tip.marketOdds : null;
  const impliedProb = tip.impliedProbability ?? impliedFromOdds;
  const implPct = impliedProb != null ? Math.round(impliedProb * 100) : null;

  return (
    <div className={`glass-card rounded-xl border ${borderClass} overflow-hidden`}>
      {/* ── Clickable main area ── */}
      <div className="w-full text-left p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono font-bold ${rankColor} opacity-50`}>#{rank}</span>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{betTypeLabel(tip.betType)}</span>
            <ValueBadge rating={tip.valueRating} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TrustBadge score={tip.trustScore} confidence={tip.confidence} />
            {tip.marketOdds != null && (
              <span className="font-mono text-lg font-bold text-teal-400 tabular-nums">{tip.marketOdds.toFixed(2)}</span>
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-lg font-bold text-white leading-tight mb-1">{tip.recommendation}</div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {implPct != null && (
              <span className="text-[11px] font-mono text-muted-foreground">
                Market <span className="text-white/60 tabular-nums font-bold">{implPct}%</span>
              </span>
            )}
            {tip.underOver && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${
                tip.underOver.startsWith('+') ? 'text-teal-300 bg-teal-400/10 border-teal-400/25' : 'text-violet-300 bg-violet-400/10 border-violet-400/25'
              }`}>
                {tip.underOver.startsWith('+') ? 'Over' : 'Under'} {tip.underOver.replace(/[+-]/, '')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2 text-sm text-white/60">
          <span className="font-medium">{tip.homeTeam}</span>
          <span className="text-white/20">vs</span>
          <span className="font-medium">{tip.awayTeam}</span>
        </div>

        {tip.winnerComment && (
          <div className="text-xs text-teal-300/70 font-mono italic mb-2 leading-snug">
            "{tip.winnerComment}"
          </div>
        )}

        <p className="text-xs text-white/50 leading-relaxed">
          {tip.reasoning}
        </p>

        {tip.comparison && (() => {
          const metrics = ['form', 'att', 'def', 'h2h'] as const;
          const labels: Record<string, string> = { form: 'Form', att: 'Angreb', def: 'Forsvar', h2h: 'H2H' };
          const items = metrics.map(k => {
            const m = (tip.comparison as Record<string, { home: string; away: string }>)[k];
            if (!m) return null;
            const h = parseFloat(m.home);
            const a = parseFloat(m.away);
            const total = h + a;
            const hPct = total > 0 ? Math.round((h / total) * 100) : 50;
            return { key: k, label: labels[k], hPct };
          }).filter(Boolean) as { key: string; label: string; hPct: number }[];
          if (items.length === 0) return null;
          return (
            <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {items.map(({ key, label, hPct }) => (
                <div key={key}>
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground/60 mb-0.5">
                    <span>{label}</span>
                    <span className="text-white/40">{hPct}% / {100 - hPct}%</span>
                  </div>
                  <div className="flex h-1 rounded-full overflow-hidden bg-white/5">
                    <div className="bg-teal-400/60 h-full" style={{ width: `${hPct}%` }} />
                    <div className="bg-violet-400/40 h-full" style={{ width: `${100 - hPct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── Always-visible match link ── */}
      <div className="border-t border-white/6 px-5 py-3 bg-white/2">
        <Link href={`/match/${tip.fixtureId}`}>
          <div className="flex items-center justify-center py-2.5 px-3 rounded-lg bg-primary/8 border border-primary/20 hover:bg-primary/15 transition-colors cursor-pointer">
            <span className="text-xs font-mono text-primary font-semibold uppercase tracking-wider">View Full Match Analysis</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

// ─── Performance panel (Fase 1.7) ────────────────────────────────────────────

interface PerformanceSummary {
  totalTips: number;
  winRate: number | null;
  roiPct: number | null;
  avgClv: number | null;
  brierAvg: number | null;
  equityCurve: Array<{ date: string; cumRoi: number }>;
}

function EquitySparkline({ points, width = 120, height = 32 }: { points: Array<{ cumRoi: number }>; width?: number; height?: number }) {
  if (points.length < 2) {
    return <div className="text-[10px] font-mono text-muted-foreground">—</div>;
  }
  const values = points.map((p) => p.cumRoi);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.cumRoi - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = height - ((values[values.length - 1] - min) / range) * height;
  const zeroY = height - ((0 - min) / range) * height;
  const positive = values[values.length - 1] >= 0;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="2,2" />
      <path d={d} fill="none" stroke={positive ? "#2dd4bf" : "#f87171"} strokeWidth="1.5" />
      <circle cx={width} cy={lastY} r="2" fill={positive ? "#2dd4bf" : "#f87171"} />
    </svg>
  );
}

function PerformancePanel() {
  const { data, error } = useQuery<PerformanceSummary>({
    queryKey: ["analysisPerformance"],
    queryFn: async () => {
      const res = await authFetch("/api/analysis/performance");
      if (res.status === 402) {
        const err = new Error("upgrade_required") as Error & { status?: number };
        err.status = 402;
        throw err;
      }
      if (!res.ok) throw new Error("Failed to fetch performance");
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const locked = (error as { status?: number } | null)?.status === 402;

  if (locked) {
    return (
      <PaywallOverlay>
        <div className="rounded-xl border border-white/6 bg-white/2 p-4 flex items-center gap-6 flex-wrap min-h-[92px]">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">90d Win Rate</div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">62%</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">ROI / unit</div>
            <div className="text-xl font-bold font-mono tabular-nums text-teal-400">+8.4%</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Avg CLV</div>
            <div className="text-xl font-bold font-mono tabular-nums text-teal-400">+3.1%</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Brier</div>
            <div className="text-xl font-bold font-mono text-white tabular-nums">0.214</div>
          </div>
        </div>
      </PaywallOverlay>
    );
  }

  if (!data) return null;

  const fmtPct = (v: number | null, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
  const fmtRoi = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  const fmtBrier = (v: number | null) => (v == null ? "—" : v.toFixed(3));

  if (!data.totalTips) {
    return (
      <div className="rounded-xl border border-white/6 bg-white/2 p-4 flex items-center gap-3 text-xs text-muted-foreground font-mono">
        <span className="px-2 py-1 rounded bg-white/5 text-white/70">PERFORMANCE</span>
        <span>Ingen afsluttede tips i predictionReviews endnu — kør backfill eller vent på første post-match review.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/6 bg-white/2 p-4 flex items-center gap-6 flex-wrap">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">90d Win Rate</div>
        <div className="text-xl font-bold font-mono text-white tabular-nums">{fmtPct(data.winRate)}</div>
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">ROI / unit</div>
        <div className={`text-xl font-bold font-mono tabular-nums ${(data.roiPct ?? 0) >= 0 ? "text-teal-400" : "text-red-400"}`}>
          {fmtRoi(data.roiPct)}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Avg CLV</div>
        <div className={`text-xl font-bold font-mono tabular-nums ${(data.avgClv ?? 0) >= 0 ? "text-teal-400" : "text-amber-400"}`}>
          {fmtPct(data.avgClv, 1)}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">Brier</div>
        <div className="text-xl font-bold font-mono text-white tabular-nums">{fmtBrier(data.brierAvg)}</div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5 text-right">Equity (90d)</div>
          <EquitySparkline points={data.equityCurve} />
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data, isLoading } = useQuery<{ tips: ValueTip[] }>({
    queryKey: ['valueOdds'],
    queryFn: async () => {
      const res = await fetch('/api/analysis/value-odds');
      if (!res.ok) throw new Error('Failed to fetch value odds');
      return res.json();
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 90_000,
  });

  const { data: accData } = useQuery<{ hitRate: number | null; reviewed: number; hits: number }>({
    queryKey: ['aiAccuracy'],
    queryFn: async () => {
      const res = await fetch('/api/analysis/accuracy');
      if (!res.ok) throw new Error('Failed to fetch accuracy');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: summary } = useQuery<DailySummary>({
    queryKey: ['dailySummary'],
    queryFn: async () => {
      const res = await fetch('/api/analysis/daily-summary');
      if (!res.ok) throw new Error('Failed to fetch daily summary');
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const tips = data?.tips ?? [];
  const uniqueFixtures = new Set(tips.map(t => t.fixtureId)).size;
  const valueTips = tips.filter(t => t.valueRating === 'strong_value' || t.valueRating === 'value');
  const fairTips  = tips.filter(t => t.valueRating === 'fair');
  const otherTips = tips.filter(t => t.valueRating !== 'strong_value' && t.valueRating !== 'value' && t.valueRating !== 'fair');

  let globalRank = 0;

  return (
    <Layout>
      <div className="space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Target className="w-5 h-5 text-primary" />
              <h1 className="text-3xl font-bold font-mono tracking-tight text-white">VALUE ODDS</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Algorithm tips — Match Result (draw/home/away), BTTS &amp; Asian Handicap. Form signals, odds filters &amp; stats gates applied.{" "}
              <a href="/performance" className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors text-xs font-mono">View backtest →</a>
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-4">
            {accData && accData.reviewed > 0 && (
              <div className="text-right">
                <div className={`text-lg font-bold font-mono tabular-nums ${(accData.hitRate ?? 0) >= 55 ? 'text-teal-400' : 'text-amber-400'}`}>
                  {accData.hitRate ?? '—'}%
                </div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">hit rate</div>
              </div>
            )}
            {!isLoading && uniqueFixtures > 0 && (
              <div className="text-right">
                <div className="text-lg font-bold font-mono text-white tabular-nums">{uniqueFixtures}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">fixtures</div>
              </div>
            )}
          </div>
        </header>

        {/* 90-day performance (Fase 1.7) */}
        <PerformancePanel />

        {/* Daily Loop — Today / Yesterday / Streak & ROI */}
        {summary && <DailyLoopBar summary={summary} />}

        {/* Odds Ændring teaser */}
        <OddsAendringPreview />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : tips.length === 0 ? (
          <div className="glass-card p-16 text-center rounded-xl flex flex-col items-center">
            <Target className="w-12 h-12 text-muted-foreground mb-4 opacity-25" />
            <h3 className="text-lg font-medium text-white mb-1">No value odds available</h3>
            <p className="text-muted-foreground text-sm">
              AI tips will appear here once upcoming fixtures have odds and signal data.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {valueTips.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-teal-400" />
                  <h2 className="text-sm font-mono font-bold text-teal-400 tracking-widest uppercase">Best Value Picks</h2>
                  <span className="text-[11px] font-mono text-muted-foreground/50 ml-auto">{valueTips.length} tips</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {valueTips.map(t => { globalRank++; return <ValueOddsCard key={t.id} tip={t} rank={globalRank} />; })}
                </div>
              </div>
            )}

            {fairTips.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  <h2 className="text-sm font-mono font-bold text-violet-400 tracking-widest uppercase">Fair Price</h2>
                  <span className="text-[11px] font-mono text-muted-foreground/50 ml-auto">{fairTips.length} tips</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {fairTips.map(t => { globalRank++; return <ValueOddsCard key={t.id} tip={t} rank={globalRank} />; })}
                </div>
              </div>
            )}

            {otherTips.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h2 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">
                      Other Markets — {otherTips.length}
                    </h2>
                    <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">
                      Active markets: <span className="text-white/50">Match Result</span>, <span className="text-white/50">BTTS</span>, <span className="text-white/50">Asian Handicap</span>. Over/Under, Double Chance &amp; Corners are disabled — all backtested as unprofitable. Tips here are outside primary filters — use with extra caution.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {otherTips.map(t => { globalRank++; return <ValueOddsCard key={t.id} tip={t} rank={globalRank} />; })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
