"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";

// Matches the tiers shown in the credit-purchase UI. Stripe computes the
// actual charge from STRIPE_CREDIT_PRICE_ID's own unit price times this
// quantity, so the amount charged is never trusted from the client — this
// allowlist only guards against nonsensical quantities reaching Stripe.
const ALLOWED_CREDIT_AMOUNTS = [1, 3, 5, 10];

export async function buyCredits(credits: number): Promise<{ url: string }> {
  if (!ALLOWED_CREDIT_AMOUNTS.includes(credits)) {
    throw new Error(`Invalid credit amount: ${credits}`);
  }

  const priceId = process.env.STRIPE_CREDIT_PRICE_ID;
  if (!priceId) {
    throw new Error(
      "STRIPE_CREDIT_PRICE_ID is not set. Add it to .env.local before buying credits can work.",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in to buy credits.");
  }

  const stripe = getStripeClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: credits }],
    customer_email: user.email ?? undefined,
    // Read by the fulfillment webhook (not yet built) to know who to credit
    // and by how much once payment is confirmed.
    metadata: { userId: user.id, credits: String(credits) },
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/dashboard?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  return { url: session.url };
}
