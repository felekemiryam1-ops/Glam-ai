/**
 * lib/hairPlan.ts — Hair Glow-Up (Pro/Premium)
 *
 * Mirrors lib/skinPlan.ts's architecture exactly — same reasoning applies
 * here, not repeated in full:
 *   - Text-only Claude call, no vision, no FAL. Hair type/concerns are
 *     self-reported form inputs, not something to re-derive from a photo.
 *   - A structural validator with the same list-length caps.
 *   - The same two-layer safety approach: prompt-level instructions forbid
 *     scalp/medical diagnosis and prescribing; a pattern-based scan
 *     independently rejects output that slips past that instruction anyway.
 *
 * SERVER-ONLY (Stage 6 Step 8/9 fix): mirrors lib/skinPlan.ts's fix exactly
 * — `import "server-only"` below, shared intake vocabulary/types moved to
 * lib/hairPlanShared.ts (no SDK import, safe for client components), and
 * re-exported here for existing server-side importers.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extractAndParseJson } from "./reportValidator";
import {
  HAIR_TYPES,
  HAIR_CONCERNS,
  isValidHairType,
  isValidHairConcerns,
  isValidBudget,
  type HairTypeId,
  type HairConcernId,
  type HairPlanIntake,
  type HairRoutineStep,
  type HairWeeklyStep,
  type HairStylingTip,
  type HairRecommendedProduct,
  type HairstyleRecommendation,
  type HairColorRecommendation,
  type HairPlan,
} from "./hairPlanShared";

export {
  HAIR_TYPES,
  HAIR_CONCERNS,
  isValidHairType,
  isValidHairConcerns,
  isValidBudget,
};
export type {
  HairTypeId,
  HairConcernId,
  HairPlanIntake,
  HairRoutineStep,
  HairWeeklyStep,
  HairStylingTip,
  HairRecommendedProduct,
  HairstyleRecommendation,
  HairColorRecommendation,
  HairPlan,
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HAIR_PLAN_MODEL = process.env.ANTHROPIC_HAIR_PLAN_MODEL || "claude-haiku-4-5";

const BUDGET_LABELS: Record<string, string> = {
  budget: "budget-friendly (drugstore / affordable finds)",
  mid_range: "mid-range (mix of drugstore and mid-tier brands)",
  premium: "premium / luxury (investment-level products)",
};

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a beauty and haircare routine assistant creating a short, practical hair routine.

CRITICAL SAFETY RULES — follow these exactly:
- You are giving general beauty/haircare routine guidance, NOT a medical diagnosis or medical advice.
- Never diagnose a medical scalp or hair condition (e.g. never say a user "has" alopecia, a fungal infection, seborrheic dermatitis, psoriasis, folliculitis, or any other medical condition).
- Never prescribe or name a specific prescription medication, prescription-strength ingredient, or dosage.
- If a concern sounds like it could be a medical condition rather than a cosmetic one (e.g. sudden or significant hair loss, persistent scalp irritation), use cautious, general language and recommend seeing a dermatologist or qualified professional — do not attempt to address it yourself beyond gentle, general haircare habits.
- Only recommend over-the-counter, widely-available product TYPES — never specific prescription products.

FORMAT RULES:
- Return ONLY valid JSON matching the exact schema given. No markdown, no explanation outside the JSON.
- Be concise. This must be scannable in under a minute — short phrases, not paragraphs.
- Each "why" is ONE short sentence, plain language, no jargon.
- washDayRoutine: 3-5 steps, in order of application.
- weeklyRoutine: 1-3 items.
- stylingRecommendations: 2-4 short, practical tips.
- recommendedProducts: 3-5 items.
- hairGoals: 2-4 short phrases (2-4 words each).
- recommendedHairstyles: exactly 2 items — real, describable hairstyles suited to this hair type/concerns (not haircuts requiring a stylist visit to evaluate — think "everyday styling looks," e.g. "Wash-and-Go Curls Defined", "Low Sleek Bun", "Face-Framing Layers").
- recommendedColors: exactly 2 items — real, describable hair colors/tones (e.g. "Warm Chestnut Balayage", "Deep Espresso Brown", "Honey Blonde Highlights") suited to this person; if hairConcerns includes color-treated care, keep suggestions low-damage (glosses/toners over full lightening).`;

function buildUserPrompt(intake: HairPlanIntake): string {
  const concernLabels = intake.hairConcerns
    .map((id) => HAIR_CONCERNS.find((c) => c.id === id)?.label ?? id)
    .join(", ");
  const hairTypeLabel = HAIR_TYPES.find((t) => t.id === intake.hairType)?.label ?? intake.hairType;
  const budgetLabel = BUDGET_LABELS[intake.budget] ?? intake.budget;

  return `Create a personalized hair routine for someone with:
- Hair type: ${hairTypeLabel}${intake.hairType === "not_sure" ? " (they aren't sure of their hair type — keep recommendations gentle and broadly suitable rather than assuming)" : ""}
- Main concerns: ${concernLabels}
- Budget: ${budgetLabel}

Return a JSON object with this exact structure:
{
  "hairGoals": ["short goal phrase", "short goal phrase"],
  "washDayRoutine": [
    { "step": "Shampoo", "productType": "sulfate-free moisturizing shampoo", "why": "one short sentence" }
  ],
  "weeklyRoutine": [
    { "step": "Deep conditioning mask", "frequency": "1x/week", "why": "..." }
  ],
  "stylingRecommendations": [
    { "tip": "short practical tip", "why": "..." }
  ],
  "recommendedProducts": [
    { "category": "Shampoo", "productType": "sulfate-free moisturizing shampoo", "example": "a recognizable, widely-available example if one fits naturally, otherwise leave empty", "why": "..." }
  ],
  "recommendedHairstyles": [
    { "name": "short hairstyle name", "description": "one short sentence describing the look", "whySuitable": "one short sentence tied to their hair type/concerns" }
  ],
  "recommendedColors": [
    { "name": "short color name", "description": "one short sentence describing the color/placement", "whySuitable": "one short sentence tied to their hair type/concerns" }
  ]
}`;
}

// ── Safety scan (defense in depth — see file header) ──────────────────────

const DIAGNOSTIC_PATTERNS: RegExp[] = [
  /\byou (have|are suffering from|are experiencing|likely have|may have)\s+(alopecia|a fungal infection|a bacterial infection|seborrheic dermatitis|psoriasis|folliculitis|ringworm)\b/i,
  /\bthis (is|appears to be|looks like)\s+(alopecia|a fungal infection|a bacterial infection|seborrheic dermatitis|psoriasis|folliculitis|ringworm)\b/i,
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|bed|bing|ption)\b/i,
];

const PRESCRIPTION_TERMS = ["minoxidil 5%", "finasteride", "clobetasol", "ketoconazole 2%", "corticosteroid"];

function findDisallowedContent(plan: HairPlan): string | null {
  const allText = [
    ...plan.hairGoals,
    ...plan.washDayRoutine.flatMap((s) => [s.step, s.productType, s.why]),
    ...plan.weeklyRoutine.flatMap((s) => [s.step, s.frequency, s.why]),
    ...plan.stylingRecommendations.flatMap((s) => [s.tip, s.why]),
    ...plan.recommendedProducts.flatMap((p) => [p.category, p.productType, p.example, p.why]),
    ...(plan.recommendedHairstyles ?? []).flatMap((h) => [h.name, h.description, h.whySuitable]),
    ...(plan.recommendedColors ?? []).flatMap((c) => [c.name, c.description, c.whySuitable]),
  ].join(" \n ");

  for (const pattern of DIAGNOSTIC_PATTERNS) {
    if (pattern.test(allText)) return `diagnostic-style phrasing matched: ${pattern}`;
  }
  const lower = allText.toLowerCase();
  for (const term of PRESCRIPTION_TERMS) {
    if (lower.includes(term)) return `prescription term found: "${term}"`;
  }
  return null;
}

// ── Validation ─────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateRoutineStep(obj: unknown): HairRoutineStep | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.step) || !isNonEmptyString(o.productType) || !isNonEmptyString(o.why)) return null;
  return { step: o.step, productType: o.productType, why: o.why };
}

function validateWeeklyStep(obj: unknown): HairWeeklyStep | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.step) || !isNonEmptyString(o.frequency) || !isNonEmptyString(o.why)) return null;
  return { step: o.step, frequency: o.frequency, why: o.why };
}

function validateStylingTip(obj: unknown): HairStylingTip | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.tip) || !isNonEmptyString(o.why)) return null;
  return { tip: o.tip, why: o.why };
}

function validateProduct(obj: unknown): HairRecommendedProduct | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.category) || !isNonEmptyString(o.productType) || !isNonEmptyString(o.why)) return null;
  return {
    category: o.category,
    productType: o.productType,
    example: isNonEmptyString(o.example) ? o.example : "",
    why: o.why,
  };
}

function validateHairstyle(obj: unknown): HairstyleRecommendation | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.name) || !isNonEmptyString(o.description) || !isNonEmptyString(o.whySuitable)) return null;
  return { name: o.name, description: o.description, whySuitable: o.whySuitable };
}

function validateColor(obj: unknown): HairColorRecommendation | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.name) || !isNonEmptyString(o.description) || !isNonEmptyString(o.whySuitable)) return null;
  return { name: o.name, description: o.description, whySuitable: o.whySuitable };
}

const MAX_GOALS = 4;
const MAX_ROUTINE_STEPS = 6;
const MAX_WEEKLY_STEPS = 4;
const MAX_STYLING_TIPS = 5;
const MAX_PRODUCTS = 6;
const MAX_HAIRSTYLES = 3;
const MAX_COLORS = 3;

/**
 * Validates and normalizes a raw parsed JSON value into a HairPlan. Throws
 * on structurally invalid or unsafe input — the caller must never save or
 * return a plan when this throws.
 */
