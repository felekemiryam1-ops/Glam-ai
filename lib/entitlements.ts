// ─────────────────────────────────────────────────────────────────────────────
// Entitlements — the single place that resolves what a user is allowed to do
// based on their subscription. Centralizes logic that was previously inline
// and duplicated (e.g. app/dashboard/page.tsx's plan resolution).
//
// Security: every function here takes only a `userId` and resolves plan/limits
// itself from the Subscription table — never accept a plan/limit as an input
// parameter. A plan claimed by the client must never be trusted.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { PRO_MONTHLY_ANALYSIS_LIMIT, PREMIUM_MONTHLY_ANALYSIS_LIMIT, type Plan } from "@/lib/stripe";

export type { Plan };

export interface Entitlements {
  userId: string;
  plan: Plan;
  /** Raw Stripe subscription status ("active", "past_due", etc.), null on the free tier. */
  subscriptionStatus: string | null;
  /** true when status is "active" or "trialing" — the only statuses that grant paid access. */
  isActive: boolean;
  /** Monthly analysis allowance for this plan. null on the free tier (no analysis allowance at all). */
  monthlyLimit: number | null;
  /** Current Stripe billing period, from the synced Subscription row. */
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Successful analyses run in the current billing period. */
  usedThisPeriod: number;
  /** monthlyLimit - usedThisPeriod, floored at 0. null when monthlyLimit is null. */
  remaining: number | null;
  /** Whether this user can start a new analysis right now. */
  canRunAnalysis: boolean;
}

// "hair_transformation" (AI hairstyle/hair-color visualization) shares the
// same monthly pool as makeup analyses — both are the same FAL Kontext
// call cost-wise, and this is the only existing cost-control mechanism in
// the app for FAL-billed generations. Not a separate/new limit system.
const REPORT_TYPES_COUNTED_AS_USAGE = ["pro_analysis", "premium_analysis", "hair_transformation"];

/**
 * Resolve a user's current plan, subscription status, and monthly analysis
 * usage/remaining allowance — purely from the database (Subscription +
 * Report rows), never from anything the client claims.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const plan: Plan =
    isActive && (subscription?.plan === "pro" || subscription?.plan === "premium")
      ? subscription.plan
      : "free";

  const monthlyLimit =
    plan === "premium" ? PREMIUM_MONTHLY_ANALYSIS_LIMIT : plan === "pro" ? PRO_MONTHLY_ANALYSIS_LIMIT : null;

  const periodStart = isActive ? (subscription?.currentPeriodStart ?? null) : null;
  const periodEnd = isActive ? (subscription?.currentPeriodEnd ?? null) : null;

  let usedThisPeriod = 0;
  if (monthlyLimit !== null && periodStart) {
    usedThisPeriod = await prisma.report.count({
      where: {
        userId,
        type: { in: REPORT_TYPES_COUNTED_AS_USAGE },
        createdAt: { gte: periodStart },
      },
    });
  }

  const remaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - usedThisPeriod);
  const canRunAnalysis = plan !== "free" && (remaining === null || remaining > 0);

  // Temporary diagnostic (Stage 6 Step 9 investigation) — safe identifiers
  // only. Remove once the "Pro subscription active but UI shows Free" issue
  // is confirmed resolved in production.
  console.log(
    `[entitlements] userId=${userId} dbPlan=${subscription?.plan ?? "<none>"} dbStatus=${subscription?.status ?? "<none>"} → resolvedPlan=${plan} isActive=${isActive}`
  );

  return {
    userId,
    plan,
    subscriptionStatus: subscription?.status ?? null,
    isActive,
    monthlyLimit,
    periodStart,
    periodEnd,
    usedThisPeriod,
    remaining,
    canRunAnalysis,
  };
}

/**
 * Convenience check for API routes that need a simple allow/deny + reason,
 * without the caller re-deriving the free-tier / limit-exhausted logic.
 */
export async function canRunAnalysis(
  userId: string
): Promise<{ allowed: boolean; reason?: string; entitlements: Entitlements }> {
  const entitlements = await getEntitlements(userId);

  if (entitlements.plan === "free") {
    return {
      allowed: false,
      reason: "This feature requires a Pro or Premium subscription.",
      entitlements,
    };
  }

  if (entitlements.remaining !== null && entitlements.remaining <= 0) {
    return {
      allowed: false,
      reason: "You've used all your analyses for this billing period.",
      entitlements,
    };
  }

  return { allowed: true, entitlements };
}
