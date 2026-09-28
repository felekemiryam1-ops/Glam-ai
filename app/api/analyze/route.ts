import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_AMOUNT, CURRENCY } from "@/lib/stripe";
import { analyzePhoto, type BeautyProfileContext } from "@/lib/ai";
import { validateImageBytes, computeSha256Server } from "@/lib/imageValidation";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
// How long a "processing" lock is considered fresh before it's treated as stale
// (e.g. server crashed mid-analysis). After this window, a retry is allowed.
const PROCESSING_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes
// Maximum number of AI retry attempts allowed per paid session
const MAX_RETRIES = 3;

// ──────────────────────────────────────────────────────────────────────────────
// In-memory processing lock
//
// Prevents two concurrent requests for the same session_id from both
// proceeding to AI analysis within the same server instance.
//
// Limitation: this does NOT prevent races across multiple server instances
// (e.g. a load-balanced deployment). For that you would need a shared
// distributed lock (Redis, etc.). For a single-instance V1 deployment,
// this combined with the Stripe metadata check is sufficient.
// ──────────────────────────────────────────────────────────────────────────────
const processingLocks = new Map<string, number>(); // sessionId → lock timestamp

function acquireLock(sessionId: string): boolean {
  if (processingLocks.has(sessionId)) return false;
  processingLocks.set(sessionId, Date.now());
  return true;
}

function releaseLock(sessionId: string): void {
  processingLocks.delete(sessionId);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function parseConsumedAt(value: string | undefined | null): {
  state: "fresh" | "processing" | "done";
  timestamp?: number;
  retryCount?: number;
} {
  if (!value) return { state: "fresh" };

  if (value.startsWith("done:")) return { state: "done" };

  if (value.startsWith("processing:")) {
    const parts = value.split(":");
    const ts = parseInt(parts[1] ?? "0", 10);
    const retries = parseInt(parts[2] ?? "0", 10);
    return { state: "processing", timestamp: ts, retryCount: retries };
  }

  // AI previously failed — state is "fresh" (retry allowed) but carry the
  // accumulated retry count forward so MAX_RETRIES is enforced correctly.
  // Format: "processing_failed:{timestamp}:{retryCount}"
  if (value.startsWith("processing_failed:")) {
    const parts = value.split(":");
    const retries = parseInt(parts[2] ?? "0", 10);
    return { state: "fresh", retryCount: retries };
  }

  return { state: "fresh" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let sessionId: string | undefined;

  try {
    const body = await req.json();
    sessionId = body.sessionId;
    // mimeType from client is intentionally ignored — server detects type via magic bytes
    const { imageBase64 } = body as {
      imageBase64?: string;
      mimeType?: string;
    };

    // ── 1. Basic input validation ────────────────────────────────────────────

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing session ID." }, { status: 400 });
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing image data." }, { status: 400 });
    }

    // ── 2. Image size check (before any decoding) ────────────────────────────

    const estimatedBytes = Math.ceil(imageBase64.length * 0.75);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Please use an image under 10MB." },
        { status: 400 }
      );
    }

    // ── 3. Server-side magic byte validation ─────────────────────────────────
    // Validates actual file bytes, NOT the MIME type the browser claims.

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
    // Use the detected MIME type from magic bytes, not what the browser sent
    const safeMime = imageValidation.detectedType ?? "image/jpeg";

    // ── 4. In-memory processing lock ─────────────────────────────────────────

    if (!acquireLock(sessionId)) {
      return NextResponse.json(
        {
          error:
            "Your report is already being generated. Please wait a moment and try again.",
          canRetry: true,
        },
        { status: 429 }
      );
    }

    // All further code must release the lock before returning.
    try {
      return await processAnalysis(sessionId, imageBase64, safeMime);
    } finally {
      releaseLock(sessionId);
    }
  } catch (error) {
    // If lock was acquired but something threw before try/finally, clean up
    if (sessionId) releaseLock(sessionId);

    console.error("[analyze] Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again.", canRetry: true },
      { status: 500 }
    );
  }
}

