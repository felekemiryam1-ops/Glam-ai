/**
 * GET / POST /api/skin-glow-up — Skin Glow-Up (Pro/Premium)
 *
 * GET  — read the user's current intake + cached plan. NEVER calls Claude.
 *        This is what a normal page view hits.
 * POST — submit intake and get a plan. Calls Claude ONLY when:
 *          (a) no cached plan exists yet, OR
 *          (b) the submitted intake differs from what's currently stored, OR
 *          (c) the client explicitly passes `refresh: true`.
 *        Otherwise returns the existing cached plan untouched — no call.
 *        This is the entire caching contract; see lib/skinPlan.ts for the
 *        generation/validation side.
 *
 * Entitlement: Pro/Premium only, via the existing, unmodified
 * getEntitlements() (lib/entitlements.ts) — gated on `plan` alone.
 * Deliberately NOT canRunAnalysis(): Skin Glow-Up is not a "core analysis"
 * and must not consume the monthly Glow-Up allowance from Step 1 — the two
 * limits are independent.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import {
  generateSkinPlan,
  isValidSkinType,
  isValidSkinConcerns,
  isValidBudget,
  type SkinPlan,
  type SkinPlanIntake,
} from "@/lib/skinPlan";

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
        { error: "Skin Glow-Up requires an active Pro or Premium subscription.", plan: entitlements.plan },
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
          skinType: profile.skinType,
          skinConcerns: parseConcerns(profile.skinConcerns),
          budget: profile.budget,
        }
      : { skinType: null, skinConcerns: [], budget: null },
    skinPlan: profile?.skinPlan ? (JSON.parse(profile.skinPlan) as SkinPlan) : null,
    skinPlanUpdatedAt: profile?.skinPlanUpdatedAt ?? null,
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
  const { skinType, skinConcerns, budget, refresh } = (body ?? {}) as {
    skinType?: unknown;
    skinConcerns?: unknown;
    budget?: unknown;
    refresh?: unknown;
  };

  if (!isValidSkinType(skinType)) {
    return NextResponse.json({ error: "Please choose a valid skin type." }, { status: 400 });
  }
  if (!isValidSkinConcerns(skinConcerns)) {
    return NextResponse.json({ error: "Please choose 1–3 skin concerns." }, { status: 400 });
  }
  if (!isValidBudget(budget)) {
    return NextResponse.json({ error: "Please choose a valid budget." }, { status: 400 });
  }
  const wantsRefresh = refresh === true;

  const existing = await prisma.beautyProfile.findUnique({ where: { userId } });

  const existingConcerns = parseConcerns(existing?.skinConcerns ?? null);
  const submittedConcerns: string[] = skinConcerns;
  const intakeUnchanged =
    existing?.skinType === skinType &&
    existing?.budget === budget &&
    existingConcerns.length === submittedConcerns.length &&
    existingConcerns.every((c) => submittedConcerns.includes(c));

  // Always persist the intake itself (even when it matches — keeps this
  // idempotent and handles the "no BeautyProfile row yet" case uniformly).
  const skinConcernsJson = JSON.stringify(skinConcerns);

  const needsGeneration = !existing?.skinPlan || !intakeUnchanged || wantsRefresh;

  if (!needsGeneration) {
    // Cached plan is still valid for this exact intake and no refresh was
    // requested — zero Claude calls, per the caching contract above.
    await prisma.beautyProfile.upsert({
      where: { userId },
      update: { skinType, skinConcerns: skinConcernsJson, budget },
      create: { userId, skinType, skinConcerns: skinConcernsJson, budget },
    });
    return NextResponse.json({
      success: true,
      skinPlan: JSON.parse(existing!.skinPlan!) as SkinPlan,
      skinPlanUpdatedAt: existing!.skinPlanUpdatedAt,
      regenerated: false,
    });
  }

  const intake: SkinPlanIntake = { skinType, skinConcerns, budget };

  let plan: SkinPlan;
  try {
    plan = await generateSkinPlan(intake);
  } catch (err) {
    console.error("[skin-glow-up] Generation failed:", err instanceof Error ? err.message : err);
    // Intake is NOT saved on a failed generation — the user's prior
    // intake/plan (if any) stays exactly as it was, and they can retry.
    return NextResponse.json(
      { error: "Couldn't generate your skin plan right now. Please try again.", canRetry: true },
      { status: 500 }
    );
  }

  const now = new Date();
  await prisma.beautyProfile.upsert({
    where: { userId },
    update: {
      skinType,
      skinConcerns: skinConcernsJson,
      budget,
      skinPlan: JSON.stringify(plan),
      skinPlanUpdatedAt: now,
    },
    create: {
      userId,
      skinType,
      skinConcerns: skinConcernsJson,
      budget,
      skinPlan: JSON.stringify(plan),
      skinPlanUpdatedAt: now,
    },
  });

  return NextResponse.json({ success: true, skinPlan: plan, skinPlanUpdatedAt: now, regenerated: true });
}
