// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for Pro/Premium plan copy — positioning, pricing,
// and feature lists shown on /pricing, the plan-aware /login step, the
// /glow-up upsell, and the post-checkout dashboard welcome. Previously each
// of those pages hardcoded its own slightly different feature list (Pro and
// Premium's lists had drifted and were even swapped in one place) — this
// keeps them all reading from the same object so they can't disagree again.
//
// Feature wording intentionally matches only what the product actually does
// today or is a stated plan allowance (e.g. monthly analysis counts) —
// nothing here describes a feature that doesn't exist. Updated for Stage 6
// Steps 1-6 (Skin/Hair Glow-Up, Beauty Routine, Premium's Progress/Routine
// Tracking/Photos/Monthly Glow-Up) — the previous copy predated all of it
// and listed several features ("Beauty lookbooks," "Hair transformation
// previews," "Saved Glow-Up reports") that were never built.
// ─────────────────────────────────────────────────────────────────────────────

export type PaidPlan = "pro" | "premium";

export interface PlanCopy {
  name: string;
  price: string;
  priceNote: string;
  /** One-line positioning tagline. */
  positioning: string;
  /** Headline shown immediately after successful checkout. */
  welcomeHeadline: string;
  /** Subline shown under the welcome headline. */
  welcomeSubline: string;
  /** Primary CTA label on the post-checkout welcome screen. */
  ctaLabel: string;
  features: string[];
}

export const PLAN_COPY: Record<PaidPlan, PlanCopy> = {
  pro: {
    name: "Pro",
    price: "$9.99",
    priceNote: "/month",
    positioning: "Your personalized AI beauty advisor.",
    welcomeHeadline: "Welcome to Glam AI Pro",
    welcomeSubline: "Your personalized beauty companion is ready.",
    ctaLabel: "Start Your First Analysis",
    features: [
      "10 included Glow-Up analyses / month",
      "Skin Glow-Up — your personalized skincare routine",
      "Hair Glow-Up — your personalized haircare routine",
      "Personalized hairstyle & hair-color recommendations",
      "Beauty Routine — makeup, skin & hair in one daily plan",
      "Personalized makeup recommendations & Shop Your Look",
      "Color, undertone & style guidance",
    ],
  },
  premium: {
    name: "Premium",
    price: "$19.99",
    priceNote: "/month",
    positioning: "Your full AI beauty stylist.",
    welcomeHeadline: "Welcome to Glam AI Premium",
    welcomeSubline: "Your full AI beauty stylist is ready.",
    ctaLabel: "Create Your First Look",
    features: [
      "Everything in Pro",
      "30 included Glow-Up analyses / month",
      "Glow-Up Progress — your transformation over time",
      "Routine Tracking — mark your routine complete, build streaks",
      "Progress Photos — track & compare your results",
      "Monthly Glow-Up check-in & summary",
      "Your full Premium beauty dashboard",
    ],
  },
};

export function isPaidPlan(value: string | null | undefined): value is PaidPlan {
  return value === "pro" || value === "premium";
}
