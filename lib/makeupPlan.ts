/**
 * lib/makeupPlan.ts — turns a GlamPreview's color palette into a structured
 * makeup plan, then turns that plan into the natural-language prompt sent
 * to the image generator.
 *
 * This is a deliberate architectural separation:
 *
 *   COLOR ANALYSIS (lib/previewAi.ts)
 *     ↓  produces preview.palette { primary, supporting, definition }
 *   MAKEUP PLAN (buildMakeupPlan, below)
 *     ↓  a typed object: which color goes on which product, where on the
 *        face, how intensely — not a paragraph of prose
 *   COLOR → PRODUCT → REGION MAPPING
 *     ↓  already baked into the plan's shape (plan.eyeshadow.lid.colorName,
 *        plan.blush.placement, etc.) — there's no separate step where the
 *        image model has to infer this itself
 *   IMAGE GENERATION PROMPT (buildPromptFromPlan, below)
 *     ↓  the plan rendered as natural language
 *   KONTEXT (lib/imageGen.ts calls FLUX.1 Kontext [pro] with this prompt)
 *
 * Why this matters: previously the prompt builder read preview.bestColors
 * directly and improvised which color did what inline in one long template
 * string. Now that decision is made once, explicitly, in buildMakeupPlan —
 * inspectable, testable, and reusable if a future masked-editing pipeline
 * needs per-region color assignments without re-deriving them from prose.
 */

import type { GlamPreview } from "./types";

// ── Color blending (used only to derive blush/lip colors — see buildMakeupPlan) ──
//
// The AI palette gives exactly 3 analyzed colors (primary/supporting/
// definition), but there are 4 real face regions to color (eye transition,
// eye lid/definition, blush, lips). Eyes get two of the three colors
// directly. Blush and lips must NOT both just copy the same third color
// verbatim — that reads as flat/uncoordinated (same hex = same rendered
// color = same recommended shopping products). Instead each is a genuine
// HSL blend of two of the analyzed colors, nudged toward its own
// professional role (a diffused, softer cheek flush vs. a more defined,
// wearable lip) — coordinated with the rest of the analyzed palette, never
// an invented, unrelated hue.

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** Shortest-arc hue interpolation — handles the 0°/360° wraparound correctly. */
function lerpHue(h1: number, h2: number, t: number): number {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (((h1 + diff * t) % 360) + 360) % 360;
}

/**
 * Blends two analyzed palette colors into a genuinely new, distinct color —
 * never a straight copy of either input. weightA controls how much colorA
 * dominates (0.5 = even blend); lightnessDelta/saturationDelta apply a
 * small, deliberate value shift on top of the blend, since blush and lips
 * have different professional roles even when built from the same
 * coordinated palette (see call sites in buildMakeupPlan below).
 */
function blendColor(
  colorA: { hex: string },
  colorB: { hex: string },
  weightA: number,
  lightnessDelta = 0,
  saturationDelta = 0
): string {
  const [h1, s1, l1] = hexToHsl(colorA.hex);
  const [h2, s2, l2] = hexToHsl(colorB.hex);
  const h = lerpHue(h1, h2, 1 - weightA);
  const s = s1 * weightA + s2 * (1 - weightA) + saturationDelta;
  const l = l1 * weightA + l2 * (1 - weightA) + lightnessDelta;
  return hslToHex(h, s, l);
}

// Minimum guaranteed lightness gap between a derived color and any color it
// must stay visibly distinct from. blendColor's weights/deltas are tuned for
// the common case, but nothing stops an AI-analyzed primary from happening
// to land close to supporting or definition in a given photo — lightness is
// the most robust channel to force separation on regardless of hue, so this
// is a deterministic safety net, not a hope that the blend weights alone
// always produce enough separation.
const MIN_LIGHTNESS_GAP = 0.1;

// A real makeup pigment, however light or deep, essentially never renders
// as literal near-white or near-black in a natural photo — this caps how
// far ensureLightnessSeparation is allowed to push a color while resolving
// a gap, so guaranteeing distinctness can never wash a color out to
// invisible or crush it to near-black in service of pure separation.
const LIGHTNESS_FLOOR = 0.16;
const LIGHTNESS_CEILING = 0.82;

