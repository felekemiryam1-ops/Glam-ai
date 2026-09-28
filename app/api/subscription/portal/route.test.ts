import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: { billingPortal: { sessions: { create: vi.fn() } } },
}));
vi.mock("@/lib/db", () => ({
  prisma: { subscription: { findUnique: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_portal";

function mockSession(userId: string | null) {
  vi.mocked(auth).mockResolvedValue((userId ? { user: { id: userId } } : null) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/subscription/portal", () => {
  it("rejects unauthenticated requests", async () => {
    mockSession(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no Stripe customer on file", async () => {
    mockSession(USER_ID);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(404);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a portal session for the authenticated user's own Stripe customer", async () => {
    mockSession(USER_ID);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ stripeCustomerId: "cus_abc123" } as never);
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" } as never);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBe("https://billing.stripe.com/session/xyz");
    const call = vi.mocked(stripe.billingPortal.sessions.create).mock.calls[0][0]!;
    expect(call.customer).toBe("cus_abc123");
  });

  it("looks up the subscription by the authenticated session's own userId, never a client-supplied one", async () => {
    mockSession(USER_ID);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ stripeCustomerId: "cus_abc123" } as never);
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({ url: "https://billing.stripe.com/session/xyz" } as never);

    await POST();

    const call = vi.mocked(prisma.subscription.findUnique).mock.calls[0][0] as { where: { userId: string } };
    expect(call.where.userId).toBe(USER_ID);
  });
});
