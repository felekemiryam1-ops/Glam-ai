// POST /api/profile/onboarding
// Saves the user's beauty preferences (goals, aesthetic, budget) to their
// BeautyProfile row. Creates the row if it doesn't exist yet (upsert).
//
// Auth-protected — returns 401 if called without a valid session.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const VALID_AESTHETICS = [
  "soft_glam",
  "clean_girl",
  "bold_colorful",
  "natural",
  "vintage",
  "edgy",
  "classic",
] as const;

const VALID_BUDGETS = ["budget", "mid_range", "premium"] as const;

const VALID_GOALS = [
  "everyday_glow",
  "better_makeup",
  "hair_transformation",
  "style_upgrade",
  "occasion_prep",
  "confidence_boost",
] as const;

type ValidAesthetic = (typeof VALID_AESTHETICS)[number];
type ValidBudget = (typeof VALID_BUDGETS)[number];
type ValidGoal = (typeof VALID_GOALS)[number];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { goals, aesthetic, budget } = body as {
    goals?: unknown;
    aesthetic?: unknown;
    budget?: unknown;
  };

  // ── Validate goals ────────────────────────────────────────────────────────
  if (!Array.isArray(goals) || goals.length === 0) {
    return NextResponse.json(
      { error: "Please select at least one goal." },
      { status: 400 }
    );
  }
  const validGoals = goals.filter((g): g is ValidGoal =>
    VALID_GOALS.includes(g as ValidGoal)
  );
  if (validGoals.length === 0) {
    return NextResponse.json({ error: "Invalid goal values." }, { status: 400 });
  }

  // ── Validate aesthetic ────────────────────────────────────────────────────
  if (!aesthetic || !VALID_AESTHETICS.includes(aesthetic as ValidAesthetic)) {
    return NextResponse.json(
      { error: "Please select an aesthetic." },
      { status: 400 }
    );
  }

  // ── Validate budget ───────────────────────────────────────────────────────
  if (!budget || !VALID_BUDGETS.includes(budget as ValidBudget)) {
    return NextResponse.json(
      { error: "Please select a budget preference." },
      { status: 400 }
    );
  }

  await prisma.beautyProfile.upsert({
    where: { userId: session.user.id },
    update: {
      goals: JSON.stringify(validGoals),
      aesthetic: aesthetic as string,
      budget: budget as string,
    },
    create: {
      userId: session.user.id,
      goals: JSON.stringify(validGoals),
      aesthetic: aesthetic as string,
      budget: budget as string,
    },
  });

  return NextResponse.json({ success: true });
}
