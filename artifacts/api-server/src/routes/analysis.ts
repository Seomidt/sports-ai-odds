import { Router } from "express";
import { db } from "@workspace/db";
import {
  getBettingTip,
  getLiveAnalysis,
  triggerPostMatchReview,
  getAiAccuracyStats,
  generateAlertText,
} from "../ai/analysisLayer.js";

const router = Router();

// GET /api/analysis/:fixtureId/betting-tip — pre-match betting recommendation (stored in DB permanently)
router.get("/analysis/:fixtureId/betting-tip", async (req, res) => {
  const id = parseInt(req.params["fixtureId"] ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const tip = await getBettingTip(id);
    if (!tip) {
      return res.json({ tip: null, message: "Insufficient signal data — tip not yet available." });
    }
    res.set("Cache-Control", "public, max-age=900, stale-while-revalidate=300");
    return res.json({ tip });
  } catch (err) {
    console.error("[analysis] betting-tip error:", err);
    return res.status(500).json({ error: "Tip generation failed" });
  }
});

// GET /api/analysis/:fixtureId/post-review — post-match review (outcome + summary)
router.get("/analysis/:fixtureId/post-review", async (req, res) => {
  const id = parseInt(req.params["fixtureId"] ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    // Trigger review if not done yet (idempotent)
    await triggerPostMatchReview(id);

    const tip = await db.query.aiBettingTips.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.fixtureId, id),
    });

    if (!tip) {
      return res.json({ review: null, message: "No prediction was made for this fixture." });
    }

    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    return res.json({ review: tip });
  } catch (err) {
    console.error("[analysis] post-review error:", err);
    return res.status(500).json({ error: "Review generation failed" });
  }
});

// GET /api/analysis/:fixtureId/live — live in-play analysis (5 min TTL)
router.get("/analysis/:fixtureId/live", async (req, res) => {
  const id = parseInt(req.params["fixtureId"] ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getLiveAnalysis(id);
    const signals = await db.query.fixtureSignals.findMany({
      where: (s, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(s.fixtureId, id), eqFn(s.phase, "live")),
    });
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=30");
    return res.json({
      phase: "live",
      headline: result.headline,
      narrative: result.narrative,
      key_factors: result.key_factors,
      momentum_verdict: result.momentum_verdict,
      alert_worthy: result.alert_worthy,
      cachedAt: new Date().toISOString(),
      signals,
    });
  } catch (err) {
    console.error("[analysis] live error:", err);
    return res.status(500).json({ error: "Analysis failed" });
  }
});

// GET /api/analysis/accuracy — AI track record (admin + display)
router.get("/analysis/accuracy", async (_req, res) => {
  try {
    const stats = await getAiAccuracyStats();
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(stats);
  } catch (err) {
    console.error("[analysis] accuracy error:", err);
    return res.status(500).json({ error: "Failed to fetch accuracy stats" });
  }
});

// POST /api/alerts/explain
router.post("/alerts/explain", async (req, res) => {
  const { signalKey, signalLabel, matchName } = req.body as {
    signalKey?: string;
    signalLabel?: string;
    matchName?: string;
  };

  if (!signalKey || !signalLabel || !matchName) {
    return res.status(400).json({ error: "Missing signalKey, signalLabel or matchName" });
  }

  try {
    const text = await generateAlertText(signalKey, signalLabel, matchName);
    return res.json({ alertText: text });
  } catch (err) {
    console.error("[analysis] alert explain error:", err);
    return res.status(500).json({ error: "Alert generation failed" });
  }
});

export default router;
