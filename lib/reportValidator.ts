/**
 * GlamReport structural validator.
 *
 * Validates that the AI response has the required shape before
 * we return it to the frontend. Returns a cleaned, type-safe object
 * or throws with a descriptive message.
 */

import type {
  GlamReport,
  RecommendationItem,
  StyleDirection,
  GlowUpPriority,
  QuickPlan,
  FeatureEnhancement,
  FaceRegionKey,
} from "./types";

const VALID_FACE_REGIONS: FaceRegionKey[] = ["eyes", "brows", "lips", "cheeks", "jawline", "forehead"];

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateRecommendationItem(obj: unknown, path: string): RecommendationItem {
  if (!obj || typeof obj !== "object") {
    throw new Error(`${path}: expected object, got ${typeof obj}`);
  }
  const o = obj as Record<string, unknown>;
  if (!isString(o.title)) throw new Error(`${path}.title: missing or empty`);
  if (!isString(o.recommendation)) throw new Error(`${path}.recommendation: missing or empty`);
  if (!isString(o.why)) throw new Error(`${path}.why: missing or empty`);

  const products = Array.isArray(o.products)
    ? (o.products as unknown[]).filter((p): p is string => typeof p === "string")
    : [];

  return {
    title: o.title,
    recommendation: o.recommendation,
    why: o.why,
    products,
  };
}

