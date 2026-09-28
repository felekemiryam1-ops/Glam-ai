/**
 * GET / POST /api/monthly-glow-up — Monthly Glow-Up (Premium)
 *
 * The consolidated check-in + summary system (see lib/monthlyGlowUp.ts for
 * the full reasoning behind not having a separate check-in table).
 *
 * GET  — read the cached summary. NEVER calls Claude.
 * POST — submit check-in answers. Calls Claude exactly ONCE, gathering
 *        already-existing, already-cached local data as context:
 *          - Routine completion stats (lib/routineStats.ts, Premium-only,
 *            reused as-is)
 *          - The cached SkinPlan/HairPlan goals (Steps 3/4, read verbatim,
 *            never regenerated here)
 *          - The current makeup plan summary, via buildMakeupPlan() on the
 *            most recent Report's stored preview (same pure function
 *            Step 5's Beauty Routine already uses, called again here
 *            rather than imported from that route file)
 *        No image, no vision call, no FAL call.
 *
 * Entitlement: getEntitlements() directly — Premium only. Independent of
 * the monthly included-analysis allowance from Step 1; this route never
 * touches the Report table at all, so it cannot consume that allowance.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { computeRoutineState } from "@/lib/routineStats";
import { buildMakeupPlan } from "@/lib/makeupPlan";
import {
  generateMonthlyGlowUp,
  isValidCheckInAnswers,
  type MonthlyGlowUpSummary,
  type MonthlyGlowUpInput,
} from "@/lib/monthlyGlowUp";
import type { SkinPlan } from "@/lib/skinPlan";
import type { HairPlan } from "@/lib/hairPlan";
import type { GlamPreview } from "@/lib/types";

async function requirePremium(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  }

  const entitlements = await getEntitlements(session.user.id);
  if (entitlements.plan !== "premium") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Monthly Glow-Up requires an active Premium subscription.", plan: entitlements.plan },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: session.user.id };
}

async function makeupSummaryFor(userId: string): Promise<string | null> {
  // Restricted to makeup-analysis report types — see the identical
  // reasoning in app/api/beauty-routine/route.ts. A more recent
  // "hair_transformation" row (a different shape, no `preview`) must not
  // shadow the user's real last makeup analysis here.
  const latestReport = await prisma.report.findFirst({
    where: { userId, type: { in: ["glow_up", "pro_analysis", "premium_analysis"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!latestReport) return null;

  let parsed: { preview?: GlamPreview } = {};
  try {
    parsed = JSON.parse(latestReport.data);
  } catch {
    return null;
  }
  if (!parsed.preview) return null;

  const plan = buildMakeupPlan(parsed.preview);
  return `${parsed.preview.colorDirection}, ${plan.intensityLabel.split("—")[0].trim()} — ${plan.eyeshadow.lid.colorName} eyes, ${plan.blush.colorName} cheeks, ${plan.lips.colorName} lips`;
}

export async function GET() {
  const gate = await requirePremium();
  if (!gate.ok) return gate.response;

  const profile = await prisma.beautyProfile.findUnique({ where: { userId: gate.userId } });

  return NextResponse.json({
    summary: profile?.monthlyGlowUp ? (JSON.parse(profile.monthlyGlowUp) as MonthlyGlowUpSummary) : null,
    updatedAt: profile?.monthlyGlowUpUpdatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requirePremium();
  if (!gate.ok) return gate.response;
  const { userId } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidCheckInAnswers(body)) {
    return NextResponse.json({ error: "Invalid check-in answers." }, { status: 400 });
  }

  const [profile, routineState, makeupSummary] = await Promise.all([
    prisma.beautyProfile.findUnique({ where: { userId } }),
    computeRoutineState(userId),
    makeupSummaryFor(userId),
  ]);

  const skinPlan: SkinPlan | null = profile?.skinPlan ? (JSON.parse(profile.skinPlan) as SkinPlan) : null;
  const hairPlan: HairPlan | null = profile?.hairPlan ? (JSON.parse(profile.hairPlan) as HairPlan) : null;

  const input: MonthlyGlowUpInput = {
    checkIn: body,
    weekCompletionCount: routineState.weekCompletionCount,
    weekTotalPossible: routineState.weekTotalPossible,
    streakDays: routineState.streakDays,
    skinGoals: skinPlan?.skinGoals ?? [],
    hairGoals: hairPlan?.hairGoals ?? [],
    makeupSummary,
  };

  let summary: MonthlyGlowUpSummary;
  try {
    summary = await generateMonthlyGlowUp(input);
  } catch (err) {
    console.error("[monthly-glow-up] Generation failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Couldn't generate your Monthly Glow-Up right now. Please try again.", canRetry: true },
      { status: 500 }
    );
  }

  const now = new Date();
  await prisma.beautyProfile.upsert({
    where: { userId },
    update: { monthlyGlowUp: JSON.stringify(summary), monthlyGlowUpUpdatedAt: now },
    create: { userId, monthlyGlowUp: JSON.stringify(summary), monthlyGlowUpUpdatedAt: now },
  });

  return NextResponse.json({ success: true, summary, updatedAt: now });
}
