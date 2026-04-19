import StripeImport from "stripe";

// Stripe is inactive until BILLING_ENABLED=true (or the legacy STRIPE_ENABLED=true)
// is set in env. Requires STRIPE_SECRET_KEY + STRIPE_PRO_PRICE_ID + STRIPE_WEBHOOK_SECRET.
export const BILLING_ENABLED =
  process.env.BILLING_ENABLED === "true" || process.env.STRIPE_ENABLED === "true";
// Deprecated alias kept for backward compat.
export const STRIPE_ENABLED = BILLING_ENABLED;

type StripeClient = InstanceType<typeof StripeImport>;

let _client: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (!BILLING_ENABLED) {
    throw new Error("Billing is not enabled. Set BILLING_ENABLED=true to activate.");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set. Connect the Stripe integration and restart.");
  }

  if (!_client) {
    _client = new StripeImport(secretKey);
  }

  return _client;
}

export function resetStripeClient(): void {
  _client = null;
}