import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    report: { count: vi.fn() },
  },
}));

// lib/stripe.ts throws at import time if STRIPE_SECRET_KEY isn't set (a
// deliberate guard for real usage) — mocked here with just the two
// constants lib/entitlements.ts actually reads, same values as production.
vi.mock("./stripe", () => ({
  PRO_MONTHLY_ANALYSIS_LIMIT: 10,
  PREMIUM_MONTHLY_ANALYSIS_LIMIT: 30,
}));

import { getEntitlements, canRunAnalysis } from "./entitlements";
import { prisma } from "./db";

const USER_ID = "user_test_entitlements";

function mockSubscription(overrides: Record<string, unknown> | null) {
  vi.mocked(prisma.subscription.findUnique).mockResolvedValue(overrides as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.report.count).mockResolvedValue(0);
});

describe("getEntitlements — plan resolution from subscription status", () => {
  it("no subscription row → free", async () => {
    mockSubscription(null);
    const e = await getEntitlements(USER_ID);
    expect(e.plan).toBe("free");
    expect(e.isActive).toBe(false);
    expect(e.monthlyLimit).toBeNull();
  });

  it("active status → paid access", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const e = await getEntitlements(USER_ID);
    expect(e.plan).toBe("pro");
    expect(e.isActive).toBe(true);
  });

  it("trialing status → paid access", async () => {
    mockSubscription({ plan: "premium", status: "trialing", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const e = await getEntitlements(USER_ID);
    expect(e.plan).toBe("premium");
    expect(e.isActive).toBe(true);
  });

  it("past_due status → free entitlement, not paid", async () => {
    mockSubscription({ plan: "pro", status: "past_due", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const e = await getEntitlements(USER_ID);
    expect(e.plan).toBe("free");
    expect(e.isActive).toBe(false);
    expect(e.monthlyLimit).toBeNull();
  });

  it("canceled status → free entitlement, not paid", async () => {
    mockSubscription({ plan: "premium", status: "canceled", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const e = await getEntitlements(USER_ID);
    expect(e.plan).toBe("free");
    expect(e.isActive).toBe(false);
  });
});

describe("getEntitlements — monthly limits and usage", () => {
  it("Pro monthly limit is 10", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const e = await getEntitlements(USER_ID);
    expect(e.monthlyLimit).toBe(10);
  });

  it("Premium monthly limit is 30", async () => {
    mockSubscription({ plan: "premium", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const e = await getEntitlements(USER_ID);
    expect(e.monthlyLimit).toBe(30);
  });

  it("remaining reflects usage this period", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    vi.mocked(prisma.report.count).mockResolvedValue(7);
    const e = await getEntitlements(USER_ID);
    expect(e.usedThisPeriod).toBe(7);
    expect(e.remaining).toBe(3);
  });

  it("remaining is floored at 0, never negative", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    vi.mocked(prisma.report.count).mockResolvedValue(15); // over the limit
    const e = await getEntitlements(USER_ID);
    expect(e.remaining).toBe(0);
  });

  it("usage counting only includes pro_analysis/premium_analysis/hair_transformation report types — never glow_up", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    await getEntitlements(USER_ID);

    const call = vi.mocked(prisma.report.count).mock.calls[0][0] as { where: { type: { in: string[] } } };
    expect(call.where.type.in).toEqual(["pro_analysis", "premium_analysis", "hair_transformation"]);
    expect(call.where.type.in).not.toContain("glow_up");
  });
});

describe("canRunAnalysis", () => {
  it("free plan is denied", async () => {
    mockSubscription(null);
    const result = await canRunAnalysis(USER_ID);
    expect(result.allowed).toBe(false);
  });

  it("Pro with remaining allowance is allowed", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    vi.mocked(prisma.report.count).mockResolvedValue(2);
    const result = await canRunAnalysis(USER_ID);
    expect(result.allowed).toBe(true);
  });

  it("Pro with exhausted allowance is denied", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    vi.mocked(prisma.report.count).mockResolvedValue(10);
    const result = await canRunAnalysis(USER_ID);
    expect(result.allowed).toBe(false);
  });

  it("Premium with exhausted allowance is denied at 30", async () => {
    mockSubscription({ plan: "premium", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    vi.mocked(prisma.report.count).mockResolvedValue(30);
    const result = await canRunAnalysis(USER_ID);
    expect(result.allowed).toBe(false);
  });
});

// ── Stage 6 Step 9 — regression tests for the "Stripe succeeded but Glam AI
// still shows Subscribe" investigation. ──
describe("getEntitlements — Stage 6 Step 9 regression coverage", () => {
  it("a webhook-synced active Pro row (exact upsert shape the webhook writes) produces Pro entitlement", async () => {
    // Mirrors exactly what app/api/webhooks/stripe/route.ts's syncSubscription
    // writes on a successful checkout — same field names, same value types.
    mockSubscription({
      userId: USER_ID,
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_realistic1",
      stripeSubscriptionId: "sub_realistic1",
      currentPeriodStart: new Date(1700000000 * 1000),
      currentPeriodEnd: new Date(1702592000 * 1000),
      cancelAtPeriodEnd: false,
    });

    const e = await getEntitlements(USER_ID);

    expect(e.plan).toBe("pro");
    expect(e.isActive).toBe(true);
    expect(e.monthlyLimit).toBe(10);
    expect(e.canRunAnalysis).toBe(true);
  });

  it("Pro entitlement survives a fresh, independent request — no hidden caching between calls", async () => {
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });

    const first = await getEntitlements(USER_ID);
    const second = await getEntitlements(USER_ID); // a second, fully independent call — same as a browser refresh

    expect(first.plan).toBe("pro");
    expect(second.plan).toBe("pro");
    // Each call re-queried the DB rather than reusing a stale result from the first.
    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it("a stale in-memory read cannot persist Free after the DB row becomes Pro — each call reflects current DB state", async () => {
    // First call: no subscription yet (pre-webhook).
    mockSubscription(null);
    const before = await getEntitlements(USER_ID);
    expect(before.plan).toBe("free");

    // Webhook lands between calls, DB now has an active Pro row.
    mockSubscription({ plan: "pro", status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date() });
    const after = await getEntitlements(USER_ID);

    expect(after.plan).toBe("pro");
  });
});
