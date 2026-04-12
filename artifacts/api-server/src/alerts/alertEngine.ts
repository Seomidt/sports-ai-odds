import { db } from "@workspace/db";
import { followedFixtures, alertLog, fixtureSignals } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateAlertText } from "../ai/analysisLayer.js";

const ALERT_TRIGGER_KEYS = new Set([
  "momentum_shift",
  "upset_risk",
  "red_card_changed_balance",
  "home_pressure_rising",
  "away_over_expected_tempo",
]);

// Track which (fixtureId, signalKey, sessionId) combos already alerted this session
const alreadyAlerted = new Set<string>();

export async function runAlertEngine() {
  // Get all currently followed fixtures
  const followed = await db.query.followedFixtures.findMany();
  if (followed.length === 0) return;

  const fixtureIds = [...new Set(followed.map((f) => f.fixtureId))];

  for (const fixtureId of fixtureIds) {
    // Get live signals for this fixture
    const signals = await db.query.fixtureSignals.findMany({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, "live")),
    });

    const fixture = await db.query.fixtures.findFirst({
      where: (f, { eq: eqFn }) => eqFn(f.fixtureId, fixtureId),
    });

    if (!fixture) continue;

    const matchName = `${fixture.homeTeamName} vs ${fixture.awayTeamName}`;

    for (const signal of signals) {
      if (!ALERT_TRIGGER_KEYS.has(signal.signalKey)) continue;
      if (!(signal.signalBool === true || (signal.signalValue !== null && signal.signalValue > 0.65))) continue;

      // Find all sessions following this fixture
      const sessions = followed.filter((f) => f.fixtureId === fixtureId);

      for (const session of sessions) {
        const alertKey = `${fixtureId}:${signal.signalKey}:${session.sessionId}`;
        if (alreadyAlerted.has(alertKey)) continue;

        // DB-level dedup: skip if an alert for this (fixture, signal, session) already exists
        const existing = await db.query.alertLog.findFirst({
          where: (a, { and: andFn, eq: eqFn }) =>
            andFn(
              eqFn(a.fixtureId, fixtureId),
              eqFn(a.signalKey, signal.signalKey),
              eqFn(a.sessionId, session.sessionId),
            ),
        });
        if (existing) {
          alreadyAlerted.add(alertKey);
          continue;
        }

        // Generate AI text
        const alertText = await generateAlertText(signal.signalKey, signal.signalLabel, matchName);

        // Store in DB
        await db.insert(alertLog).values({
          fixtureId,
          sessionId: session.sessionId,
          signalKey: signal.signalKey,
          alertText,
          isRead: false,
          createdAt: new Date(),
        });

        alreadyAlerted.add(alertKey);
        console.log(`[alerts] Alert created: ${matchName} — ${signal.signalLabel}`);
      }
    }
  }
}

let alertEngineStarted = false;

export function startAlertEngine() {
  if (alertEngineStarted) return;
  alertEngineStarted = true;
  console.log("[alerts] Alert engine started");
  // Check every 30 seconds
  setInterval(() => runAlertEngine().catch(console.error), 30 * 1000);
}
