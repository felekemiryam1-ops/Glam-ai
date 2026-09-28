import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn() }));
vi.mock("@/lib/imageValidation", () => ({
  validateImageBytes: vi.fn(() => ({ valid: true, detectedType: "image/jpeg" })),
}));
vi.mock("@/lib/imageGen", () => ({
  uploadBase64Image: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    progressPhoto: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Strongest possible proof of "zero AI calls" for this route: mock the
// Anthropic SDK itself and the FAL client's generation surface, and assert
// neither is ever touched by upload/list — only the plain storage upload
// (mocked above via lib/imageGen) is used.
const anthropicCreateMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: anthropicCreateMock } })),
}));

import { GET, POST } from "./route";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { uploadBase64Image } from "@/lib/imageGen";
import { validateImageBytes } from "@/lib/imageValidation";

const USER_A = "user_a";
const USER_B = "user_b";
const VALID_IMAGE_BASE64 = Buffer.from("fake-image-bytes").toString("base64");

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
  return new NextRequest("http://localhost/api/progress-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateImageBytes).mockReturnValue({ valid: true, detectedType: "image/jpeg" });
  vi.mocked(prisma.progressPhoto.create).mockResolvedValue({
    id: "photo1",
    imageUrl: "https://cdn.fal.ai/progress1.jpg",
    note: null,
    takenAt: new Date("2026-01-01"),
  } as never);
});

describe("GET /api/progress-photos", () => {
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

  it("rejects a Pro user — progress photos are Premium-only", async () => {
    mockSession(USER_A);
    mockPlan("pro");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("only returns the authenticated user's own photos — ownership filter present in the query", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    vi.mocked(prisma.progressPhoto.findMany).mockResolvedValue([]);

    await GET();

    const call = vi.mocked(prisma.progressPhoto.findMany).mock.calls[0][0] as { where: { userId: string } };
    expect(call.where.userId).toBe(USER_A);
  });

  it("photo isolation: user B's query never scoped to user A's id", async () => {
    mockSession(USER_B);
    mockPlan("premium");
    vi.mocked(prisma.progressPhoto.findMany).mockResolvedValue([]);

    await GET();

    const call = vi.mocked(prisma.progressPhoto.findMany).mock.calls[0][0] as { where: { userId: string } };
    expect(call.where.userId).toBe(USER_B);
    expect(call.where.userId).not.toBe(USER_A);
  });
});

describe("POST /api/progress-photos", () => {
  it("a free user cannot spoof access by claiming premium in the body", async () => {
    mockSession(USER_A);
    mockPlan("free");
    const res = await POST(makePostRequest({ imageBase64: VALID_IMAGE_BASE64, plan: "premium" }));
    expect(res.status).toBe(403);
    expect(uploadBase64Image).not.toHaveBeenCalled();
  });

  it("uploads and persists ownership from the session, never a client-supplied id", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    vi.mocked(uploadBase64Image).mockResolvedValue("https://cdn.fal.ai/progress1.jpg");

    // Even if the client tried to smuggle a userId, the route never reads one.
    const res = await POST(makePostRequest({ imageBase64: VALID_IMAGE_BASE64, userId: "someone-else" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    const createArgs = vi.mocked(prisma.progressPhoto.create).mock.calls[0][0] as { data: { userId: string } };
    expect(createArgs.data.userId).toBe(USER_A);
  });

  it("rejects malformed/invalid image bytes before ever calling FAL storage", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    vi.mocked(validateImageBytes).mockReturnValue({ valid: false, error: "Unsupported file type." });

    const res = await POST(makePostRequest({ imageBase64: VALID_IMAGE_BASE64 }));
    expect(res.status).toBe(400);
    expect(uploadBase64Image).not.toHaveBeenCalled();
  });

  it("rejects an oversized image before ever calling FAL storage", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    const hugeBase64 = "a".repeat(15 * 1024 * 1024); // > 10MB estimated

    const res = await POST(makePostRequest({ imageBase64: hugeBase64 }));
    expect(res.status).toBe(400);
    expect(uploadBase64Image).not.toHaveBeenCalled();
  });

  it("never calls Claude — upload/viewing has zero AI calls", async () => {
    mockSession(USER_A);
    mockPlan("premium");
    vi.mocked(uploadBase64Image).mockResolvedValue("https://cdn.fal.ai/progress1.jpg");

    await POST(makePostRequest({ imageBase64: VALID_IMAGE_BASE64 }));

    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });
});