/**
 * Nudges a derived color's lightness away from every color in `avoid` until
 * each is at least MIN_LIGHTNESS_GAP apart — guarantees blush/lips read as
 * visibly distinct in value from the eye colors (and each other) even in
 * edge cases where the analyzed palette's three colors happen to sit close
 * together. Hue and saturation are left untouched, so this still reads as
 * the same derived color, just pushed lighter or darker as needed.
 *
 * `bias` optionally forces which direction a conflict gets resolved in,
 * rather than whichever side the candidate happens to start on. Distinct-
 * ness alone doesn't guarantee a flattering result — blush in particular
 * must always read as a soft, light, diffused flush, never end up nudged
 * darker/heavier just because that happened to be the shorter path to
 * satisfying the gap against a nearby eye color.
 */
function ensureLightnessSeparation(candidateHex: string, avoid: string[], bias?: "lighter"): string {
  const [h, s, startL] = hexToHsl(candidateHex);
  let l = startL;
  for (const avoidHex of avoid) {
    const [, , avoidL] = hexToHsl(avoidHex);
    if (Math.abs(l - avoidL) < MIN_LIGHTNESS_GAP) {
      l = bias === "lighter" || l >= avoidL ? avoidL + MIN_LIGHTNESS_GAP : avoidL - MIN_LIGHTNESS_GAP;
    }
  }
  l = Math.min(LIGHTNESS_CEILING, Math.max(LIGHTNESS_FLOOR, l));
  return hslToHex(h, s, l);
}

// ── Intensity tier ────────────────────────────────────────────────────────────

export type IntensityTier = "subtle" | "defined" | "dramatic";

/**
 * Classify makeup intensity from the free-text makeupStyle/beautyVibe fields
 * the preview AI generates (e.g. "Soft Glam", "Natural Polish", "Bold Editorial").
 * These are open-ended strings, not an enum, so we match on keywords rather
 * than exact values — defaulting to "defined" (a polished Soft-Glam-like
 * middle ground) when nothing matches either extreme.
 */
function classifyIntensity(preview: GlamPreview): IntensityTier {
  const text = `${preview.makeupStyle} ${preview.beautyVibe}`.toLowerCase();

  if (/\b(bold|dramatic|editorial|smoky|smokey|statement|vivid|graphic|full glam)\b/.test(text)) {
    return "dramatic";
  }
  if (/\b(natural|minimal|barely|no-?makeup|understated|effortless)\b/.test(text)) {
    return "subtle";
  }
  return "defined";
}

const INTENSITY_COPY: Record<
  IntensityTier,
  { label: string; eyes: string; cheeks: string; lips: string }
