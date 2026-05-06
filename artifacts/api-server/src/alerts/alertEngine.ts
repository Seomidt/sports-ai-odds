import { db } from "@workspace/db";
import { alertLog } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Previously broadcast live match-state signals (momentum, cards, …) to alert_log.
 * The app feed is now odds-only — those rows are no longer inserted.
 * Odds drops: poller → signalKey `odds_drop`. Live line vs model: `live_value`.
 */
export async function runAlertEngine() {
  return;
}

/**
 * Emit a "critical" tier alert when a super-value tip is generated.
 * Not shown on the odds-radar feed (filtered server-side) but kept for optional future use / admin.
 */
export async function emitSuperValueAlert(params: {
  fixtureId: number;
  betType: string;
  betSide: string;
  marketOdds: number;
  edge: number;
  matchName: string;
}) {
  const PRIMARY_MARKETS = new Set(["match_result", "over_under", "over_under_2_5", "btts", "double_chance"]);
  if (!PRIMARY_MARKETS.has(params.betType)) return;
  if (params.edge < 0.05) return;

  const signalKey = `super_value:${params.betType}:${params.betSide}`;

  const existing = await db.query.alertLog.findFirst({
    where: (a, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(a.fixtureId, params.fixtureId), eqFn(a.signalKey, signalKey)),
  });
  if (existing) return;

  const edgePp = (params.edge * 100).toFixed(1);
  const marketLabel = params.betType.replace(/_/g, " ").replace("over under", "Over/Under");
  const edgeLabel = params.edge >= 0.15 ? "🔥 Super value" : params.edge >= 0.08 ? "Strong value" : "Value tip";
  const alertText = `${edgeLabel}: ${marketLabel} ${params.betSide} @ ${params.marketOdds.toFixed(2)} — edge +${edgePp}pp`;

  await db.insert(alertLog).values({
    fixtureId: params.fixtureId,
    sessionId: null,
    signalKey,
    alertText,
    tier: "critical",
    isRead: false,
    createdAt: new Date(),
  });

  console.log(`[alerts] SUPER-VALUE: ${params.matchName} — ${params.betType} ${params.betSide} edge +${edgePp}pp`);
}

let alertEngineStarted = false;

export function startAlertEngine() {
  if (alertEngineStarted) return;
  alertEngineStarted = true;
  console.log("[alerts] Alert engine interval started (match-state broadcasts disabled; odds alerts via poller / live_value)");
  setInterval(() => runAlertEngine().catch(console.error), 30 * 1000);
}
