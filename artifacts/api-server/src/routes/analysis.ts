import { Router } from "express";
import { db } from "@workspace/db";
import { fixtureSignals } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getPreAnalysis, getLiveAnalysis, getPostAnalysis, generateAlertText } from "../ai/analysisLayer.js";

const router = Router();

function buildText(result: { headline: string; narrative: string; key_factors?: string[] }): string {
  const factors = result.key_factors?.length
    ? "\n\nKey factors: " + result.key_factors.join(" · ")
    : "";
  return `${result.headline}\n\n${result.narrative}${factors}`;
}

async function getSignals(fixtureId: number, phase: string) {
  return db.query.fixtureSignals.findMany({
    where: (s, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(s.fixtureId, fixtureId), eqFn(s.phase, phase)),
  });
}

// GET /api/analysis/:fixtureId/pre
router.get("/analysis/:fixtureId/pre", async (req, res) => {
  const id = parseInt(req.params.fixtureId ?? "0");
  if (!id) return res.status(400).json({ error: "Invalid fixture id" });

  try {
    const result = await getPreAnalysis(id);
    const signals = await getSignals(id, "pre");
    return res.json({
      phase: "pre",
      text: buildText(result),
      cachedAt: new Date().toISOString(),
      signals,
    });
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
    const signals = await getSignals(id, "live");
    return res.json({
      phase: "live",
      text: buildText(result),
      cachedAt: new Date().toISOString(),
      signals,
    });
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
    const signals = await getSignals(id, "post");
    return res.json({
      phase: "post",
      text: buildText(result),
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
