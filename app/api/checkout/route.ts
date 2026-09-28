import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_AMOUNT, CURRENCY, PRODUCT_NAME } from "@/lib/stripe";

// SHA-256 hex is always exactly 64 characters
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageHash } = body;

    // Validate that the client sent a proper SHA-256 hex digest.
    // This is stored in Stripe metadata and verified at analysis time.
    if (!imageHash || typeof imageHash !== "string" || !SHA256_HEX_REGEX.test(imageHash)) {
      return NextResponse.json(
        { error: "Invalid or missing image hash. Please try uploading your photo again." },
        { status: 400 }
      );
    }

    // Never use the client-supplied Origin header for redirect URLs —
    // a spoofed Origin would send users to an attacker-controlled domain
    // after payment. Always derive the base URL from the server environment.
    const origin = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: PRODUCT_NAME,
              description:
                "Personalized AI-powered beauty analysis: makeup, hair, colors, style & glow-up priorities.",
              images: [],
            },
            unit_amount: PRICE_AMOUNT,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/results?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/upload?cancelled=true`,
      metadata: {
        // Cryptographic binding: SHA-256 of the image base64.
        // /api/analyze re-computes this and rejects mismatches.
        imageHash,
        product: "glam_ai_glow_up_report",
        // consumed_at is set by /api/analyze after successful generation.
        // Values: "" (fresh) | "processing:{timestamp}" | "done:{timestamp}"
        consumed_at: "",
      },
      custom_text: {
        submit: {
          message:
            "Your personalized Glam AI report will be ready immediately after payment.",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[checkout] Error creating Stripe session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
