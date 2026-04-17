import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@workspace/db";
import { alertLog, fixtures } from "@workspace/db/schema";

const router = Router();

router.get("/alerts/recent", async (req: Request, res: Response) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 1, 1), 24);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const rows = await db
      .select({
        id: alertLog.id,
        fixtureId: alertLog.fixtureId,
        sessionId: alertLog.sessionId,
        signalKey: alertLog.signalKey,
        alertText: alertLog.alertText,
        isRead: alertLog.isRead,
        createdAt: alertLog.createdAt,
        homeTeamName: fixtures.homeTeamName,
        awayTeamName: fixtures.awayTeamName,
        statusShort: fixtures.statusShort,
        leagueName: fixtures.leagueName,
      })
      .from(alertLog)
      .leftJoin(fixtures, eq(alertLog.fixtureId, fixtures.fixtureId))
      .where(gte(alertLog.createdAt, since))
      .orderBy(desc(alertLog.createdAt))
      .limit(200);

    return res.json({ alerts: rows, hours });
  } catch (err) {
    console.error("[routes:alerts.recent]", err);
    return res.status(500).json({ error: "Failed to load recent alerts" });
  }
});

router.get("/alerts/unread", async (req: Request, res: Response) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) return res.json({ alerts: [] });

  try {
    const rows = await db
      .select({
        id: alertLog.id,
        fixtureId: alertLog.fixtureId,
        sessionId: alertLog.sessionId,
        signalKey: alertLog.signalKey,
        alertText: alertLog.alertText,
        isRead: alertLog.isRead,
        createdAt: alertLog.createdAt,
        homeTeamName: fixtures.homeTeamName,
        awayTeamName: fixtures.awayTeamName,
      })
      .from(alertLog)
      .leftJoin(fixtures, eq(alertLog.fixtureId, fixtures.fixtureId))
      .where(and(eq(alertLog.sessionId, sessionId), eq(alertLog.isRead, false)))
      .orderBy(desc(alertLog.createdAt))
      .limit(50);

    return res.json({ alerts: rows });
  } catch (err) {
    console.error("[routes:alerts.unread]", err);
    return res.status(500).json({ error: "Failed to load unread alerts" });
  }
});

router.post("/alerts/:id/read", async (req: Request, res: Response) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  const id = Number(req.params.id);

  if (!sessionId || !Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    await db
      .update(alertLog)
      .set({ isRead: true })
      .where(and(eq(alertLog.id, id), eq(alertLog.sessionId, sessionId)));

    return res.json({ read: true });
  } catch (err) {
    console.error("[routes:alerts.markRead]", err);
    return res.status(500).json({ error: "Failed to mark alert as read" });
  }
});

router.post("/alerts/explain", async (req: Request, res: Response) => {
  const { signalKey, signalLabel, matchName } = (req.body ?? {}) as {
    signalKey?: string;
    signalLabel?: string;
    matchName?: string;
  };

  const key = (signalKey ?? "").toLowerCase();
  let alertText: string;

  if (key === "high_value_tip" || (signalLabel ?? "").toLowerCase().includes("value tip")) {
    alertText = `This is a high-value betting tip where the AI model detected a statistical edge. The available odds are significantly better than the estimated probability, making this a positive expected-value opportunity.`;
  } else if (key.includes("odds") || (signalLabel ?? "").toLowerCase().includes("drop")) {
    alertText = `The odds for this market dropped sharply, indicating sharp money or high-confidence wagering. Significant odds movement often signals that informed bettors have identified value — worth monitoring closely.`;
  } else if ((signalLabel ?? "").toLowerCase().includes("goal") || (signalLabel ?? "").toLowerCase().includes("red card")) {
    alertText = `A key match event (${signalLabel ?? signalKey}) has been detected for ${matchName ?? "this match"}. This can materially affect in-play odds and subsequent betting markets.`;
  } else {
    alertText = `Signal "${signalLabel ?? signalKey}" was triggered for ${matchName ?? "this match"} by the AI analysis engine. This indicates a statistically notable pattern in the live data that may be worth investigating.`;
  }

  return res.json({ alertText });
});

export default router;