> = {
  subtle: {
    label: "SOFT WEARABLE — clearly visible, everyday makeup (not dramatic, but not invisible)",
    eyes:
      "This is explicitly NOT a smoky eye — but it IS visible eyeshadow, applied in all three zones, not skipped or left invisible. Apply a soft, blended wash of the transition shade through the crease — sheer, but clearly present, not merely implied. Apply a visible (gently blended, not heavy) wash of the lid color across the mobile lid — this should read unmistakably as eyeshadow when compared to a bare eye. Softly deepen the definition shade at the outer corner, blended with no hard edge — a light touch, but still visible, not omitted. Keep the UPPER lash line naturally defined; a thin, soft line of the definition shade right at the upper lash line is expected and should be visible up close. The lower lash line and under-eye stay completely bare — no color there at all. No thick eyeliner wing, no heavy dark smoky zone — but do not make the eyeshadow so faint it disappears into the skin.",
    cheeks: "A soft, healthy flush of color concentrated on the apples of the cheeks only, clearly visible as blush when compared to the bare face — not a dramatic sculpted contour, but not so faint it reads as no blush at all. A small area with a soft, feathered edge that fades out gradually — it must never reach the temple, under-eye area, hairline, or jaw, and must stay clearly separate from the eyeshadow above it.",
    lips: "A visible, coordinated lip color with a soft satin or sheer-gloss finish — the lips should clearly read as wearing color, not merely 'slightly different from bare lips.' Natural lip texture should still show through, and this should not look like a bold matte lip, but it must be unmistakably present as applied lip color, not skipped.",
  },
  defined: {
    label: "DEFINED — polished, soft-glam finish (soft and wearable, not heavy)",
    eyes:
      "Build soft, blended dimension — visible and polished, never heavy or smoky: a softly blended transition shade through the crease, a gently visible lid wash (present and clear, but not dense or opaque), and the definition shade lightly deepened at the outer corner and outer crease, fading smoothly toward the center with no hard buildup of pigment. A thin, softly smudged line of the definition shade along the upper lash line only for gentle definition — not a sharp graphic liner. The lower lash line and under-eye stay completely bare — no color there at all. This should read as 'she has flattering eye makeup on,' not 'her eyes are the focal point of a bold look.'",
    cheeks: "A soft, natural flush concentrated on the apples of the cheeks only, with a diffused edge that fades outward gradually in a small, contained area — a healthy natural flush, not a heavy or heavily pigmented application. Must never spread toward the temple, under-eye area, hairline, or jaw, and must stay clearly separate from the eyeshadow above it — they are two distinct elements, never one continuous wash of color.",
    lips: "A soft, natural-looking, coordinated lip color with a gentle gradient — slightly deeper at the outer corners, softer toward the center — wearable and true to the person's natural lip tone, not bold or heavily saturated. A thin, natural-lip-line liner if it helps definition.",
  },
  dramatic: {
    label: "DRAMATIC — full glam, still photoreal and blended",
    eyes:
      "Build noticeably more depth while keeping every transition seamless: a rich, well-blended transition shade filling the crease, a bold and saturated lid wash, and the definition shade concentrated and deepened at the outer corner, windshield-wiped outward and slightly upward for lift, fully blended with no visible edge. Definition is primarily along the upper lash line (not a sharp graphic cat-eye). Only for this dramatic level, a very thin, softly smudged touch of the definition shade may be added right at the lower lash line if it suits the look — faint and diffused, never a solid line, never spreading onto the under-eye skin, never forming a ring around the eye. Fuller-looking, well-separated lashes.",
    cheeks: "A more sculpted, deeper flush, still concentrated on the apples of the cheeks and no higher than the upper cheekbone, with soft bronzer beneath for dimension — diffused, never a hard-edged contour line. Must never reach the temple, under-eye area, or jaw, and must stay clearly separate from the eyeshadow above it.",
    lips: "A fuller-coverage, more saturated lip color with clean but soft edges that follow the person's actual lip shape exactly — never overlined or enlarged.",
  },
};

// ── Color-family lock ─────────────────────────────────────────────────────────

/**
 * FLUX models tend to default to a "generic glam" prior (a cool gray/silver
 * smoky eye + bold red lip) unless explicitly told which hue family to stay
 * in. This is a short, high-priority constraint naming the allowed hue
 * family in plain language and explicitly forbidding the opposite-temperature
 * colors the model tends to fall back on.
 */
/**
 * NOTE: the forbidden list must name specific hues, not just categories.
 * Earlier versions of this function forbade only "gray/blue/silver" for
 * warm palettes — which left purple/mauve/plum/burgundy technically
 * unmentioned, and Kontext reliably drifted straight into them (its
 * apparent default "glam eyeshadow" prior). Every color family the model
 * could plausibly reach for that ISN'T in the target family must be named
 * explicitly and individually.
 *
 * Same lesson applied a second time: the warm/neutral variants named "gold"
 * and "bronze" as allowed hue words but never explicitly forbade yellow,
 * olive, lime, mustard, or chartreuse — an adjacent drift target that's
 * just as available to Kontext as purple was, and reads as theatrical/
 * costume-like rather than flattering when it appears. Named explicitly
 * below for the same reason purple/mauve/plum are.
 *
 * Hue-family correctness alone isn't the whole story either: a color can
 * be technically the right hue family and still look theatrical if it's
 * too saturated or bright. Each variant also carries an explicit
 * wearability constraint — the goal is a flattering, believable, real
 * makeup-artist result, not a color-differentiation exercise.
 */
