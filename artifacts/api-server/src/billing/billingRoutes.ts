import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { STRIPE_ENABLED, getStripeClient } from "./stripeClient.js";

const billingRouter = Router();

// GET /api/billing/status — returns current Stripe state (no sensitive data exposed)
billingRouter.get("/billing/status", requireAuth, async (_req, res) => {
  if (!STRIPE_ENABLED) {
    return res.json({
      enabled: false,
      configured: false,
      message: "Stripe payments are not yet activated.",
      setupSteps: [
        "Connect the Stripe integration via the Integrations panel",
        "Set STRIPE_SECRET_KEY in environment secrets",
        "Optionally set STRIPE_WEBHOOK_SECRET for webhook verification",
        "Set STRIPE_ENABLED=true in environment secrets",
        "Restart the API server",
        "Run the seed-products script to create subscription plans",
      ],
    });
  }

  try {
    const stripe = getStripeClient();
    await stripe.balance.retrieve();
    return res.json({
      enabled: true,
      configured: true,
      mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
    });
  } catch {
    return res.status(503).json({
      enabled: true,
      configured: false,
      error: "Stripe is enabled but not reachable. Check STRIPE_SECRET_KEY.",
    });
  }
});

// GET /api/billing/plans — lists active subscription plans from Stripe
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
  } catch {
    return res.status(503).json({ error: "Failed to fetch plans from Stripe.", plans: [] });
  }
});

// POST /api/billing/checkout — creates a Checkout session for the authenticated user
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
  } catch {
    return res.status(500).json({ error: "Failed to create checkout session." });
  }
});

// POST /api/billing/portal — creates a Customer Portal session for the authenticated user.
// Stripe customer ID is looked up from the database using the session user's email —
// the client never supplies it, preventing IDOR.
billingRouter.post("/billing/portal", requireAuth, async (req, res) => {
  if (!STRIPE_ENABLED) {
    return res.status(503).json({ error: "Stripe payments are not enabled." });
  }

  const auth = getAuth(req);
  const email = (auth?.sessionClaims?.email as string | undefined) ?? "";
  if (!email) {
    return res.status(401).json({ error: "Could not determine authenticated user email." });
  }

  const [user] = await db
    .select()
    .from(allowedUsers)
    .where(eq(allowedUsers.email, email))
    .limit(1);

  if (!user?.stripeCustomerId) {
    return res.status(404).json({ error: "No Stripe customer found for this account." });
  }

  try {
    const stripe = getStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard`,
    });

    return res.json({ url: session.url });
  } catch {
    return res.status(500).json({ error: "Failed to create billing portal session." });
  }
});

export default billingRouter;
