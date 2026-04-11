import { Router } from "express";
import { db } from "@workspace/db";
import { getPreAnalysis, getLiveAnalysis, getPostAnalysis, generateAlertText } from "../ai/analysisLayer.js";

const router = Router();

async function getSignals(fixtureId: number, phase: string) {
  return db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, phase)),
  });
}

// GET /api/analysis/:fixtureId/pre
// AI result cached 30 min in analysisLayer; HTTP cache 25 min
router.get("/analysis/:fixtureId/pre", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getPreAnalysis(id);
    const signals = await getSignals(id, "pre");
    res.set("Cache-Control", "public, max-age=1500, stale-while-revalidate=300");
    return res.json({
      phase: "pre",
      headline: result.headline,
      narrative: result.narrative,
      key_factors: result.key_factors,
      favorite: result.favorite,
      confidence: result.confidence,
      cachedAt: new Date().toISOString(),
      signals,
    });
  } catch (err) {
    console.error("[analysis] pre error:", err);
    return res.status(500).json({ error: "Analysis failed" });
  }
});

// GET /api/analysis/:fixtureId/live
// AI result cached 5 min in analysisLayer; HTTP cache 4 min
router.get("/analysis/:fixtureId/live", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getLiveAnalysis(id);
    const signals = await getSignals(id, "live");
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

// GET /api/analysis/:fixtureId/post
// AI result cached permanently in analysisLayer; HTTP cache 1 day
router.get("/analysis/:fixtureId/post", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getPostAnalysis(id);
    const signals = await getSignals(id, "post");
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    return res.json({
      phase: "post",
      headline: result.headline,
      narrative: result.narrative,
      key_factors: result.key_factors,
      deviation_note: result.deviation_note,
      man_of_match: result.man_of_match,
      cachedAt: new Date().toISOString(),
      signals,
    });
  } catch (err) {
    console.error("[analysis] post error:", err);
    return res.status(500).json({ error: "Analysis failed" });
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
