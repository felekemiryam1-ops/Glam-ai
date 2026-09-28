/**
 * lib/imageGen.ts — FAL.ai Makeup Glow-Up generation
 *
 * Model: FLUX.1 Kontext [pro]  (fal-ai/flux-pro/kontext)
 *
 * Why Kontext [pro]:
 *   • Purpose-built image EDITING (not generation) — modifies the input
 *     photo rather than creating a new one, so identity is inherently preserved
 *   • Explicitly designed for "character consistency preservation across edits"
 *   • $0.04 per image — very cost-effective against a $4.99 product
 *   • Instruction-following: responds to precise makeup directives
 *
 * Architecture (hybrid — generative + deterministic):
 *   preview.palette (lib/previewAi.ts — color analysis)
 *     → buildMakeupPlan (lib/makeupPlan.ts — structured color→product→region plan)
 *     → buildPromptFromPlan (lib/makeupPlan.ts — plan rendered as prompt text;
 *       cheeks explicitly excluded, see that file's header)
 *     → this file: Kontext renders eyes/lips/brows (needs artistic judgment —
 *       multi-tone blending, technique — genuinely benefits from a generative
 *       model), then blush is applied afterward as a deterministic HSL
 *       chroma tint through lib/makeupMasks.ts's cheek mask, not by Kontext.
 *
 * Why blush is split out from the generative step:
 *   Isolated single-purpose prompt tests (same photo, same model settings,
 *   only the prompt content varied) proved Kontext reliably follows an exact
 *   hue and reliably follows a placement boundary when nothing competes with
 *   those instructions — but repeatedly rendered blush as a solid, opaque
 *   painted patch regardless of how the desired "sheer/translucent, skin
 *   texture visible through the color" finish was worded. That's not a
 *   prompt-wording problem worth continuing to chase: it's a photometric
 *   property (color shifted, lightness/texture untouched) that our own
 *   image processing can get exactly right by construction, not something
 *   worth hoping a generative model renders correctly. A first version of
 *   this used a flat alpha-over composite (blend a constant color in at a
 *   fixed opacity) — that still read as painted, because blending every
 *   masked pixel toward one uniform color compresses the region's natural
 *   luminance variation regardless of opacity. The fix: only hue/saturation
 *   move toward the blush color; lightness always comes from the original
 *   pixel, untouched, at any strength — see lib/makeupMasks.ts's
 *   applyChromaTint() for the actual per-pixel math.
 *
 * Status note (reverted from a FULLY masked-editing experiment):
 *   An earlier attempt replaced Kontext entirely with sequential FLUX Fill
 *   (fal-ai/flux-pro/v1/fill) calls per masked region. The masks themselves
 *   (lib/faceLandmarks.ts + lib/makeupMasks.ts) were precise and reliable;
 *   Fill's generative output quality inside those masks was NOT — nearly
 *   identical prompts on the same mask produced results ranging from good to
 *   badly broken (flat neon-color blocks, hard-edged banding) across
 *   repeated real tests. That's why blush uses a plain deterministic tint
 *   here rather than a second generative (Fill) call: this reuses the same
 *   trustworthy masks, but skips the generative step that was already shown
 *   to be unreliable.
 *
 * Security:
 *   • FAL_KEY is server-side only — never in NEXT_PUBLIC_* vars
 *   • Image is uploaded via fal.storage (server to FAL CDN), never exposed to browser
 *   • Only the final result URL is returned to the client
 */

import { fal } from "@fal-ai/client";
import type { GlamPreview } from "./types";
import { buildMakeupPlan, buildPromptFromPlan } from "./makeupPlan";
import { detectFaceLandmarks } from "./faceLandmarks";
import { buildRegionMasks, applyChromaTint } from "./makeupMasks";

// Peak strength for the deterministic blush chroma tint — how far hue/
// saturation move toward the blush color at the mask's whitest (most
// central) point, tapering to 0 at the feathered edge. Lightness is never
// touched at any strength (see applyChromaTint), so skin texture/shading
// stays fully visible regardless of this value — this only controls how
// visible the color shift itself reads. Tune here only, nothing else in
// the pipeline needs to change if this needs adjusting again.
const BLUSH_PEAK_STRENGTH = 0.38;

// ── FAL client configuration ──────────────────────────────────────────────────
// Credentials are read lazily so missing FAL_KEY only errors at call time,
// not at module import time (which would break the build in CI).

function getConfiguredFal() {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error("FAL_KEY environment variable is not set");
  }
  fal.config({ credentials: key });
  return fal;
}

// ── Model ─────────────────────────────────────────────────────────────────────

// FLUX.1 Kontext [pro] — image-to-image editing, identity-preserving
const FAL_MODEL = "fal-ai/flux-pro/kontext" as const;

// ── Prompt construction ───────────────────────────────────────────────────────

/**
 * Build the makeup-only prompt for FLUX.1 Kontext [pro] from a GlamPreview.
 * Thin wrapper: derives the structured plan, then renders it as prompt text.
 * Exported for debugging/display and because /api/generate-makeup logs it.
 */
export function buildMakeupPrompt(preview: GlamPreview): string {
  const plan = buildMakeupPlan(preview);
  return buildPromptFromPlan(plan, preview);
}

// ── Image upload ──────────────────────────────────────────────────────────────

