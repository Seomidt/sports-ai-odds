/**
 * Backfill predictionReviews for all already-finalized aiBettingTips (Fase 1.8).
 *
 * For each tip with a non-null outcome, computes Brier/ROI/CLV and inserts (or
 * upserts) a predictionReviews row. Closing line is derived from the latest
 * oddsSnapshot captured before kickoff — if none is available (likely for
 * historical tips generated before Fase 1.2), closingLineValue stays null.
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm --filter @workspace/scripts tsx src/backfillReviews.ts
 *   DATABASE_URL=<url> pnpm --filter @workspace/scripts tsx src/backfillReviews.ts --only-missing
 */
import { db, aiBettingTips, oddsSnapshots, predictionReviews, fixtures } from "@workspace/db";
import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";

const onlyMissing = process.argv.includes("--only-missing");

type BetSideKey = "home" | "draw" | "away" | "over" | "under" | "yes" | "no" | string;

function closingFromSnapshot(
  betType: string,
  betSide: BetSideKey | null,
  snap: { homeWin: number | null; draw: number | null; awayWin: number | null; btts: number | null; overUnder25: number | null }
): number | null {
  if (!betSide) return null;
  const t = betType.toLowerCase();
  const s = betSide.toLowerCase();
  if (t === "match_result") {
    if (s === "home") return snap.homeWin;
    if (s === "draw") return snap.draw;
    if (s === "away") return snap.awayWin;
  }
  if (t === "over_under" || t === "over_under_2_5") {
    if (s === "over") return snap.overUnder25;
  }
  if (t === "btts") {
    if (s === "yes") return snap.btts;
  }
  return null;
}

function calibrationBucketFor(probability: number | null): string | null {
  if (probability == null || !isFinite(probability)) return null;
  const pct = probability * 100;
  if (pct < 0 || pct > 100) return null;
  const floor = Math.min(90, Math.floor(pct / 10) * 10);
  return `${floor}-${floor + 10}%`;
}

function deriveErrorTags(args: {
  outcome: string;
  aiProbability: number | null;
  closingOdds: number | null;
  closingLineValue: number | null;
}): string[] {
  const tags: string[] = [];
  if (args.closingOdds == null) tags.push("no_closing_line");
  if (args.closingLineValue != null && args.closingLineValue < -0.05) tags.push("odds_moved_against");
  if (args.closingLineValue != null && args.closingLineValue > 0.05) tags.push("positive_clv");
  if (args.outcome === "hit") tags.push("correct_edge");
  if (args.outcome === "miss" && (args.aiProbability ?? 0) >= 0.7) tags.push("high_confidence_miss");
  return tags;
}

async function main() {
  console.log(`[backfill] Starting — onlyMissing=${onlyMissing}`);

  const tipsWithReview = onlyMissing
    ? new Set<number>(
        (
          await db.select({ predictionId: predictionReviews.predictionId }).from(predictionReviews)
        ).map((r) => r.predictionId)
      )
    : new Set<number>();

  const tips = await db
    .select({
      id: aiBettingTips.id,
      fixtureId: aiBettingTips.fixtureId,
      betType: aiBettingTips.betType,
      betSide: aiBettingTips.betSide,
      outcome: aiBettingTips.outcome,
      aiProbability: aiBettingTips.aiProbability,
      marketOdds: aiBettingTips.marketOdds,
      closingOdds: aiBettingTips.closingOdds,
      kickoff: aiBettingTips.kickoff,
    })
    .from(aiBettingTips)
    .where(and(isNotNull(aiBettingTips.outcome)));

  console.log(`[backfill] Found ${tips.length} finalized tips`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const tip of tips) {
    if (onlyMissing && tipsWithReview.has(tip.id)) {
      skipped++;
      continue;
    }
    if (tip.betType === "no_bet") {
      skipped++;
      continue;
    }

    try {
      let closingOdds: number | null = tip.closingOdds ?? null;

      if (closingOdds == null && tip.kickoff) {
        const cutoff = new Date(tip.kickoff.getTime() + 2 * 60 * 1000);
        const [snap] = await db
          .select({
            homeWin: oddsSnapshots.homeWin,
            draw: oddsSnapshots.draw,
            awayWin: oddsSnapshots.awayWin,
            btts: oddsSnapshots.btts,
            overUnder25: oddsSnapshots.overUnder25,
            snappedAt: oddsSnapshots.snappedAt,
          })
          .from(oddsSnapshots)
          .where(and(eq(oddsSnapshots.fixtureId, tip.fixtureId), lte(oddsSnapshots.snappedAt, cutoff)))
          .orderBy(desc(oddsSnapshots.snappedAt))
          .limit(1);

        if (snap) {
          closingOdds = closingFromSnapshot(tip.betType, tip.betSide, snap);
          if (closingOdds != null && closingOdds > 1) {
            await db
              .update(aiBettingTips)
              .set({ closingOdds })
              .where(eq(aiBettingTips.id, tip.id));
          } else {
            closingOdds = null;
          }
        }
      }

      const outcomeNumeric = tip.outcome === "hit" ? 1 : 0;
      const brierScore =
        tip.aiProbability != null && isFinite(tip.aiProbability)
          ? (tip.aiProbability - outcomeNumeric) ** 2
          : null;

      let roiImpact: number | null = null;
      if (tip.marketOdds != null && tip.marketOdds > 1) {
        if (tip.outcome === "hit") roiImpact = tip.marketOdds - 1;
        else if (tip.outcome === "miss") roiImpact = -1;
        else roiImpact = 0;
      }

      const closingLineValue =
        closingOdds != null && tip.marketOdds != null && tip.marketOdds > 0
          ? (closingOdds - tip.marketOdds) / tip.marketOdds
          : null;

      const calibrationBucket = calibrationBucketFor(tip.aiProbability);
      const errorTags = deriveErrorTags({
        outcome: tip.outcome ?? "",
        aiProbability: tip.aiProbability,
        closingOdds,
        closingLineValue,
      });

      await db
        .insert(predictionReviews)
        .values({
          predictionId: tip.id,
          brierScore,
          roiImpact,
          calibrationBucket,
          errorTags,
          closingLineValue,
        })
        .onConflictDoUpdate({
          target: predictionReviews.predictionId,
          set: { brierScore, roiImpact, calibrationBucket, errorTags, closingLineValue },
        });
      inserted++;
    } catch (err) {
      errors++;
      console.error(`[backfill] Error on tip ${tip.id}:`, err);
    }

    if ((inserted + skipped) % 200 === 0) {
      console.log(`[backfill] Progress: inserted=${inserted} skipped=${skipped} errors=${errors}`);
    }
  }

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withClv: sql<number>`count(*) filter (where closing_line_value is not null)::int`,
    })
    .from(predictionReviews);

  console.log(`[backfill] Done — inserted/updated=${inserted} skipped=${skipped} errors=${errors}`);
  console.log(`[backfill] predictionReviews total=${counts?.total ?? 0} withClv=${counts?.withClv ?? 0}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
