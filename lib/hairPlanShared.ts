/**
 * lib/hairPlanShared.ts — client-safe types/constants for Hair Glow-Up.
 *
 * Mirrors lib/skinPlanShared.ts exactly — see that file for the full
 * root-cause explanation (Stage 6 Step 8/9 fix). Split out of
 * lib/hairPlan.ts so app/dashboard/hair/page.tsx (a client component) can
 * import HAIR_TYPES/HAIR_CONCERNS without pulling in lib/hairPlan.ts's
 * Anthropic client instantiation into the browser bundle.
 */

// ── Intake vocabulary ──────────────────────────────────────────────────────

export const HAIR_TYPES = [
  { id: "straight", label: "Straight" },
  { id: "wavy", label: "Wavy" },
  { id: "curly", label: "Curly" },
  { id: "coily", label: "Coily" },
  { id: "not_sure", label: "Not sure" },
] as const;
export type HairTypeId = (typeof HAIR_TYPES)[number]["id"];

export const HAIR_CONCERNS = [
  { id: "dryness", label: "Dryness" },
  { id: "frizz", label: "Frizz" },
  { id: "breakage", label: "Breakage / damage" },
  { id: "thinning", label: "Thinning-looking" },
  { id: "oiliness", label: "Oiliness" },
  { id: "dullness", label: "Dullness (lack of shine)" },
  { id: "volume", label: "Lack of volume" },
  { id: "flaky_scalp", label: "Flaky-looking scalp" },
  { id: "split_ends", label: "Split ends" },
  { id: "color_treated", label: "Color-treated care" },
] as const;
export type HairConcernId = (typeof HAIR_CONCERNS)[number]["id"];

const HAIR_TYPE_IDS = new Set<string>(HAIR_TYPES.map((t) => t.id));
const HAIR_CONCERN_IDS = new Set<string>(HAIR_CONCERNS.map((c) => c.id));

export function isValidHairType(v: unknown): v is HairTypeId {
  return typeof v === "string" && HAIR_TYPE_IDS.has(v);
}

export function isValidHairConcerns(v: unknown): v is HairConcernId[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 3 &&
    v.every((c) => typeof c === "string" && HAIR_CONCERN_IDS.has(c))
  );
}

// Same vocabulary as BeautyProfile.budget / the onboarding wizard / Skin
// Glow-Up — reused, not reinvented.
export function isValidBudget(v: unknown): v is "budget" | "mid_range" | "premium" {
  return v === "budget" || v === "mid_range" || v === "premium";
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface HairPlanIntake {
  hairType: HairTypeId;
  hairConcerns: HairConcernId[];
  budget: string;
}

export interface HairRoutineStep {
  step: string;
  productType: string;
  why: string;
}

export interface HairWeeklyStep {
  step: string;
  frequency: string;
  why: string;
}

export interface HairStylingTip {
  tip: string;
  why: string;
}

export interface HairRecommendedProduct {
  category: string;
  productType: string;
  example: string;
  why: string;
}

export interface HairstyleRecommendation {
  name: string;
  description: string;
  whySuitable: string;
}

export interface HairColorRecommendation {
  name: string;
  description: string;
  whySuitable: string;
}

export interface HairPlan {
  hairGoals: string[];
  washDayRoutine: HairRoutineStep[];
  weeklyRoutine: HairWeeklyStep[];
  stylingRecommendations: HairStylingTip[];
  recommendedProducts: HairRecommendedProduct[];
  // Additive — absent on plans generated/cached before this field existed
  // (BeautyProfile.hairPlan is stored as raw JSON, so an older cached plan
  // simply has no hairstyle/color recommendations until the user refreshes).
  recommendedHairstyles?: HairstyleRecommendation[];
  recommendedColors?: HairColorRecommendation[];
}