function colorFamilyLock(colorDirection: string): string {
  const dir = colorDirection.toLowerCase();
  const wearability =
    "WEARABILITY: every color must look soft, muted, and genuinely wearable — the kind of tasteful, blended, professional makeup a client would actually wear out in real life to look more like the best version of herself, not a bright, neon, glowing, metallic-shimmer-heavy, theatrical, costume, or high-fashion-editorial color statement. The goal is 'she looks more beautiful,' never 'she is wearing a bold color.' If a color starts to look neon, glowing, or costume-like, mute it down until it reads as flattering, soft, real makeup.";
  if (dir === "cool") {
    return `COLOR FAMILY — COOL TONES ONLY: stay strictly within rose, mauve, plum, cool taupe, and soft berry — think dusty rose, cool-toned brown, soft plum. FORBIDDEN, do not use anywhere on the face under any circumstance: orange, gold, warm bronze, peach, terracotta, yellow, olive, lime, mustard, chartreuse, or any warm/sun-kissed or yellow-green tone. ${wearability}`;
  }
  if (dir === "neutral") {
    return `COLOR FAMILY — SOFT NEUTRAL TONES ONLY: stay strictly within soft beige, taupe, and neutral rose-brown — think sand, oatmeal, soft cocoa. FORBIDDEN, do not use anywhere on the face under any circumstance: purple, lavender, mauve, plum, burgundy, wine, gray, blue, silver, yellow, olive, lime, mustard, chartreuse, or strongly warm orange/gold extremes. ${wearability}`;
  }
  return `COLOR FAMILY — WARM TONES ONLY: stay strictly within deep gold-brown, bronze, brown, terracotta, peach, and warm berry — think sand, caramel, coffee, honey, clay. FORBIDDEN, do not use anywhere on the face under any circumstance: purple, lavender, mauve, plum, burgundy, wine, rose-pink, gray, blue, silver, ash, yellow, bright gold, metallic gold, olive, lime, mustard, or chartreuse. This eyeshadow must read as a soft, muted brown or bronze — like caramel or terracotta — never a bright or metallic yellow-gold, an olive or khaki green, or a purple flower, wine, or berry. Preserve the exact lightness/darkness of each recommended shade — a shade described as deep, dark, or rich must render dark, never lightened or brightened. If you are about to render anything resembling purple, lavender, mauve, pink-toned, bright/metallic gold, or olive/green eyeshadow, STOP — that is the wrong color family entirely. ${wearability}`;
}

/**
 * Describes the lip color in purely positive, sensory terms — deliberately
 * with NO mention of the word "red" or any "not X" negation, even to
 * forbid it. Testing showed that explicitly naming "red" as forbidden
 * (e.g. "NOT a classic red lipstick") made Kontext MORE likely to render a
 * red lip, not less — a known failure mode of diffusion/edit models, which
 * tend to attend to whatever concept is mentioned regardless of "not."
 * Describing the desired color vividly and never naming the undesired one
 * is the reliable way to steer away from it.
 */
/**
 * Vivid, repeated, name-anchored reinforcement for an eyeshadow color.
 *
 * Unlike lips (describeLipColorSensory, below — only 3 possible outputs
 * keyed on colorDirection, since every warm lip reads similarly enough),
 * eye colors vary far more (copper vs. cocoa vs. bronze vs. caramel are
 * visually distinct), so there's no small fixed set of sensory anchors to
 * hardcode — this instead leans on repeating the AI's own specific,
 * already-descriptive name (e.g. "Soft Copper", "Warm Cocoa") with an
 * explicit anti-drift clause. Named because the observed failure mode is
 * eyes rendering as gray/ash/colorless — colorFamilyRule already forbids
 * "gray" once, face-wide; this repeats the constraint specifically at the
 * point the color is actually applied, and ties it to the swatch by name.
 */
