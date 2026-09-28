import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: vi.fn() } } },
  PRO_PRICE_ID: "price_pro_test",
  PREMIUM_PRICE_ID: "price_premium_test",
}));

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { findUnique: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_checkout";

function mockSession(user: { id: string; email: string } | null) {
  vi.mocked(auth).mockResolvedValue((user ? { user } : null) as never);
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
  vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: "https://checkout.stripe.com/session123" } as never);
});

describe("POST /api/subscription/checkout", () => {
  it("rejects unauthenticated requests", async () => {
    mockSession(null);
    const res = await POST(makeRequest({ plan: "pro" }));
    expect(res.status).toBe(401);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("free user can choose Pro — a real checkout session is created", async () => {
    mockSession({ id: USER_ID, email: "t@example.com" });
    const res = await POST(makeRequest({ plan: "pro" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session123");
    const call = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0]!;
    expect(call.line_items?.[0]).toMatchObject({ price: "price_pro_test" });
    expect(call.client_reference_id).toBe(USER_ID);
  });

  it("free user can choose Premium — a real checkout session is created", async () => {
    mockSession({ id: USER_ID, email: "t@example.com" });
    const res = await POST(makeRequest({ plan: "premium" }));
    expect(res.status).toBe(200);

    const call = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0]!;
    expect(call.line_items?.[0]).toMatchObject({ price: "price_premium_test" });
  });

  it("rejects an invalid plan value", async () => {
    mockSession({ id: USER_ID, email: "t@example.com" });
    const res = await POST(makeRequest({ plan: "ultra-deluxe" }));
    expect(res.status).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("the requested plan is validated server-side against a fixed allowlist, not passed through blindly", async () => {
    mockSession({ id: USER_ID, email: "t@example.com" });
    // Any string outside ["pro","premium"] must be rejected — including
    // something that looks plausible but isn't a real plan.
    const res = await POST(makeRequest({ plan: "free" }));
    expect(res.status).toBe(400);
  });

  it("reuses the existing Stripe customer id when the user already has one on file", async () => {
    mockSession({ id: USER_ID, email: "t@example.com" });
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ stripeCustomerId: "cus_existing123" } as never);

    await POST(makeRequest({ plan: "pro" }));

    const call = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0]!;
    expect(call.customer).toBe("cus_existing123");
  });
});
