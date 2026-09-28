import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { GlamReport, GlamPreview } from "@/lib/types";

// ── Mocks ────────────────────────────────────────────────────────────────────
// No paid Claude/FAL calls anywhere in this file — everything mocked.

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  canRunAnalysis: vi.fn(),
}));

vi.mock("@/lib/imageGen", () => ({
  generateMakeupGlowUp: vi.fn(),
}));

vi.mock("@/lib/imageValidation", () => ({
  validateImageBytes: vi.fn(() => ({ valid: true, detectedType: "image/jpeg" })),
}));

vi.mock("@/lib/ai", () => ({
  analyzePhoto: vi.fn(),
}));

vi.mock("@/lib/faceLandmarks", () => ({
  detectFaceLandmarks: vi.fn(),
}));

vi.mock("@/lib/faceMap", () => ({
  buildFaceMap: vi.fn(() => []),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    report: {
      create: vi.fn(),
    },
    beautyProfile: {
      findUnique: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { canRunAnalysis } from "@/lib/entitlements";
import { generateMakeupGlowUp } from "@/lib/imageGen";
import { analyzePhoto } from "@/lib/ai";
import { detectFaceLandmarks } from "@/lib/faceLandmarks";
import { prisma } from "@/lib/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "user_test_123";
const IMAGE_BASE64 = Buffer.from("fake-image-bytes").toString("base64");

const PREVIEW: GlamPreview = {
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

const recommendation = { title: "t", recommendation: "r", why: "w", products: [] };
const MOCK_REPORT: GlamReport = {
  profile: { headline: "h", summary: "s" },
  makeup: { base: recommendation, blush: recommendation, bronzer: recommendation, highlighter: recommendation, eyes: recommendation, lips: recommendation },
  hair: { styles: recommendation, cuts: recommendation, styling: recommendation, color: recommendation },
  colors: { clothing: recommendation, makeup: recommendation, accessories: recommendation },
  style: [],
  priorities: [],
  quickPlan: { today: [], thisWeek: [], nextPurchase: [] },
  aestheticIdentity: null,
  featureEnhancements: [],
};

const MOCK_LANDMARKS = {
  leftEye: [{ x: 1, y: 1 }],
  rightEye: [{ x: 2, y: 2 }],
  leftEyebrow: [{ x: 1, y: 0 }],
  rightEyebrow: [{ x: 2, y: 0 }],
  leftIris: [{ x: 1, y: 1 }],
  rightIris: [{ x: 2, y: 2 }],
  lips: [{ x: 1, y: 3 }],
  faceOval: [{ x: 0, y: 0 }],
  width: 100,
  height: 100,
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/generate-makeup/included", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSession(userId: string | null) {
  vi.mocked(auth).mockResolvedValue(
    (userId ? { user: { id: userId, email: "test@example.com" } } : null) as never
  );
}

function mockEntitlements(opts: { allowed: boolean; plan: "free" | "pro" | "premium"; remaining?: number | null; reason?: string }) {
  vi.mocked(canRunAnalysis).mockResolvedValue({
    allowed: opts.allowed,
    reason: opts.reason,
    entitlements: {
      userId: USER_ID,
      plan: opts.plan,
      subscriptionStatus: opts.plan === "free" ? null : "active",
      isActive: opts.plan !== "free",
      monthlyLimit: opts.plan === "premium" ? 30 : opts.plan === "pro" ? 10 : null,
      periodStart: null,
      periodEnd: null,
      usedThisPeriod: 0,
      remaining: opts.remaining ?? (opts.plan === "premium" ? 30 : opts.plan === "pro" ? 10 : null),
      canRunAnalysis: opts.allowed,
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analyzePhoto).mockResolvedValue(MOCK_REPORT);
  vi.mocked(detectFaceLandmarks).mockResolvedValue(MOCK_LANDMARKS);
  vi.mocked(prisma.report.create).mockResolvedValue({} as never);
  vi.mocked(prisma.beautyProfile.findUnique).mockResolvedValue(null);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/generate-makeup/included", () => {
  it("1. rejects unauthenticated requests", async () => {
    mockSession(null);

    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));

    expect(res.status).toBe(401);
    expect(canRunAnalysis).not.toHaveBeenCalled();
    expect(generateMakeupGlowUp).not.toHaveBeenCalled();
  });

  it("2. rejects an authenticated free-tier user", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: false, plan: "free", remaining: null, reason: "This feature requires a Pro or Premium subscription." });

    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("This feature requires a Pro or Premium subscription.");
    expect(generateMakeupGlowUp).not.toHaveBeenCalled();
  });

  it("3. allows a Pro user", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "pro", remaining: 9 });
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/pro-result.jpg", prompt: "p0" });

    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.imageUrl).toBe("https://cdn.fal.ai/pro-result.jpg");
  });

  it("4. allows a Premium user", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "premium", remaining: 29 });
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/premium-result.jpg", prompt: "p0" });

    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("5. ignores a client-supplied fake tier — a free user cannot spoof plan: 'premium'", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: false, plan: "free", remaining: null, reason: "This feature requires a Pro or Premium subscription." });

    // The body claims premium; canRunAnalysis (mocked as the real DB-backed
    // free user) is the only thing consulted — the route never reads `plan`
    // from the body at all.
    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW, plan: "premium" }));

    expect(res.status).toBe(403);
    expect(generateMakeupGlowUp).not.toHaveBeenCalled();
    // canRunAnalysis was called with only the authenticated userId — never
    // anything derived from the request body.
    expect(canRunAnalysis).toHaveBeenCalledWith(USER_ID);
  });

  it("6. a Pro analysis is persisted with type 'pro_analysis' and stripeSessionId null", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "pro" });
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/pro.jpg", prompt: "p0" });

    await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));

    expect(prisma.report.create).toHaveBeenCalledTimes(1);
    const createArgs = vi.mocked(prisma.report.create).mock.calls[0][0] as { data: { userId: string; type: string; stripeSessionId: string | null } };
    expect(createArgs.data.userId).toBe(USER_ID);
    expect(createArgs.data.type).toBe("pro_analysis");
    expect(createArgs.data.stripeSessionId).toBeNull();
  });

  it("7. a Premium analysis is persisted with type 'premium_analysis'", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "premium" });
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/premium.jpg", prompt: "p0" });

    await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));

    const createArgs = vi.mocked(prisma.report.create).mock.calls[0][0] as { data: { type: string } };
    expect(createArgs.data.type).toBe("premium_analysis");
  });

  it("8. a successful generation creates exactly one Report", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "pro" });
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/one.jpg", prompt: "p0" });

    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));

    expect(res.status).toBe(200);
    expect(prisma.report.create).toHaveBeenCalledTimes(1);
  });

  it("9. a failed generation does not create a Report (never counts against the monthly allowance)", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "pro" });
    vi.mocked(generateMakeupGlowUp).mockRejectedValue(new Error("FAL exploded"));

    const res = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.canRetry).toBe(true);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it("10. concurrent requests for the same user cannot double-consume — the second is rejected while the first is in flight", async () => {
    mockSession(USER_ID);
    mockEntitlements({ allowed: true, plan: "pro" });

    let resolveFal!: (v: { imageUrl: string; prompt: string }) => void;
    const falPromise = new Promise<{ imageUrl: string; prompt: string }>((resolve) => {
      resolveFal = resolve;
    });
    vi.mocked(generateMakeupGlowUp).mockReturnValue(falPromise);

    // Fire the first request but don't await it yet — it's now holding the lock.
    const firstReqPromise = POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    // Give the event loop a tick so the first request reaches the lock before the second fires.
    await new Promise((r) => setTimeout(r, 0));

    // Second concurrent request for the SAME user must be rejected immediately.
    const secondRes = await POST(makeRequest({ imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    expect(secondRes.status).toBe(429);

    // Now let the first request's FAL call resolve and complete normally.
    resolveFal({ imageUrl: "https://cdn.fal.ai/first.jpg", prompt: "p0" });
    const firstRes = await firstReqPromise;
    expect(firstRes.status).toBe(200);

    // Exactly one Report was created — the rejected second request never reached persistence.
    expect(prisma.report.create).toHaveBeenCalledTimes(1);
  });
});
