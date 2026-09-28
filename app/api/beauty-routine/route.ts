/**
 * GET /api/beauty-routine — Beauty Routine (Pro/Premium)
 *
 * Pure read + deterministic assembly — NOT another AI feature. Reuses:
 *   - BeautyProfile.skinPlan / hairPlan — already-cached Skin/Hair Glow-Up
 *     output (lib/skinPlan.ts / lib/hairPlan.ts), read verbatim, never
 *     regenerated here.
 *   - buildMakeupPlan() (lib/makeupPlan.ts) — the same pure, synchronous
 *     function the $4.99 result page already calls client-side, run here
 *     against the user's most recent Report's stored `preview`.
 *   - matchProducts() (lib/productMatching.ts) — the same product-matching
 *     engine ShopYourLook already uses; not a new one.
 *
 * No Claude call anywhere in this file. No database write anywhere in this
 * file — every operation below is a read (findUnique/findFirst/findMany).
 *
 * Entitlement: getEntitlements() directly (not canRunAnalysis()) — same
 * reasoning as Skin/Hair Glow-Up: this must not consume the monthly
 * included-analysis allowance from Step 1.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { buildMakeupPlan } from "@/lib/makeupPlan";
import { matchProducts, type BudgetTier, type CategoryMatchResult } from "@/lib/productMatching";
import type { SkinPlan } from "@/lib/skinPlan";
import type { HairPlan } from "@/lib/hairPlan";
import type { GlamPreview } from "@/lib/types";

interface MakeupSummary {
  colorDirection: string;
  intensityLabel: string;
  eyeColorName: string;
  blushColorName: string;
  lipColorName: string;
  imageUrl: string | null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const userId = session.user.id;

  const entitlements = await getEntitlements(userId);
  if (entitlements.plan !== "pro" && entitlements.plan !== "premium") {
    return NextResponse.json(
      { error: "Beauty Routine requires an active Pro or Premium subscription.", plan: entitlements.plan },
      { status: 403 }
    );
  }

  const [profile, latestReport] = await Promise.all([
    prisma.beautyProfile.findUnique({ where: { userId } }),
    // Restricted to makeup-analysis report types (StoredAnalysis shape —
    // has `preview`/`imageUrl`). "hair_transformation" rows are a
    // different shape (see app/api/generate-hair/route.ts) and must never
    // become "latestReport" here, or the parsing below would silently find
    // no `preview` and treat a user with real makeup history as if they
    // had none.
    prisma.report.findFirst({
      where: { userId, type: { in: ["glow_up", "pro_analysis", "premium_analysis"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const skinPlan: SkinPlan | null = profile?.skinPlan ? (JSON.parse(profile.skinPlan) as SkinPlan) : null;
  const hairPlan: HairPlan | null = profile?.hairPlan ? (JSON.parse(profile.hairPlan) as HairPlan) : null;

  let makeup: MakeupSummary | null = null;
  let matchedProducts: CategoryMatchResult[] = [];

  if (latestReport) {
    // Top-level `preview`/`imageUrl` are present on every StoredAnalysis
    // schema version this app has ever written (schemaVersion 2's flat
    // fields, schemaVersion 3's latest-attempt aliases — see lib/types.ts),
    // so no version-specific handling is needed to read just these two.
    let parsed: { preview?: GlamPreview; imageUrl?: string } = {};
    try {
      parsed = JSON.parse(latestReport.data);
    } catch {
      parsed = {};
    }

    if (parsed.preview) {
      const plan = buildMakeupPlan(parsed.preview);
      makeup = {
        colorDirection: parsed.preview.colorDirection,
        intensityLabel: plan.intensityLabel,
        eyeColorName: plan.eyeshadow.lid.colorName,
        blushColorName: plan.blush.colorName,
        lipColorName: plan.lips.colorName,
        imageUrl: parsed.imageUrl ?? null,
      };

      const catalog = await prisma.product.findMany({ where: { active: true } });
      const budget = (profile?.budget as BudgetTier | null) ?? undefined;
      matchedProducts = matchProducts(plan, catalog, budget);
    }
  }

  return NextResponse.json({
    skinPlan,
    hairPlan,
    makeup,
    matchedProducts,
  });
}