/**
 * Upload raw image bytes to FAL CDN and return a public URL.
 * Exported (Stage 6 Step 6) for reuse by Progress Photos — visibility
 * change only, no behavior change; this function and its call sites within
 * this file are otherwise untouched.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const client = getConfiguredFal();

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });

  const url = await client.storage.upload(file);
  if (!url || typeof url !== "string") {
    throw new Error("FAL storage upload returned no URL");
  }
  return url;
}

/**
 * Upload a base64 image to FAL CDN and return a public URL.
 * The URL is then passed as `image_url` to the Kontext model.
 * Exported (Stage 6 Step 6) for reuse by Progress Photos — visibility
 * change only, no behavior change.
 */
export async function uploadBase64Image(
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const buffer = Buffer.from(imageBase64, "base64");
  const ext = mimeType.split("/")[1] ?? "jpeg";
  return uploadImageBuffer(buffer, mimeType, `glamai-input.${ext}`);
}

/** Download a generated image's bytes so it can be composited on locally. */
async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download generated image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Deterministically tints blush onto a generated image — see this file's
 * header for why this is a plain chroma tint rather than a second
 * generative call. Detects landmarks on the KONTEXT OUTPUT itself (not the
 * original photo) so the cheek mask is pixel-accurate to the image it's
 * actually being applied to, regardless of any minor geometry drift from
 * the edit.
 */
async function applyBlushOverlay(imageBuffer: Buffer, blushHex: string): Promise<Buffer> {
  const landmarks = await detectFaceLandmarks(imageBuffer);
  const { cheeks } = await buildRegionMasks(landmarks);
  return applyChromaTint(imageBuffer, cheeks, blushHex, BLUSH_PEAK_STRENGTH);
}

// ── Generation ────────────────────────────────────────────────────────────────

export interface MakeupGlowUpResult {
  imageUrl: string;  // FAL CDN URL of the generated image
  prompt: string;    // The prompt used (for debugging / display)
}

/**
 * Generate a makeup glow-up image.
 *
 * Flow:
 *  1. Upload the user's original photo to FAL CDN → get a URL
 *  2. Build a structured makeup plan, then render it as a prompt (cheeks
 *     excluded — see buildPromptFromPlan's header)
 *  3. Call FLUX.1 Kontext [pro] with the photo URL + prompt → eyes/lips/brows
 *  4. Download that result, deterministically tint blush onto it
 *     (lib/makeupMasks.ts's cheek mask + applyChromaTint — see this file's
 *     header for why blush is handled this way instead of by Kontext)
 *  5. Upload the tinted final image and return its URL
 *
 * Cost: ~$0.04 per successful call (step 3 is the only paid step — the
 * blush tint is local image processing, no additional API cost).
 * Throws on any failure — the caller is responsible for retry accounting.
 */
export async function generateMakeupGlowUp(
  imageBase64: string,
  mimeType: string,
  preview: GlamPreview
): Promise<MakeupGlowUpResult> {
  const client = getConfiguredFal();

  // Validate inputs before spending money
  if (!imageBase64 || imageBase64.length < 100) {
    throw new Error("Invalid image data provided to image generator");
  }

  // 1. Upload to FAL CDN
  const inputImageUrl = await uploadBase64Image(imageBase64, mimeType);

  // 2. Build the structured plan, then the prompt
  const plan = buildMakeupPlan(preview);
  const prompt = buildPromptFromPlan(plan, preview);

  // 3. Call FLUX.1 Kontext [pro]
  const result = await client.subscribe(FAL_MODEL, {
    input: {
      prompt,
      image_url: inputImageUrl,
      guidance_scale: 4.5,    // higher = stricter prompt adherence; critical for preservation constraints
      // Explicitly disabled: FAL's own docs don't specify this parameter's
      // default or document what "enhancing" the prompt actually does —
      // left unset, we have no guarantee our carefully-constructed color
      // instructions reach the model unmodified. Testing whether an
      // undocumented rewrite step was diluting the eye-color instructions
      // (see the gray/blue-eyeshadow root-cause investigation).
      enhance_prompt: false,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "3" as const,  // slightly relaxed for beauty/cosmetic content
    },
  });

  // 4. Extract result URL
  // fal.subscribe returns { data: { images: [...], seed: number } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const falResult = result as any;
  const data = falResult?.data ?? falResult;
  const images: Array<{ url: string }> = data?.images ?? [];
  const generatedUrl = images[0]?.url;

  if (!generatedUrl || typeof generatedUrl !== "string") {
    throw new Error(
      `FAL.ai returned no image URL. Response: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  // 5. Deterministically tint blush onto the Kontext result, then
  // upload the final image. If landmark detection or tinting fails for
  // any reason (e.g. no face detected in the edited image — shouldn't
  // happen given Kontext's identity-preservation constraints, but this is
  // real image processing on a real photo), fail loudly rather than
  // silently shipping a blush-less result — the caller's existing
  // retry/error handling already covers this path.
  const kontextResult = await downloadImage(generatedUrl);
  const withBlush = await applyBlushOverlay(kontextResult, plan.blush.hex);
  const finalImageUrl = await uploadImageBuffer(withBlush, "image/jpeg", "glamai-result.jpg");

  return { imageUrl: finalImageUrl, prompt };
}
