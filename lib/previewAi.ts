/**
 * Free Glam Preview AI analysis.
 *
 * Uses a fast, cheap model to return a small but genuinely useful GlamPreview.
 * This is the FREE tier — cost must stay very low (<$0.002/call).
 *
 * Override the model via ANTHROPIC_PREVIEW_MODEL env var.
 * Default: claude-haiku-4-5
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GlamPreview, PaletteColor, BeautyPalette, FeatureEnhancement, FaceRegionKey } from "./types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Cheapest vision-capable model — keeps free preview economical
const PREVIEW_MODEL = process.env.ANTHROPIC_PREVIEW_MODEL || "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a professional makeup artist and color consultant who provides brief, personalized beauty direction — the kind of analysis a client would get in a real in-person color consultation.

IMPORTANT:
- Phrase all observations as suggestions, not diagnoses
- Never comment on race, ethnicity, age, health, or physical flaws
- Be warm, specific, and empowering
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

// Exported (test-only reason) so lib/previewAi.test.ts can assert the
// aesthetic-guidance wording without a live AI call.
export const USER_PROMPT = `Look at this photo and provide a concise, professionally-curated personalized Glam Preview — the standard should be "a client could take this into Sephora or Ulta and know exactly what to look for."

UNDERTONE — be conservative:
Base "colorDirection" on skin undertone, overall skin coloring, hair color, eye color, and natural contrast. Only call it "warm" or "cool" if the visual evidence is reasonably clear. If it's ambiguous or you can't tell confidently, use "neutral" rather than guessing — do not overclaim certainty.

PALETTE — this is the most important part, read carefully:
Return a coherent 3-color BEAUTY PALETTE, not three unrelated "pretty" colors. Each color has a distinct, deliberate role:
  - "primary": the single most flattering, most useful color for this person. Best applications are blush and a wearable lipstick.
  - "supporting": a softer color that complements the primary. Best applications are a transition eyeshadow shade and a soft blush undertone.
  - "definition": a deeper or richer color for contrast and dimension. Best applications are outer-corner/lid eyeshadow, bronzer, or a deeper lip option. Unless the style/vibe you're describing for this person is bold, dramatic, editorial, smoky, or full-glam, "definition" should be a sophisticated, wearable, PROFESSIONALLY FLATTERING neutral — for a warm-toned person think cocoa, espresso, warm brown, bronze, caramel, soft copper, golden brown, or warm taupe; for a cool-toned person think cool taupe-brown, plum-brown, or dusty mauve-brown; for neutral think soft cocoa or taupe. This is the color most likely to end up as eyeshadow, so it must read as something a real makeup artist would put on a client for an elevated-but-believable everyday look — never a bright, saturated, glowing, or neon-leaning color, and never yellow, olive, lime, mustard, or khaki-green, even if "gold" or "bronze" seems to technically apply.
These three colors must look like they belong together and make sense as a coordinated set — like colors you'd find in one curated eyeshadow palette or one makeup artist's kit for this person, not three random shades.

REQUIREMENTS for each color:
- The name must describe an actual, real, wearable beauty color (examples of good names: "Warm Terracotta", "Peachy Nude", "Soft Bronze", "Rose Brown", "Muted Berry", "Dusty Mauve", "Soft Caramel", "Rich Cocoa"). Do not invent strange or overly abstract names just to sound premium.
- The hex value must visually match the name and role — e.g. if the name says "Warm Bronze", the hex must actually render as a warm, muted bronze/brown tone, not a bright gold, yellow, olive, or gray. Never pick a hex that contradicts its own name, and never let a "gold" or "bronze" name drift into a saturated yellow or olive-green hex — the correct interpretation is always a soft, muted brown-based tone, not a bright metallic or neon one.
- The three colors must be genuinely differentiated from each other — not the same color with three different names (bad example: "Terracotta" / "Orange" / "Burnt Orange", or "Pink" / "Pink Nude" / "Soft Pink"). Differentiate them by more than just depth/brightness — a real professional palette usually spans a couple of related-but-distinct HUES within the same family, not one hue at three lightness levels (e.g. for a warm palette: a peachy-coral tone + a soft copper tone + a deeper cocoa tone, not "light terracotta / terracotta / dark terracotta"). Each should have a visibly different role: one lighter/softer, one with more depth, one as the versatile hero tone — but the hue itself, not just how light or dark it is, should shift between them. This is about tasteful hue variety, not intensity — every color must still be muted and wearable, not bright or saturated.
- Write a short "use" string for each color describing what it's best applied to (e.g. "Best for blush and warm lipstick").

Return a JSON object with this EXACT structure (no extra fields):
{
  "headline": "A short, warm, personalized headline (max 10 words). Focus on a feature or quality you notice.",
  "colorDirection": "warm or cool or neutral — pick one word only",
  "makeupStyle": "A 2–3 word makeup style name (e.g. 'Soft Glam', 'Natural Polish', 'Bold Editorial')",
  "beautyVibe": "A 2–3 word overall vibe (e.g. 'Dewy Glow', 'Classic Chic', 'Fresh Natural')",
  "palette": {
    "primary": { "name": "Color name (1–2 words)", "hex": "#RRGGBB", "use": "Best for ..." },
    "supporting": { "name": "Color name (1–2 words)", "hex": "#RRGGBB", "use": "Best for ..." },
    "definition": { "name": "Color name (1–2 words)", "hex": "#RRGGBB", "use": "Best for ..." }
  },
  "makeupDirection": "One sentence describing the most flattering makeup direction for this person.",
  "firstMove": "One specific, actionable first beauty move they could try today (max 15 words).",
  "featureHighlights": [
    { "region": "eyes or brows or lips or cheeks or jawline or forehead — pick ONE per entry", "title": "2-4 word label (e.g. 'Define the Crease')", "recommendation": "One short, specific tip for this feature (max 12 words)", "why": "One short reason (max 10 words)" }
  ]
}

For "featureHighlights": return exactly 3 entries, each for a DIFFERENT region (choose the 3 most relevant regions for this person from: eyes, brows, lips, cheeks, jawline, forehead). These become callout points on a visual Face Map, so keep each "recommendation" concrete and actionable — not a general observation.

Make every field feel genuinely personalized to what you observe in the photo, while keeping the palette internally coherent per the rules above.`;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

const FALLBACK_PALETTE: BeautyPalette = {
  primary: { name: "Warm Terracotta", hex: "#C4826A", use: "Best for blush and warm lipstick" },
  supporting: { name: "Peachy Nude", hex: "#E8B4A0", use: "Best for transition eyeshadow and soft blush" },
  definition: { name: "Warm Bronze", hex: "#A66B4F", use: "Best for outer-corner eyeshadow and bronzer" },
};

function parsePaletteColor(raw: unknown, role: string, fallback: PaletteColor): PaletteColor {
  if (!raw || typeof raw !== "object") throw new Error(`palette.${role}: expected object`);
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== "string" || !c.name) throw new Error(`palette.${role}.name: missing`);
  if (typeof c.use !== "string" || !c.use) throw new Error(`palette.${role}.use: missing`);
  const hex = isHexColor(c.hex) ? c.hex : fallback.hex; // fallback to a safe, role-appropriate hex
  return { name: c.name, hex, use: c.use };
}

function validatePreview(raw: unknown): GlamPreview {
  if (!raw || typeof raw !== "object") {
    throw new Error("Preview: expected object at root level");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.headline !== "string" || !r.headline)
    throw new Error("preview.headline: missing");
  if (typeof r.colorDirection !== "string" || !r.colorDirection)
    throw new Error("preview.colorDirection: missing");
  if (typeof r.makeupStyle !== "string" || !r.makeupStyle)
    throw new Error("preview.makeupStyle: missing");
  if (typeof r.beautyVibe !== "string" || !r.beautyVibe)
    throw new Error("preview.beautyVibe: missing");
  if (typeof r.makeupDirection !== "string" || !r.makeupDirection)
    throw new Error("preview.makeupDirection: missing");
  if (typeof r.firstMove !== "string" || !r.firstMove)
    throw new Error("preview.firstMove: missing");

  if (!r.palette || typeof r.palette !== "object") {
    throw new Error("preview.palette: missing");
  }
  const p = r.palette as Record<string, unknown>;
  const palette: BeautyPalette = {
    primary: parsePaletteColor(p.primary, "primary", FALLBACK_PALETTE.primary),
    supporting: parsePaletteColor(p.supporting, "supporting", FALLBACK_PALETTE.supporting),
    definition: parsePaletteColor(p.definition, "definition", FALLBACK_PALETTE.definition),
  };

  // bestColors is derived from `palette` — kept for existing UI display
  // (preview/page.tsx, glow-up/page.tsx) which reads a flat 3-swatch array.
  // Order matters: index 0 is the primary/hero color.
  const bestColors = [palette.primary, palette.supporting, palette.definition].map(
    ({ name, hex }) => ({ name, hex })
  );

  return {
    headline: r.headline,
    colorDirection: r.colorDirection,
    makeupStyle: r.makeupStyle,
    beautyVibe: r.beautyVibe,
    palette,
    bestColors,
    makeupDirection: r.makeupDirection,
    firstMove: r.firstMove,
    featureHighlights: parseFeatureHighlights(r.featureHighlights),
  };
}

const VALID_REGIONS = new Set<FaceRegionKey>(["eyes", "brows", "lips", "cheeks", "jawline", "forehead"]);

/**
 * Best-effort parse — malformed or missing entries are dropped rather than
 * failing the whole preview, since this field is additive (the Face Map
 * simply shows fewer/no callouts if the AI omits or malforms it).
 */
