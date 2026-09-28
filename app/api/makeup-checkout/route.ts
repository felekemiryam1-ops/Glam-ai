/**
 * POST /api/makeup-checkout
 *
 * Creates a Stripe Checkout session for the $4.99 Makeup Glow-Up product.
 * This is the V2 primary paid product — distinct from the V1 text report.
 *
 * Security:
 * - Validates imageHash format (SHA-256 hex) before creating the session
 * - Never trusts the client for redirect origin (uses NEXT_PUBLIC_URL)
 * - Stores product type in Stripe metadata — verified server-side at generation time
 * - Cryptographic image binding via SHA-256 hash in metadata
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe, CURRENCY } from "@/lib/stripe";

// $4.99 one-time — same price as V1, distinct product
const MAKEUP_GLOW_UP_AMOUNT = 499; // cents
const MAKEUP_PRODUCT_NAME = "Glam AI Makeup Glow-Up";

// SHA-256 hex is always exactly 64 characters
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageHash } = body as { imageHash?: string };

    // ── 1. Validate image hash ────────────────────────────────────────────────

    if (
      !imageHash ||
      typeof imageHash !== "string" ||
      !SHA256_HEX_REGEX.test(imageHash)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid or missing image hash. Please try uploading your photo again.",
        },
        { status: 400 }
      );
    }

    // ── 2. Derive origin server-side — never trust the browser ───────────────

    const origin = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

    // ── 3. Create Stripe Checkout session ─────────────────────────────────────

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: MAKEUP_PRODUCT_NAME,
              description:
                "AI-generated before & after makeup transformation — personalised to your features and colouring.",
              images: [],
            },
            unit_amount: MAKEUP_GLOW_UP_AMOUNT,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/glow-up?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/preview?cancelled=true`,
      metadata: {
        // Product identifier — verified in /api/generate-makeup
        product: "glam_ai_makeup_glow_up",
        // SHA-256 of the image base64 — cryptographically binds this payment
        // to the specific photo that was previewed. /api/generate-makeup
        // re-computes this and rejects mismatches.
        imageHash,
        // State machine for FAL generation.
        // Values: "" (fresh) | "processing:{ts}:{retries}" |
        //         "processing_failed:{ts}:{retries}" | "done:{ts}"
        consumed_at: "",
        // Set by /api/generate-makeup after successful image generation.
        // Used to return the image on refresh without re-generating.
        generated_image_url: "",
      },
      custom_text: {
        submit: {
          message:
            "Your personalised Makeup Glow-Up image will be generated immediately after payment.",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[makeup-checkout] Error creating Stripe session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
