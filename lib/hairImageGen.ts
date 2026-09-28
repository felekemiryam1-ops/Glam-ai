/**
 * lib/hairImageGen.ts — FAL.ai Hair Glow-Up (hairstyle + hair-color) generation
 *
 * Deliberately reuses the exact SAME technique already proven for makeup
 * (lib/imageGen.ts): a single FLUX.1 Kontext [pro] whole-image edit call,
 * with an explicit, itemized "preserve everything except X" instruction
 * block. No new masking/segmentation infrastructure — none exists for hair
 * (lib/faceLandmarks.ts/lib/makeupMasks.ts only detect FACE landmarks, not
 * hair pixels), and building one is a separate, much larger effort. This
 * mirrors the approved architecture note on hair transformation: reuse the
 * pattern, not the makeup prompt's content.
 *
 * Unlike makeup, there is no deterministic post-processing step here (no
 * hair-region mask to apply a precise chroma tint through) — hairstyle and
 * color changes are structurally bigger edits than a blush tint, so the
 * whole result comes from the single Kontext call. Output reliability for
 * hair specifically is unproven relative to the makeup prompt's many tuning
 * rounds — flagged here deliberately, not overclaimed.
 *
 * Security: FAL_KEY is server-side only, same as lib/imageGen.ts. Only the
 * final result URL is returned to the client.
 */

import { fal } from "@fal-ai/client";
import type { HairstyleRecommendation, HairColorRecommendation } from "./hairPlanShared";
import { uploadBase64Image } from "./imageGen";

// Lazy credential read (same reasoning as lib/imageGen.ts's identical
// helper, duplicated rather than imported since that one isn't exported):
// missing FAL_KEY should only error at call time, not at module import
// time, which would break the build in CI.
function getConfiguredFal() {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error("FAL_KEY environment variable is not set");
  }
  fal.config({ credentials: key });
  return fal;
}

const FAL_MODEL = "fal-ai/flux-pro/kontext" as const;

export interface HairGlowUpResult {
  imageUrl: string;
  prompt: string;
}

/**
 * Build the hair-only edit prompt. At least one of hairstyle/color must be
 * provided — the caller enforces this (see the route).
 */
export function buildHairPrompt(
  hairstyle: HairstyleRecommendation | null,
  color: HairColorRecommendation | null
): string {
  const changes: string[] = [];
  if (hairstyle) {
    changes.push(
      `HAIRSTYLE: Restyle the hair to "${hairstyle.name}" — ${hairstyle.description} Keep the change realistic and physically plausible for this person's actual hair length/density visible in the photo (do not add hair extensions or length that isn't achievable from what's shown).`
    );
  }
  if (color) {
    changes.push(
      `HAIR COLOR: Change the hair color to "${color.name}" — ${color.description} Apply the color with realistic, natural-looking strand variation and root/tone blending, not a flat single-tone fill.`
    );
  }

  return `CRITICAL CONSTRAINT — READ FIRST: this is a face-preservation task first, a hair-styling task second. The output face must be pixel-for-pixel recognizable as the exact same person: identical face shape, jawline, cheekbone structure, forehead height and hairline curvature, nose shape, eye shape and spacing, eye color, lip shape, brow shape, ethnicity, skin tone and texture, and any existing makeup. If styling the hair differently exposes more or less forehead/temple/ear area than the original crop, extend the existing skin exactly as it already looks in the photo — do not redraw, reshape, smooth, or regenerate ANY facial feature. Treat everything below the hairline as a locked, untouchable region.

This is a hair-only photograph edit. Change nothing except the hair itself, as described below.

PRIORITY 1 — THE HAIR CHANGE (the only thing you are allowed to change):
${changes.join("\n")}

PRIORITY 2 — REALISM, NOT AN AI FILTER:
Must look like a real photograph of a real person with real hair, not an illustration, wig, or beauty-app filter. Preserve natural hair texture, individual strands, and realistic lighting/shadow on the hair. No plastic or painted-on look.

PRIORITY 3 — PRESERVE THE PERSON'S IDENTITY AND EVERYTHING ELSE:
Face shape, jawline, eye shape, eye color, lip shape, brow shape, ethnicity, skin tone, and any existing makeup are all unchanged — this is the same person, never a different one. Clothing, accessories, body position, posture, background, setting, lighting, camera angle, and crop are all unchanged. Do not alter facial features in any way while editing the hair.

FINAL CHECK BEFORE RENDERING: compare the face you are about to output against the input photo's face. If any facial feature looks even slightly different in shape, proportion, or structure, that is a failure — the hair may change, the face may not.`;
}

/**
 * Generate a hairstyle/hair-color transformation image.
 *
 * Flow mirrors lib/imageGen.ts's generateMakeupGlowUp:
 *  1. Upload the user's original photo to FAL CDN → get a URL
 *  2. Build the hair-only edit prompt
 *  3. Call FLUX.1 Kontext [pro] with the photo URL + prompt
 *  4. Return the result URL directly (no deterministic post-processing
 *     step exists for hair, unlike makeup's blush tint)
 *
 * Cost: ~$0.04 per successful call, same model as makeup.
 * Throws on any failure — the caller is responsible for retry accounting
 * and for not counting a failed attempt against the user's allowance.
 */
export async function generateHairGlowUp(
  imageBase64: string,
  mimeType: string,
  hairstyle: HairstyleRecommendation | null,
  color: HairColorRecommendation | null
): Promise<HairGlowUpResult> {
  if (!hairstyle && !color) {
    throw new Error("At least one of hairstyle or color must be selected");
  }
  if (!imageBase64 || imageBase64.length < 100) {
    throw new Error("Invalid image data provided to image generator");
  }

  const client = getConfiguredFal();

  const inputImageUrl = await uploadBase64Image(imageBase64, mimeType);
  const prompt = buildHairPrompt(hairstyle, color);

  const result = await client.subscribe(FAL_MODEL, {
    input: {
      prompt,
      image_url: inputImageUrl,
      // Higher than makeup's 4.5 — face-identity drift on hairstyle edits
      // (confirmed via a real test: the model reshaped the face on an
      // updo that exposed more forehead than the source crop) is a bigger
      // risk here than for makeup's much smaller edits, so this trades a
      // little more literalness for stricter adherence to the
      // preservation constraints above.
      guidance_scale: 6,
      enhance_prompt: false,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "3" as const,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const falResult = result as any;
  const data = falResult?.data ?? falResult;
  const images: Array<{ url: string }> = data?.images ?? [];
  const generatedUrl = images[0]?.url;

  if (!generatedUrl || typeof generatedUrl !== "string") {
    throw new Error(`FAL.ai returned no image URL. Response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return { imageUrl: generatedUrl, prompt };
}
