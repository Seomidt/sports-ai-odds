import StripeImport from "stripe";

// Stripe is inactive until STRIPE_ENABLED=true is set in environment secrets.
// To enable: connect Stripe integration, add STRIPE_SECRET_KEY, set STRIPE_ENABLED=true, restart.
export const STRIPE_ENABLED = process.env.STRIPE_ENABLED === "true";

type StripeClient = InstanceType<typeof StripeImport>;

let _client: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (!STRIPE_ENABLED) {
    throw new Error("Stripe is not enabled. Set STRIPE_ENABLED=true to activate.");
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