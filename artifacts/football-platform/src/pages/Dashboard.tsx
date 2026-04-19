import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import {
  Activity, TrendingUp, Zap, ChevronRight, ChevronDown,
  Target, Flame, Trophy, TrendingDown, BarChart3, CalendarCheck, Star,
  CheckCircle2, XCircle, MinusCircle, HelpCircle
} from "lucide-react";

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
  edge: number | null;
  reasoning: string;
  marketOdds: number | null;
  valueRating: string | null;
  valueScore: number;
  combinedScore: number;
  createdAt: string;
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
                {streak.type === 'win' ? 'win' : 'loss'}{streak.current !== 1 ? 's' : ''}
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
  const yrHitRate = yr.total > 0 ? Math.round((yr.wins / yr.total) * 100) : null;
  const topPick = todayPicks[0];
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
                    {topPick.edge != null && (
                      <span className="text-teal-400 font-mono ml-1">+{Math.round(topPick.edge * 100)}% edge</span>
                    )}
                    {topPick.marketOdds != null && topPick.edge == null && (
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
                      {tip.edge != null ? (
                        <span className="font-mono text-sm font-bold text-teal-400">+{Math.round(tip.edge * 100)}%</span>
                      ) : tip.marketOdds != null ? (
                        <span className="font-mono text-sm font-bold text-teal-400">{tip.marketOdds.toFixed(2)}</span>
                      ) : null}
                      <span className={`text-sm font-mono font-bold tabular-nums ${tip.trustScore >= 7 ? 'text-teal-400' : 'text-amber-400'}`}>
                        {tip.trustScore}<span className="text-[10px] text-muted-foreground/40">/10</span>
                      </span>
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

                  {yesterdayUncovered.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-white/2">
                        <span className="text-[10px] font-mono text-white/20 uppercase tracking-wider">No AI coverage</span>
                      </div>
                      {yesterdayUncovered.map(f => (
                        <Link key={f.fixtureId} href={`/match/${f.fixtureId}`}>
                          <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors cursor-pointer opacity-50">
                            <div className="w-5 h-5 rounded-full border border-white/15 flex items-center justify-center shrink-0">
                              <span className="text-[8px] text-white/30 font-mono">—</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-muted-foreground/40 font-mono truncate">{f.leagueName ?? ''}</div>
                              <div className="text-sm text-white/60 truncate">{f.homeTeam} vs {f.awayTeam}</div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/15 shrink-0" />
                          </div>
                        </Link>
                      ))}
                    </>
                  )}
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

function SignalSummaryPreview() {
  return (
    <div className="glass-card rounded-xl border border-white/8 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-widest">Top Signals</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">Live odds aware</span>
      </div>
      <div className="p-3 space-y-2">
        {[
          "Odds dropping fast on one match",
          "One strong value edge per fixture",
          "Injuries / lineup changes merged into one signal",
        ].map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-white/70 bg-white/3 rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ValueOddsCard ────────────────────────────────────────────────────────────

function ValueOddsCard({ tip, rank }: { tip: ValueTip; rank: number }) {
  const isTopValue = tip.valueRating === 'strong_value' || tip.valueRating === 'value';
  const borderClass = isTopValue
    ? 'border-teal-400/30 shadow-[0_0_20px_rgba(0,255,200,0.06)]'
    : 'border-white/8';
  const rankColor = rank <= 3 ? 'text-teal-400' : rank <= 6 ? 'text-amber-400' : 'text-violet-400';

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
            {tip.edge != null && (
              <div className={`px-2 py-0.5 rounded text-xs font-mono font-bold tabular-nums border ${
                tip.edge >= 0.15 ? 'text-teal-300 bg-teal-400/10 border-teal-400/30' :
                tip.edge >= 0.05 ? 'text-teal-400 bg-teal-400/10 border-teal-400/20' :
                tip.edge >= -0.05 ? 'text-violet-400 bg-violet-400/10 border-violet-400/20' :
                'text-amber-400 bg-amber-400/10 border-amber-400/20'
              }`}>
                {tip.edge >= 0 ? '+' : ''}{(tip.edge * 100).toFixed(1)}% edge
              </div>
            )}
            {tip.marketOdds != null && (
              <span className="font-mono text-lg font-bold text-teal-400 tabular-nums">{tip.marketOdds.toFixed(2)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold text-white leading-tight">{tip.recommendation}</div>
          <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
            <div className="flex items-center gap-1">
              <span className={`text-xl font-mono font-bold tabular-nums ${tip.trustScore >= 7 ? 'text-teal-400' : tip.trustScore >= 5 ? 'text-amber-400' : 'text-white/40'}`}>
                {tip.trustScore}
              </span>
              <span className="text-xs text-muted-foreground font-mono">/10</span>
            </div>
            {tip.aiProbability != null && (
              <div className="text-[10px] font-mono text-muted-foreground/40">{(tip.aiProbability * 100).toFixed(0)}% prob</div>
            )}
          </div>
        </div>

        <div className="flex gap-0.5 mb-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-sm ${
                i < tip.trustScore
                  ? (tip.trustScore >= 7 ? 'bg-teal-400' : tip.trustScore >= 5 ? 'bg-amber-400' : 'bg-white/30')
                  : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 mb-2 text-sm text-white/60">
          <span className="font-medium">{tip.homeTeam}</span>
          <span className="text-white/20">vs</span>
          <span className="font-medium">{tip.awayTeam}</span>
        </div>

        <p className="text-xs text-white/50 leading-relaxed">
          {tip.reasoning}
        </p>
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
  const { data } = useQuery<PerformanceSummary>({
    queryKey: ["analysisPerformance"],
    queryFn: async () => {
      const res = await fetch("/api/analysis/performance");
      if (!res.ok) throw new Error("Failed to fetch performance");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  if (!data || !data.totalTips) return null;

  const fmtPct = (v: number | null, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
  const fmtRoi = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  const fmtBrier = (v: number | null) => (v == null ? "—" : v.toFixed(3));

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
              AI-ranked betting tips sorted by value and confidence.
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
                <h2 className="text-sm font-mono font-bold text-muted-foreground tracking-widest uppercase">
                  Other Markets — {otherTips.length}
                </h2>
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
