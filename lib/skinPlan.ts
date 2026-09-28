/**
 * lib/skinPlan.ts — Skin Glow-Up (Pro/Premium)
 *
 * A short, structured skincare routine generated from a self-reported
 * intake (skin type, 1-3 concerns, budget) — NOT a re-analysis of the
 * user's photo. Deliberately text-only: skin type/concerns are form inputs,
 * not something that needs re-examining an image, which is the single
 * biggest cost lever here (no vision call, no FAL call — see the route for
 * the caching rule that keeps this to one call per intake/refresh).
 *
 * Safety: this is beauty guidance, not a medical tool. The system prompt
 * below forbids diagnosis and prescribing; validateSkinPlan() below adds a
 * second, independent layer — a pattern-based scan that rejects output
 * containing diagnostic phrasing or prescription-drug names outright, so a
 * prompt-injection or model slip doesn't silently reach the user. It is a
 * keyword/pattern net, not a medical classifier — it catches the clear
 * cases (a definitive diagnosis, a named prescription drug), not every
 * possible medical claim, and is not a substitute for the prompt-level
 * instruction being followed in the first place.
 *
 * SERVER-ONLY (Stage 6 Step 8/9 fix): this file instantiates the Anthropic
 * client with ANTHROPIC_API_KEY at module scope. `import "server-only"`
 * below makes any accidental client-bundle import of this exact file fail
 * loudly at build time instead of crashing at runtime in the browser. The
 * shared intake vocabulary/types that a client component legitimately
 * needs (SKIN_TYPES, SKIN_CONCERNS, SkinPlan, etc.) now live in
 * lib/skinPlanShared.ts, which has no SDK import — that's what
 * app/dashboard/skin/page.tsx imports from directly. This file re-exports
 * all of it so existing server-side importers (the API route, tests) are
 * unaffected.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extractAndParseJson } from "./reportValidator";
import {
  SKIN_TYPES,
  SKIN_CONCERNS,
  isValidSkinType,
  isValidSkinConcerns,
  isValidBudget,
  type SkinTypeId,
  type SkinConcernId,
  type SkinPlanIntake,
  type SkinRoutineStep,
  type SkinWeeklyStep,
  type SkinRecommendedProduct,
  type SkinPlan,
} from "./skinPlanShared";

export {
  SKIN_TYPES,
  SKIN_CONCERNS,
  isValidSkinType,
  isValidSkinConcerns,
  isValidBudget,
};
export type {
  SkinTypeId,
  SkinConcernId,
  SkinPlanIntake,
  SkinRoutineStep,
  SkinWeeklyStep,
  SkinRecommendedProduct,
  SkinPlan,
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same cheap/fast model as the free preview analysis (lib/previewAi.ts) —
// this is a short, structured, text-only task, not a full vision analysis.
const SKIN_PLAN_MODEL = process.env.ANTHROPIC_SKIN_PLAN_MODEL || "claude-haiku-4-5";

const BUDGET_LABELS: Record<string, string> = {
  budget: "budget-friendly (drugstore / affordable finds)",
  mid_range: "mid-range (mix of drugstore and mid-tier brands)",
  premium: "premium / luxury (investment-level products)",
};

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a beauty and skincare routine assistant creating a short, practical skincare routine.

CRITICAL SAFETY RULES — follow these exactly:
- You are giving general beauty/skincare routine guidance, NOT a medical diagnosis or medical advice.
- Never diagnose a medical skin condition (e.g. never say a user "has" acne, eczema, rosacea, psoriasis, dermatitis, a fungal or bacterial infection, or any other medical condition).
- Never prescribe or name a specific prescription medication, prescription-strength ingredient, or dosage.
- If a concern sounds like it could be a medical condition rather than a cosmetic one, use cautious, general language ("if this persists or concerns you, a dermatologist can help") and recommend seeing a dermatologist or qualified professional — do not attempt to address it yourself beyond gentle, general skincare habits.
- Only recommend over-the-counter, widely-available product TYPES (e.g. "gentle gel cleanser," "vitamin C serum," "broad-spectrum SPF 30+ moisturizer") — never specific prescription products.

FORMAT RULES:
- Return ONLY valid JSON matching the exact schema given. No markdown, no explanation outside the JSON.
- Be concise. This must be scannable in under a minute — short phrases, not paragraphs.
- Each "why" is ONE short sentence, plain language, no jargon.
- morningRoutine and nightRoutine: 3-5 steps each, in order of application.
- weeklyCare: 1-3 items.
- recommendedProducts: 3-5 items.
- skinGoals: 2-4 short phrases (2-4 words each).`;

function buildUserPrompt(intake: SkinPlanIntake): string {
  const concernLabels = intake.skinConcerns
    .map((id) => SKIN_CONCERNS.find((c) => c.id === id)?.label ?? id)
    .join(", ");
  const skinTypeLabel = SKIN_TYPES.find((t) => t.id === intake.skinType)?.label ?? intake.skinType;
  const budgetLabel = BUDGET_LABELS[intake.budget] ?? intake.budget;

  return `Create a personalized skincare routine for someone with:
- Skin type: ${skinTypeLabel}${intake.skinType === "not_sure" ? " (they aren't sure of their skin type — keep recommendations gentle and broadly suitable rather than assuming)" : ""}
- Main concerns: ${concernLabels}
- Budget: ${budgetLabel}

Return a JSON object with this exact structure:
{
  "skinGoals": ["short goal phrase", "short goal phrase"],
  "morningRoutine": [
    { "step": "Cleanser", "productType": "gentle gel cleanser", "why": "one short sentence" }
  ],
  "nightRoutine": [
    { "step": "Cleanser", "productType": "...", "why": "..." }
  ],
  "weeklyCare": [
    { "step": "Exfoliation", "frequency": "2x/week", "why": "..." }
  ],
  "recommendedProducts": [
    { "category": "Cleanser", "productType": "gentle gel cleanser", "example": "a recognizable, widely-available example if one fits naturally, otherwise leave empty", "why": "..." }
  ]
}`;
}

// ── Safety scan (defense in depth — see file header) ──────────────────────

const DIAGNOSTIC_PATTERNS: RegExp[] = [
  /\byou (have|are suffering from|are experiencing|likely have|may have)\s+(rosacea|eczema|psoriasis|dermatitis|folliculitis|a fungal infection|a bacterial infection|cystic acne|hormonal acne|melasma)\b/i,
  /\bthis (is|appears to be|looks like)\s+(rosacea|eczema|psoriasis|dermatitis|a fungal infection|a bacterial infection|melasma)\b/i,
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|bed|bing|ption)\b/i,
];

// Prescription-only drug/ingredient names — never appropriate in an
// over-the-counter routine recommendation.
const PRESCRIPTION_TERMS = [
  "tretinoin",
  "isotretinoin",
  "accutane",
  "spironolactone",
  "clindamycin",
  "doxycycline",
  "minocycline",
  "hydrocortisone",
  "betamethasone",
  "hydroquinone 4%",
];

function findDisallowedContent(plan: SkinPlan): string | null {
  const allText = [
    ...plan.skinGoals,
    ...plan.morningRoutine.flatMap((s) => [s.step, s.productType, s.why]),
    ...plan.nightRoutine.flatMap((s) => [s.step, s.productType, s.why]),
    ...plan.weeklyCare.flatMap((s) => [s.step, s.frequency, s.why]),
    ...plan.recommendedProducts.flatMap((p) => [p.category, p.productType, p.example, p.why]),
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

function validateRoutineStep(obj: unknown): SkinRoutineStep | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.step) || !isNonEmptyString(o.productType) || !isNonEmptyString(o.why)) return null;
  return { step: o.step, productType: o.productType, why: o.why };
}

function validateWeeklyStep(obj: unknown): SkinWeeklyStep | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!isNonEmptyString(o.step) || !isNonEmptyString(o.frequency) || !isNonEmptyString(o.why)) return null;
  return { step: o.step, frequency: o.frequency, why: o.why };
}

function validateProduct(obj: unknown): SkinRecommendedProduct | null {
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

// Caps — "keep the number of routine steps reasonable" enforced structurally,
// not just requested in the prompt.
const MAX_GOALS = 4;
const MAX_ROUTINE_STEPS = 6;
const MAX_WEEKLY_STEPS = 4;
const MAX_PRODUCTS = 6;

/**
 * Validates and normalizes a raw parsed JSON value into a SkinPlan.
 * Throws with a descriptive message on structurally invalid input — the
 * caller (generateSkinPlan) is responsible for treating that as a failed
 * generation, never for saving or returning a malformed/unsafe plan.
 */
