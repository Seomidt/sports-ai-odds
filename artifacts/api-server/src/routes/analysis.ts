import { Router } from "express";
import { getPreAnalysis, getLiveAnalysis, getPostAnalysis, generateAlertText } from "../ai/analysisLayer.js";

const router = Router();

// GET /api/analysis/:fixtureId/pre
router.get("/analysis/:fixtureId/pre", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getPreAnalysis(id);
    return res.json(result);
  } catch (err) {
    console.error("[analysis] pre error:", err);
    return res.status(500).json({ error: "Analysis failed" });
  }
});

// GET /api/analysis/:fixtureId/live
router.get("/analysis/:fixtureId/live", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getLiveAnalysis(id);
    return res.json(result);
  } catch (err) {
    console.error("[analysis] live error:", err);
    return res.status(500).json({ error: "Analysis failed" });
  }
});

// GET /api/analysis/:fixtureId/post
router.get("/analysis/:fixtureId/post", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getPostAnalysis(id);
    return res.json(result);
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
