import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  getEntitlements: vi.fn(),
}));

vi.mock("@/lib/hairPlan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hairPlan")>("@/lib/hairPlan");
  return {
    ...actual,
    generateHairPlan: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    beautyProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { generateHairPlan } from "@/lib/hairPlan";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_hair";

function mockSession(userId: string | null) {
  vi.mocked(auth).mockResolvedValue((userId ? { user: { id: userId, email: "t@example.com" } } : null) as never);
}

function mockPlan(plan: "free" | "pro" | "premium") {
  vi.mocked(getEntitlements).mockResolvedValue({
    userId: USER_ID,
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
  return new NextRequest("http://localhost/api/hair-glow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_PLAN = {
  hairGoals: ["Less frizz"],
  washDayRoutine: [{ step: "Shampoo", productType: "sulfate-free shampoo", why: "gentle cleanse" }],
  weeklyRoutine: [{ step: "Mask", frequency: "1x/week", why: "boosts moisture" }],
  stylingRecommendations: [{ tip: "Use a microfiber towel", why: "reduces frizz" }],
  recommendedProducts: [{ category: "Shampoo", productType: "sulfate-free shampoo", example: "", why: "gentle" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/hair-glow-up", () => {
  it("cached plan returns without any Claude call", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      hairType: "curly",
      hairConcerns: JSON.stringify(["frizz"]),
      budget: "mid_range",
      hairPlan: JSON.stringify(SAMPLE_PLAN),
      hairPlanUpdatedAt: new Date("2026-01-01"),
    } as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.hairPlan).toEqual(SAMPLE_PLAN);
    expect(generateHairPlan).not.toHaveBeenCalled();
  });

  it("free user is rejected with 403", async () => {
    mockSession(USER_ID);
    mockPlan("free");

    const res = await GET();
    expect(res.status).toBe(403);
    expect(generateHairPlan).not.toHaveBeenCalled();
  });

  it("unauthenticated user is rejected with 401", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getEntitlements).not.toHaveBeenCalled();
  });
});

describe("POST /api/hair-glow-up", () => {
  it("free user cannot generate", async () => {
    mockSession(USER_ID);
    mockPlan("free");

    const res = await POST(makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range" }));
    expect(res.status).toBe(403);
    expect(generateHairPlan).not.toHaveBeenCalled();
  });

  it("Pro user can generate", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateHairPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hairPlan).toEqual(SAMPLE_PLAN);
  });

  it("Premium user can generate", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateHairPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest({ hairType: "wavy", hairConcerns: ["dullness"], budget: "premium" }));
    expect(res.status).toBe(200);
  });

  it("a free user cannot spoof access by claiming a paid tier in the body", async () => {
    mockSession(USER_ID);
    mockPlan("free"); // the DB-backed truth — the body below is ignored

    const res = await POST(
      makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range", plan: "premium" })
    );
    expect(res.status).toBe(403);
    expect(generateHairPlan).not.toHaveBeenCalled();
  });

  it("intake saves correctly", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateHairPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    await POST(makePostRequest({ hairType: "coily", hairConcerns: ["breakage", "dryness"], budget: "budget" }));

    const upsertArgs = vi.mocked(prisma.beautyProfile.upsert).mock.calls[0][0] as {
      update: { hairType: string; hairConcerns: string; budget: string };
    };
    expect(upsertArgs.update.hairType).toBe("coily");
    expect(JSON.parse(upsertArgs.update.hairConcerns)).toEqual(["breakage", "dryness"]);
    expect(upsertArgs.update.budget).toBe("budget");
  });

  it("first generation calls Claude and saves hairPlan", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateHairPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    await POST(makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range" }));

    expect(generateHairPlan).toHaveBeenCalledTimes(1);
    const upsertArgs = vi.mocked(prisma.beautyProfile.upsert).mock.calls[0][0] as { update: { hairPlan: string } };
    expect(JSON.parse(upsertArgs.update.hairPlan)).toEqual(SAMPLE_PLAN);
  });

  it("an existing cached plan with unchanged intake does NOT call Claude again", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      hairType: "curly",
      hairConcerns: JSON.stringify(["frizz"]),
      budget: "mid_range",
      hairPlan: JSON.stringify(SAMPLE_PLAN),
      hairPlanUpdatedAt: new Date("2026-01-01"),
    } as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.regenerated).toBe(false);
    expect(generateHairPlan).not.toHaveBeenCalled();
  });

  it("changing intake invalidates the cached plan and regenerates", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      hairType: "curly",
      hairConcerns: JSON.stringify(["frizz"]),
      budget: "mid_range",
      hairPlan: JSON.stringify(SAMPLE_PLAN),
      hairPlanUpdatedAt: new Date("2026-01-01"),
    } as never);
    const newPlan = { ...SAMPLE_PLAN, hairGoals: ["Reduce breakage"] };
    vi.mocked(generateHairPlan).mockResolvedValue(newPlan as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    // hairType changed from "curly" to "wavy"
    const res = await POST(makePostRequest({ hairType: "wavy", hairConcerns: ["frizz"], budget: "mid_range" }));
    const data = await res.json();

    expect(generateHairPlan).toHaveBeenCalledTimes(1);
    expect(data.regenerated).toBe(true);
    expect(data.hairPlan).toEqual(newPlan);
  });

  it("an explicit refresh regenerates even when intake is unchanged", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      hairType: "curly",
      hairConcerns: JSON.stringify(["frizz"]),
      budget: "mid_range",
      hairPlan: JSON.stringify(SAMPLE_PLAN),
      hairPlanUpdatedAt: new Date("2026-01-01"),
    } as never);
    const refreshedPlan = { ...SAMPLE_PLAN, hairGoals: ["Fresh take"] };
    vi.mocked(generateHairPlan).mockResolvedValue(refreshedPlan as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(
      makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range", refresh: true })
    );
    const data = await res.json();

    expect(generateHairPlan).toHaveBeenCalledTimes(1);
    expect(data.regenerated).toBe(true);
    expect(data.hairPlan).toEqual(refreshedPlan);
  });

  it("an invalid/unsafe Claude response is rejected safely — no save, clean error", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateHairPlan).mockRejectedValue(new Error("Hair plan rejected by safety validation: ..."));

    const res = await POST(makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "mid_range" }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.canRetry).toBe(true);
    expect(prisma.beautyProfile.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid hairType/hairConcerns/budget with 400 before ever calling Claude", async () => {
    mockSession(USER_ID);
    mockPlan("pro");

    const res1 = await POST(makePostRequest({ hairType: "not_a_type", hairConcerns: ["frizz"], budget: "mid_range" }));
    expect(res1.status).toBe(400);

    const res2 = await POST(makePostRequest({ hairType: "curly", hairConcerns: [], budget: "mid_range" }));
    expect(res2.status).toBe(400);

    const res3 = await POST(makePostRequest({ hairType: "curly", hairConcerns: ["frizz"], budget: "unlimited" }));
    expect(res3.status).toBe(400);

    expect(generateHairPlan).not.toHaveBeenCalled();
  });
});
