import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { BILLING_ENABLED, getStripeClient } from "./stripeClient.js";
import { getUserFromRequest } from "../middlewares/requireAuth.js";
import { logger } from "../lib/logger.js";

const billingRouter = Router();

const PRO_PRICE_DKK = 14900; // 149 kr/mdr

billingRouter.get("/billing/status", (_req, res) => {
  res.json({ enabled: BILLING_ENABLED });
});

billingRouter.get("/billing/plans", (_req, res) => {
  const priceId = process.env.STRIPE_PRO_PRICE_ID ?? null;
  res.json({
    plans: [
      { id: "free", name: "Free", priceDkk: 0, priceId: null, features: ["Forsinkede low-confidence tips", "Begrænset signal-feed"] },
      { id: "pro", name: "Pro", priceDkk: PRO_PRICE_DKK, priceId, features: ["Alle live-tips", "Performance + CLV", "Super-value notifikationer"] },
    ],
  });
});

billingRouter.post("/billing/checkout", async (req, res) => {
  if (!BILLING_ENABLED) {
    res.status(503).json({ error: "Billing not enabled" });
    return;
  }
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    res.status(500).json({ error: "STRIPE_PRO_PRICE_ID not configured" });
    return;
  }
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const stripe = getStripeClient();
    const existing = await db.query.allowedUsers.findFirst({ where: eq(allowedUsers.email, user.email) });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: existing?.stripeCustomerId ?? undefined,
      customer_email: existing?.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      success_url: process.env.STRIPE_SUCCESS_URL ?? `${req.headers.origin ?? ""}/settings/billing?status=success`,
      cancel_url: process.env.STRIPE_CANCEL_URL ?? `${req.headers.origin ?? ""}/pricing?status=cancel`,
      allow_promotion_codes: true,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "checkout.session.create failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

billingRouter.post("/billing/portal", async (req, res) => {
  if (!BILLING_ENABLED) {
    res.status(503).json({ error: "Billing not enabled" });
    return;
  }
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const existing = await db.query.allowedUsers.findFirst({ where: eq(allowedUsers.email, user.email) });
    if (!existing?.stripeCustomerId) {
      res.status(400).json({ error: "No Stripe customer for user" });
      return;
    }
    const stripe = getStripeClient();
    const portal = await stripe.billingPortal.sessions.create({
      customer: existing.stripeCustomerId,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL ?? `${req.headers.origin ?? ""}/settings/billing`,
    });
    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "billingPortal.create failed");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

export default billingRouter;
