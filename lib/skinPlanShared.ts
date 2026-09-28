/**
 * lib/skinPlanShared.ts — client-safe types/constants for Skin Glow-Up.
 *
 * Split out of lib/skinPlan.ts (Stage 6 Step 8/9 fix) specifically so
 * client components — the intake form on app/dashboard/skin/page.tsx —
 * can import the shared vocabulary (SKIN_TYPES, SKIN_CONCERNS) and types
 * WITHOUT pulling in lib/skinPlan.ts's Anthropic client instantiation.
 *
 * Root cause this fixes: importing ANY value export from a module executes
 * that module's entire top-level code, not just the imported binding. The
 * intake form only ever needed SKIN_TYPES/SKIN_CONCERNS (plain data), but
 * because those lived in the same file as `const client = new
 * Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`, importing them
 * from a "use client" page forced that line into the browser bundle too —
 * which the Anthropic SDK itself refuses to run in a browser (by design,
 * to prevent API key exposure) unless dangerouslyAllowBrowser is set,
 * which must never happen here.
 *
 * This file has no SDK import and reads no secret — safe on either side of
 * the server/client boundary. lib/skinPlan.ts re-exports everything below
 * so existing server-side imports (the API route, tests) are unaffected.
 */

// ── Intake vocabulary ──────────────────────────────────────────────────────

export const SKIN_TYPES = [
  { id: "oily", label: "Oily" },
  { id: "dry", label: "Dry" },
  { id: "combination", label: "Combination" },
  { id: "normal", label: "Normal" },
  { id: "sensitive", label: "Sensitive" },
  { id: "not_sure", label: "Not sure" },
] as const;
export type SkinTypeId = (typeof SKIN_TYPES)[number]["id"];

export const SKIN_CONCERNS = [
  { id: "dryness", label: "Dryness" },
  { id: "oiliness", label: "Oiliness" },
  { id: "acne_prone", label: "Acne-prone appearance" },
  { id: "uneven_tone", label: "Uneven-looking tone" },
  { id: "dullness", label: "Dullness" },
  { id: "texture", label: "Texture" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "dark_spots", label: "Dark spots / appearance of discoloration" },
  { id: "fine_lines", label: "Fine lines" },
  { id: "hydration", label: "Hydration" },
] as const;
export type SkinConcernId = (typeof SKIN_CONCERNS)[number]["id"];

const SKIN_TYPE_IDS = new Set<string>(SKIN_TYPES.map((t) => t.id));
const SKIN_CONCERN_IDS = new Set<string>(SKIN_CONCERNS.map((c) => c.id));

export function isValidSkinType(v: unknown): v is SkinTypeId {
  return typeof v === "string" && SKIN_TYPE_IDS.has(v);
}

export function isValidSkinConcerns(v: unknown): v is SkinConcernId[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 3 &&
    v.every((c) => typeof c === "string" && SKIN_CONCERN_IDS.has(c))
  );
}

// Same vocabulary as the existing onboarding wizard's BUDGETS list
// (app/onboarding/page.tsx) and BeautyProfile.budget — reused, not
// reinvented, so the two flows never disagree.
export function isValidBudget(v: unknown): v is "budget" | "mid_range" | "premium" {
  return v === "budget" || v === "mid_range" || v === "premium";
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkinPlanIntake {
  skinType: SkinTypeId;
  skinConcerns: SkinConcernId[];
  budget: string; // "budget" | "mid_range" | "premium" — same vocabulary as BeautyProfile.budget
}

export interface SkinRoutineStep {
  step: string;
  productType: string;
  why: string;
}

export interface SkinWeeklyStep {
  step: string;
  frequency: string;
  why: string;
}

export interface SkinRecommendedProduct {
  category: string;
  productType: string;
  example: string;
  why: string;
}

export interface SkinPlan {
  skinGoals: string[];
  morningRoutine: SkinRoutineStep[];
  nightRoutine: SkinRoutineStep[];
  weeklyCare: SkinWeeklyStep[];
  recommendedProducts: SkinRecommendedProduct[];
}
