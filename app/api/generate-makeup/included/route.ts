/**
 * POST /api/generate-makeup/included
 *
 * Subscriber-only Makeup Glow-Up generation — an analysis "included" with an
 * active Pro or Premium subscription, counted against that plan's monthly
 * allowance instead of the $4.99 one-time price.
 *
 * This is a SEPARATE route from /api/generate-makeup on purpose. That route's
 * entire step 5-9 sequence (retrieve Stripe Checkout Session, verify
 * payment_status, product/amount/currency, SHA-256 image-hash binding, the
 * consumed_at state machine) exists for one-time-purchase payment integrity
 * and has no equivalent concept here — there is no Checkout Session, no
 * sessionId, nothing to bind a hash to. Threading subscriber logic into that
 * state machine would risk the tested $4.99 path for no benefit; this route
 * shares only the underlying generation pipeline, not the payment plumbing.
 *
 * Authorization model (the actual point of this route):
 *   1. auth() — userId comes ONLY from the authenticated session, never the
 *      client. There is no `plan`/`tier` field read from the request body at
 *      all — nothing to spoof, because nothing client-supplied is consulted.
 *   2. canRunAnalysis(userId) from lib/entitlements.ts, UNMODIFIED — the
 *      single existing source of truth for plan + monthly usage, already
 *      correctly deriving usage from Report rows typed "pro_analysis" /
 *      "premium_analysis" (REPORT_TYPES_COUNTED_AS_USAGE). Denied → 403.
 *
 * Usage accounting: there is no separate counter to increment. "Counts
 * against the monthly limit" IS "a Report row of the right type exists" —
 * canRunAnalysis's next call re-derives usage by counting those rows. So an
 * analysis only ever counts once a Report has actually been persisted below;
 * a failed FAL call returns before any Report is created and therefore never
 * counts, with no extra bookkeeping required to guarantee that.
 *
 * Concurrency: an in-memory lock keyed by userId (mirrors the existing
 * route's sessionId-keyed lock) is held for the FULL duration of the
 * request, including the FAL call — a double-click's second request is
 * rejected with 429 before it can reach the entitlement check at all, so it
 * never races the first request for the same monthly slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRunAnalysis } from "@/lib/entitlements";
import { generateMakeupGlowUp } from "@/lib/imageGen";
import { validateImageBytes } from "@/lib/imageValidation";
import { analyzePhoto, type BeautyProfileContext } from "@/lib/ai";
import { detectFaceLandmarks, type FaceLandmarks } from "@/lib/faceLandmarks";
import { buildFaceMap } from "@/lib/faceMap";
import { prisma } from "@/lib/db";
import type { GlamPreview, GlamReport, StoredAnalysis, MakeupAttempt, FaceMapAnchor } from "@/lib/types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — same cap as the $4.99 route

// ── In-memory lock, keyed by userId (not sessionId — there is no session here) ──

const processingLocks = new Map<string, number>();

function acquireLock(userId: string): boolean {
  if (processingLocks.has(userId)) return false;
  processingLocks.set(userId, Date.now());
  return true;
}

function releaseLock(userId: string): void {
  processingLocks.delete(userId);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let userId: string | undefined;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "You must be signed in to use an included analysis." }, { status: 401 });
    }
    userId = session.user.id;

    const body = await req.json();
    // Deliberately does NOT read a `plan`/`tier` field from the body — the
    // server decides entitlement below from the DB, never from the client.
    const { imageBase64, preview } = body as { imageBase64?: string; preview?: GlamPreview };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing image data." }, { status: 400 });
    }
    if (!preview || typeof preview !== "object" || typeof preview.headline !== "string") {
      return NextResponse.json({ error: "Missing or invalid preview data." }, { status: 400 });
    }

    const estimatedBytes = Math.ceil(imageBase64.length * 0.75);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Please use an image under 10 MB." }, { status: 400 });
    }

    const imageValidation = validateImageBytes(imageBase64);
    if (!imageValidation.valid) {
      return NextResponse.json(
        { error: imageValidation.error ?? "Unsupported file type. Please upload a JPEG, PNG, or WebP image." },
        { status: 400 }
      );
    }
    const safeMime = imageValidation.detectedType ?? "image/jpeg";

    // ── Server-authoritative entitlement check ─────────────────────────────
    const { allowed, reason, entitlements } = await canRunAnalysis(userId);
    if (!allowed || (entitlements.plan !== "pro" && entitlements.plan !== "premium")) {
      return NextResponse.json(
        {
          error: reason ?? "This feature requires an active Pro or Premium subscription.",
          plan: entitlements.plan,
          remaining: entitlements.remaining,
        },
        { status: 403 }
      );
    }
    const plan = entitlements.plan; // narrowed to "pro" | "premium" by the check above

    if (!acquireLock(userId)) {
      return NextResponse.json(
        { error: "An analysis is already in progress. Please wait a moment.", canRetry: true },
        { status: 429 }
      );
    }

    try {
      return await processIncludedGeneration(userId, plan, imageBase64, safeMime, preview);
    } finally {
      releaseLock(userId);
    }
  } catch (error) {
    if (userId) releaseLock(userId);
    console.error("[generate-makeup/included] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred. Please try again.", canRetry: true }, { status: 500 });
  }
}

// ── Core processing ───────────────────────────────────────────────────────────

async function processIncludedGeneration(
  userId: string,
  plan: "pro" | "premium",
  imageBase64: string,
  safeMime: string,
  preview: GlamPreview
): Promise<NextResponse> {
  // Beauty profile personalization — best-effort, mirrors the $4.99 route.
  let profileContext: BeautyProfileContext | undefined;
  try {
    const beautyProfile = await prisma.beautyProfile.findUnique({ where: { userId } });
    if (beautyProfile) {
      profileContext = {
        goals: beautyProfile.goals ? (JSON.parse(beautyProfile.goals) as string[]) : undefined,
        aesthetic: beautyProfile.aesthetic ?? undefined,
        budget: beautyProfile.budget ?? undefined,
      };
    }
  } catch (err) {
    console.warn("[generate-makeup/included] Could not resolve profile — continuing without personalization:", err);
  }

  // Full analysis + landmarks run in parallel with the FAL call below,
  // exactly as in the $4.99 route — same functions, unchanged.
  const analysisPromise: Promise<GlamReport | null> = analyzePhoto(imageBase64, safeMime, profileContext).catch(
    (err) => {
      console.warn(
        "[generate-makeup/included] Full analysis failed (image generation unaffected):",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  );

  const landmarksPromise: Promise<FaceLandmarks | null> = detectFaceLandmarks(Buffer.from(imageBase64, "base64")).catch(
    (err) => {
      console.warn(
        "[generate-makeup/included] Face landmark detection failed:",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  );

  let generatedImageUrl: string;
  let generatedPrompt = "";

  try {
    const result = await generateMakeupGlowUp(imageBase64, safeMime, preview);
    generatedImageUrl = result.imageUrl;
    generatedPrompt = result.prompt;
  } catch (falError) {
    console.error(`[generate-makeup/included] FAL failed for user ${userId}:`, falError);
    // No Report is created below this point — this attempt never counts
    // against the monthly allowance (see this file's header).
    return NextResponse.json(
      {
        error: "Image generation hit a snag. This attempt was not counted against your monthly analyses — please try again.",
        canRetry: true,
      },
      { status: 500 }
    );
  }

  const [report, landmarks] = await Promise.all([analysisPromise, landmarksPromise]);
  const faceMap: FaceMapAnchor[] = report && landmarks ? buildFaceMap(landmarks, report.featureEnhancements) : [];
  const imageWidth = landmarks?.width ?? null;
  const imageHeight = landmarks?.height ?? null;

  const attempt: MakeupAttempt = {
    imageUrl: generatedImageUrl,
    imagePrompt: generatedPrompt,
    createdAt: new Date().toISOString(),
  };
  const reportType = plan === "premium" ? "premium_analysis" : "pro_analysis";

  // Persisting a Report row IS what makes this analysis count — no separate
  // counter exists. If analysis (report) is unavailable, no row is created
  // here, matching the $4.99 route's identical existing tradeoff (it also
  // only ever persists when `report` is non-null).
  if (report) {
    try {
      const storedAnalysis: StoredAnalysis = {
        schemaVersion: 3,
        preview,
        report,
        attempts: [attempt],
        imageUrl: attempt.imageUrl,
        imagePrompt: attempt.imagePrompt,
        faceMap,
        imageWidth,
        imageHeight,
        createdAt: new Date().toISOString(),
      };

      await prisma.report.create({
        data: {
          userId,
          type: reportType,
          stripeSessionId: null,
          data: JSON.stringify(storedAnalysis),
        },
      });
    } catch (persistError) {
      console.warn("[generate-makeup/included] Report persistence failed:", persistError);
    }
  }

  return NextResponse.json({
    success: true,
    imageUrl: generatedImageUrl,
    preview,
    report,
    faceMap,
    imageWidth,
    imageHeight,
  });
}
