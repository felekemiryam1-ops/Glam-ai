/**
 * POST /api/generate-makeup
 *
 * Paid FAL.ai image generation endpoint — Makeup Glow-Up product.
 *
 * Security model (mirrors /api/analyze exactly):
 *   1. Basic input validation
 *   2. Image size check
 *   3. Magic byte image validation (server-detected MIME, not client-claimed)
 *   4. In-memory processing lock (prevents concurrent calls per session)
 *   5. Stripe session retrieval & payment_status === "paid" check
 *   6. Product check — metadata.product === "glam_ai_makeup_glow_up"
 *   7. Amount & currency verification
 *   8. SHA-256 image hash binding (re-computes, rejects mismatches)
 *   9. consumed_at state machine:
 *        "" → fresh, generate
 *        "processing:{ts}:{n}" → in progress (or stale if > TIMEOUT)
 *        "processing_failed:{ts}:{n}" → retry allowed, counter incremented
 *        "done:{ts}" → already generated, return stored imageUrl from metadata
 *  10. Mark "processing" → call FAL → mark "done" + store image URL
 *
 * Duplicate generation prevention:
 *   - consumed_at = "done:{ts}" blocks any repeat FAL call
 *   - stored generated_image_url in Stripe metadata is returned directly on refresh
 *   - In-memory lock prevents concurrent calls to the same session
 *
 * Retry safety:
 *   - On FAL failure: sets consumed_at = "processing_failed:{ts}:{n+1}"
 *   - Payment is NOT lost — user retries the same session, no new charge
 *   - After MAX_RETRIES failures: locked out with support instructions
 *
 * User-requested regeneration ("Try Another Application"):
 *   - Body flag `regenerate: true` — only meaningful once consumed_at is
 *     already "done"; a client sending it against a fresh/in-progress
 *     session is silently reinterpreted as a normal (non-regenerating)
 *     request (see `isRegeneration` below) — the flag is never trusted
 *     blindly.
 *   - Tracked by a SEPARATE Stripe metadata counter, `regeneration_count`,
 *     capped at MAX_REGENERATIONS (2) — completely orthogonal to the
 *     failure-retry counter above. A failed regeneration attempt restores
 *     consumed_at to its prior "done:{ts}" value and never increments
 *     regeneration_count — the existing result is untouched and no slot is
 *     consumed. No new Stripe charge is ever created either way.
 *   - A successful regeneration reuses the SAME `preview` (and therefore the
 *     same makeup plan/colors) and does NOT re-run the paid Claude analysis
 *     or landmark detection — only another FAL image edit. The resulting
 *     image is appended to StoredAnalysis.attempts[] (see lib/types.ts),
 *     never replacing earlier attempts.
 *   - Max 1 (original) + MAX_REGENERATIONS (2) = 3 total looks per purchase.
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe, CURRENCY } from "@/lib/stripe";
import { generateMakeupGlowUp } from "@/lib/imageGen";
import { validateImageBytes, computeSha256Server } from "@/lib/imageValidation";
import { analyzePhoto, type BeautyProfileContext } from "@/lib/ai";
import { detectFaceLandmarks, type FaceLandmarks } from "@/lib/faceLandmarks";
import { buildFaceMap } from "@/lib/faceMap";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { GlamPreview, GlamReport, StoredAnalysis, MakeupAttempt, FaceMapAnchor } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAKEUP_GLOW_UP_AMOUNT = 499; // Must match makeup-checkout
const PROCESSING_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes — matches /api/analyze
const MAX_RETRIES = 3;

// User-requested "Try Another Application" regenerations — completely
// separate from MAX_RETRIES above. MAX_RETRIES counts FAL *failures* and
// never produces more than one successful image; this counts successful
// regenerations of an already-successful result, so a single $4.99 purchase
// can yield at most 1 (original) + MAX_REGENERATIONS = 3 total looks.
const MAX_REGENERATIONS = 2;

// ── In-memory lock ────────────────────────────────────────────────────────────

const processingLocks = new Map<string, number>(); // sessionId → lockTimestamp

function acquireLock(sessionId: string): boolean {
  if (processingLocks.has(sessionId)) return false;
  processingLocks.set(sessionId, Date.now());
  return true;
}

function releaseLock(sessionId: string): void {
  processingLocks.delete(sessionId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseConsumedAt(raw: string | undefined | null): {
  state: "fresh" | "processing" | "done";
  timestamp?: number;
  retryCount?: number;
} {
  if (!raw) return { state: "fresh" };
  if (raw.startsWith("done:")) return { state: "done" };

  if (raw.startsWith("processing:")) {
    const [, ts, retries] = raw.split(":");
    return {
      state: "processing",
      timestamp: parseInt(ts ?? "0", 10),
      retryCount: parseInt(retries ?? "0", 10),
    };
  }

  if (raw.startsWith("processing_failed:")) {
    const [, , retries] = raw.split(":");
    return { state: "fresh", retryCount: parseInt(retries ?? "0", 10) };
  }

  return { state: "fresh" };
}

/**
 * Best-effort lookup of the Report persisted for this Stripe session (see
 * step 14 below). Used to re-hydrate the richer StoredAnalysis fields
 * (report/faceMap/imageWidth/imageHeight/attempts) on a refresh or before a
 * regeneration, instead of only returning the bare imageUrl Stripe metadata
 * already had. Never throws — a miss (older purchase from before this
 * existed, or persistence failed at generation time) just means those
 * fields come back empty.
 *
 * Normalizes pre-regeneration rows (schemaVersion 2 — a flat imageUrl/
 * imagePrompt, no attempts array) into the current shape by synthesizing a
 * single-attempt history, so old and new reports both work uniformly with
 * the attempts[]-based regeneration/switcher logic without a DB migration.
 */
