import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  getEntitlements: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    beautyProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    report: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
  },
}));

// The strongest possible proof of "zero Claude calls": mock the Anthropic
// SDK itself and assert its constructor/messages.create are never touched.
// route.ts doesn't even import lib/skinPlan.ts's or lib/hairPlan.ts's
// generate functions — this mock would catch it even if it someday did.
const anthropicCreateMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: anthropicCreateMock },
  })),
}));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_routine";

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

const SAMPLE_SKIN_PLAN = {
  skinGoals: ["Hydration"],
  morningRoutine: [{ step: "Cleanser", productType: "gel cleanser", why: "gentle" }],
  nightRoutine: [{ step: "Cleanser", productType: "gel cleanser", why: "gentle" }],
  weeklyCare: [{ step: "Mask", frequency: "1x/week", why: "boosts hydration" }],
  recommendedProducts: [{ category: "Cleanser", productType: "gel cleanser", example: "", why: "gentle" }],
};

const SAMPLE_HAIR_PLAN = {
  hairGoals: ["Less frizz"],
  washDayRoutine: [{ step: "Shampoo", productType: "sulfate-free shampoo", why: "gentle cleanse" }],
  weeklyRoutine: [{ step: "Mask", frequency: "1x/week", why: "boosts moisture" }],
  stylingRecommendations: [{ tip: "Use a microfiber towel", why: "reduces frizz" }],
  recommendedProducts: [{ category: "Shampoo", productType: "sulfate-free shampoo", example: "", why: "gentle" }],
};

const SAMPLE_PREVIEW = {
  headline: "Test headline",
  colorDirection: "warm",
  makeupStyle: "Soft Glam",
  beautyVibe: "Natural Polish",
  palette: {
    primary: { name: "Warm Terracotta", hex: "#D97D5C", use: "blush" },
    supporting: { name: "Soft Peach", hex: "#F4D4C4", use: "transition" },
    definition: { name: "Rich Cocoa", hex: "#6B5344", use: "lid" },
  },
  bestColors: [],
  makeupDirection: "warm, soft glam",
  firstMove: "Try a warm blush",
};

function sampleReport(overrides: Record<string, unknown> = {}) {
  return {
    data: JSON.stringify({
      schemaVersion: 3,
      preview: SAMPLE_PREVIEW,
      imageUrl: "https://cdn.fal.ai/latest.jpg",
      attempts: [{ imageUrl: "https://cdn.fal.ai/latest.jpg", imagePrompt: "p", createdAt: "2026-01-01T00:00:00.000Z" }],
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.product.findMany).mockResolvedValue([]);
});

describe("GET /api/beauty-routine", () => {
  it("rejects unauthenticated requests", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getEntitlements).not.toHaveBeenCalled();
  });

  it("free user is rejected with 403", async () => {
    mockSession(USER_ID);
    mockPlan("free");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("Pro user has access", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("Premium user has access", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("reads cached Skin and Hair plans correctly", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: JSON.stringify(SAMPLE_SKIN_PLAN),
      hairPlan: JSON.stringify(SAMPLE_HAIR_PLAN),
      budget: "mid_range",
    } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    const res = await GET();
    const data = await res.json();

    expect(data.skinPlan).toEqual(SAMPLE_SKIN_PLAN);
    expect(data.hairPlan).toEqual(SAMPLE_HAIR_PLAN);
  });

  it("no Claude call is made even when cached plans exist", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: JSON.stringify(SAMPLE_SKIN_PLAN),
      hairPlan: JSON.stringify(SAMPLE_HAIR_PLAN),
      budget: "mid_range",
    } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(sampleReport() as never);

    await GET();

    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("no Claude call is made on a plain page load with no data at all", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    await GET();

    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("handles a missing Skin plan correctly — null, not an error", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: null,
      hairPlan: JSON.stringify(SAMPLE_HAIR_PLAN),
      budget: "mid_range",
    } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.skinPlan).toBeNull();
    expect(data.hairPlan).toEqual(SAMPLE_HAIR_PLAN);
  });

  it("handles a missing Hair plan correctly — null, not an error", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: JSON.stringify(SAMPLE_SKIN_PLAN),
      hairPlan: null,
      budget: "mid_range",
    } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.skinPlan).toEqual(SAMPLE_SKIN_PLAN);
    expect(data.hairPlan).toBeNull();
  });

  it("handles makeup data correctly when a report exists — deterministic assembly, no invention", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({ budget: "mid_range" } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(sampleReport() as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.makeup).not.toBeNull();
    expect(data.makeup.colorDirection).toBe("warm");
    expect(data.makeup.imageUrl).toBe("https://cdn.fal.ai/latest.jpg");
    expect(typeof data.makeup.eyeColorName).toBe("string");
  });

  it("handles no report at all correctly — makeup is null, not fabricated", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);

    const res = await GET();
    const data = await res.json();

    expect(data.makeup).toBeNull();
    expect(data.matchedProducts).toEqual([]);
  });

  it("does not consume any Glow-Up analysis usage — no Report row is ever created", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: JSON.stringify(SAMPLE_SKIN_PLAN),
      hairPlan: JSON.stringify(SAMPLE_HAIR_PLAN),
      budget: "mid_range",
    } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(sampleReport() as never);

    await GET();

    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(prisma.report.update).not.toHaveBeenCalled();
  });

  it("makes no unnecessary database writes at all — every call is a read", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: JSON.stringify(SAMPLE_SKIN_PLAN),
      hairPlan: JSON.stringify(SAMPLE_HAIR_PLAN),
      budget: "premium",
    } as never);
    vi.mocked(prisma.report.findFirst).mockResolvedValue(sampleReport() as never);

    await GET();

    expect(prisma.beautyProfile.update).not.toHaveBeenCalled();
    expect(prisma.beautyProfile.upsert).not.toHaveBeenCalled();
    expect(prisma.beautyProfile.create).not.toHaveBeenCalled();
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(prisma.report.update).not.toHaveBeenCalled();
  });
});
