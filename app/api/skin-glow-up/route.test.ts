import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  getEntitlements: vi.fn(),
}));

vi.mock("@/lib/skinPlan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/skinPlan")>("@/lib/skinPlan");
  return {
    ...actual,
    generateSkinPlan: vi.fn(),
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
import { generateSkinPlan } from "@/lib/skinPlan";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_skin";

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
  return new NextRequest("http://localhost/api/skin-glow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_PLAN = {
  skinGoals: ["Hydration"],
  morningRoutine: [{ step: "Cleanser", productType: "gel cleanser", why: "gentle" }],
  nightRoutine: [{ step: "Cleanser", productType: "gel cleanser", why: "gentle" }],
  weeklyCare: [{ step: "Mask", frequency: "1x/week", why: "boosts hydration" }],
  recommendedProducts: [{ category: "Cleanser", productType: "gel cleanser", example: "", why: "gentle" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/skin-glow-up", () => {
  it("12. returns cached data without any Claude call", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinType: "oily",
      skinConcerns: JSON.stringify(["dryness"]),
      budget: "mid_range",
      skinPlan: JSON.stringify(SAMPLE_PLAN),
      skinPlanUpdatedAt: new Date("2026-01-01"),
    } as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.skinPlan).toEqual(SAMPLE_PLAN);
    expect(generateSkinPlan).not.toHaveBeenCalled();
  });

  it("free user is rejected with 403", async () => {
    mockSession(USER_ID);
    mockPlan("free");

    const res = await GET();
    expect(res.status).toBe(403);
    expect(generateSkinPlan).not.toHaveBeenCalled();
  });

  it("unauthenticated user is rejected with 401", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getEntitlements).not.toHaveBeenCalled();
  });
});

describe("POST /api/skin-glow-up", () => {
  it("1. free user cannot generate", async () => {
    mockSession(USER_ID);
    mockPlan("free");

    const res = await POST(makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range" }));
    expect(res.status).toBe(403);
    expect(generateSkinPlan).not.toHaveBeenCalled();
  });

  it("2. Pro user can generate", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateSkinPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.skinPlan).toEqual(SAMPLE_PLAN);
  });

  it("3. Premium user can generate", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateSkinPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest({ skinType: "dry", skinConcerns: ["hydration"], budget: "premium" }));
    expect(res.status).toBe(200);
  });

  it("4. a free user cannot spoof access by claiming a paid tier in the body", async () => {
    mockSession(USER_ID);
    mockPlan("free"); // the DB-backed truth — the body below is ignored

    const res = await POST(
      makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range", plan: "premium" })
    );
    expect(res.status).toBe(403);
    expect(generateSkinPlan).not.toHaveBeenCalled();
  });

  it("5. intake saves correctly", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateSkinPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    await POST(makePostRequest({ skinType: "combination", skinConcerns: ["texture", "dullness"], budget: "budget" }));

    const upsertArgs = vi.mocked(prisma.beautyProfile.upsert).mock.calls[0][0] as {
      update: { skinType: string; skinConcerns: string; budget: string };
    };
    expect(upsertArgs.update.skinType).toBe("combination");
    expect(JSON.parse(upsertArgs.update.skinConcerns)).toEqual(["texture", "dullness"]);
    expect(upsertArgs.update.budget).toBe("budget");
  });

  it("6. first generation calls Claude and saves skinPlan", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null); // no existing row
    vi.mocked(generateSkinPlan).mockResolvedValue(SAMPLE_PLAN as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    await POST(makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range" }));

    expect(generateSkinPlan).toHaveBeenCalledTimes(1);
    const upsertArgs = vi.mocked(prisma.beautyProfile.upsert).mock.calls[0][0] as { update: { skinPlan: string } };
    expect(JSON.parse(upsertArgs.update.skinPlan)).toEqual(SAMPLE_PLAN);
  });

  it("7. an existing cached plan with unchanged intake does NOT call Claude again", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinType: "oily",
      skinConcerns: JSON.stringify(["dryness"]),
      budget: "mid_range",
      skinPlan: JSON.stringify(SAMPLE_PLAN),
      skinPlanUpdatedAt: new Date("2026-01-01"),
    } as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.regenerated).toBe(false);
    expect(generateSkinPlan).not.toHaveBeenCalled();
  });

  it("8. changing intake invalidates the cached plan and regenerates", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinType: "oily",
      skinConcerns: JSON.stringify(["dryness"]),
      budget: "mid_range",
      skinPlan: JSON.stringify(SAMPLE_PLAN),
      skinPlanUpdatedAt: new Date("2026-01-01"),
    } as never);
    const newPlan = { ...SAMPLE_PLAN, skinGoals: ["Reduce shine"] };
    vi.mocked(generateSkinPlan).mockResolvedValue(newPlan as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    // skinType changed from "oily" to "combination"
    const res = await POST(makePostRequest({ skinType: "combination", skinConcerns: ["dryness"], budget: "mid_range" }));
    const data = await res.json();

    expect(generateSkinPlan).toHaveBeenCalledTimes(1);
    expect(data.regenerated).toBe(true);
    expect(data.skinPlan).toEqual(newPlan);
  });

  it("9. an explicit refresh regenerates even when intake is unchanged", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinType: "oily",
      skinConcerns: JSON.stringify(["dryness"]),
      budget: "mid_range",
      skinPlan: JSON.stringify(SAMPLE_PLAN),
      skinPlanUpdatedAt: new Date("2026-01-01"),
    } as never);
    const refreshedPlan = { ...SAMPLE_PLAN, skinGoals: ["Fresh take"] };
    vi.mocked(generateSkinPlan).mockResolvedValue(refreshedPlan as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(
      makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range", refresh: true })
    );
    const data = await res.json();

    expect(generateSkinPlan).toHaveBeenCalledTimes(1);
    expect(data.regenerated).toBe(true);
    expect(data.skinPlan).toEqual(refreshedPlan);
  });

  it("10. an invalid/unsafe Claude response is rejected safely — no save, clean error", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    // generateSkinPlan itself throws when its internal validateSkinPlan call
    // rejects malformed/unsafe JSON — the route must treat that as a clean failure.
    vi.mocked(generateSkinPlan).mockRejectedValue(new Error("Skin plan rejected by safety validation: ..."));

    const res = await POST(makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "mid_range" }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.canRetry).toBe(true);
    expect(prisma.beautyProfile.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid skinType/skinConcerns/budget with 400 before ever calling Claude", async () => {
    mockSession(USER_ID);
    mockPlan("pro");

    const res1 = await POST(makePostRequest({ skinType: "not_a_type", skinConcerns: ["dryness"], budget: "mid_range" }));
    expect(res1.status).toBe(400);

    const res2 = await POST(makePostRequest({ skinType: "oily", skinConcerns: [], budget: "mid_range" }));
    expect(res2.status).toBe(400);

    const res3 = await POST(makePostRequest({ skinType: "oily", skinConcerns: ["dryness"], budget: "unlimited" }));
    expect(res3.status).toBe(400);

    expect(generateSkinPlan).not.toHaveBeenCalled();
  });
});