function describeEyeColorSensory(colorName: string): string {
  const lower = colorName.toLowerCase();
  return `a true, clearly-pigmented ${lower} — vividly and unmistakably ${lower}, not gray, ash, taupe-gray, a muted neutral, or a colorless wash. Picture an actual ${lower} eyeshadow swatch: if what's rendered doesn't visibly match that swatch's color, it is wrong, regardless of how soft or blended the application is.`;
}

function describeLipColorSensory(colorDirection: string): string {
  const dir = colorDirection.toLowerCase();
  if (dir === "cool") {
    return "a cool dusty rose-brown, like faded petals or soft mauve clay — muted and cool, never bright or bold.";
  }
  if (dir === "neutral") {
    return "a soft sandy rose-taupe, like warm sand mixed with a touch of cocoa — balanced and muted.";
  }
  return "warm and earthy, like sun-warmed clay, toasted caramel, or golden terracotta — muted and soft, never bright or bold.";
}

// ── Makeup plan ────────────────────────────────────────────────────────────────

export interface PlanColor {
  colorName: string;
  hex: string;
}

export interface EyeshadowPlan {
  transition: PlanColor & { placement: string };
  lid: PlanColor & { placement: string };
  definition: PlanColor & { placement: string };
  highlight: { placement: string };
  technique: string;
}

export interface BlushPlan extends PlanColor {
  placement: string;
  intensity: string;
}

export interface LipPlan extends PlanColor {
  finish: string;
}

export interface BrowPlan {
  approach: string;
}

export interface MakeupPlan {
  intensityTier: IntensityTier;
  intensityLabel: string;
  colorFamilyRule: string;
  eyeshadow: EyeshadowPlan;
  blush: BlushPlan;
  lips: LipPlan;
  brows: BrowPlan;
}

/**
 * Derive a structured makeup plan from a GlamPreview's palette.
 *
 * Fixed color→product convention (matches what the preview AI is prompted
 * to produce in lib/previewAi.ts, so the palette the user sees and the plan
 * used for generation are built from the same assumption):
 *   - supporting → eyeshadow transition shade (soft, crease-only wash),
 *                  used directly, unchanged
 *   - definition → eyeshadow lid + outer-corner (the main, most concentrated
 *                  eye color), used directly, unchanged
 *   - blush      → a blend of primary + supporting (lightened, softened) —
 *                  a diffused cheek flush, distinct from both eye colors
 *   - lips       → a blend of primary + definition (slightly deepened) —
 *                  a wearable lip with its own intentional depth, distinct
 *                  from blush and both eye colors
 * Blush and lips deliberately do NOT just copy one of the three analyzed
 * colors verbatim — with only 3 AI-analyzed colors and 4 real face regions,
 * a straight copy would make two different regions render (and shop-match)
 * as literally the same color, which reads as flat/uncoordinated rather
 * than like an intentional professional palette. See blendColor() above.
 * This is intentionally a fixed, deterministic mapping rather than something
 * re-derived per photo — it keeps the system predictable and testable.
 */
