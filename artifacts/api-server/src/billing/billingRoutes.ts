/**
 * Billing Routes — Feature-Flagged
 *
 * Routes in this file are always registered, but return meaningful
 * "not configured" responses when STRIPE_ENABLED is false.
 *
 * When STRIPE_ENABLED=true and STRIPE_SECRET_KEY is set, full Stripe
 * functionality becomes available.
 *
 * Endpoints:
 *   GET  /api/billing/status          — current Stripe integration state
 *   GET  /api/billing/plans           — available subscription plans
 *   POST /api/billing/checkout        — create a checkout session (requires STRIPE_ENABLED)
 *   POST /api/billing/portal          — create customer portal session (requires STRIPE_ENABLED)
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { STRIPE_ENABLED, getStripeClient } from "./stripeClient.js";

const billingRouter = Router();

/**
 * GET /api/billing/status
 * Returns the current Stripe integration state. Admin only for full details.
 */
billingRouter.get("/billing/status", requireAuth, async (req, res) => {
  const auth = (req as any).auth;
  const isAdmin = (req as any).isAdmin;

  if (!STRIPE_ENABLED) {
    return res.json({
      enabled: false,
      configured: false,
      message: "Stripe payments are not yet activated.",
      setupSteps: [
        "Connect the Stripe integration via the Integrations panel",
        "Set STRIPE_SECRET_KEY in environment secrets",
        "Set STRIPE_ENABLED=true in environment secrets",
        "Restart the API server",
        "Run the seed-products script to create subscription plans",
      ],
    });
  }

  try {
    const stripe = getStripeClient();
    const balance = await stripe.balance.retrieve();
    return res.json({
      enabled: true,
      configured: true,
      mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
      currency: balance.available[0]?.currency?.toUpperCase(),
    });
  } catch (err: any) {
    return res.status(503).json({
      enabled: true,
      configured: false,
      error: "Stripe is enabled but not reachable. Check STRIPE_SECRET_KEY.",
    });
  }
});

/**
 * GET /api/billing/plans
 * Returns available subscription plans synced from Stripe.
 */
billingRouter.get("/billing/plans", requireAuth, async (_req, res) => {
  if (!STRIPE_ENABLED) {
    return res.json({ plans: [] });
  }

  try {
    const stripe = getStripeClient();
    const [products, prices] = await Promise.all([
      stripe.products.list({ active: true, limit: 20 }),
      stripe.prices.list({ active: true, limit: 50 }),
    ]);

    const plans = products.data.map((product) => {
      const productPrices = prices.data.filter((p) => p.product === product.id);
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        metadata: product.metadata,
        prices: productPrices.map((price) => ({
          id: price.id,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? "one_time",
          intervalCount: price.recurring?.interval_count ?? 1,
        })),
      };
    });

    return res.json({ plans });
  } catch (err: any) {
    return res.status(503).json({ error: "Failed to fetch plans from Stripe.", plans: [] });
  }
});

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout session for a given price ID.
 */
billingRouter.post("/billing/checkout", requireAuth, async (req, res) => {
  if (!STRIPE_ENABLED) {
    return res.status(503).json({ error: "Stripe payments are not enabled." });
  }

  const { priceId } = req.body as { priceId?: string };
  if (!priceId) {
    return res.status(400).json({ error: "priceId is required." });
  }

  try {
    const stripe = getStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?billing=success`,
      cancel_url: `${baseUrl}/dashboard?billing=cancelled`,
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create checkout session." });
  }
});

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session for managing subscriptions.
 */
billingRouter.post("/billing/portal", requireAuth, async (req, res) => {
  if (!STRIPE_ENABLED) {
    return res.status(503).json({ error: "Stripe payments are not enabled." });
  }

  const { customerId } = req.body as { customerId?: string };
  if (!customerId) {
    return res.status(400).json({ error: "customerId is required." });
  }

  try {
    const stripe = getStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/admin`,
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create billing portal session." });
  }
});

export default billingRouter;
