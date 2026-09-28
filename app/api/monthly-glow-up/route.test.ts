import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn() }));

vi.mock("@/lib/monthlyGlowUp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/monthlyGlowUp")>("@/lib/monthlyGlowUp");
  return { ...actual, generateMonthlyGlowUp: vi.fn() };
});

vi.mock("@/lib/routineStats", () => ({
  computeRoutineState: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    beautyProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    report: {
      findFirst: vi.fn(),
    },
  },
}));

import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { generateMonthlyGlowUp } from "@/lib/monthlyGlowUp";
import { computeRoutineState } from "@/lib/routineStats";
import { prisma } from "@/lib/db";

const USER_ID = "user_test_monthly";

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
  return new NextRequest("http://localhost/api/monthly-glow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_CHECKIN = {
  skinConcernsChanged: false,
  hairConcernsChanged: false,
  productsChanged: true,
  routineConsistency: "medium" as const,
  improveNext: "More hydration",
};

const SAMPLE_SUMMARY = {
  workingOn: ["Hydration"],
  routineConsistencySummary: "You're building a solid habit.",
  skinFocus: "Keep it simple.",
  hairFocus: "Stay consistent.",
  makeupFocus: "You're on track.",
  nextFocus: ["Add SPF"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(computeRoutineState).mockResolvedValue({
    today: { skin_am: true, skin_pm: false, hair: false, makeup: false },
    weekCompletionCount: 5,
    weekTotalPossible: 28,
    streakDays: 2,
  } as never);
  vi.mocked(prisma.report.findFirst).mockResolvedValue(null);
});

describe("GET /api/monthly-glow-up", () => {
  it("rejects unauthenticated requests", async () => {
    mockSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("rejects a free user", async () => {
    mockSession(USER_ID);
    mockPlan("free");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("rejects a Pro user — Monthly Glow-Up is Premium-only", async () => {
    mockSession(USER_ID);
    mockPlan("pro");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("reads a cached summary with zero Claude calls", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      monthlyGlowUp: JSON.stringify(SAMPLE_SUMMARY),
      monthlyGlowUpUpdatedAt: new Date("2026-01-01"),
    } as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toEqual(SAMPLE_SUMMARY);
    expect(generateMonthlyGlowUp).not.toHaveBeenCalled();
  });

  it("returns null when no check-in has ever happened — not an error", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toBeNull();
  });
});

describe("POST /api/monthly-glow-up", () => {
  it("a free user cannot spoof access by claiming premium in the body", async () => {
    mockSession(USER_ID);
    mockPlan("free");
    const res = await POST(makePostRequest({ ...VALID_CHECKIN, plan: "premium" }));
    expect(res.status).toBe(403);
    expect(generateMonthlyGlowUp).not.toHaveBeenCalled();
  });

  it("rejects invalid check-in answers before calling Claude", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    const res = await POST(makePostRequest({ routineConsistency: "extreme" }));
    expect(res.status).toBe(400);
    expect(generateMonthlyGlowUp).not.toHaveBeenCalled();
  });

  it("calls Claude exactly once on an explicit, valid check-in submission", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateMonthlyGlowUp).mockResolvedValue(SAMPLE_SUMMARY as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    const res = await POST(makePostRequest(VALID_CHECKIN));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(generateMonthlyGlowUp).toHaveBeenCalledTimes(1);
    expect(data.summary).toEqual(SAMPLE_SUMMARY);
  });

  it("caches the generated summary onto BeautyProfile", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateMonthlyGlowUp).mockResolvedValue(SAMPLE_SUMMARY as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    await POST(makePostRequest(VALID_CHECKIN));

    const upsertArgs = vi.mocked(prisma.beautyProfile.upsert).mock.calls[0][0] as {
      update: { monthlyGlowUp: string };
    };
    expect(JSON.parse(upsertArgs.update.monthlyGlowUp)).toEqual(SAMPLE_SUMMARY);
  });

  it("a failed generation does not cache anything and returns a clean error", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
    vi.mocked(generateMonthlyGlowUp).mockRejectedValue(new Error("Monthly Glow-Up rejected by safety validation"));

    const res = await POST(makePostRequest(VALID_CHECKIN));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.canRetry).toBe(true);
    expect(prisma.beautyProfile.upsert).not.toHaveBeenCalled();
  });

  it("uses cached routine stats and skin/hair goals as input — reuses existing data, no re-computation", async () => {
    mockSession(USER_ID);
    mockPlan("premium");
    vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue({
      skinPlan: JSON.stringify({ skinGoals: ["Hydration"], morningRoutine: [], nightRoutine: [], weeklyCare: [], recommendedProducts: [] }),
      hairPlan: JSON.stringify({ hairGoals: ["Less frizz"], washDayRoutine: [], weeklyRoutine: [], stylingRecommendations: [], recommendedProducts: [] }),
    } as never);
    vi.mocked(generateMonthlyGlowUp).mockResolvedValue(SAMPLE_SUMMARY as never);
    vi.mocked(prisma.beautyProfile.upsert).mockResolvedValue({} as never);

    await POST(makePostRequest(VALID_CHECKIN));

    const input = vi.mocked(generateMonthlyGlowUp).mock.calls[0][0];
    expect(input.skinGoals).toEqual(["Hydration"]);
    expect(input.hairGoals).toEqual(["Less frizz"]);
    expect(input.weekCompletionCount).toBe(5);
    expect(input.streakDays).toBe(2);
  });
});
