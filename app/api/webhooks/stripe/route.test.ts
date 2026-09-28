import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
  planFromPriceId: (priceId: string) => {
    if (priceId === "price_pro_test") return "pro";
    if (priceId === "price_premium_test") return "premium";
    return "free";
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    subscription: {
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_webhook";

function makeRequest(body: string, hasSignature = true) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: hasSignature ? { "stripe-signature": "test-sig" } : {},
    body,
  });
}

function mockSubscriptionObject(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_test123",
    status: "active",
    cancel_at_period_end: false,
    customer: "cus_test123",
    items: {
      data: [
        {
          price: { id: "price_pro_test" },
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  vi.mocked(prisma.subscription.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.subscription.update).mockResolvedValue({} as never);
  vi.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("POST /api/webhooks/stripe — signature safety", () => {
  it("rejects a request with no stripe-signature header", async () => {
    const res = await POST(makeRequest("{}", false));
    expect(res.status).toBe(400);
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("rejects a request whose signature fails verification — no DB writes happen", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error("signature mismatch");
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — checkout.session.completed", () => {
  it("syncs a new Pro subscription, plan derived from the Stripe price id (not client input)", async () => {
    const sub = mockSubscriptionObject();
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", client_reference_id: USER_ID, subscription: "sub_test123" } },
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.subscription.upsert).mock.calls[0][0] as {
      where: { userId: string };
      create: { plan: string; status: string; stripeCustomerId: string };
    };
    expect(call.where.userId).toBe(USER_ID);
    expect(call.create.plan).toBe("pro");
    expect(call.create.status).toBe("active");
    expect(call.create.stripeCustomerId).toBe("cus_test123");
  });

  it("syncs a Premium subscription correctly when the price id maps to premium", async () => {
    const sub = mockSubscriptionObject({
      items: { data: [{ price: { id: "price_premium_test" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", client_reference_id: USER_ID, subscription: "sub_test123" } },
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub as never);

    await POST(makeRequest("{}"));

    const call = vi.mocked(prisma.subscription.upsert).mock.calls[0][0] as { create: { plan: string } };
    expect(call.create.plan).toBe("premium");
  });

  it("ignores one-time-payment checkout events (mode !== 'subscription') — never touches the $4.99 flow", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { mode: "payment", client_reference_id: USER_ID } },
    } as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — customer.subscription.updated", () => {
  it("re-syncs on renewal/plan change", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ userId: USER_ID } as never);
    const sub = mockSubscriptionObject({ status: "active" });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: sub },
    } as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  it("syncs cancel-at-period-end toggling on", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ userId: USER_ID } as never);
    const sub = mockSubscriptionObject({ status: "active", cancel_at_period_end: true });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: sub },
    } as never);

    await POST(makeRequest("{}"));

    const call = vi.mocked(prisma.subscription.upsert).mock.calls[0][0] as { create: { cancelAtPeriodEnd: boolean } };
    expect(call.create.cancelAtPeriodEnd).toBe(true);
  });

  it("syncs a trialing status through unchanged", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ userId: USER_ID } as never);
    const sub = mockSubscriptionObject({ status: "trialing" });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: sub },
    } as never);

    await POST(makeRequest("{}"));

    const call = vi.mocked(prisma.subscription.upsert).mock.calls[0][0] as { create: { status: string } };
    expect(call.create.status).toBe("trialing");
  });
});

describe("POST /api/webhooks/stripe — customer.subscription.deleted", () => {
  it("sets status to canceled and clears cancelAtPeriodEnd", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ userId: USER_ID } as never);
    const sub = mockSubscriptionObject();
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: sub },
    } as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.subscription.update).mock.calls[0][0] as {
      where: { userId: string };
      data: { status: string; cancelAtPeriodEnd: boolean };
    };
    expect(call.where.userId).toBe(USER_ID);
    expect(call.data.status).toBe("canceled");
    expect(call.data.cancelAtPeriodEnd).toBe(false);
  });
});

describe("POST /api/webhooks/stripe — invoice.payment_failed", () => {
  it("sets status to past_due for the matching customer", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ userId: USER_ID } as never);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_test123" } },
    } as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.subscription.updateMany).mock.calls[0][0] as {
      where: { userId: string };
      data: { status: string };
    };
    expect(call.where.userId).toBe(USER_ID);
    expect(call.data.status).toBe("past_due");
  });
});

describe("POST /api/webhooks/stripe — unhandled event types", () => {
  it("returns 200 and does nothing for an event type this webhook doesn't handle", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "customer.updated",
      data: { object: {} },
    } as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});

// ── Stage 6 Step 9 — regression tests for the "Stripe succeeded but Glam AI
// still shows Subscribe" investigation. These use the exact real Stripe
// response shape (current_period_start/end on the SubscriptionItem, not the
// top-level Subscription — verified against the installed stripe@22.5.0
// type definitions directly, not assumed) rather than a shape convenient
// for the test, specifically so a payload-shape mismatch would be caught
// here rather than only in production. ──

