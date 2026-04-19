import { db } from "@workspace/db";
import { aiBettingTips, oddsSnapshots, fixtures } from "@workspace/db/schema";
import { and, between, desc, eq, isNull, sql } from "drizzle-orm";

/**
 * Closing-line capture (Fase 1.2).
 *
 * Runs on a fast cadence to snapshot the last pre-kickoff odds for every open
 * AI betting tip. The "closing line" is the most efficient market signal we
 * have for measuring edge (CLV) after the match resolves.
 *
 * Idempotent: a tip whose closingOdds is already populated is skipped.
 */

type BetSideKey =
  | { kind: "match_result"; side: "home" | "draw" | "away" }
  | { kind: "over_under"; side: "over" | "under" }
  | { kind: "btts"; side: "yes" | "no" };

function mapTipToOdds(
  betType: string,
  betSide: string | null,
  snapshot: { homeWin: number | null; draw: number | null; awayWin: number | null; btts: number | null; overUnder25: number | null }
): number | null {
  if (!betSide) return null;
  const t = betType.toLowerCase();
  const s = betSide.toLowerCase();

  if (t === "match_result") {
    if (s === "home") return snapshot.homeWin ?? null;
    if (s === "draw") return snapshot.draw ?? null;
    if (s === "away") return snapshot.awayWin ?? null;
  }
  if (t === "over_under" || t === "over_under_2_5") {
    // oddsSnapshots only stores Over 2.5 — Under side closing line is not
    // captured. Leave null rather than fabricate.
    if (s === "over") return snapshot.overUnder25 ?? null;
    return null;
  }
  if (t === "btts") {
    // oddsSnapshots stores BTTS Yes odds. No side not captured.
    if (s === "yes") return snapshot.btts ?? null;
    return null;
  }
  return null;
}

/**
 * Populate `closingOdds` on AI tips whose fixture is about to kick off.
 *
 * Window: fixture.statusShort='NS' AND kickoff BETWEEN now() AND now() + WINDOW_MINUTES min.
 * Only tips with `closingOdds IS NULL` are updated.
 */
export async function captureClosingOdds(windowMinutes = 3): Promise<{ updated: number; fixturesProcessed: number }> {
  const now = new Date();
  const until = new Date(now.getTime() + windowMinutes * 60 * 1000);

  const candidates = await db
    .select({
      tipId: aiBettingTips.id,
      fixtureId: aiBettingTips.fixtureId,
      betType: aiBettingTips.betType,
      betSide: aiBettingTips.betSide,
    })
    .from(aiBettingTips)
    .innerJoin(fixtures, eq(fixtures.fixtureId, aiBettingTips.fixtureId))
    .where(
      and(
        isNull(aiBettingTips.closingOdds),
        eq(fixtures.statusShort, "NS"),
        between(fixtures.kickoff, now, until)
      )
    );

  if (candidates.length === 0) return { updated: 0, fixturesProcessed: 0 };

  const byFixture = new Map<number, typeof candidates>();
  for (const row of candidates) {
    const arr = byFixture.get(row.fixtureId) ?? [];
    arr.push(row);
    byFixture.set(row.fixtureId, arr);
  }

  let updated = 0;
  for (const [fixtureId, tips] of byFixture) {
    const [latest] = await db
      .select({
        homeWin: oddsSnapshots.homeWin,
        draw: oddsSnapshots.draw,
        awayWin: oddsSnapshots.awayWin,
        btts: oddsSnapshots.btts,
        overUnder25: oddsSnapshots.overUnder25,
      })
      .from(oddsSnapshots)
      .where(eq(oddsSnapshots.fixtureId, fixtureId))
      .orderBy(desc(oddsSnapshots.snappedAt))
      .limit(1);

    if (!latest) continue;

    for (const tip of tips) {
      const closing = mapTipToOdds(tip.betType, tip.betSide, latest);
      if (closing == null || !isFinite(closing) || closing <= 1) continue;

      await db
        .update(aiBettingTips)
        .set({ closingOdds: closing })
        .where(and(eq(aiBettingTips.id, tip.tipId), isNull(aiBettingTips.closingOdds)));
      updated++;
    }
  }

  if (updated > 0) {
    console.log(`[closing-odds] Captured ${updated} closing lines across ${byFixture.size} fixtures`);
  }

  return { updated, fixturesProcessed: byFixture.size };
}