export function buildMakeupPlan(preview: GlamPreview): MakeupPlan {
  const { primary, supporting, definition } = preview.palette;
  const tier = classifyIntensity(preview);
  const copy = INTENSITY_COPY[tier];

  // Derive blush and lips as genuine blends (see blendColor's doc comment),
  // then guarantee each stays visibly distinct in lightness from both eye
  // colors — and lips from blush too — regardless of how close the AI's
  // three analyzed colors happen to sit together for a given photo.
  //
  // Deltas are deliberately restrained toward SOFTER, not just DIFFERENT:
  // distinctness alone doesn't guarantee a flattering result — a
  // mathematically-distinct color can still look too heavy or saturated.
  // Blush leans meaningfully lighter/softer (a diffused flush is always
  // lighter than a concentrated eye or lip color) — the lightness delta
  // below stays. Lips get a small lightness nudge for their own role but no
  // saturation boost — a natural, wearable lip should not be pushed more
  // saturated by default.
  //
  // Blush's saturation delta was 0 here (no artificial change) — it used to
  // be -0.16 (deliberately desaturated), tuned back when blush was rendered
  // by Kontext's text-following, which tended to overshoot toward intensity
  // and needed a compensating desaturated input. Blush is now rendered by
  // lib/makeupMasks.ts's deterministic HSL chroma tint instead, which moves
  // each pixel's saturation via linear interpolation toward this exact
  // hex's own raw saturation — that's a hard ceiling (interpolation can
  // never exceed either endpoint), so a pre-desaturated input directly
  // capped how visible blush could ever render, no matter how the tint's
  // own strength/mask parameters were tuned (verified: 0.38 through 0.85
  // strength were visually indistinguishable). Removing the artificial
  // desaturation here — not boosting saturation at render time — is the
  // fix: the recommended color itself just needs to carry its natural,
  // un-penalized chroma for the renderer to have room to work with.
  const rawBlush = blendColor(primary, supporting, 0.75, 0.16, 0);
  const blushHex = ensureLightnessSeparation(rawBlush, [supporting.hex, definition.hex], "lighter");
  const rawLips = blendColor(primary, definition, 0.8, -0.03, -0.04);
  const lipsHex = ensureLightnessSeparation(rawLips, [supporting.hex, definition.hex, blushHex]);

  return {
    intensityTier: tier,
    intensityLabel: copy.label,
    colorFamilyRule: colorFamilyLock(preview.colorDirection),
    eyeshadow: {
      transition: {
        colorName: supporting.name,
        hex: supporting.hex,
        placement: "swept softly through the crease only, diffused with no visible start or end line",
      },
      lid: {
        colorName: definition.name,
        hex: definition.hex,
        placement: "across the mobile eyelid from the lash line up toward the crease, fading into the transition shade with no visible seam",
      },
      definition: {
        colorName: definition.name,
        hex: definition.hex,
        placement: "concentrated at the outer corner and outer third of the crease, blended toward the center with no hard edge, no rectangle, no circular patch",
      },
      highlight: {
        placement: "a soft touch at the inner corner and/or brow bone to lift and open the eye — subtle, not shimmery or metallic",
      },
      technique: copy.eyes,
    },
    blush: {
      colorName: `${primary.name} Flush`,
      hex: blushHex,
      placement: "the apples of the cheeks only (the round, fullest part of the cheek when smiling), fading outward gradually in a small, soft-edged area — never reaching the temple, under-eye area, hairline, or jaw",
      intensity: copy.cheeks,
    },
    lips: {
      colorName: `${primary.name} Tint`,
      hex: lipsHex,
      finish: copy.lips,
    },
    brows: {
      approach:
        "groomed and clearly defined: fill in the natural brow shape with soft, hair-like strokes so the brows read as complete and polished — a visible improvement in definition compared to the original, not just a preserved brow. Do not change the brow's shape, arch, or position — only add definition within that exact existing shape.",
    },
  };
}

// ── Prompt construction ───────────────────────────────────────────────────────

/**
 * Render a makeup plan as the natural-language prompt for FLUX.1 Kontext [pro].
 *
 * Structured as 6 explicit, numbered priorities, COLORS FIRST. This ordering
 * is deliberate, not stylistic: an isolated test (a ~700-character prompt
 * containing only the eye-color instruction, everything else stripped out)
 * against the same photo and the same model settings correctly rendered the
 * specified colors, while the previous, much longer version of this prompt
 * (~16,000 characters, colorFamilyRule and the eye-color description each
 * stated 2-3 times across different sections) did not — Kontext rendered a
 * gray/blue eyeshadow despite the correct color being present in the text.
 * The content was never wrong; it was diluted by sheer competing volume and
 * duplication. Every fact below is now stated exactly once, and the exact
 * colors lead the prompt instead of being buried after several paragraphs
 * of visibility/boundary framing.
 *
 * Blush is deliberately NOT part of this prompt at all. Isolated tests
 * proved Kontext can follow an exact hue and can follow a placement
 * boundary, but repeatedly rendered blush as a solid opaque patch no matter
 * how the "sheer/translucent/skin-visible-through" instruction was worded —
 * that specific property (controlled low opacity, texture preserved
 * underneath) isn't something natural-language image generation reliably
 * controls. Kontext is told here to leave cheeks completely untouched;
 * lib/imageGen.ts applies blush afterward as a deterministic alpha-composite
 * through lib/makeupMasks.ts's cheek mask instead — see that file's header.
 */