function parseFeatureHighlights(raw: unknown): FeatureEnhancement[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: FeatureEnhancement[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.region !== "string" || !VALID_REGIONS.has(e.region as FaceRegionKey)) continue;
    if (typeof e.title !== "string" || !e.title) continue;
    if (typeof e.recommendation !== "string" || !e.recommendation) continue;
    result.push({
      region: e.region as FaceRegionKey,
      title: e.title,
      recommendation: e.recommendation,
      why: typeof e.why === "string" ? e.why : "",
    });
  }
  return result.length > 0 ? result : undefined;
}

function extractJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  return JSON.parse(cleaned);
}

/**
 * Generate a free GlamPreview from a base64-encoded photo.
 * Uses a cheap, fast model. Throws on failure.
 */
export async function analyzePhotoPreview(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<GlamPreview> {
  if (imageBase64.length > 14_000_000) {
    throw new Error("Image is too large for preview analysis");
  }

  const validMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  type ValidMime = (typeof validMimes)[number];
  const safeMime: ValidMime = validMimes.includes(mimeType as ValidMime)
    ? (mimeType as ValidMime)
    : "image/jpeg";

  const response = await client.messages.create({
    model: PREVIEW_MODEL,
    max_tokens: 700, // small output = low cost (bumped from 512 to fit featureHighlights)
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: safeMime, data: imageBase64 },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected AI response format — no text content");
  }

  const raw = extractJson(content.text);
  return validatePreview(raw);
}
