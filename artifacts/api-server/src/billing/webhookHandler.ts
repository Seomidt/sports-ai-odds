import StripeImport from "stripe";
import { type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { getStripeClient, BILLING_ENABLED } from "./stripeClient.js";
import { logger } from "../lib/logger.js";

// Registered in app.ts BEFORE express.json() so req.body remains a raw Buffer.
// Only mounted when BILLING_ENABLED=true.
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!BILLING_ENABLED) {
    res.status(503).json({ error: "Billing not enabled" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET." });
    return;
  }

  const sigStr = Array.isArray(sig) ? sig[0] : sig;

  let event: StripeImport.Event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sigStr!, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook Error: ${message}` });
    return;
  }

  logger.info({ type: event.type, id: event.id }, "Stripe webhook received");

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeImport.Checkout.Session;
        const email = session.customer_email ?? session.customer_details?.email ?? null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        if (email && customerId) {
          await upsertPlan({ email, customerId, subscriptionId, plan: "pro", status: "active" });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as StripeImport.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const isActive = sub.status === "active" || sub.status === "trialing";
        await updateByCustomer({
          customerId,
          plan: isActive ? "pro" : "free",
          status: sub.status,
          subscriptionId: sub.id,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeImport.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await updateByCustomer({ customerId, plan: "free", status: "canceled", subscriptionId: sub.id, cancelAt: new Date() });
        break;
      }
      default:
        logger.debug({ type: event.type }, "Unhandled Stripe webhook event");
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), type: event.type }, "Webhook handler error");
  }

  res.status(200).json({ received: true });
}

async function upsertPlan(params: {
  email: string;
  customerId: string;
  subscriptionId: string | null;
  plan: "free" | "pro";
  status: string;
}): Promise<void> {
  const email = params.email.toLowerCase().trim();
  const existing = await db.query.allowedUsers.findFirst({ where: eq(allowedUsers.email, email) });
  const now = new Date();
  if (existing) {
    await db.update(allowedUsers).set({
      stripeCustomerId: params.customerId,
      stripeSubscriptionId: params.subscriptionId,
      stripeSubscriptionStatus: params.status,
      plan: params.plan,
      planStartedAt: existing.planStartedAt ?? now,
    }).where(eq(allowedUsers.email, email));
  } else {
    await db.insert(allowedUsers).values({
      email,
      role: "user",
      stripeCustomerId: params.customerId,
      stripeSubscriptionId: params.subscriptionId,
      stripeSubscriptionStatus: params.status,
      plan: params.plan,
      planStartedAt: now,
    });
  }
}

async function updateByCustomer(params: {
  customerId: string;
  plan: "free" | "pro";
  status: string;
  subscriptionId: string;
  cancelAt: Date | null;
}): Promise<void> {
  await db.update(allowedUsers).set({
    stripeSubscriptionId: params.subscriptionId,
    stripeSubscriptionStatus: params.status,
    plan: params.plan,
    planCancelAt: params.cancelAt,
  }).where(eq(allowedUsers.stripeCustomerId, params.customerId));
}
