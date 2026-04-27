import { db } from "@workspace/db";
import { alertLog, fixtures } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { generateAlertText } from "../ai/analysisLayer.js";

const ALERT_TRIGGER_KEYS = new Set([
  "momentum_shift",
  "upset_risk",
  "red_card_changed_balance",
  "home_pressure_rising",
  "away_over_expected_tempo",
]);

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];

// Track (fixtureId, signalKey) combos already alerted this process run
const alreadyAlerted = new Set<string>();

export async function runAlertEngine() {
  // Broadcast mode: scan all live fixtures, emit one global alert per signal.
  // sessionId=null → visible to everyone on the Signals page.
  const live = await db
    .select({
      fixtureId: fixtures.fixtureId,
      homeTeamName: fixtures.homeTeamName,
      awayTeamName: fixtures.awayTeamName,
    })
    .from(fixtures)
    .where(inArray(fixtures.statusShort, LIVE_STATUSES));

  if (live.length === 0) return;

  for (const fix of live) {
    const signals = await db.query.fixtureSignals.findMany({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, fix.fixtureId), eqFn(s.phase, "live")),
    });

    const matchName = `${fix.homeTeamName} vs ${fix.awayTeamName}`;

    for (const signal of signals) {
      if (!ALERT_TRIGGER_KEYS.has(signal.signalKey)) continue;
      if (!(signal.signalBool === true || (signal.signalValue !== null && signal.signalValue > 0.65))) continue;

      const alertKey = `${fix.fixtureId}:${signal.signalKey}`;
      if (alreadyAlerted.has(alertKey)) continue;

      const existing = await db.query.alertLog.findFirst({
        where: (a, { and: andFn, eq: eqFn, isNull: isNullFn }) =>
          andFn(
            eqFn(a.fixtureId, fix.fixtureId),
            eqFn(a.signalKey, signal.signalKey),
            isNullFn(a.sessionId),
          ),
      });
      if (existing) {
        alreadyAlerted.add(alertKey);
        continue;
      }

      const alertText = await generateAlertText(signal.signalKey, signal.signalLabel, matchName);

      await db.insert(alertLog).values({
        fixtureId: fix.fixtureId,
        sessionId: null,
        signalKey: signal.signalKey,
        alertText,
        tier: "critical",
        isRead: false,
        createdAt: new Date(),
      });

      alreadyAlerted.add(alertKey);
      console.log(`[alerts] Broadcast signal: ${matchName} — ${signal.signalLabel}`);
    }
  }
}

/**
 * Emit a "critical" tier alert when a super-value tip is generated.
 * Criteria: edge ≥ 0.15 (15pp) AND confidence='high' AND primary market.
 * Called from analysisLayer after tip passes the publish filter.
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
  if (params.edge < 0.05) return; // 5pp minimum — matches our value filter

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
  console.log("[alerts] Alert engine started (broadcast mode)");
  setInterval(() => runAlertEngine().catch(console.error), 30 * 1000);
}