describe("POST /api/webhooks/stripe — Stage 6 Step 9 regression coverage", () => {
  it("a successful Pro checkout creates a local subscription with the CORRECT user and plan", async () => {
    const sub = mockSubscriptionObject(); // status: active, price: price_pro_test
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", client_reference_id: USER_ID, subscription: "sub_test123" } },
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub as never);

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.subscription.upsert).mock.calls[0][0] as {
      where: { userId: string };
      create: { userId: string; plan: string; status: string; stripeCustomerId: string; stripeSubscriptionId: string };
    };
    // Same identity checked twice, two different ways — this is exactly the
    // "correct user is associated with subscription" requirement.
    expect(call.where.userId).toBe(USER_ID);
    expect(call.create.userId).toBe(USER_ID);
    expect(call.create.plan).toBe("pro");
    expect(call.create.status).toBe("active");
    expect(call.create.stripeCustomerId).toBe("cus_test123");
    expect(call.create.stripeSubscriptionId).toBe("sub_test123");
  });

  it("webhook updates the EXISTING row rather than creating a duplicate for the same user", async () => {
    // First: checkout.session.completed creates the row.
    const sub = mockSubscriptionObject();
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", client_reference_id: USER_ID, subscription: "sub_test123" } },
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub as never);
    await POST(makeRequest("{}"));

    // Second: customer.subscription.updated arrives (e.g. a renewal) — the
    // row now exists, so userIdFromCustomer resolves it via stripeCustomerId.
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ userId: USER_ID } as never);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce({
      type: "customer.subscription.updated",
      data: { object: mockSubscriptionObject({ status: "active" }) },
    } as never);
    await POST(makeRequest("{}"));

    // Both syncs are upserts, both keyed on the SAME userId — an upsert
    // keyed by a stable unique field is structurally incapable of creating
    // a second row for the same user, regardless of how many times it runs.
    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(prisma.subscription.upsert).mock.calls;
    expect((first[0] as { where: { userId: string } }).where.userId).toBe(USER_ID);
    expect((second[0] as { where: { userId: string } }).where.userId).toBe(USER_ID);
  });

  it("repeated delivery of the IDENTICAL event is idempotent — same end state, no duplicate side effects", async () => {
    const sub = mockSubscriptionObject();
    const event = {
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", client_reference_id: USER_ID, subscription: "sub_test123" } },
    };
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub as never);

    // Stripe retries webhooks that don't return 200 fast enough, or on
    // ambiguous network failures — simulate the same event landing twice.
    await POST(makeRequest("{}"));
    await POST(makeRequest("{}"));

    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(prisma.subscription.upsert).mock.calls;
    // Both calls upsert the identical target/content — replaying the same
    // event twice converges to the same state, never compounds it.
    expect(first[0]).toEqual(second[0]);
  });

  it("a fully-realistic Pro checkout.session.completed payload (real field shapes) syncs without error", async () => {
    // Deliberately mirrors the ACTUAL Stripe API response shape verified
    // against node_modules/stripe's own type definitions for this
    // installed version — current_period_start/end live on the
    // SubscriptionItem, not the Subscription itself. A prior version of
    // this code assumed the same; this test pins that assumption down so a
    // future dependency bump that changes it again gets caught here.
    const realisticSub = {
      id: "sub_realistic1",
      status: "active",
      cancel_at_period_end: false,
      customer: "cus_realistic1",
      items: {
        object: "list",
        data: [
          {
            id: "si_realistic1",
            object: "subscription_item",
            price: { id: "price_pro_test", object: "price" },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            quantity: 1,
          },
        ],
      },
    };
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          mode: "subscription",
          client_reference_id: USER_ID,
          subscription: "sub_realistic1", // NOT expanded — a plain string id, as real Stripe sends it
          customer: "cus_realistic1",
        },
      },
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(realisticSub as never);

    const res = await POST(makeRequest("{}"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
    const call = vi.mocked(prisma.subscription.upsert).mock.calls[0][0] as {
      create: { plan: string; status: string; currentPeriodStart: Date; currentPeriodEnd: Date };
    };
    expect(call.create.plan).toBe("pro");
    expect(call.create.status).toBe("active");
    // Confirms the date math reads from the ITEM, not the subscription —
    // if it silently read from the (nonexistent) top-level field instead,
    // this would be an Invalid Date, not a real timestamp.
    expect(call.create.currentPeriodStart.getTime()).not.toBeNaN();
    expect(call.create.currentPeriodEnd.getTime()).not.toBeNaN();
    expect(call.create.currentPeriodStart.toISOString()).toBe(new Date(1700000000 * 1000).toISOString());
  });
});
