/**
 * Stripe Webhook Handler — Feature-Flagged
 *
 * This handler processes Stripe webhook events when STRIPE_ENABLED=true.
 * It must be registered BEFORE express.json() middleware in app.ts.
 *
 * Currently handled events:
 *   - customer.subscription.created   → logs new subscription
 *   - customer.subscription.updated   → logs status changes
 *   - customer.subscription.deleted   → logs cancellation
 *   - invoice.payment_succeeded       → logs successful payment
 *   - invoice.payment_failed          → logs failed payment
 *
 * Extend this file when more webhook handling is needed.
 */

import { type Request, type Response } from "express";
import { getStripeClient, STRIPE_ENABLED } from "./stripeClient.js";
import { logger } from "../lib/logger.js";

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!STRIPE_ENABLED) {
    res.status(503).json({ error: "Stripe not enabled." });
    return;
  }

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET." });
    return;
  }

  const sigStr = Array.isArray(sig) ? sig[0] : sig;

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sigStr, webhookSecret);
  } catch (err: any) {
    logger.warn({ err: err.message }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
    return;
  }

  logger.info({ type: event.type }, "Stripe webhook received");

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      logger.info({ subscriptionId: sub.id, status: sub.status, customerId: sub.customer }, `Subscription ${event.type}`);
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as any;
      logger.info({ invoiceId: inv.id, amount: inv.amount_paid, customerId: inv.customer }, "Payment succeeded");
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as any;
      logger.warn({ invoiceId: inv.id, customerId: inv.customer }, "Payment failed");
      break;
    }

    default:
      logger.debug({ type: event.type }, "Unhandled Stripe webhook event");
  }

  res.status(200).json({ received: true });
}
