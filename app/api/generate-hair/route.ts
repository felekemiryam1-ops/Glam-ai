/**
 * POST /api/generate-hair
 *
 * DISABLED. AI hair transformation — both a full hairstyle change and,
 * after that failed, a color-only-restricted version — was tested against
 * real photos and both reliably altered the person's actual face, not
 * just the hair:
 *   - Hairstyle edits that moved hair off the forehead (e.g. an updo)
 *     visibly reshaped the face and dropped a distinguishing mole.
 *   - Restricting to color-only did not fix it either — the model also
 *     changed hair LENGTH/TEXTURE beyond what was asked, and face
 *     identity still wasn't confidently clean.
 *
 * Root cause: FLUX Kontext (the model this reused from lib/imageGen.ts's
 * makeup pipeline) has no mask/strength parameter to spatially lock the
 * face region, so identity preservation depends entirely on the model
 * choosing to comply with a text instruction — and it doesn't reliably.
 * Makeup's blush avoids this same risk by being a deterministic pixel
 * tint through a real face-landmark mask, never generated; hair has no
 * equivalent segmentation to mask through.
 *
 * Rather than ship a result users didn't ask for and might not notice is
 * wrong, this route is turned off here — the earliest, hardest point to
 * enforce it, so no client (including a hand-crafted request bypassing
 * the UI) can reach real generation. lib/hairImageGen.ts (the generation
 * function itself) and the entitlement plumbing are left as they are for
 * when this gets properly solved — either a real hair-segmentation mask
 * or a genuinely tuned prompt/technique, the way makeup's own prompt took
 * multiple real rounds to get right — rather than rebuilt from scratch.
 * The text hairstyle/color recommendations (lib/hairPlan.ts) are
 * unaffected and still shown; only the photo-visualization step here is
 * disabled.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Hair photo visualization is temporarily unavailable. Your hairstyle and color recommendations are still available above.",
    },
    { status: 503 }
  );
}
