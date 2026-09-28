import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is not set");
}

// Non-null assertion is safe: the guard above throws if the key is missing.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ─── V1 one-time report ───────────────────────────────────────────────────────
export const PRICE_AMOUNT = 499; // $4.99 in cents
export const CURRENCY = "usd";
export const PRODUCT_NAME = "Glam AI Glow-Up Report";

// ─── V2 subscription price IDs ───────────────────────────────────────────────
// Create these in your Stripe Dashboard (Products → Add Product → Recurring)
// then paste the price IDs below.
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? "";
export const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";

// ─── V2 usage limits (analysis calls per calendar month) ─────────────────────
// Adjust these to balance user value vs. API cost.
// At claude-opus-4-5 pricing (~$0.12/analysis): Pro = $1.20/user/mo, Premium = $3.60/user/mo
export const PRO_MONTHLY_ANALYSIS_LIMIT = 10;
export const PREMIUM_MONTHLY_ANALYSIS_LIMIT = 30;

// ─── Plan helpers ─────────────────────────────────────────────────────────────
export type Plan = "free" | "pro" | "premium";

/** Map a Stripe price ID back to our internal plan name. */
export function planFromPriceId(priceId: string): Plan {
  if (priceId === PRO_PRICE_ID) return "pro";
  if (priceId === PREMIUM_PRICE_ID) return "premium";
  return "free";
}
