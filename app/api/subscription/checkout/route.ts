// POST /api/subscription/checkout
// Creates a Stripe Checkout Session for Pro or Premium subscriptions.
// Requires the user to be authenticated.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe, PRO_PRICE_ID, PREMIUM_PRICE_ID } from "@/lib/stripe";
import { prisma } from "@/lib/db";

const VALID_PLANS = ["pro", "premium"] as const;
type SubscriptionPlan = (typeof VALID_PLANS)[number];

function priceIdForPlan(plan: SubscriptionPlan): string {
  return plan === "premium" ? PREMIUM_PRICE_ID : PRO_PRICE_ID;
}

export async function POST(req: NextRequest) {
  // ── 1. Auth check ──────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "You must be signed in to subscribe." }, { status: 401 });
  }

  const { id: userId, email } = session.user;

  // ── 2. Validate requested plan ─────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const plan = body.plan as string;

  if (!VALID_PLANS.includes(plan as SubscriptionPlan)) {
    return NextResponse.json({ error: "Invalid plan. Choose 'pro' or 'premium'." }, { status: 400 });
  }

  const priceId = priceIdForPlan(plan as SubscriptionPlan);

  if (!priceId) {
    return NextResponse.json(
      { error: "Subscription pricing is not configured yet. Please check back soon." },
      { status: 503 }
    );
  }

  // ── 3. Resolve or create Stripe Customer ───────────────────────────────────
  // Reuse the customer if they already have a subscription record.
  let stripeCustomerId: string | undefined;

  const existingSub = await prisma.subscription.findUnique({ where: { userId } });
  if (existingSub?.stripeCustomerId) {
    stripeCustomerId = existingSub.stripeCustomerId;
  }

  const origin = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

  // ── 4. Create Stripe Checkout Session ─────────────────────────────────────
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    // client_reference_id lets the webhook identify which user subscribed.
    client_reference_id: userId,
    customer: stripeCustomerId,           // reuse if exists
    customer_email: stripeCustomerId ? undefined : email, // prefill if new
    success_url: `${origin}/dashboard?subscribed=true`,
    cancel_url: `${origin}/pricing?cancelled=true`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId, plan },
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
