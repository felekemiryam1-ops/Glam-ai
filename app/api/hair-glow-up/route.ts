/**
 * GET / POST /api/hair-glow-up — Hair Glow-Up (Pro/Premium)
 *
 * Mirrors app/api/skin-glow-up/route.ts's contract exactly:
 *
 * GET  — read the user's current intake + cached plan. NEVER calls Claude.
 * POST — submit intake and get a plan. Calls Claude ONLY when:
 *          (a) no cached plan exists yet, OR
 *          (b) the submitted intake differs from what's currently stored, OR
 *          (c) the client explicitly passes `refresh: true`.
 *        Otherwise returns the existing cached plan untouched — no call.
 *
 * Entitlement: getEntitlements() directly (not canRunAnalysis()) — Hair
 * Glow-Up is not a "core analysis" and must not consume the monthly
 * Glow-Up allowance from Step 1; the two limits are independent.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import {
  generateHairPlan,
  isValidHairType,
  isValidHairConcerns,
  isValidBudget,
  type HairPlan,
  type HairPlanIntake,
} from "@/lib/hairPlan";

// ── Shared entitlement check ──────────────────────────────────────────────

async function requirePaidPlan(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  }

  const entitlements = await getEntitlements(session.user.id);
  if (entitlements.plan !== "pro" && entitlements.plan !== "premium") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Hair Glow-Up requires an active Pro or Premium subscription.", plan: entitlements.plan },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: session.user.id };
}

function parseConcerns(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── GET — read only, zero AI calls ────────────────────────────────────────

export async function GET() {
  const gate = await requirePaidPlan();
  if (!gate.ok) return gate.response;

  const profile = await prisma.beautyProfile.findUnique({ where: { userId: gate.userId } });

  return NextResponse.json({
    intake: profile
      ? {
          hairType: profile.hairType,
          hairConcerns: parseConcerns(profile.hairConcerns),
          budget: profile.budget,
        }
      : { hairType: null, hairConcerns: [], budget: null },
    hairPlan: profile?.hairPlan ? (JSON.parse(profile.hairPlan) as HairPlan) : null,
    hairPlanUpdatedAt: profile?.hairPlanUpdatedAt ?? null,
  });
}

// ── POST — submit intake, generate only when actually needed ─────────────

export async function POST(req: NextRequest) {
  const gate = await requirePaidPlan();
  if (!gate.ok) return gate.response;
  const { userId } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { hairType, hairConcerns, budget, refresh } = (body ?? {}) as {
    hairType?: unknown;
    hairConcerns?: unknown;
    budget?: unknown;
    refresh?: unknown;
  };

  if (!isValidHairType(hairType)) {
    return NextResponse.json({ error: "Please choose a valid hair type." }, { status: 400 });
  }
  if (!isValidHairConcerns(hairConcerns)) {
    return NextResponse.json({ error: "Please choose 1–3 hair concerns." }, { status: 400 });
  }
  if (!isValidBudget(budget)) {
    return NextResponse.json({ error: "Please choose a valid budget." }, { status: 400 });
  }
  const wantsRefresh = refresh === true;

  const existing = await prisma.beautyProfile.findUnique({ where: { userId } });

  const existingConcerns = parseConcerns(existing?.hairConcerns ?? null);
  const submittedConcerns: string[] = hairConcerns;
  const intakeUnchanged =
    existing?.hairType === hairType &&
    existing?.budget === budget &&
    existingConcerns.length === submittedConcerns.length &&
    existingConcerns.every((c) => submittedConcerns.includes(c));

  const hairConcernsJson = JSON.stringify(hairConcerns);

  const needsGeneration = !existing?.hairPlan || !intakeUnchanged || wantsRefresh;

  if (!needsGeneration) {
    // Cached plan is still valid for this exact intake and no refresh was
    // requested — zero Claude calls, per the caching contract above.
    await prisma.beautyProfile.upsert({
      where: { userId },
      update: { hairType, hairConcerns: hairConcernsJson, budget },
      create: { userId, hairType, hairConcerns: hairConcernsJson, budget },
    });
    return NextResponse.json({
      success: true,
      hairPlan: JSON.parse(existing!.hairPlan!) as HairPlan,
      hairPlanUpdatedAt: existing!.hairPlanUpdatedAt,
      regenerated: false,
    });
  }

  const intake: HairPlanIntake = { hairType, hairConcerns, budget };

  let plan: HairPlan;
  try {
    plan = await generateHairPlan(intake);
  } catch (err) {
    console.error("[hair-glow-up] Generation failed:", err instanceof Error ? err.message : err);
    // Intake is NOT saved on a failed generation — the user's prior
    // intake/plan (if any) stays exactly as it was, and they can retry.
    return NextResponse.json(
      { error: "Couldn't generate your hair plan right now. Please try again.", canRetry: true },
      { status: 500 }
    );
  }

  const now = new Date();
  await prisma.beautyProfile.upsert({
    where: { userId },
    update: {
      hairType,
      hairConcerns: hairConcernsJson,
      budget,
      hairPlan: JSON.stringify(plan),
      hairPlanUpdatedAt: now,
    },
    create: {
      userId,
      hairType,
      hairConcerns: hairConcernsJson,
      budget,
      hairPlan: JSON.stringify(plan),
      hairPlanUpdatedAt: now,
    },
  });

  return NextResponse.json({ success: true, hairPlan: plan, hairPlanUpdatedAt: now, regenerated: true });
}
