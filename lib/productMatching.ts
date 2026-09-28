/**
 * lib/productMatching.ts — deterministic product-recommendation matching.
 *
 * Pure function, no I/O: no database writes, no AI calls, no Stripe calls,
 * no external network calls. Everything it needs (the color/category
 * targets, the catalog, the budget preference) is passed in as plain data,
 * and its output is reproducible for the same inputs — this is deliberate
 * per the approved architecture: recommendations must be explainable and
 * reproducible, not another AI call layered on top of the existing one.
 *
 * Pipeline (see the approved Stage 5A architecture for the full rationale):
 *   1. Category filter (hard)   — cheeks→blush, eyes→eyeshadow(-palette), lips→lipstick/gloss
 *   2. Undertone filter (hard-ish) — reuses the same warm/cool/neutral family
 *      logic already governing image generation (lib/makeupPlan.ts's
 *      colorFamilyLock), read off MakeupPlan.colorFamilyRule rather than
 *      re-deriving it a second way
 *   3. Color similarity (primary soft signal) — CIE76 Delta-E in LAB space,
 *      computed at runtime from stored hex; LAB is never persisted
 *   4. Shade-name fallback (lower confidence) — only when a product has no
 *      hex; matches against shadeName AND tags (real, sourced descriptive
 *      words — see Stage 5A.1), since many real shade names are proper
 *      nouns ("Embark") with no color word in them at all
 *   5. Individual-shade tier bonus (Stage 5A.1) — a small nudge so
 *      individual shades (Product.category === "eyeshadow") generally
 *      surface above palettes (category === "eyeshadow-palette") for the
 *      same recommendation, without an absolute rule — a palette with
 *      genuinely strong, well-documented pan-level tags can still outrank
 *      a weak individual match
 *   6. Finish (minor soft signal) — opportunistic keyword match, no schema
 *      column for it; never a hard exclusion
 *   7. Budget (minor soft signal) — a preference, never overrides a
 *      dramatically better color match
 */

import type { Product } from "@prisma/client";
import type { MakeupPlan } from "./makeupPlan";

// ── Public types ────────────────────────────────────────────────────────────

export type ShoppableCategory = "cheeks" | "eyes" | "lips";
export type BudgetTier = "budget" | "mid_range" | "premium";
export type MatchConfidence = "color" | "shade-name";
export type ProductType = "individual" | "palette";

export interface ProductMatch {
  product: Product;
  confidence: MatchConfidence;
  productType: ProductType;
}

export interface CategoryMatchResult {
  category: ShoppableCategory;
  recommendedColorName: string;
  recommendedHex: string;
  matches: ProductMatch[];
}

// ── Category mapping ─────────────────────────────────────────────────────────
// "lips" intentionally maps to two Product.category values (lipstick AND lip
// gloss) — both are genuinely lip products fulfilling the same recommendation,
// unlike cheeks/eyes which have no ambiguous sub-category in this catalog.
// This is still a hard filter: an eyeshadow can never appear for "cheeks",
// matching the "no category mismatch" requirement.

const CATEGORY_MAP: Record<ShoppableCategory, string[]> = {
  cheeks: ["blush"],
  eyes: ["eyeshadow", "eyeshadow-palette"],
  lips: ["lipstick", "lip gloss"],
};

/** "eyeshadow-palette" is the only palette-type category today. */
function productType(category: string): ProductType {
  return category.endsWith("-palette") ? "palette" : "individual";
}

// ── Undertone ────────────────────────────────────────────────────────────────

type Undertone = "warm" | "cool" | "neutral";

/**
 * Reuses lib/makeupPlan.ts's existing colorFamilyLock() output rather than
 * re-deriving warm/cool/neutral a second way. colorFamilyRule has exactly
 * three possible values (it's a pure function of GlamPreview.colorDirection),
 * so matching on its fixed prefix is reliable, unlike parsing free-form AI text.
 */
function planUndertone(plan: MakeupPlan): Undertone {
  if (plan.colorFamilyRule.includes("WARM TONES")) return "warm";
  if (plan.colorFamilyRule.includes("COOL TONES")) return "cool";
  return "neutral";
}

