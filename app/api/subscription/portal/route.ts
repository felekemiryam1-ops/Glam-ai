// POST /api/subscription/portal
// Creates a Stripe Customer Portal session for billing management.
// Requires the user to be authenticated AND to have an active subscription.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export async function POST() {
  // ── 1. Auth check ──────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  // ── 2. Retrieve Stripe Customer ID ─────────────────────────────────────────
  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No subscription found. Please subscribe first." },
      { status: 404 }
    );
  }

  // ── 3. Create portal session ───────────────────────────────────────────────
  const origin = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${origin}/dashboard/settings`,
  });

  return NextResponse.json({ url: portalSession.url });
}
