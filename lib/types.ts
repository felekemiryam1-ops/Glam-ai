export interface GlamReport {
  profile: {
    headline: string;
    summary: string;
  };
  makeup: {
    base: RecommendationItem;
    blush: RecommendationItem;
    bronzer: RecommendationItem;
    highlighter: RecommendationItem;
    eyes: RecommendationItem;
    lips: RecommendationItem;
  };
  hair: {
    styles: RecommendationItem;
    cuts: RecommendationItem;
    styling: RecommendationItem;
    color: RecommendationItem;
  };
  colors: {
    clothing: RecommendationItem;
    makeup: RecommendationItem;
    accessories: RecommendationItem;
  };
  style: StyleDirection[];
  priorities: GlowUpPriority[];
  quickPlan: QuickPlan;

  // Added for the visual-first analysis restructure. Additive — every field
  // above this point is unchanged, so nothing that already consumes
  // GlamReport needs to change. null/[] when the AI omits or malforms these
  // (see lib/reportValidator.ts) rather than failing the whole report.
  aestheticIdentity: StyleDirection | null;
  featureEnhancements: FeatureEnhancement[];
}

export type FaceRegionKey = "eyes" | "brows" | "lips" | "cheeks" | "jawline" | "forehead";

export interface FeatureEnhancement extends RecommendationItem {
  region: FaceRegionKey;
}

export interface RecommendationItem {
  title: string;
  recommendation: string;
  why: string;
  products?: string[];
}

export interface StyleDirection {
  name: string;
  description: string;
  keyPieces: string[];
}

export interface GlowUpPriority {
  rank: number;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export interface QuickPlan {
  today: string[];
  thisWeek: string[];
  nextPurchase: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  report?: GlamReport;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Free Glam Preview — returned by /api/preview (no payment required)
// ──────────────────────────────────────────────────────────────────────────────

export interface ColorSwatch {
  name: string; // e.g. "Terracotta"
  hex: string;  // e.g. "#C4826A"
}

// A single role in a coordinated 3-color beauty palette. `use` is a short,
// human-readable explanation of what this color is for (shown to the user
// and consumed by the image generator) — e.g. "Best for blush and warm lipstick".
export interface PaletteColor {
  name: string;
  hex: string;
  use: string;
}

// A coherent, professionally-curated 3-color palette with distinct roles:
//   primary     — the single most flattering/useful color; blush + lip territory
//   supporting  — a softer, complementary color; transition eyeshadow + soft blush
//   definition  — a deeper/richer color for eye definition, contrast, or depth
// This is the single source of truth for color recommendations — it drives
// both the /preview + /glow-up display (via bestColors, derived from this)
// and the image-generation prompt (via buildMakeupPrompt in lib/imageGen.ts).
export interface BeautyPalette {
  primary: PaletteColor;
  supporting: PaletteColor;
  definition: PaletteColor;
}

export interface GlamPreview {
  headline: string;        // personalized 1-liner
  colorDirection: string;  // "warm" | "cool" | "neutral"
  makeupStyle: string;     // e.g. "Soft Glam"
  beautyVibe: string;      // e.g. "Natural Polish"
  palette: BeautyPalette;    // structured, role-based palette — source of truth
  bestColors: ColorSwatch[]; // [primary, supporting, definition] flattened for
                              // existing UI display — always derived from `palette`
  makeupDirection: string; // 1–2 sentences
  firstMove: string;       // single most impactful action

  // Additive (Face Map for the free tier) — a small number of region-tagged
  // callouts from the SAME cheap preview call, paired with locally-detected
  // landmarks (lib/faceLandmarks.ts, no AI cost) to build a real Face Map
  // for free users. Optional/undefined for any preview generated before
  // this field existed, or if the AI omits it — the UI falls back to the
  // plain photo in that case rather than guessing.
  featureHighlights?: FeatureEnhancement[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Persistence envelope — what actually gets stored in Report.data.
//
// Deliberately separate from GlamReport/GlamPreview: those two stay pure
// AI-input/output contracts, while StoredAnalysis is free to evolve its own
// shape (via schemaVersion) without ever touching the AI prompt contracts.
//
// faceMap/imageWidth/imageHeight are reserved for the Face Map overlay
// feature (landmark-derived, computed in lib/faceMap.ts) — that computation
// isn't wired in yet, so today these are always [] / null.
// ──────────────────────────────────────────────────────────────────────────────

export interface FaceMapAnchor {
  region: FaceRegionKey;
  x: number; // pixel position on the ORIGINAL uploaded photo
  y: number;
  label: string;
  detail: string;
}

// One generated makeup image — either the original Glow-Up result or a
// user-requested "Try Another Application" regeneration of the SAME
// recommendations (same photo, same preview/palette, same makeup plan —
// only Kontext's inherent stochasticity differs between attempts).
export interface MakeupAttempt {
  imageUrl: string;
  imagePrompt: string;
  createdAt: string; // ISO timestamp
}

export interface StoredAnalysis {
  schemaVersion: 3;
  preview: GlamPreview;
  report: GlamReport;
  // Ordered; attempts[0] is always the original generation. Regenerations
  // are appended, never replace or reorder earlier attempts — see
  // app/api/generate-makeup/route.ts for how this is built/extended.
  attempts: MakeupAttempt[];
  // Convenience aliases — always mirror attempts[attempts.length - 1], kept
  // at the top level so any pre-existing code reading these two fields
  // directly still sees "the current result" without needing to know about
  // attempts[].
  imageUrl: string;
  imagePrompt: string;
  faceMap: FaceMapAnchor[];
  imageWidth: number | null;
  imageHeight: number | null;
  createdAt: string; // ISO timestamp of the ORIGINAL generation
}
