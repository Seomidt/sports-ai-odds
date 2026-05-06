import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { HelpTooltip } from "@/components/HelpTooltip";
import { supabase } from "@/lib/supabase";
import {
  Activity, Zap, ChevronRight, ChevronDown,
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

// Derived market — one bet per card, derived from API-Football predictions
interface ValueTip {
  fixtureId: number;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoff: string | null;
  leagueName: string | null;
  // The derived bet
  market: string;   // 'match_result' | 'btts' | 'over_under_25' | 'double_chance' | 'win_or_draw'
  side: string;     // 'home' | 'draw' | 'away' | 'yes' | 'no' | 'over' | 'under' | 'home_draw' | 'away_draw'
  label: string;    // e.g. "Manchester City vinder"
  probability: number; // 0-100
  // Supporting prediction context
  adviceText: string | null;
  winner: string | null;
  winnerComment: string | null;
  goalsHome: number | null;
  goalsAway: number | null;
  underOver: string | null;
  winOrDraw: boolean | null;
  homeWinPercent: number | null;
  drawPercent: number | null;
  awayWinPercent: number | null;
  comparison: Record<string, { home: string; away: string }> | null;
  last5Home: { form: string | null; goals: { for: { total: number }; against: { total: number } }; att: string | null; def: string | null } | null;
  last5Away: { form: string | null; goals: { for: { total: number }; against: { total: number } }; att: string | null; def: string | null } | null;
  // Trust
  trustScore: number;
  confidence: "high" | "medium" | "low" | null;
  marketOdds: number | null;
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

/** Én hurtig 0–100 score: model vs implied, ellers trust. Ingen %-point i UI. */
function pickQuickScore(tip: TipSummary): number {
  const implied = tip.impliedProbability ?? (tip.marketOdds && tip.marketOdds > 1 ? 1 / tip.marketOdds : null);
  if (tip.aiProbability != null && implied != null) {
    const edge = tip.aiProbability - implied;
    return Math.max(0, Math.min(100, Math.round(50 + edge * 3)));
  }
  return Math.max(0, Math.min(100, Math.round((tip.trustScore / 9) * 100)));
}

function pickScoreTierClass(score: number): string {
  if (score >= 72) return "text-teal-400";
  if (score >= 55) return "text-violet-300";
  return "text-amber-400/90";
}

function DailyLoopBar({ summary }: { summary: DailySummary }) {
  const { todayPicks, yesterdayTips, yesterdayUncovered = [], yesterdayResults, streak, roi } = summary;
  const [todayOpen, setTodayOpen] = useState(false);
  const [yesterdayOpen, setYesterdayOpen] = useState(false);

  const yr = yesterdayResults;
  const yrResolved = yr.wins + yr.losses + yr.pushes;
  const yrHitRate = yrResolved > 0 ? Math.round((yr.wins / yrResolved) * 100) : null;
  const topPick = todayPicks.reduce<TipSummary | null>((best, tip) => {
    if (!best) return tip;
    return pickQuickScore(tip) > pickQuickScore(best) ? tip : best;
  }, null);
  const badge = streak.badge ? BADGE_CONFIG[streak.badge] : null;

  return (
    <div className="space-y-3 mb-8">
      {/* Row 1: Today + Yesterday side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* AI-trackede tips (kort liste — samme pipeline som i går / streak) */}
        <div className="glass-card rounded-xl border border-white/8 overflow-hidden">
          <button
            onClick={() => setTodayOpen(o => !o)}
            className="w-full text-left p-4 hover:bg-white/3 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Zap className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-widest">Udvalgte tips</span>
                <span className="text-[9px] font-mono text-muted-foreground/45">7 dage · max 12 · uden uafgjort 1X2</span>
              </div>
              {todayPicks.length > 0 && (
                todayOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/55 leading-snug mb-2">
              Sporbare AI-anbefalinger (ikke det samme som markedsscan-kortene nedenunder). Sorteret efter markedstype og styrke — ikke fyldt med X.
            </p>
            {todayPicks.length === 0 ? (
              <div className="text-sm text-muted-foreground/50">Ingen tips i vinduet, der matcher filteret.</div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold font-mono text-white tabular-nums">{todayPicks.length}</span>
                  <span className="text-xs text-muted-foreground">i listen lige nu</span>
                </div>
                {topPick && !todayOpen && (
                  <div className="text-xs text-muted-foreground/70 truncate">
                    Stærkest: <span className="text-white/85">{topPick.recommendation}</span>
                    <span className={`font-mono font-semibold tabular-nums ml-1.5 ${pickScoreTierClass(pickQuickScore(topPick))}`}>
                      {pickQuickScore(topPick)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 ml-0.5">score</span>
                    {topPick.marketOdds != null && (
                      <span className="text-muted-foreground/60 font-mono ml-1.5">@ {topPick.marketOdds.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </button>

          {todayOpen && todayPicks.length > 0 && (
            <div className="border-t border-white/5 divide-y divide-white/5">
              {todayPicks.map(tip => (
                <Link key={tip.id} href={`/match/${tip.fixtureId}`}>
                  <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/4 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
                      <div className="text-right">
                        <div className={`font-mono text-sm font-bold tabular-nums leading-none ${pickScoreTierClass(pickQuickScore(tip))}`}>
                          {pickQuickScore(tip)}
                        </div>
                        <div className="text-[9px] text-muted-foreground/45 uppercase tracking-wide">score</div>
                        {tip.marketOdds != null && (
                          <div className="text-[10px] font-mono text-muted-foreground/55 tabular-nums mt-0.5">@ {tip.marketOdds.toFixed(2)}</div>
                        )}
                      </div>
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
                          Kun tips med <span className="text-teal-300">Value</span> eller <span className="text-teal-300">Strong Value</span> — dem vi regner for “spilleværdige” ift. markedet. Hit rate og ROI er på disse linjer, ikke på hele markedsscan-grid’et.
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

const MARKET_LABEL: Record<string, string> = {
  match_result: '1X2', btts: 'BTTS', over_under_25: 'Goals 2.5',
  double_chance: '1X / X2', win_or_draw: 'Win or draw',
};

function marketCardAccent(market: string): { bar: string; chip: string; chipText: string } {
  switch (market) {
    case "match_result":
      return { bar: "bg-teal-400", chip: "bg-teal-400/15 border-teal-400/35 text-teal-300", chipText: "1X2" };
    case "over_under_25":
      return { bar: "bg-violet-400", chip: "bg-violet-400/15 border-violet-400/35 text-violet-200", chipText: "O/U 2.5" };
    case "btts":
      return { bar: "bg-amber-400", chip: "bg-amber-400/15 border-amber-400/35 text-amber-200", chipText: "BTTS" };
    case "double_chance":
    case "win_or_draw":
      return { bar: "bg-sky-400", chip: "bg-sky-400/15 border-sky-400/35 text-sky-200", chipText: "1X / X2" };
    default:
      return { bar: "bg-white/30", chip: "bg-white/8 border-white/15 text-muted-foreground", chipText: "Combo" };
  }
}

function ValueOddsCard({ tip, rank }: { tip: ValueTip; rank: number }) {
  const prob = tip.probability;
  const isPrimary = tip.market === "match_result" || tip.market === "over_under_25" || tip.market === "btts";
  const textColor = prob >= 72 ? 'text-teal-300' : prob >= 60 ? 'text-violet-300' : 'text-amber-400';
  const barColor = prob >= 72 ? 'bg-teal-400' : prob >= 60 ? 'bg-violet-400' : 'bg-amber-400';
  const borderClass = isPrimary
    ? (prob >= 72 ? 'border-teal-400/30' : prob >= 60 ? 'border-violet-400/25' : 'border-white/10')
    : 'border-white/6';
  const rankColor = rank <= 3 ? 'text-teal-400' : rank <= 6 ? 'text-amber-400' : 'text-violet-400';
  const accent = marketCardAccent(tip.market);
  const pickSize = isPrimary ? 'text-xl md:text-2xl' : 'text-lg';

  return (
    <div className={`glass-card rounded-xl border ${borderClass} overflow-hidden flex flex-col relative`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.bar} opacity-80`} aria-hidden />
      <div className="p-5 flex flex-col flex-1 pl-6">

        {/* Header: match + trust */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-mono font-bold ${rankColor} opacity-60`}>#{rank}</span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${accent.chip}`}>
                {MARKET_LABEL[tip.market] ?? tip.market}
              </span>
              {tip.kickoff && (
                <span className="text-[10px] font-mono text-muted-foreground/35 ml-auto shrink-0">
                  {format(new Date(tip.kickoff), 'EEE d MMM, HH:mm')}
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-white/90 leading-tight truncate">
              {tip.homeTeam} <span className="text-white/25 font-normal">vs</span> {tip.awayTeam}
            </div>
            {tip.leagueName && (
              <div className="text-[10px] font-mono text-muted-foreground/35 truncate mt-0.5">{tip.leagueName}</div>
            )}
            {/* Predicted winner badge */}
            {tip.winner && isPrimary && (
              <div className="mt-1.5">
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border text-amber-300/80 bg-amber-400/8 border-amber-400/20 uppercase tracking-wider">
                  Model: {tip.winner}
                </span>
              </div>
            )}
          </div>
          <TrustBadge score={tip.trustScore} confidence={tip.confidence} />
        </div>

        {/* The pick */}
        <div className="mb-4">
          <div className={`font-bold leading-tight mb-2 ${pickSize} ${isPrimary ? textColor : 'text-white/85'}`}>{tip.label}</div>
          {/* Probability bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor}/70`} style={{ width: `${prob}%` }} />
            </div>
            <span className={`text-sm font-bold font-mono tabular-nums ${textColor}`}>{prob}%</span>
          </div>
        </div>

          {/* Compact context */}
          <div className="flex-1 space-y-2">

          {/* 1X2 bar only for match-result cards */}
          {tip.market === "match_result" && tip.homeWinPercent != null && (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider">
                <span>{tip.homeTeam}</span>
                {(tip.drawPercent ?? 0) >= 30 ? <span>Draw</span> : <span className="opacity-0">Draw</span>}
                <span>{tip.awayTeam}</span>
              </div>
              <div className="flex items-center h-6 rounded overflow-hidden w-full">
                {(tip.homeWinPercent ?? 0) > 0 && (
                  <div className="h-full flex items-center justify-center bg-teal-400/20 border-r border-teal-400/30 min-w-[2rem]" style={{ flex: tip.homeWinPercent ?? 0 }}>
                    <span className="text-[10px] font-mono font-bold text-teal-300 px-1">{Math.round(tip.homeWinPercent ?? 0)}%</span>
                  </div>
                )}
                {(tip.drawPercent ?? 0) >= 30 && (
                  <div className="h-full flex items-center justify-center border-r border-amber-400/40 min-w-[2rem]" style={{ flex: tip.drawPercent ?? 0, backgroundColor: "rgba(251,191,36,0.2)" }}>
                    <span className="text-[10px] font-mono font-bold text-amber-300 px-1">{Math.round(tip.drawPercent ?? 0)}%</span>
                  </div>
                )}
                {(tip.awayWinPercent ?? 0) > 0 && (
                  <div className="h-full flex items-center justify-center bg-violet-400/20 min-w-[2rem]" style={{ flex: tip.awayWinPercent ?? 0 }}>
                    <span className="text-[10px] font-mono font-bold text-violet-300 px-1">{Math.round(tip.awayWinPercent ?? 0)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Keep cards concise: detailed context lives on the match page */}
        </div>
      </div>

      {/* Match link — always at bottom */}
      <div className="border-t border-white/6 px-5 py-3 bg-white/2 mt-auto">
        <Link href={`/match/${tip.fixtureId}`}>
          <div className="flex items-center justify-center py-2 px-3 rounded-lg bg-primary/8 border border-primary/20 hover:bg-primary/15 transition-colors cursor-pointer">
            <span className="text-xs font-mono text-primary font-semibold uppercase tracking-wider">Se kampanalyse →</span>
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
  const uniqueFixtureCount = useMemo(() => new Set(tips.map((t) => t.fixtureId)).size, [tips]);
  let globalRank = 0;

  return (
    <Layout>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Predictions"
          title="Full prediction grid"
          description={
            <>
              <span className="block mb-1.5">
                Nederst: bred <strong className="text-white/90 font-medium">markedsscan</strong> (mange markeder). Midt på siden:{" "}
                <strong className="text-white/90 font-medium">Udvalgte tips</strong> — færre linjer, sporbare AI-anbefalinger (uden 1X2 uafgjort).
              </span>
              Kort daglig oversigt:{" "}
              <Link href="/today" className="text-primary hover:text-primary/90 underline underline-offset-2 decoration-primary/35">
                Today
              </Link>
              . Historik:{" "}
              <Link href="/performance" className="text-primary hover:text-primary/90 underline underline-offset-2 decoration-primary/35">
                Performance
              </Link>
              .
            </>
          }
          icon={Target}
        >
          <div className="shrink-0 flex items-center gap-5">
            {accData && accData.reviewed > 0 && (
              <div className="text-right">
                <div className={`text-xl font-semibold tabular-nums ${(accData.hitRate ?? 0) >= 55 ? "text-emerald-400" : "text-amber-400"}`}>
                  {accData.hitRate ?? "—"}%
                </div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Hit rate</div>
              </div>
            )}
            {!isLoading && tips.length > 0 && (
              <div className="text-right pl-5 border-l border-white/[0.08]">
                <div className="text-xl font-semibold text-white tabular-nums">{uniqueFixtureCount}</div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Fixtures</div>
              </div>
            )}
          </div>
        </PageHeader>

        {/* 90-day performance (Fase 1.7) */}
        <PerformancePanel />

        {/* Daily Loop — Today / Yesterday / Streak & ROI */}
        {summary && <DailyLoopBar summary={summary} />}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        ) : tips.length === 0 ? (
          <div className="glass-card p-16 text-center rounded-2xl flex flex-col items-center">
            <Target className="w-12 h-12 text-muted-foreground mb-4 opacity-25" />
            <h3 className="text-lg font-medium text-white mb-1">Ingen predictions tilgængelige</h3>
            <p className="text-muted-foreground text-sm">
              Predictions vises her når kommende kampe har API-Football data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-semibold text-emerald-400/95 tracking-[0.15em] uppercase">All picks</h2>
              <span className="text-[11px] text-muted-foreground/70 ml-auto tabular-nums font-medium">
                {tips.length} picks · {uniqueFixtureCount} fixtures
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {tips.map((t) => {
                globalRank++;
                return (
                  <ValueOddsCard
                    key={`${t.fixtureId}-${t.market}-${t.side}`}
                    tip={t}
                    rank={globalRank}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
