/**
 * POST /api/preview
 *
 * Free Glam Preview endpoint — no payment required.
 * Returns a GlamPreview (small subset of the full analysis).
 *
 * Security:
 * - Per-IP rate limiting (PREVIEW_RATE_LIMIT calls per PREVIEW_RATE_WINDOW_MS)
 * - Server-side magic byte image validation
 * - Image size cap
 * - No secrets returned
 *
 * Cost control:
 * - Uses cheap model (claude-haiku-4-5 by default)
 * - Small max_tokens (512)
 * - Rate-limited to prevent abuse
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzePhotoPreview } from "@/lib/previewAi";
import { validateImageBytes } from "@/lib/imageValidation";
import { detectFaceLandmarks } from "@/lib/faceLandmarks";
import { buildFaceMap } from "@/lib/faceMap";
import type { FaceMapAnchor } from "@/lib/types";

// ── Configurable limits ──────────────────────────────────────────────────────

// Max image size — same as paid product
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// Rate limiting — adjust these constants without touching call sites
const PREVIEW_RATE_LIMIT = parseInt(process.env.PREVIEW_RATE_LIMIT ?? "5", 10);
const PREVIEW_RATE_WINDOW_MS = parseInt(
  process.env.PREVIEW_RATE_WINDOW_MS ?? String(60 * 60 * 1000), // 1 hour
  10
);

// ── In-memory rate limiter ───────────────────────────────────────────────────
// Simple per-IP sliding-window counter.
// For multi-instance deployments, swap this for a Redis-based solution.

interface RateEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateEntry>();

/**
 * Returns true if the IP is allowed to proceed, false if rate-limited.
 * Side-effect: increments the counter for the IP.
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > PREVIEW_RATE_WINDOW_MS) {
    // New window
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= PREVIEW_RATE_LIMIT) {
    return false; // rate limited
  }

  entry.count += 1;
  return true;
}

/** Best-effort IP extraction from Next.js request headers. */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body as {
      imageBase64?: string;
      mimeType?: string;
    };

    // ── 1. Basic input validation ──────────────────────────────────────────

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing image data." }, { status: 400 });
    }

    // ── 2. Rate limit ──────────────────────────────────────────────────────

    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: `You've used all your free previews for this hour. Please try again later.`,
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    // ── 3. Image size check ────────────────────────────────────────────────

    const estimatedBytes = Math.ceil(imageBase64.length * 0.75);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Please use an image under 10MB." },
        { status: 400 }
      );
    }

    // ── 4. Magic byte validation ───────────────────────────────────────────

    const imageValidation = validateImageBytes(imageBase64);
    if (!imageValidation.valid) {
      return NextResponse.json(
        {
          error:
            imageValidation.error ||
            "Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
        },
        { status: 400 }
      );
    }
    const safeMime = imageValidation.detectedType ?? "image/jpeg";

    // ── 5. Ignore client-supplied mimeType — use server-detected type ──────
    void mimeType; // intentionally unused

    // ── 6. Run preview analysis ────────────────────────────────────────────

    const preview = await analyzePhotoPreview(imageBase64, safeMime);

    // ── 7. Face Map — local landmark detection only, no AI/API cost. Runs
    // for every plan tier per the product requirement that Face Map is a
    // core makeup feature, not a paid-tier upsell. Best-effort: a failure
    // here (e.g. no face detected) must never fail the free preview itself.
    let faceMap: FaceMapAnchor[] = [];
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;
    if (preview.featureHighlights && preview.featureHighlights.length > 0) {
      try {
        const landmarks = await detectFaceLandmarks(Buffer.from(imageBase64, "base64"));
        faceMap = buildFaceMap(landmarks, preview.featureHighlights);
        imageWidth = landmarks.width;
        imageHeight = landmarks.height;
      } catch (err) {
        console.warn("[preview] Face landmark detection failed (preview unaffected):", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ success: true, preview, faceMap, imageWidth, imageHeight });
  } catch (error) {
    console.error("[preview] Error:", error);
    return NextResponse.json(
      {
        error: "Preview analysis failed. Please try again.",
        canRetry: true,
      },
      { status: 500 }
    );
  }
}
