// POST /api/webhooks/stripe
// Handles Stripe subscription lifecycle events to keep the DB in sync.
//
// Events handled:
//   checkout.session.completed   — new subscription created via Checkout
//   customer.subscription.updated — renewal, plan change, cancel-at-period-end
//   customer.subscription.deleted — subscription fully ended
//   invoice.payment_failed        — payment failure → past_due
//
// Security: every request is verified against the STRIPE_WEBHOOK_SECRET.
// NEVER trust unverified webhook payloads.
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/db";

// Disable Next.js body parsing — Stripe signature verification needs raw bytes.
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function customerId(obj: { customer: string | Stripe.Customer | Stripe.DeletedCustomer | null }): string | null {
  if (!obj.customer) return null;
  return typeof obj.customer === "string" ? obj.customer : obj.customer.id;
}

/** Sync a Stripe Subscription object into our DB. */
async function syncSubscription(
  sub: Stripe.Subscription,
  userId: string,
) {
  const item = sub.items.data[0];
  const priceId = item?.price.id ?? "";
  const plan = planFromPriceId(priceId);
  const stripeCustomer = customerId(sub) ?? "";

  // Stripe SDK 22.x: current_period_start/end moved from Subscription to SubscriptionItem
  const currentPeriodStart = item ? new Date(item.current_period_start * 1000) : undefined;
  const currentPeriodEnd = item ? new Date(item.current_period_end * 1000) : undefined;

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeSubscriptionId: sub.id,
      stripeCustomerId: stripeCustomer,
      plan,
      status: sub.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    create: {
      userId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: stripeCustomer,
      plan,
      status: sub.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

/** Find userId from a Stripe customer ID (for events without client_reference_id). */
async function userIdFromCustomer(stripeCustomerId: string): Promise<string | null> {
  const record = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
    select: { userId: true },
  });
  return record?.userId ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  console.log(`[webhook] ${event.type}`);

  try {
    switch (event.type) {
      // ── New subscription created via Checkout ────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Diagnostic (Stage 6 Step 9 investigation) — safe identifiers only,
        // no secrets/payment details. Shows exactly what this event carried
        // before any of the logic below decides what to do with it.
        console.log(
          `[webhook] checkout.session.completed received — mode=${session.mode} client_reference_id=${session.client_reference_id ?? "<none>"} subscription=${typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? "<none>"}`
        );

        if (session.mode !== "subscription") break; // ignore one-time payment events

        const userId = session.client_reference_id;
        if (!userId) {
          console.error("[webhook] checkout.session.completed missing client_reference_id — cannot identify the user, sync skipped");
          break;
        }

        // Expand the subscription object so we have all fields
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

        if (!subscriptionId) {
          console.error("[webhook] checkout.session.completed missing subscription id");
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const resolvedPlan = planFromPriceId(sub.items.data[0]?.price.id ?? "");
        console.log(
          `[webhook] syncing subscription — userId=${userId} stripeSubscriptionId=${sub.id} stripeCustomerId=${customerId(sub) ?? "<none>"} plan=${resolvedPlan} status=${sub.status}`
        );
        await syncSubscription(sub, userId);
        console.log(`[webhook] Subscription synced for user ${userId} — plan: ${resolvedPlan}, status: ${sub.status}`);
        break;
      }

      // ── Renewal, plan change, cancel-at-period-end toggle ────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerId(sub);
        console.log(`[webhook] customer.subscription.updated received — stripeSubscriptionId=${sub.id} stripeCustomerId=${cid ?? "<none>"} status=${sub.status}`);
        if (!cid) break;

        const userId = await userIdFromCustomer(cid);
        if (!userId) {
          // This is the known race: this event can arrive before
          // checkout.session.completed has created the row for this
          // customer yet (Stripe doesn't guarantee event ordering). Not
          // fatal by itself — checkout.session.completed's own sync (via
          // client_reference_id, not this lookup) still creates the
          // correct row — but if THAT event is also missing/failing, this
          // update is silently dropped, which is worth being able to see.
          console.warn(`[webhook] No local Subscription row found for Stripe customer ${cid} — update skipped (expected only if checkout.session.completed hasn't synced yet)`);
          break;
        }

        await syncSubscription(sub, userId);
        console.log(`[webhook] Subscription updated for user ${userId} — status: ${sub.status}`);
        break;
      }

      // ── Subscription ended (cancelled and period expired) ────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const cid = customerId(sub);
        if (!cid) break;

        const userId = await userIdFromCustomer(cid);
        if (!userId) break;

        await prisma.subscription.update({
          where: { userId },
          data: { status: "canceled", cancelAtPeriodEnd: false },
        });
        console.log(`[webhook] Subscription canceled for user ${userId}`);
        break;
      }

      // ── Payment failure ───────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const cid = customerId(invoice);
        if (!cid) break;

        const userId = await userIdFromCustomer(cid);
        if (!userId) break;

        await prisma.subscription.updateMany({
          where: { userId },
          data: { status: "past_due" },
        });
        console.log(`[webhook] Payment failed for user ${userId}`);
        break;
      }

      default:
        // Unhandled event types — fine to ignore
        break;
    }
  } catch (err) {
    console.error(`[webhook] Error processing ${event.type}:`, err);
    // Return 500 so Stripe retries the event
    return NextResponse.json({ error: "Internal error processing webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