const OPPOSITE: Record<Undertone, Undertone> = { warm: "cool", cool: "warm", neutral: "neutral" };

/** Only the directly opposite undertone is excluded — "universal" and unset always pass. */
function undertoneCompatible(target: Undertone, productUndertone: string | null): boolean {
  if (!productUndertone) return true; // unclear — not enough info to exclude
  if (productUndertone === "universal") return true;
  return productUndertone !== OPPOSITE[target];
}

// ── Color distance: hex → LAB → Delta-E76 ───────────────────────────────────
// Stored as hex everywhere in this app already (BeautyPalette, MakeupPlan).
// LAB is computed here at runtime and never persisted — see architecture §5.

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// sRGB (D65) → XYZ → CIE L*a*b*, standard reference-white formulas.
function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const [rl, gl, bl] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];

  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;

  // D65 reference white
  const [xn, yn, zn] = [0.95047, 1.0, 1.08883];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x / xn), f(y / yn), f(z / zn)];

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToLab(rgb) : null;
}

/** CIE76 Delta-E — plain Euclidean distance in LAB space. Deliberately not
 * CIEDE2000 (more accurate but materially more complex) — over-engineering
 * for a catalog of this size, per the approved architecture §5. */
export function deltaE76(hexA: string, hexB: string): number | null {
  const labA = hexToLab(hexA);
  const labB = hexToLab(hexB);
  if (!labA || !labB) return null;
  const [l1, a1, b1] = labA;
  const [l2, a2, b2] = labB;
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// ── Shade-name fallback (only used when a product has no hex) ──────────────
// A small, explicit, deterministic synonym table — not a second AI call.

// Pure temperature/undertone words carry no color-FAMILY information on
// their own, and are already handled by the separate hard undertone filter
// — nearly every warm-toned product's description includes "warm"
// somewhere, so counting it as a text-match signal made an unrelated
// warm-bronze product tie with a genuinely cocoa-toned one.
const GENERIC_MODIFIER_WORDS = new Set(["warm", "cool", "neutral"]);

// Tight families: real, narrow color-family groupings (a match here is
// strong evidence of the same color, not just "also brownish"), plus two
// intensity-descriptor families — this catalog deliberately includes
// adjacent pairs distinguished mainly by depth ("Rich Cocoa" vs. "Warm
// Cocoa", "Deep Warm Brown" vs. "Warm Neutral Brown"), so intensity words
// carry real signal here, unlike the temperature words above.
const COLOR_FAMILY_GROUPS: string[][] = [
  ["peach", "apricot", "coral", "terracotta"],
  ["caramel", "toffee", "honey", "butterscotch"],
  ["cocoa", "chocolate", "espresso", "mocha"],
  ["bronze", "copper"],
  ["golden", "gold", "amber"],
  ["berry", "wine", "plum", "burgundy"],
  ["rose", "mauve", "pink"],
  ["nude", "beige", "sand"],
  ["taupe", "taupaz"],
];

// Intensity/depth descriptors, kept separate from color-family groups above.
// On their own these carry no color information at all — "deep" describes
// Urban Decay Ember (copper) exactly as well as it describes a cocoa shade,
// so an intensity-only match must never qualify as color-relevance evidence.
// They only amplify a match that already has real color-family agreement
// (see synonymBonus) — e.g. distinguishing "Rich Cocoa" from "Warm Cocoa"
// between two shades that both already agree on the cocoa family.
const INTENSITY_GROUPS: string[][] = [
  ["rich", "intense", "deep"],
  ["soft", "light", "muted"],
];

// A wider fallback net for genuinely generic brown/neutral words that don't
// belong to any single tight family above. Deliberately excludes bronze,
// copper, and taupe — those already have their own tight groups, and are
// perceptually distinct enough (metallic copper, gray-toned taupe) that they
// must not get free "also basically brown" credit against an unrelated
// query like "cocoa" — that was previously letting Urban Decay Ember
// (copper) and Stila Taupaz (taupe) falsely qualify for "Rich Cocoa."
const BROAD_BROWN_FAMILY = [
  "brown", "cocoa", "chocolate", "espresso", "mocha",
  "caramel", "toffee", "honey", "golden", "gold", "amber", "tan", "beige",
];

function shadeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0 && !GENERIC_MODIFIER_WORDS.has(w));
}

