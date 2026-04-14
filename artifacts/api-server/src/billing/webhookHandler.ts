import StripeImport from "stripe";
import { type Request, type Response } from "express";
import { getStripeClient, STRIPE_ENABLED } from "./stripeClient.js";
import { logger } from "../lib/logger.js";

// Registered in app.ts BEFORE express.json() so req.body remains a raw Buffer.
// Only mounted when STRIPE_ENABLED=true.
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

  let event: InstanceType<typeof StripeImport>["webhooks"] extends {
    constructEvent(payload: Buffer, header: string, secret: string): infer T;
  }
    ? T
    : never;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sigStr, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook Error: ${message}` });
    return;
  }

  logger.info({ type: event.type }, "Stripe webhook received");

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as {
        id: string;
        status?: string;
        customer?: string | null;
      };
      logger.info(
        { subscriptionId: sub.id, status: sub.status, customerId: sub.customer },
        `Subscription ${event.type}`,
      );
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const inv = event.data.object as {
        id: string;
        amount_paid?: number | null;
        customer?: string | null;
      };
      if (event.type === "invoice.payment_succeeded") {
        logger.info({ invoiceId: inv.id, amount: inv.amount_paid }, "Payment succeeded");
      } else {
        logger.warn({ invoiceId: inv.id, customerId: inv.customer }, "Payment failed");
      }
      break;
    }
    default:
      logger.debug({ type: event.type }, "Unhandled Stripe webhook event");
  }

  res.status(200).json({ received: true });
}