async function loadStoredAnalysis(sessionId: string): Promise<StoredAnalysis | null> {
  try {
    const row = await prisma.report.findUnique({ where: { stripeSessionId: sessionId } });
    if (!row) return null;
    const raw = JSON.parse(row.data) as Partial<StoredAnalysis> & {
      imageUrl: string;
      imagePrompt: string;
      createdAt: string;
    };
    if (raw.attempts && raw.attempts.length > 0) {
      return raw as StoredAnalysis;
    }
    return {
      ...raw,
      schemaVersion: 3,
      attempts: [{ imageUrl: raw.imageUrl, imagePrompt: raw.imagePrompt, createdAt: raw.createdAt }],
    } as StoredAnalysis;
  } catch (err) {
    console.warn("[generate-makeup] Could not load stored analysis for refresh:", err);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let sessionId: string | undefined;

  try {
    const body = await req.json();
    sessionId = body.sessionId as string | undefined;
    const { imageBase64, preview, regenerate } = body as {
      imageBase64?: string;
      preview?: GlamPreview;
      regenerate?: boolean;
    };
    // Only ever a UI-driven request for another look at an EXISTING result —
    // never trusted blindly. processGeneration re-derives whether this is a
    // genuine regeneration from server-side state (consumed_at === "done"),
    // so a client sending regenerate:true against a fresh/in-progress
    // session cannot skip analysis or otherwise change behavior.
    const wantsRegeneration = regenerate === true;

    // ── 1. Basic input validation ──────────────────────────────────────────

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing session ID." }, { status: 400 });
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing image data." }, { status: 400 });
    }

    if (
      !preview ||
      typeof preview !== "object" ||
      typeof preview.headline !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid preview data." },
        { status: 400 }
      );
    }

    // ── 2. Image size check ────────────────────────────────────────────────

    const estimatedBytes = Math.ceil(imageBase64.length * 0.75);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Please use an image under 10 MB." },
        { status: 400 }
      );
    }

    // ── 3. Magic byte validation ───────────────────────────────────────────

    const imageValidation = validateImageBytes(imageBase64);
    if (!imageValidation.valid) {
      return NextResponse.json(
        {
          error:
            imageValidation.error ??
            "Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
        },
        { status: 400 }
      );
    }
    const safeMime = imageValidation.detectedType ?? "image/jpeg";

    // ── 4. In-memory lock ──────────────────────────────────────────────────

    if (!acquireLock(sessionId)) {
      return NextResponse.json(
        {
          error:
            "Your glow-up is already being generated. Please wait a moment.",
          canRetry: true,
        },
        { status: 429 }
      );
    }

    try {
      return await processGeneration(sessionId, imageBase64, safeMime, preview, wantsRegeneration);
    } finally {
      releaseLock(sessionId);
    }
  } catch (error) {
    if (sessionId) releaseLock(sessionId);
    console.error("[generate-makeup] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "An unexpected error occurred. Please try again.",
        canRetry: true,
      },
      { status: 500 }
    );
  }
}