export function validateSkinPlan(raw: unknown): SkinPlan {
  if (!raw || typeof raw !== "object") {
    throw new Error("Skin plan response was not a JSON object");
  }
  const o = raw as Record<string, unknown>;

  if (!Array.isArray(o.skinGoals) || !o.skinGoals.every(isNonEmptyString)) {
    throw new Error("Skin plan missing valid skinGoals");
  }
  if (!Array.isArray(o.morningRoutine) || !Array.isArray(o.nightRoutine)) {
    throw new Error("Skin plan missing morningRoutine/nightRoutine arrays");
  }
  if (!Array.isArray(o.weeklyCare) || !Array.isArray(o.recommendedProducts)) {
    throw new Error("Skin plan missing weeklyCare/recommendedProducts arrays");
  }

  const morningRoutine = o.morningRoutine.map(validateRoutineStep).filter((s): s is SkinRoutineStep => s !== null);
  const nightRoutine = o.nightRoutine.map(validateRoutineStep).filter((s): s is SkinRoutineStep => s !== null);
  const weeklyCare = o.weeklyCare.map(validateWeeklyStep).filter((s): s is SkinWeeklyStep => s !== null);
  const recommendedProducts = o.recommendedProducts.map(validateProduct).filter((p): p is SkinRecommendedProduct => p !== null);

  if (morningRoutine.length === 0 || nightRoutine.length === 0) {
    throw new Error("Skin plan produced no valid morning/night routine steps");
  }

  const plan: SkinPlan = {
    skinGoals: (o.skinGoals as string[]).slice(0, MAX_GOALS),
    morningRoutine: morningRoutine.slice(0, MAX_ROUTINE_STEPS),
    nightRoutine: nightRoutine.slice(0, MAX_ROUTINE_STEPS),
    weeklyCare: weeklyCare.slice(0, MAX_WEEKLY_STEPS),
    recommendedProducts: recommendedProducts.slice(0, MAX_PRODUCTS),
  };

  const disallowed = findDisallowedContent(plan);
  if (disallowed) {
    throw new Error(`Skin plan rejected by safety validation: ${disallowed}`);
  }

  return plan;
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Generate a skin plan from an intake. Throws on any failure (Claude error,
 * unparseable JSON, structurally invalid JSON, or a plan rejected by the
 * safety scan) — the caller must not save or return a plan when this
 * throws. Text-only: no image, no vision call.
 */
export async function generateSkinPlan(intake: SkinPlanIntake): Promise<SkinPlan> {
  const response = await client.messages.create({
    model: SKIN_PLAN_MODEL,
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(intake) }],
  });

  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from AI — no text content returned");
  }

  const raw = extractAndParseJson(content.text);
  return validateSkinPlan(raw);
}