export function buildPromptFromPlan(plan: MakeupPlan, preview: GlamPreview): string {
  const { eyeshadow, lips, brows, colorFamilyRule, intensityLabel } = plan;
  const lipSensoryDescriptor = describeLipColorSensory(preview.colorDirection);
  const transitionSensory = describeEyeColorSensory(eyeshadow.transition.colorName);
  const lidSensory = describeEyeColorSensory(eyeshadow.lid.colorName);

  return `This is a makeup-only photograph edit. Change nothing except the cosmetics described below.

PRIORITY 1 — EXACT COLORS (the most important instruction below — apply these exactly, nowhere else, no substitutions):
${colorFamilyRule}
  - EYES, transition shade (crease only): ${eyeshadow.transition.colorName} (${eyeshadow.transition.hex}) — ${transitionSensory}
  - EYES, lid + outer-corner shade: ${eyeshadow.lid.colorName} (${eyeshadow.lid.hex}) — ${lidSensory}
  - LIPS: ${lips.colorName} (${lips.hex}) — ${lipSensoryDescriptor}
  - CHEEKS: leave completely untouched — no blush, no bronzer, no color of any kind. Blush is added afterward by a separate process, not by you.
Do not apply the lip color to the eyes, or the eyeshadow colors to the cheeks or lips. Never substitute a different hue family for any of these. The eyes specifically must never drift toward blue, purple, lavender, silver, or gray — if you are about to render any of those, stop; that is the wrong color entirely.

PRIORITY 2 — EYE APPLICATION TECHNIQUE (avoid the most common failure: one flat block of color):
  1. Transition shade: ${eyeshadow.transition.placement}.
  2. Lid + outer-corner shade: ${eyeshadow.lid.placement}. Deepen further at the outer corner: ${eyeshadow.definition.placement}.
  3. Highlight: ${eyeshadow.highlight.placement}.
${eyeshadow.technique}
Every zone blends seamlessly into the next, no hard edges. Stays strictly between the upper lash line and the brow bone — never below the lash line or on the under-eye skin, and never forms a ring, halo, or band of color around the eye. If eyeliner is used: thin, upper lash line only, natural shape — no thick or graphic liner, no lower-lash-line definition, unless the intensity target below explicitly calls for it.

PRIORITY 3 — VISIBILITY & INTENSITY:
Intensity target: ${intensityLabel}. The makeup must be clearly, unmistakably visible compared to the bare face — not painted-on, not barely-there — achieved through color clarity and correct placement, never by enlarging the area any color covers. But visible does not mean heavy or bold: default to the softest version of each color and technique that still reads clearly as applied makeup; when in doubt between two ways to render something, choose the softer, more restrained one.

PRIORITY 4 — LIPS & BROWS (cheeks intentionally excluded — see Priority 1):
LIPS: Follow the person's actual natural lip shape exactly — no overlining or enlarging. ${lips.finish} Realistic lip texture, soft natural gradient, not a flat fill.
BROWS: ${brows.approach}

PRIORITY 5 — REALISM, NOT AN AI FILTER:
Must look like a real photograph of a person wearing real makeup, not an illustration or a beauty-app filter. Keep the skin's natural texture, pores, and fine detail — no blurring, smoothing, or plasticizing, no change to the underlying skin tone. Mascara looks like real, separated, slightly clumped lashes, not a painted fringe. No over-smoothed plastic skin, no symmetry correction, no oversized eyes, no random colors that weren't specified in Priority 1.

PRIORITY 6 — PRESERVE THE PERSON'S IDENTITY:
Hair (style, position, length, texture, color), face shape, jawline, eye shape, lip shape, brow shape, ethnicity, and skin tone are all unchanged — this is the same person, never a different one. Clothing, accessories, body position, posture, background, setting, lighting, camera angle, and crop are all unchanged.`;
}
