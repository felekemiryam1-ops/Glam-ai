import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { GlamReport, GlamPreview, StoredAnalysis } from "@/lib/types";

// ── Mocks ────────────────────────────────────────────────────────────────────
// Every external dependency of the route (Stripe, FAL, Claude, MediaPipe,
// Auth.js, Prisma) is mocked — no paid calls, no real network/DB access.
// This mirrors exactly what the route imports from each module.

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: vi.fn(),
        update: vi.fn(),
        // Deliberately no `create` — if the route ever tried to open a new
        // checkout session during regeneration, this throws and fails the
        // test loudly, proving "no additional Stripe charge" rather than
        // just asserting an absence.
        create: vi.fn(() => {
          throw new Error("must not create a new checkout session during regeneration");
        }),
      },
    },
  },
  CURRENCY: "usd",
}));

vi.mock("@/lib/imageGen", () => ({
  generateMakeupGlowUp: vi.fn(),
}));

vi.mock("@/lib/imageValidation", () => ({
  validateImageBytes: vi.fn(() => ({ valid: true, detectedType: "image/jpeg" })),
  computeSha256Server: vi.fn(() => "test-hash"),
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

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    report: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    beautyProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { stripe } from "@/lib/stripe";
import { generateMakeupGlowUp } from "@/lib/imageGen";
import { analyzePhoto } from "@/lib/ai";
import { detectFaceLandmarks } from "@/lib/faceLandmarks";
import { prisma } from "@/lib/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID = "cs_test_123";
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

function makeStripeSession(metadata: Record<string, string | undefined>) {
  return {
    id: SESSION_ID,
    payment_status: "paid",
    amount_total: 499,
    currency: "usd",
    metadata: {
      product: "glam_ai_makeup_glow_up",
      imageHash: "test-hash",
      ...metadata,
    },
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/generate-makeup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function existingStoredAnalysis(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
  return {
    schemaVersion: 3,
    preview: PREVIEW,
    report: MOCK_REPORT,
    attempts: [{ imageUrl: "https://cdn.fal.ai/original.jpg", imagePrompt: "original prompt", createdAt: "2024-01-01T00:00:00.000Z" }],
    imageUrl: "https://cdn.fal.ai/original.jpg",
    imagePrompt: "original prompt",
    faceMap: [],
    imageWidth: 100,
    imageHeight: 100,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the throwing `create` stub after clearAllMocks wipes it.
  vi.mocked(stripe.checkout.sessions.create).mockImplementation(() => {
    throw new Error("must not create a new checkout session during regeneration");
  });
  vi.mocked(analyzePhoto).mockResolvedValue(MOCK_REPORT);
  vi.mocked(detectFaceLandmarks).mockResolvedValue(MOCK_LANDMARKS);
  vi.mocked(prisma.report.create).mockResolvedValue({} as never);
  vi.mocked(prisma.report.update).mockResolvedValue({} as never);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/generate-makeup — regeneration", () => {
  it("1. initial generation does not regenerate (analysis runs, regeneration_count stays 0)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(makeStripeSession({}) as never);
    vi.mocked(stripe.checkout.sessions.update).mockResolvedValue({} as never);
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/first.jpg", prompt: "p0" });

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.attempts).toHaveLength(1);
    expect(data.attempts[0].imageUrl).toBe("https://cdn.fal.ai/first.jpg");
    expect(data.regenerationsRemaining).toBe(2);
    expect(analyzePhoto).toHaveBeenCalledTimes(1); // full analysis DOES run on the original
    expect(prisma.report.create).toHaveBeenCalledTimes(1);
    expect(prisma.report.update).not.toHaveBeenCalled();

    const doneCall = vi.mocked(stripe.checkout.sessions.update).mock.calls.find(
      (c) => (c[1] as { metadata: Record<string, string> }).metadata.consumed_at?.startsWith("done:")
    );
    expect(doneCall?.[1]).toMatchObject({ metadata: expect.objectContaining({ regeneration_count: "0" }) });
  });

  it("2. normal failure retry does not consume regeneration_count", async () => {
    // Simulates the client's plain handleRetry() after a prior FAL failure —
    // consumed_at is "processing_failed:...", regenerate is NOT sent.
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "processing_failed:1000:1" }) as never
    );
    vi.mocked(stripe.checkout.sessions.update).mockResolvedValue({} as never);
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/retry-success.jpg", prompt: "p0" });

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(analyzePhoto).toHaveBeenCalledTimes(1); // treated as an original generation, not a regeneration

    const doneCall = vi.mocked(stripe.checkout.sessions.update).mock.calls.find(
      (c) => (c[1] as { metadata: Record<string, string> }).metadata.consumed_at?.startsWith("done:")
    );
    expect(doneCall?.[1]).toMatchObject({ metadata: expect.objectContaining({ regeneration_count: "0" }) });
  });

  it("3. regenerate:true creates a new attempt, reuses the same analysis, and appends (not replaces)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/original.jpg" }) as never
    );
    vi.mocked(stripe.checkout.sessions.update).mockResolvedValue({} as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ data: JSON.stringify(existingStoredAnalysis()) } as never);
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/regen1.jpg", prompt: "p1" });

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW, regenerate: true }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.attempts).toHaveLength(2);
    expect(data.attempts[1].imageUrl).toBe("https://cdn.fal.ai/regen1.jpg");
    expect(data.regenerationsRemaining).toBe(1);
    expect(analyzePhoto).not.toHaveBeenCalled(); // reused, not re-run — no extra paid Claude call
    expect(detectFaceLandmarks).not.toHaveBeenCalled();
    expect(prisma.report.update).toHaveBeenCalledTimes(1);
    expect(prisma.report.create).not.toHaveBeenCalled();

    const doneCall = vi.mocked(stripe.checkout.sessions.update).mock.calls.find(
      (c) => (c[1] as { metadata: Record<string, string> }).metadata.consumed_at?.startsWith("done:")
    );
    expect(doneCall?.[1]).toMatchObject({ metadata: expect.objectContaining({ regeneration_count: "1" }) });
  });

  it("4. failed regeneration does not consume a slot and restores the prior done state", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/original.jpg" }) as never
    );
    vi.mocked(stripe.checkout.sessions.update).mockResolvedValue({} as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ data: JSON.stringify(existingStoredAnalysis()) } as never);
    vi.mocked(generateMakeupGlowUp).mockRejectedValue(new Error("FAL exploded"));

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW, regenerate: true }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.canRetry).toBe(true);
    expect(prisma.report.update).not.toHaveBeenCalled();
    expect(prisma.report.create).not.toHaveBeenCalled();

    // The failure-path metadata update must restore consumed_at to "done:1000"
    // (untouched result) and must NOT introduce/bump regeneration_count.
    // (calls[0] is the earlier "mark processing" transition — the failure
    // handler's own update is the LAST call made in this request.)
    const calls = vi.mocked(stripe.checkout.sessions.update).mock.calls;
    const failureCall = calls[calls.length - 1];
    const metadata = (failureCall[1] as { metadata: Record<string, string | undefined> }).metadata;
    expect(metadata.consumed_at).toBe("done:1000");
    expect(metadata.regeneration_count).toBeUndefined();
  });

  it("5. a third total attempt is blocked server-side — no FAL call, no charge", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/latest.jpg", regeneration_count: "2" }) as never
    );

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW, regenerate: true }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.regenerationLimitReached).toBe(true);
    expect(generateMakeupGlowUp).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("6 & 7. previous attempts remain accessible and the original attempt stays intact after a regeneration", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/original.jpg" }) as never
    );
    vi.mocked(stripe.checkout.sessions.update).mockResolvedValue({} as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ data: JSON.stringify(existingStoredAnalysis()) } as never);
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/regen1.jpg", prompt: "p1" });

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW, regenerate: true }));
    const data = await res.json();

    expect(data.attempts[0].imageUrl).toBe("https://cdn.fal.ai/original.jpg"); // original intact, unmodified
    expect(data.attempts[0].imagePrompt).toBe("original prompt");
    expect(data.attempts[1].imageUrl).toBe("https://cdn.fal.ai/regen1.jpg"); // new one appended, not replacing
  });

  it("8. no additional Stripe checkout session is ever created during regeneration", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/original.jpg" }) as never
    );
    vi.mocked(stripe.checkout.sessions.update).mockResolvedValue({} as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ data: JSON.stringify(existingStoredAnalysis()) } as never);
    vi.mocked(generateMakeupGlowUp).mockResolvedValue({ imageUrl: "https://cdn.fal.ai/regen1.jpg", prompt: "p1" });

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW, regenerate: true }));
    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    // Same sessionId used throughout — every call keyed off the one paid session.
    for (const call of vi.mocked(stripe.checkout.sessions.update).mock.calls) {
      expect(call[0]).toBe(SESSION_ID);
    }
  });

  it("9. existing (pre-regeneration, schemaVersion 2) reports continue loading correctly", async () => {
    // An old row: flat imageUrl/imagePrompt, no attempts[] at all.
    const oldRow = {
      schemaVersion: 2,
      preview: PREVIEW,
      report: MOCK_REPORT,
      imageUrl: "https://cdn.fal.ai/legacy.jpg",
      imagePrompt: "legacy prompt",
      faceMap: [],
      imageWidth: 100,
      imageHeight: 100,
      createdAt: "2023-06-01T00:00:00.000Z",
    };
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/legacy.jpg" }) as never
    );
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ data: JSON.stringify(oldRow) } as never);

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.alreadyGenerated).toBe(true);
    expect(data.imageUrl).toBe("https://cdn.fal.ai/legacy.jpg");
    expect(data.attempts).toHaveLength(1);
    expect(data.attempts[0].imageUrl).toBe("https://cdn.fal.ai/legacy.jpg");
    expect(generateMakeupGlowUp).not.toHaveBeenCalled();
  });

  it("10. existing $4.99 Glow-Up refresh behavior remains intact (no regenerate flag, already done)", async () => {
    vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue(
      makeStripeSession({ consumed_at: "done:1000", generated_image_url: "https://cdn.fal.ai/original.jpg" }) as never
    );
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ data: JSON.stringify(existingStoredAnalysis()) } as never);

    const res = await POST(makeRequest({ sessionId: SESSION_ID, imageBase64: IMAGE_BASE64, preview: PREVIEW }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.alreadyGenerated).toBe(true);
    expect(data.imageUrl).toBe("https://cdn.fal.ai/original.jpg");
    expect(data.report).toEqual(MOCK_REPORT);
    // No new FAL call, no new analysis, no new charge — a pure cache hit,
    // exactly as before this feature existed.
    expect(generateMakeupGlowUp).not.toHaveBeenCalled();
    expect(analyzePhoto).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.update).not.toHaveBeenCalled();
  });
});