async function processAnalysis(
  sessionId: string,
  imageBase64: string,
  safeMime: string
): Promise<NextResponse> {
  // ── 5. Retrieve and verify Stripe session ────────────────────────────────

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

  if (stripeSession.metadata?.product !== "glam_ai_glow_up_report") {
    return NextResponse.json(
      { error: "Invalid session type." },
      { status: 400 }
    );
  }

  // ── 8. Amount & currency verification ───────────────────────────────────
  // Never trust that a Stripe session was created with the correct price.
  // Verify the actual amount charged matches what we expect.

  if (stripeSession.amount_total !== PRICE_AMOUNT) {
    console.error(
      `[analyze] Amount mismatch: expected ${PRICE_AMOUNT}, got ${stripeSession.amount_total} for session ${sessionId}`
    );
    return NextResponse.json(
      { error: "Payment amount mismatch. Please contact support." },
      { status: 400 }
    );
  }

  if (stripeSession.currency !== CURRENCY) {
    console.error(
      `[analyze] Currency mismatch: expected ${CURRENCY}, got ${stripeSession.currency} for session ${sessionId}`
    );
    return NextResponse.json(
      { error: "Payment currency mismatch. Please contact support." },
      { status: 400 }
    );
  }

  // ── 9. Image hash verification ───────────────────────────────────────────
  // The SHA-256 of the image base64 was stored in Stripe metadata at checkout.
  // We re-compute it now and compare. This cryptographically ties the image
  // to the payment — a different image will have a different hash and be rejected.

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
      `[analyze] Hash mismatch for session ${sessionId}. Stored: ${storedHash.slice(0, 16)}… Computed: ${computedHash.slice(0, 16)}…`
    );
    return NextResponse.json(
      {
        error:
          "The submitted photo does not match the one used at checkout. Please start over with the same photo.",
      },
      { status: 400 }
    );
  }

  // ── 10. Consumption state check ──────────────────────────────────────────

  const consumedAtRaw = stripeSession.metadata?.consumed_at;
  const consumed = parseConsumedAt(consumedAtRaw);

  // Already successfully generated
  if (consumed.state === "done") {
    trackEvent("report_already_consumed", { sessionId });
    return NextResponse.json(
      {
        error:
          "This report has already been generated. If you need help accessing it, please contact support.",
        alreadyConsumed: true,
      },
      { status: 409 }
    );
  }

  // Currently processing in another request — check if it's stale
  if (consumed.state === "processing") {
    const elapsed = Date.now() - (consumed.timestamp ?? 0);
    if (elapsed < PROCESSING_TIMEOUT_MS) {
      return NextResponse.json(
        {
          error:
            "Your report is already being generated. Please wait a moment, then try again.",
          canRetry: true,
        },
        { status: 429 }
      );
    }
    // Stale lock — previous attempt likely crashed. Allow retry.
    console.warn(
      `[analyze] Stale processing lock for session ${sessionId} (${Math.round(elapsed / 1000)}s old). Allowing retry.`
    );
  }

  // Enforce retry cap
  const retryCount = consumed.retryCount ?? 0;
  if (retryCount >= MAX_RETRIES) {
    return NextResponse.json(
      {
        error:
          `Analysis has failed ${MAX_RETRIES} times for this session. Please contact support for a refund or to try again.`,
        maxRetriesReached: true,
      },
      { status: 409 }
    );
  }

  // ── 11. Mark as "processing" in Stripe metadata ──────────────────────────
  // This is a best-effort optimistic lock across server restarts and instances.
  // It is NOT atomic with the check above — two simultaneous requests from
  // different server instances could both reach this point. For a single-instance
  // deployment, the in-memory lock above prevents this scenario.

  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...stripeSession.metadata,
        consumed_at: `processing:${Date.now()}:${retryCount}`,
      },
    });
  } catch (updateErr) {
    // Non-fatal: continue with analysis even if metadata update fails.
    // Worst case: a crash here leads to a stale "processing" state that
    // clears itself after PROCESSING_TIMEOUT_MS.
    console.warn("[analyze] Failed to set processing state in Stripe:", updateErr);
  }

  // ── 12. Load beauty profile if user is authenticated ────────────────────
  // Non-fatal: if anything fails, proceed with un-personalized analysis.

  let profileContext: BeautyProfileContext | undefined;
  try {
    const session = await auth();
    if (session?.user?.id) {
      const profile = await prisma.beautyProfile.findUnique({
        where: { userId: session.user.id },
        select: { goals: true, aesthetic: true, budget: true },
      });
      if (profile) {
        profileContext = {
          goals: profile.goals ? (JSON.parse(profile.goals) as string[]) : undefined,
          aesthetic: profile.aesthetic ?? undefined,
          budget: profile.budget ?? undefined,
        };
      }
    }
  } catch (profileErr) {
    // Never block a paid analysis over a profile fetch failure
    console.warn("[analyze] Failed to load beauty profile:", profileErr);
  }

  // ── 13. Run AI analysis ──────────────────────────────────────────────────

  trackEvent("analysis_started", { sessionId });

  let report;
  try {
    report = await analyzePhoto(imageBase64, safeMime, profileContext);
  } catch (aiError) {
    // AI failed — clear the processing lock so the user can retry
    const errorMessage =
      aiError instanceof Error ? aiError.message : "Unknown AI error";

    console.error(`[analyze] AI analysis failed for session ${sessionId}:`, errorMessage);
    trackEvent("analysis_failed", { sessionId, error: errorMessage });

    try {
      // Reset consumed_at so the user can retry (increment retry counter)
      await stripe.checkout.sessions.update(sessionId, {
        metadata: {
          ...stripeSession.metadata,
          consumed_at: `processing_failed:${Date.now()}:${retryCount + 1}`,
        },
      });
    } catch {
      // Best-effort — if this fails, the stale "processing" state will time out
    }

    return NextResponse.json(
      {
        error:
          "Our AI had a hiccup while generating your report. Your payment is still valid — please try again.",
        canRetry: true,
      },
      { status: 500 }
    );
  }

  // ── 14. Mark as successfully consumed ────────────────────────────────────
  // Only mark consumed AFTER the report is successfully generated.
  // This ensures that if AI fails, the user can retry.

  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...stripeSession.metadata,
        consumed_at: `done:${Date.now()}`,
      },
    });
  } catch (updateErr) {
    // Non-fatal: the report was generated successfully. The user might be able
    // to re-generate if they try again (since consumed_at wasn't updated),
    // but that's an acceptable edge case for V1.
    console.warn("[analyze] Failed to mark session as consumed:", updateErr);
  }

  trackEvent("analysis_completed", { sessionId });

  return NextResponse.json({ success: true, report });
}
