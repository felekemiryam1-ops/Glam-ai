import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    routineCheckIn: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";

const USER_A = "user_a";
const USER_B = "user_b";

function mockSession(userId: string | null) {
  vi.mocked(auth).mockResolvedValue((userId ? { user: { id: userId, email: "t@example.com" } } : null) as never);
}

function mockPlan(plan: "free" | "pro" | "premium") {
  vi.mocked(getEntitlements).mockResolvedValue({
    userId: USER_A,
    plan,
    subscriptionStatus: plan === "free" ? null : "active",
    isActive: plan !== "free",
    monthlyLimit: plan === "premium" ? 30 : plan === "pro" ? 10 : null,
    periodStart: null,
    periodEnd: null,
    usedThisPeriod: 0,
    remaining: null,
    canRunAnalysis: plan !== "free",
  } as never);
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/routine-checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.routineCheckIn.findMany).mockResolvedValue([]);
  vi.mocked(prisma.routineCheckIn.upsert).mockResolvedValue({} as never);
});

describe("GET /api/routine-checkin", () => {
  it("rejects unauthenticated requests", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("rejects a free user", async () => {
    mockSession(USER_A);
    mockPlan("free");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("rejects a Pro user — routine tracking is Premium-only", async () => {
    mockSession(USER_A);
    mockPlan("pro");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("allows a Premium user", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/routine-checkin", () => {
  it("a free user cannot spoof access by claiming premium in the body", async () => {
    mockSession(USER_A);
    mockPlan("free");
    const res = await POST(makePostRequest({ category: "hair", completed: true, plan: "premium" }));
    expect(res.status).toBe(403);
    expect(prisma.routineCheckIn.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid category", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    const res = await POST(makePostRequest({ category: "not_a_category", completed: true }));
    expect(res.status).toBe(400);
  });

  it("persists a completion for today, scoped to the authenticated user", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    await POST(makePostRequest({ category: "hair", completed: true }));

    const call = vi.mocked(prisma.routineCheckIn.upsert).mock.calls[0][0] as {
      where: { userId_date_category: { userId: string; category: string } };
      create: { userId: string };
    };
    expect(call.where.userId_date_category.userId).toBe(USER_A);
    expect(call.create.userId).toBe(USER_A);
    expect(call.where.userId_date_category.category).toBe("hair");
  });

  it("never writes a date other than today, regardless of client input", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    // The route doesn't even read a `date` field from the body — this just
    // confirms a client-supplied date is silently ignored, not honored.
    await POST(makePostRequest({ category: "hair", completed: true, date: "2020-01-01" }));

    const call = vi.mocked(prisma.routineCheckIn.upsert).mock.calls[0][0] as {
      create: { date: Date };
    };
    const today = new Date();
    const expectedDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    expect(call.create.date.getTime()).toBe(expectedDate.getTime());
  });

  it("completion is isolated between users — one user's write never targets another's row", async () => {
    mockSession(USER_B);
    mockPlan("premium");
    await POST(makePostRequest({ category: "makeup", completed: true }));

    const call = vi.mocked(prisma.routineCheckIn.upsert).mock.calls[0][0] as {
      where: { userId_date_category: { userId: string } };
    };
    expect(call.where.userId_date_category.userId).toBe(USER_B);
    expect(call.where.userId_date_category.userId).not.toBe(USER_A);
  });
});
