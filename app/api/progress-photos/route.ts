/**
 * GET / POST /api/progress-photos — Progress Photos (Premium)
 *
 * Visual progress tracking only — this route NEVER calls Claude or FAL's
 * generation model. The only external call is `uploadImageBuffer`
 * (exported from lib/imageGen.ts for this reuse, Stage 6 Step 6), which is
 * FAL's plain CDN storage upload — the same primitive the makeup pipeline
 * already uses to host the user's original photo before editing, not an
 * image-generation call, and not billed as one.
 *
 * Security:
 *   - auth() required; userId comes ONLY from the session.
 *   - Every query is filtered by that userId — GET can only ever return the
 *     caller's own photos, never another user's.
 *   - Upload is validated (magic bytes + size cap) BEFORE ever reaching FAL,
 *     reusing the same lib/imageValidation.ts used by the paid Glow-Up route.
 *   - No public/shareable link is created beyond the same FAL CDN URL
 *     shape already used (and already accepted as this app's storage
 *     model) for every generated Glow-Up image — nothing new is exposed
 *     that wasn't already the case for Report images.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { validateImageBytes } from "@/lib/imageValidation";
import { uploadBase64Image } from "@/lib/imageGen";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — same cap as the Glow-Up routes
const MAX_NOTE_LENGTH = 200;

async function requirePremium(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  }

  const entitlements = await getEntitlements(session.user.id);
  if (entitlements.plan !== "premium") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Progress Photos requires an active Premium subscription.", plan: entitlements.plan },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: session.user.id };
}

export async function GET() {
  const gate = await requirePremium();
  if (!gate.ok) return gate.response;

  const photos = await prisma.progressPhoto.findMany({
    where: { userId: gate.userId },
    orderBy: { takenAt: "desc" },
  });

  return NextResponse.json({
    photos: photos.map((p) => ({ id: p.id, imageUrl: p.imageUrl, note: p.note, takenAt: p.takenAt })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requirePremium();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { imageBase64, note, takenAt } = (body ?? {}) as {
    imageBase64?: unknown;
    note?: unknown;
    takenAt?: unknown;
  };

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "Missing image data." }, { status: 400 });
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

  if (note !== undefined && (typeof note !== "string" || note.length > MAX_NOTE_LENGTH)) {
    return NextResponse.json({ error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer.` }, { status: 400 });
  }

  let takenAtDate = new Date();
  if (takenAt !== undefined) {
    if (typeof takenAt !== "string") {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    const parsed = new Date(takenAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    takenAtDate = parsed;
  }

  let imageUrl: string;
  try {
    imageUrl = await uploadBase64Image(imageBase64, safeMime);
  } catch (err) {
    console.error("[progress-photos] Upload failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't upload your photo right now. Please try again." }, { status: 500 });
  }

  const photo = await prisma.progressPhoto.create({
    data: {
      userId: gate.userId,
      imageUrl,
      note: typeof note === "string" ? note : null,
      takenAt: takenAtDate,
    },
  });

  return NextResponse.json({
    success: true,
    photo: { id: photo.id, imageUrl: photo.imageUrl, note: photo.note, takenAt: photo.takenAt },
  });
}
