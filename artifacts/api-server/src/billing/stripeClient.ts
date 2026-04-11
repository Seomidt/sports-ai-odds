/**
 * Stripe Client — Feature-Flagged
 *
 * This file is the single entry point for all Stripe SDK usage.
 * Stripe is INACTIVE until all of the following are true:
 *   1. STRIPE_ENABLED=true is set in environment variables
 *   2. STRIPE_SECRET_KEY is set (obtained after connecting Stripe integration)
 *
 * How to enable when ready:
 *   1. Connect the Stripe integration via the Integrations panel
 *   2. Set STRIPE_ENABLED=true in Secrets
 *   3. Restart the API server
 *   4. Run the seed-products script: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */

import Stripe from "stripe";

export const STRIPE_ENABLED = process.env.STRIPE_ENABLED === "true";

let _client: Stripe | null = null;

/**
 * Returns the Stripe SDK client.
 * Throws if called when Stripe is not configured.
 * Always call getStripeClient() fresh — never cache the returned object in caller code.
 */
export function getStripeClient(): Stripe {
  if (!STRIPE_ENABLED) {
    throw new Error("Stripe is not enabled. Set STRIPE_ENABLED=true to activate.");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Connect the Stripe integration and restart the server."
    );
  }

  if (!_client) {
    _client = new Stripe(secretKey);
  }

  return _client;
}

/**
 * Reset the cached client (used when environment changes).
 */
export function resetStripeClient(): void {
  _client = null;
}