function validateStyleDirection(obj: unknown, index: number): StyleDirection {
  if (!obj || typeof obj !== "object") {
    throw new Error(`style[${index}]: expected object`);
  }
  const o = obj as Record<string, unknown>;
  if (!isString(o.name)) throw new Error(`style[${index}].name: missing`);
  if (!isString(o.description)) throw new Error(`style[${index}].description: missing`);
  const keyPieces = Array.isArray(o.keyPieces)
    ? (o.keyPieces as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  return { name: o.name, description: o.description, keyPieces };
}

function validatePriority(obj: unknown, index: number): GlowUpPriority {
  if (!obj || typeof obj !== "object") {
    throw new Error(`priorities[${index}]: expected object`);
  }
  const o = obj as Record<string, unknown>;
  const rank = typeof o.rank === "number" ? o.rank : index + 1;
  if (!isString(o.title)) throw new Error(`priorities[${index}].title: missing`);
  if (!isString(o.description)) throw new Error(`priorities[${index}].description: missing`);
  const impact = ["high", "medium", "low"].includes(o.impact as string)
    ? (o.impact as "high" | "medium" | "low")
    : "medium";
  return { rank, title: o.title, description: o.description, impact };
}

// ─────────────────────────────────────────────────────────────────────────────
// aestheticIdentity / featureEnhancements — additive fields (see lib/types.ts).
// Unlike the fields above, these fail SAFELY rather than throwing: a
// malformed or missing value here degrades to null/[] with a server-side
// warning instead of failing the entire report. These fields aren't
// rendered by any live UI yet, so there's no reason a formatting slip in
// them should block the $4.99 product's core deliverable (the report the
// rest of this file already validates strictly).
// ─────────────────────────────────────────────────────────────────────────────

function validateAestheticIdentity(raw: unknown): StyleDirection | null {
  try {
    return validateStyleDirection(raw, -1);
  } catch (err) {
    console.warn(
      "[reportValidator] aestheticIdentity: malformed, defaulting to null —",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function validateFeatureEnhancement(obj: unknown): FeatureEnhancement | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const region = VALID_FACE_REGIONS.includes(o.region as FaceRegionKey) ? (o.region as FaceRegionKey) : null;
  if (!region || !isString(o.title) || !isString(o.recommendation) || !isString(o.why)) {
    return null;
  }

  const products = Array.isArray(o.products)
    ? (o.products as unknown[]).filter((p): p is string => typeof p === "string")
    : [];

  return { region, title: o.title, recommendation: o.recommendation, why: o.why, products };
}

function validateFeatureEnhancements(raw: unknown): FeatureEnhancement[] {
  if (!Array.isArray(raw)) {
    console.warn("[reportValidator] featureEnhancements: missing or not an array, defaulting to []");
    return [];
  }
  const items = raw as unknown[];
  const cleaned = items
    .map((item) => validateFeatureEnhancement(item))
    .filter((x): x is FeatureEnhancement => x !== null);

  if (cleaned.length !== items.length) {
    console.warn(
      `[reportValidator] featureEnhancements: dropped ${items.length - cleaned.length} malformed item(s)`
    );
  }
  return cleaned;
}

function validateQuickPlan(obj: unknown): QuickPlan {
  if (!obj || typeof obj !== "object") {
    throw new Error("quickPlan: expected object");
  }
  const o = obj as Record<string, unknown>;
  const toStrArray = (v: unknown): string[] =>
    Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === "string") : [];

  return {
    today: toStrArray(o.today),
    thisWeek: toStrArray(o.thisWeek),
    nextPurchase: toStrArray(o.nextPurchase),
  };
}

/**
 * Validate and clean a raw AI-parsed object into a GlamReport.
 * Throws with a descriptive message if required fields are missing.
 */
export function validateReport(raw: unknown): GlamReport {
  if (!raw || typeof raw !== "object") {
    throw new Error("Report: expected object at root level");
  }
  const r = raw as Record<string, unknown>;

  // Profile
  if (!r.profile || typeof r.profile !== "object") throw new Error("profile: missing");
  const profile = r.profile as Record<string, unknown>;
  if (!isString(profile.headline)) throw new Error("profile.headline: missing");
  if (!isString(profile.summary)) throw new Error("profile.summary: missing");

  // Makeup
  if (!r.makeup || typeof r.makeup !== "object") throw new Error("makeup: missing");
  const mu = r.makeup as Record<string, unknown>;
  const makeup = {
    base: validateRecommendationItem(mu.base, "makeup.base"),
    blush: validateRecommendationItem(mu.blush, "makeup.blush"),
    bronzer: validateRecommendationItem(mu.bronzer, "makeup.bronzer"),
    highlighter: validateRecommendationItem(mu.highlighter, "makeup.highlighter"),
    eyes: validateRecommendationItem(mu.eyes, "makeup.eyes"),
    lips: validateRecommendationItem(mu.lips, "makeup.lips"),
  };

  // Hair
  if (!r.hair || typeof r.hair !== "object") throw new Error("hair: missing");
  const h = r.hair as Record<string, unknown>;
  const hair = {
    styles: validateRecommendationItem(h.styles, "hair.styles"),
    cuts: validateRecommendationItem(h.cuts, "hair.cuts"),
    styling: validateRecommendationItem(h.styling, "hair.styling"),
    color: validateRecommendationItem(h.color, "hair.color"),
  };

  // Colors
  if (!r.colors || typeof r.colors !== "object") throw new Error("colors: missing");
  const c = r.colors as Record<string, unknown>;
  const colors = {
    clothing: validateRecommendationItem(c.clothing, "colors.clothing"),
    makeup: validateRecommendationItem(c.makeup, "colors.makeup"),
    accessories: validateRecommendationItem(c.accessories, "colors.accessories"),
  };

  // Style directions
  if (!Array.isArray(r.style) || r.style.length === 0) throw new Error("style: must be a non-empty array");
  const style = (r.style as unknown[]).map((d, i) => validateStyleDirection(d, i));

  // Priorities
  if (!Array.isArray(r.priorities) || r.priorities.length === 0) throw new Error("priorities: must be a non-empty array");
  const priorities = (r.priorities as unknown[]).map((p, i) => validatePriority(p, i));

  // Quick plan
  const quickPlan = validateQuickPlan(r.quickPlan);

  // Additive fields — fail safely, see comment above validateAestheticIdentity
  const aestheticIdentity = validateAestheticIdentity(r.aestheticIdentity);
  const featureEnhancements = validateFeatureEnhancements(r.featureEnhancements);

  return {
    profile: { headline: profile.headline, summary: profile.summary },
    makeup,
    hair,
    colors,
    style,
    priorities,
    quickPlan,
    aestheticIdentity,
    featureEnhancements,
  };
}

/**
 * Attempt to extract JSON from an AI response that might be wrapped in markdown.
 * Returns the parsed object or throws.
 */
export function extractAndParseJson(text: string): unknown {
  let cleaned = text.trim();

  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  // Find the outermost JSON object if there's leading/trailing text
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}