/** Simple prefix-based stemming (no real stemmer dependency) — catches
 * "peach"/"peachy", "berry"/"berries", etc. without a fabricated NLP layer. */
function wordsRelated(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function inGroup(words: string[], group: string[]): boolean {
  return words.some((w) => group.some((g) => wordsRelated(w, g)));
}

/**
 * Requires genuine color agreement first — either a tight color-family match
 * (e.g. both sides land in the cocoa/chocolate/espresso group) or, weaker,
 * both sides merely being somewhere in the broad warm-brown spectrum. Only
 * once *some* color agreement is established does an additional
 * intensity-family match (both also agreeing on "rich"/"deep"-ish or "soft"/
 * "muted"-ish) add an amplifying bonus — real signal for telling "Rich
 * Cocoa" apart from "Warm Cocoa," or letting MAC Embark ("intense reddish
 * brown" — brown only reaches the broad tier, not the cocoa tight group)
 * still surface for "Deep Warm Brown" once its intensity word ("intense")
 * agrees too. An intensity-only match with zero color agreement of either
 * kind is deliberately worth nothing — Urban Decay "Ember" (deep copper)
 * and Stila "Taupaz" (deep taupe) both include "deep," which must never
 * make them look like cocoa or brown matches (copper/taupe are deliberately
 * excluded from the broad tier below for exactly this reason).
 */
function synonymBonus(wordsA: string[], wordsB: string[]): number {
  let colorBonus = 0;
  for (const group of COLOR_FAMILY_GROUPS) {
    if (inGroup(wordsA, group) && inGroup(wordsB, group)) colorBonus += 0.4;
  }
  // Deliberately weak: this catalog is heavily warm-brown-weighted, so
  // "also somewhere in the broad brown spectrum" is true of almost every
  // product — on its own this must never be strong enough to make an
  // only-vaguely-related product look like a real match.
  const broadMatch = inGroup(wordsA, BROAD_BROWN_FAMILY) && inGroup(wordsB, BROAD_BROWN_FAMILY);
  if (colorBonus === 0 && !broadMatch) return 0;
  const base = colorBonus > 0 ? colorBonus : 0.08;

  let intensityBonus = 0;
  for (const group of INTENSITY_GROUPS) {
    if (inGroup(wordsA, group) && inGroup(wordsB, group)) intensityBonus += 0.3;
  }
  return Math.min(0.7, base + intensityBonus);
}

/** 0..1 — direct word overlap (with light stemming) plus a synonym-family bonus. */
function wordListScore(targetWords: string[], candidateWords: string[]): number {
  if (targetWords.length === 0 || candidateWords.length === 0) return 0;
  const overlap = targetWords.filter((w) => candidateWords.some((cw) => wordsRelated(w, cw))).length;
  const directScore = overlap / targetWords.length;
  return Math.min(1, directScore + synonymBonus(targetWords, candidateWords));
}

/** Parses Product.tags (a nullable JSON string array) defensively — malformed/absent tags just yield []. */
function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 0..1 — matches the target color name against the product's shadeName and
 * its tags (real, sourced descriptive words — see Stage 5A.1) *separately*,
 * then takes the stronger of the two, weighting a hit in the product's own
 * name above one only found in an auxiliary tag. This matters concretely:
 * "Shell Peach" (shadeName itself says "Peach") is a more central match for
 * a "Warm Peach" recommendation than "Soft Brown" (whose real description
 * happens to also say "peachy-brown" as one word among several) — without
 * this distinction the two score identically and the tie is decided by
 * array order, which isn't a real signal.
 *
 * Tags exist at all because many real shade names are proper nouns
 * ("Embark", "DGAF") or a palette's generic label ("Warm", "Toasted") with
 * no color word in them whatsoever — shadeName alone would score these as
 * zero despite genuinely matching, documented color descriptions.
 */
function shadeNameSimilarity(targetColorName: string, product: Product): number {
  const target = shadeWords(targetColorName);
  if (target.length === 0) return 0;

  const nameWords = shadeWords(product.shadeName);
  const tagWords = parseTags(product.tags).flatMap(shadeWords);

  const nameScore = wordListScore(target, nameWords);
  const tagScore = wordListScore(target, tagWords) * 0.7;
  return Math.max(nameScore, tagScore);
}

// ── Finish (opportunistic — no dedicated Product column) ───────────────────

const FINISH_KEYWORDS = ["matte", "dewy", "satin", "shimmer", "gloss", "cream", "liquid", "powder"];

function inferFinishWords(text: string): Set<string> {
  const lower = text.toLowerCase();
  return new Set(FINISH_KEYWORDS.filter((k) => lower.includes(k)));
}

/** Small bonus only when both sides mention a finish keyword and they agree. Never a penalty. */
function finishBonus(planText: string, product: Product): number {
  const planFinishes = inferFinishWords(planText);
  const productFinishes = inferFinishWords(`${product.name} ${product.shadeName} ${product.tags ?? ""}`);
  if (planFinishes.size === 0 || productFinishes.size === 0) return 0;
  const overlaps = [...planFinishes].some((f) => productFinishes.has(f));
  return overlaps ? 1 : 0;
}

// ── Budget ───────────────────────────────────────────────────────────────────
// Simple, tunable price breakpoints — a reasonable MVP heuristic across this
// catalog's real brands (drugstore ~$6-12, mid ~$14-32, prestige ~$38+),
// not a precise category-calibrated model.

const BUDGET_CENTS_MAX = 1500; // <$15
const MID_RANGE_CENTS_MAX = 3500; // $15-$35, >$35 = premium

function priceTier(priceCents: number): BudgetTier {
  if (priceCents < BUDGET_CENTS_MAX) return "budget";
  if (priceCents < MID_RANGE_CENTS_MAX) return "mid_range";
  return "premium";
}

// ── Scoring weights ──────────────────────────────────────────────────────────
// Color leads by a wide margin — finish/budget are nudges, never able to
// overturn a dramatically better color match. See Test H in the test suite.

const WEIGHT_COLOR = 1.0;
const WEIGHT_SHADE_NAME_SCALE = 0.6; // no-hex fallback capped below strong hex matches
const WEIGHT_FINISH_BONUS = 0.05;
const WEIGHT_BUDGET_BONUS = 0.15;
// A meaningful structural edge, not an absolute rule — operationalizes the
// explicit Stage 5A.1 instruction to prioritize individual shades over
// palettes. A palette with a strong enough documented tag match can still
// outrank a weakly-matched individual, but this is large enough that two
// comparably-matched candidates resolve in the individual's favor.
const WEIGHT_INDIVIDUAL_TIER_BONUS = 0.2;

// Below this COLOR-RELEVANCE score, a product is excluded outright — before
// any finish/budget/tier bonus is even added. This must gate on color
// relevance alone: bonuses are for ranking among already-qualified
// candidates, never a backdoor that lets an only-vaguely-related product
// (e.g. something that merely shares the broad warm-brown spectrum) buy
// its way past the filter on the strength of the individual-shade tier
// bonus alone. See Test J / Test 15 ("never force a match that isn't
// genuinely there").
//
// Two separate thresholds, because the hex/LAB path and the shade-name/tag
// fallback path produce colorScore on genuinely different scales and a
// single shared cutoff can't be right for both:
//   - MIN_HEX_COLOR_THRESHOLD gates the hex/LAB path (0..1, uncapped by
//     WEIGHT_SHADE_NAME_SCALE). 0.5 corresponds to a CIE76 Delta-E of 50 —
//     real intended matches in this catalog sit under dE 20 (colorScore
//     >0.8); dE 50+ is a genuinely distant color that must not pass.
//   - MIN_SHADE_NAME_THRESHOLD gates the fallback path, whose raw score is
//     scaled down by WEIGHT_SHADE_NAME_SCALE (0.6) before comparison — the
//     real catalog has zero hex on any product today (Stage 5A.1 finding —
//     no source publishes it), so every real match goes through this lower
//     ceiling, not the hex path.
const MIN_HEX_COLOR_THRESHOLD = 0.5;
const MIN_SHADE_NAME_THRESHOLD = 0.15;
const MAX_RESULTS_PER_CATEGORY = 3;

interface ScoredProduct {
  product: Product;
  colorScore: number;
  finalScore: number;
  confidence: MatchConfidence;
  type: ProductType;
}

function scoreProduct(
  category: ShoppableCategory,
  product: Product,
  recommendedHex: string,
  recommendedColorName: string,
  planFinishText: string,
  budget: BudgetTier | null | undefined
): ScoredProduct {
  let colorScore: number;
  let confidence: MatchConfidence;

  if (product.hex) {
    const dE = deltaE76(recommendedHex, product.hex);
    // dE76 of ~0 is identical; ~100 is a maximally different color in LAB
    // space for realistic makeup shades — clamp to a 0..1 similarity score.
    colorScore = dE !== null ? Math.max(0, (100 - dE) / 100) * WEIGHT_COLOR : 0;
    confidence = "color";
  } else {
    colorScore = shadeNameSimilarity(recommendedColorName, product) * WEIGHT_SHADE_NAME_SCALE;
    confidence = "shade-name";
  }

  const finish = finishBonus(planFinishText, product) * WEIGHT_FINISH_BONUS;
  const budgetMatch = budget && priceTier(product.priceCents) === budget ? WEIGHT_BUDGET_BONUS : 0;
  const type = productType(product.category);
  // The individual/palette distinction only exists for "eyes" today —
  // applying it elsewhere would just shift ranking for categories where
  // "palette" has no meaning at all.
  const tierBonus = category === "eyes" && type === "individual" ? WEIGHT_INDIVIDUAL_TIER_BONUS : 0;

  return {
    product,
    colorScore,
    finalScore: colorScore + finish + budgetMatch + tierBonus,
    confidence,
    type,
  };
}

function rankCategory(
  category: ShoppableCategory,
  recommendedHex: string,
  recommendedColorName: string,
  planFinishText: string,
  catalog: Product[],
  undertone: Undertone,
  budget: BudgetTier | null | undefined
): CategoryMatchResult {
  const allowedCategories = CATEGORY_MAP[category];

  const candidates = catalog.filter(
    (p) => p.active && allowedCategories.includes(p.category) && undertoneCompatible(undertone, p.undertone)
  );

  const scored = candidates
    .map((p) => scoreProduct(category, p, recommendedHex, recommendedColorName, planFinishText, budget))
    .filter((s) => s.colorScore >= (s.confidence === "color" ? MIN_HEX_COLOR_THRESHOLD : MIN_SHADE_NAME_THRESHOLD))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, MAX_RESULTS_PER_CATEGORY);

  return {
    category,
    recommendedColorName,
    recommendedHex,
    matches: scored.map((s) => ({ product: s.product, confidence: s.confidence, productType: s.type })),
  };
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Match a MakeupPlan's cheeks/eyes/lips color targets against a product
 * catalog. Pure, deterministic, synchronous — no I/O of any kind.
 *
 * "eyes" is matched against eyeshadow.lid (the plan's "main, most
 * concentrated eye color" per buildMakeupPlan's own doc comment) rather
 * than the softer transition shade, mirroring how each other category has
 * exactly one target color.
 */
export function matchProducts(
  plan: MakeupPlan,
  catalog: Product[],
  budget?: BudgetTier | null
): CategoryMatchResult[] {
  const undertone = planUndertone(plan);

  return [
    rankCategory("cheeks", plan.blush.hex, plan.blush.colorName, plan.blush.intensity, catalog, undertone, budget),
    rankCategory(
      "eyes",
      plan.eyeshadow.lid.hex,
      plan.eyeshadow.lid.colorName,
      plan.eyeshadow.technique,
      catalog,
      undertone,
      budget
    ),
    rankCategory("lips", plan.lips.hex, plan.lips.colorName, plan.lips.finish, catalog, undertone, budget),
  ];
}