export function validateHairPlan(raw: unknown): HairPlan {
  if (!raw || typeof raw !== "object") {
    throw new Error("Hair plan response was not a JSON object");
  }
  const o = raw as Record<string, unknown>;

  if (!Array.isArray(o.hairGoals) || !o.hairGoals.every(isNonEmptyString)) {
    throw new Error("Hair plan missing valid hairGoals");
  }
  if (!Array.isArray(o.washDayRoutine)) {
    throw new Error("Hair plan missing washDayRoutine array");
  }
  if (!Array.isArray(o.weeklyRoutine) || !Array.isArray(o.stylingRecommendations) || !Array.isArray(o.recommendedProducts)) {
    throw new Error("Hair plan missing weeklyRoutine/stylingRecommendations/recommendedProducts arrays");
  }

  const washDayRoutine = o.washDayRoutine.map(validateRoutineStep).filter((s): s is HairRoutineStep => s !== null);
  const weeklyRoutine = o.weeklyRoutine.map(validateWeeklyStep).filter((s): s is HairWeeklyStep => s !== null);
  const stylingRecommendations = o.stylingRecommendations
    .map(validateStylingTip)
    .filter((s): s is HairStylingTip => s !== null);
  const recommendedProducts = o.recommendedProducts.map(validateProduct).filter((p): p is HairRecommendedProduct => p !== null);

  // Additive, best-effort — a malformed/missing array here doesn't fail the
  // whole plan (the routine itself is the load-bearing part).
  const recommendedHairstyles = Array.isArray(o.recommendedHairstyles)
    ? o.recommendedHairstyles.map(validateHairstyle).filter((h): h is HairstyleRecommendation => h !== null)
    : [];
  const recommendedColors = Array.isArray(o.recommendedColors)
    ? o.recommendedColors.map(validateColor).filter((c): c is HairColorRecommendation => c !== null)
    : [];

  if (washDayRoutine.length === 0) {
    throw new Error("Hair plan produced no valid wash-day routine steps");
  }

  const plan: HairPlan = {
    hairGoals: (o.hairGoals as string[]).slice(0, MAX_GOALS),
    washDayRoutine: washDayRoutine.slice(0, MAX_ROUTINE_STEPS),
    weeklyRoutine: weeklyRoutine.slice(0, MAX_WEEKLY_STEPS),
    stylingRecommendations: stylingRecommendations.slice(0, MAX_STYLING_TIPS),
    recommendedProducts: recommendedProducts.slice(0, MAX_PRODUCTS),
    recommendedHairstyles: recommendedHairstyles.slice(0, MAX_HAIRSTYLES),
    recommendedColors: recommendedColors.slice(0, MAX_COLORS),
  };

  const disallowed = findDisallowedContent(plan);
  if (disallowed) {
    throw new Error(`Hair plan rejected by safety validation: ${disallowed}`);
  }

  return plan;
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Generate a hair plan from an intake. Throws on any failure (Claude error,
 * unparseable JSON, structurally invalid JSON, or a plan rejected by the
 * safety scan) — the caller must not save or return a plan when this
 * throws. Text-only: no image, no vision call.
 */
export async function generateHairPlan(intake: HairPlanIntake): Promise<HairPlan> {
  const response = await client.messages.create({
    model: HAIR_PLAN_MODEL,
    max_tokens: 1600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(intake) }],
  });

  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from AI — no text content returned");
  }

  const raw = extractAndParseJson(content.text);
  return validateHairPlan(raw);
}