// ── Core processing ───────────────────────────────────────────────────────────

async function processGeneration(
  sessionId: string,
  imageBase64: string,
  safeMime: string,
  preview: GlamPreview,
  wantsRegeneration: boolean
): Promise<NextResponse> {
  // ── 5. Retrieve & verify Stripe session ─────────────────────────────────

  let stripeSession: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json(
      { error: "Payment session not found. Please contact support." },
      { status: 400 }
    );
  }

  // ── 6. Payment status ────────────────────────────────────────────────────

  if (stripeSession.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment has not been completed. Please complete checkout first." },
      { status: 402 }
    );
  }

  // ── 7. Product verification ──────────────────────────────────────────────

  if (stripeSession.metadata?.product !== "glam_ai_makeup_glow_up") {
    return NextResponse.json(
      { error: "Invalid session type." },
      { status: 400 }
    );
  }

  // ── 8. Amount & currency verification ───────────────────────────────────

  if (stripeSession.amount_total !== MAKEUP_GLOW_UP_AMOUNT) {
    console.error(
      `[generate-makeup] Amount mismatch: expected ${MAKEUP_GLOW_UP_AMOUNT}, got ${stripeSession.amount_total} for ${sessionId}`
    );
    return NextResponse.json(
      { error: "Payment amount mismatch. Please contact support." },
      { status: 400 }
    );
  }

  if (stripeSession.currency !== CURRENCY) {
    return NextResponse.json(
      { error: "Payment currency mismatch. Please contact support." },
      { status: 400 }
    );
  }

  // ── 9. SHA-256 image hash binding ───────────────────────────────────────

  const storedHash = stripeSession.metadata?.imageHash;
  if (!storedHash) {
    return NextResponse.json(
      {
        error:
          "This session was created without image verification. Please start over.",
      },
      { status: 400 }
    );
  }

  const computedHash = computeSha256Server(imageBase64);
  if (computedHash !== storedHash) {
    console.warn(
      `[generate-makeup] Hash mismatch for session ${sessionId}. ` +
        `Stored: ${storedHash.slice(0, 16)}… Computed: ${computedHash.slice(0, 16)}…`
    );
    return NextResponse.json(
      {
        error:
          "The submitted photo does not match the one used at checkout. Please start over with the same photo.",
      },
      { status: 400 }
    );
  }

  // ── 10. consumed_at state machine ────────────────────────────────────────

  const consumedAtRaw = stripeSession.metadata?.consumed_at;
  const consumed = parseConsumedAt(consumedAtRaw);
  const regenerationCount = parseInt(stripeSession.metadata?.regeneration_count ?? "0", 10);

  // A "regenerate" request only ever means something relative to an
  // ALREADY-successful result — this is the single point where the
  // client-supplied flag is authoritatively reinterpreted against real
  // server-side state, so it can never be used to skip analysis or
  // otherwise change behavior on a fresh/in-progress session.
  const isRegeneration = wantsRegeneration && consumed.state === "done";

  // Already successfully generated — return the stored result, unless this
  // is a genuine "Try Another Application" request.
  if (consumed.state === "done" && !isRegeneration) {
    const storedImageUrl = stripeSession.metadata?.generated_image_url;
    if (storedImageUrl && storedImageUrl.length > 10) {
      const stored = await loadStoredAnalysis(sessionId);
      return NextResponse.json({
        success: true,
        imageUrl: storedImageUrl,
        preview,
        alreadyGenerated: true,
        report: stored?.report ?? null,
        faceMap: stored?.faceMap ?? [],
        imageWidth: stored?.imageWidth ?? null,
        imageHeight: stored?.imageHeight ?? null,
        attempts: stored?.attempts ?? [{ imageUrl: storedImageUrl, imagePrompt: "", createdAt: new Date().toISOString() }],
        regenerationsRemaining: Math.max(0, MAX_REGENERATIONS - regenerationCount),
      });
    }
    // Edge case: done but URL missing (shouldn't happen, but handle gracefully)
    return NextResponse.json(
      {
        error:
          "Your Makeup Glow-Up has already been generated but the image URL is unavailable. Please contact support.",
        alreadyConsumed: true,
      },
      { status: 409 }
    );
  }

  // Server-side enforcement of the regeneration cap — the client button
  // hides itself at this point too, but that's UX only; this is the real
  // gate. No FAL call is made and nothing is charged or consumed.
  if (isRegeneration && regenerationCount >= MAX_REGENERATIONS) {
    return NextResponse.json(
      {
        error: `You've used all ${MAX_REGENERATIONS} regenerations for this Glow-Up.`,
        regenerationLimitReached: true,
      },
      { status: 409 }
    );
  }

  // Currently processing — check for stale lock
  if (consumed.state === "processing") {
    const elapsed = Date.now() - (consumed.timestamp ?? 0);
    if (elapsed < PROCESSING_TIMEOUT_MS) {
      return NextResponse.json(
        {
          error: "Your glow-up is being generated. Please wait a moment, then refresh.",
          canRetry: true,
        },
        { status: 429 }
      );
    }
    console.warn(
      `[generate-makeup] Stale lock for session ${sessionId} (${Math.round(elapsed / 1000)}s old). Allowing retry.`
    );
  }

  // Enforce retry cap
  const retryCount = consumed.retryCount ?? 0;
  if (retryCount >= MAX_RETRIES) {
    return NextResponse.json(
      {
        error: `Image generation has failed ${MAX_RETRIES} times for this session. Please contact support — your payment is valid.`,
        maxRetriesReached: true,
      },
      { status: 409 }
    );
  }

  // ── 11. Mark as "processing" ─────────────────────────────────────────────

  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...stripeSession.metadata,
        consumed_at: `processing:${Date.now()}:${retryCount}`,
      },
    });
  } catch (err) {
    console.warn("[generate-makeup] Failed to set processing state:", err);
  }

  // ── 11.5 Resolve current user (optional, best-effort) ────────────────────
  // Purely additive bookkeeping for Report attribution + BeautyProfile
  // personalization — payment verification above is entirely driven by the
  // Stripe session and does not depend on this. A failed/missing auth
  // lookup must never block the paid generation, so it's isolated here.

  let userId: string | null = null;
  let profileContext: BeautyProfileContext | undefined;
  try {
    const session = await auth();
    userId = session?.user?.id ?? null;
    if (userId) {
      const beautyProfile = await prisma.beautyProfile.findUnique({ where: { userId } });
      if (beautyProfile) {
        profileContext = {
          goals: beautyProfile.goals ? (JSON.parse(beautyProfile.goals) as string[]) : undefined,
          aesthetic: beautyProfile.aesthetic ?? undefined,
          budget: beautyProfile.budget ?? undefined,
        };
      }
    }
  } catch (err) {
    console.warn("[generate-makeup] Could not resolve user/profile — continuing anonymously:", err);
  }

  // ── 12. Call FAL.ai (image) + Claude (full analysis) in parallel ─────────
  // The full analysis (for Report persistence, below) is new instrumentation
  // and must never affect the core paid deliverable — its own promise is
  // caught independently so a Claude failure only means "no Report row this
  // time," never a failed generation response for a user who already paid.
  //
  // On a regeneration, the analysis/landmarks are NOT re-run: the whole
  // point of "Try Another Application" is another rendering of the SAME
  // recommendations, not a fresh AI read of the photo (which could drift on
  // its own and would misrepresent this as a new analysis). The existing
  // report/faceMap are reused from the original attempt instead — cheaper
  // (no extra paid Claude call) and, more importantly, correct.
  const existingStored = isRegeneration ? await loadStoredAnalysis(sessionId) : null;

  const analysisPromise: Promise<GlamReport | null> = isRegeneration
    ? Promise.resolve(existingStored?.report ?? null)
    : analyzePhoto(imageBase64, safeMime, profileContext).catch((err) => {
        console.warn(
          "[generate-makeup] Full analysis failed (image generation unaffected):",
          err instanceof Error ? err.message : err
        );
        return null;
      });

  // Face landmark detection powers the Face Map overlay (real pixel
  // coordinates on the ORIGINAL photo, rendered client-side — never sent to
  // FAL). Same isolation as the analysis above: a failure here (e.g. no
  // face clearly detected) only means no Face Map for this result, never a
  // failed generation for a user who already paid. Skipped on a
  // regeneration for the same reason as analysis above — faceMap is reused
  // from existingStored instead (see below).
  const landmarksPromise: Promise<FaceLandmarks | null> = isRegeneration
    ? Promise.resolve(null)
    : detectFaceLandmarks(Buffer.from(imageBase64, "base64")).catch((err) => {
        console.warn(
          "[generate-makeup] Face landmark detection failed (Face Map unavailable for this result):",
          err instanceof Error ? err.message : err
        );
        return null;
      });

  let generatedImageUrl: string;
  let generatedPrompt = "";

  try {
    const result = await generateMakeupGlowUp(imageBase64, safeMime, preview);
    generatedImageUrl = result.imageUrl;
    generatedPrompt = result.prompt;
  } catch (falError) {
    const msg = falError instanceof Error ? falError.message : "Unknown FAL error";
    console.error(`[generate-makeup] FAL failed for session ${sessionId}:`, msg);

    try {
      if (isRegeneration) {
        // A failed REGENERATION must not disturb the already-successful
        // result sitting behind it: restore consumed_at to exactly what it
        // was before this attempt (the "done:..." value captured at the top
        // of this request) rather than the failure-retry state below. That
        // keeps regeneration_count untouched (no slot consumed — this
        // attempt never succeeded) and keeps the existing attempts fully
        // intact and returnable on the next request.
        await stripe.checkout.sessions.update(sessionId, {
          metadata: { ...stripeSession.metadata, consumed_at: consumedAtRaw ?? `done:${Date.now()}` },
        });
      } else {
        // Original-generation failure path — unchanged: reset so the user
        // can retry, increment the (separate) failure-retry counter.
        await stripe.checkout.sessions.update(sessionId, {
          metadata: {
            ...stripeSession.metadata,
            consumed_at: `processing_failed:${Date.now()}:${retryCount + 1}`,
          },
        });
      }
    } catch {
      // Best-effort; stale lock will timeout if this also fails
    }

    return NextResponse.json(
      {
        error: isRegeneration
          ? "Generating another look hit a snag. Your current result is unchanged — please try again."
          : "Image generation hit a snag. Your payment is safe — please try again.",
        canRetry: true,
      },
      { status: 500 }
    );
  }

  // ── 13. Mark as "done" + store image URL ────────────────────────────────
  // Store the URL in metadata so refresh calls can return it without
  // triggering a new FAL generation. regeneration_count only increments
  // here — after a genuine regeneration has actually SUCCEEDED — never on
  // the original generation and never on a failed attempt (the catch block
  // above never touches this field).

  const newRegenerationCount = isRegeneration ? regenerationCount + 1 : regenerationCount;

  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...stripeSession.metadata,
        consumed_at: `done:${Date.now()}`,
        generated_image_url: generatedImageUrl,
        regeneration_count: String(newRegenerationCount),
      },
    });
  } catch (err) {
    // Non-fatal: image was generated. The user might regenerate on refresh
    // (one wasted FAL call) but their payment is safe.
    console.warn("[generate-makeup] Failed to mark session as done:", err);
  }

  // ── 14. Persist Report + BeautyProfile (best-effort) ─────────────────────
  // Never affects the response: the paid image above is already guaranteed
  // to the user regardless of what happens here. If the full analysis (§12)
  // failed, there's no GlamReport to store — skip persistence for this
  // request rather than storing a StoredAnalysis with a fabricated report.
  //
  // On a regeneration, report/landmarks were never re-computed (§12) — they
  // resolve straight from existingStored, so faceMap/imageWidth/imageHeight
  // below correctly come from the ORIGINAL attempt too, never recomputed.

  const [report, landmarks] = await Promise.all([analysisPromise, landmarksPromise]);
  const faceMap: FaceMapAnchor[] = isRegeneration
    ? existingStored?.faceMap ?? []
    : report && landmarks
      ? buildFaceMap(landmarks, report.featureEnhancements)
      : [];
  const imageWidth = isRegeneration ? existingStored?.imageWidth ?? null : landmarks?.width ?? null;
  const imageHeight = isRegeneration ? existingStored?.imageHeight ?? null : landmarks?.height ?? null;

  const newAttempt: MakeupAttempt = {
    imageUrl: generatedImageUrl,
    imagePrompt: generatedPrompt,
    createdAt: new Date().toISOString(),
  };
  const attempts: MakeupAttempt[] =
    isRegeneration && existingStored ? [...existingStored.attempts, newAttempt] : [newAttempt];

  if (report) {
    try {
      if (isRegeneration && existingStored) {
        const storedAnalysis: StoredAnalysis = {
          ...existingStored,
          schemaVersion: 3,
          attempts,
          imageUrl: newAttempt.imageUrl,
          imagePrompt: newAttempt.imagePrompt,
        };
        await prisma.report.update({
          where: { stripeSessionId: sessionId },
          data: { data: JSON.stringify(storedAnalysis) },
        });
        // BeautyProfile reflects the underlying analysis, which is unchanged
        // on a regeneration — nothing new to upsert.
        return NextResponse.json({
          success: true,
          imageUrl: generatedImageUrl,
          preview,
          report,
          faceMap,
          imageWidth,
          imageHeight,
          attempts,
          regenerationsRemaining: Math.max(0, MAX_REGENERATIONS - newRegenerationCount),
        });
      }

      const storedAnalysis: StoredAnalysis = {
        schemaVersion: 3,
        preview,
        report,
        attempts,
        imageUrl: newAttempt.imageUrl,
        imagePrompt: newAttempt.imagePrompt,
        faceMap,
        imageWidth,
        imageHeight,
        createdAt: new Date().toISOString(),
      };

      await prisma.report.create({
        data: {
          userId,
          type: "glow_up",
          stripeSessionId: sessionId,
          data: JSON.stringify(storedAnalysis),
        },
      });

      // Only real users can have a BeautyProfile row; anonymous $4.99
      // purchases still get a Report (userId: null) but nothing to update here.
      if (userId) {
        const profileFields = {
          colorProfile: JSON.stringify({
            palette: preview.palette,
            colorDirection: preview.colorDirection,
            clothing: report.colors.clothing,
            makeup: report.colors.makeup,
            accessories: report.colors.accessories,
          }),
          makeupProfile: JSON.stringify({
            style: preview.makeupStyle,
            direction: preview.makeupDirection,
            aestheticIdentity: report.aestheticIdentity,
            base: report.makeup.base,
            blush: report.makeup.blush,
            bronzer: report.makeup.bronzer,
            highlighter: report.makeup.highlighter,
            eyes: report.makeup.eyes,
            lips: report.makeup.lips,
          }),
          hairProfile: JSON.stringify({
            styles: report.hair.styles,
            cuts: report.hair.cuts,
            styling: report.hair.styling,
            color: report.hair.color,
          }),
        };

        // update/create only ever touch colorProfile/makeupProfile/hairProfile
        // — goals/aesthetic/budget (set by onboarding) are never overwritten.
        await prisma.beautyProfile.upsert({
          where: { userId },
          update: profileFields,
          create: { userId, ...profileFields },
        });
      }
    } catch (persistError) {
      // Report/profile persistence is a bonus on top of the paid image, not
      // a requirement of it — log and move on, the response below is
      // unaffected either way.
      console.warn("[generate-makeup] Report/profile persistence failed:", persistError);
    }
  }

  // Reached when report is null (analysis unavailable) or when persistence
  // above threw before its own early return — the generated image is still
  // valid and returned either way; attempts/regenerationsRemaining are
  // computed independently of persistence succeeding.
  return NextResponse.json({
    success: true,
    imageUrl: generatedImageUrl,
    preview,
    report,
    faceMap,
    imageWidth,
    imageHeight,
    attempts,
    regenerationsRemaining: Math.max(0, MAX_REGENERATIONS - newRegenerationCount),
  });
}
