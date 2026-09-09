import Stripe from "stripe";

let stripeClient: Stripe | null = null;

// Constructed lazily so importing this module doesn't throw before real keys
// exist — STRIPE_SECRET_KEY is not set in .env.local yet, so this only
// surfaces an error when a checkout is actually attempted.
export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local before buying credits can work.",
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}
