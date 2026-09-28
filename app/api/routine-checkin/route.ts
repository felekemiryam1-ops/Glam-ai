/**
 * GET / POST /api/routine-checkin — Routine Tracking (Premium)
 *
 * Pure DB read/write, zero AI calls of any kind. `date` is ALWAYS derived
 * server-side as "today" (UTC, truncated to midnight) — never accepted
 * from the client — so a user can only ever mark TODAY's items, closing
 * off retroactive gaming of streaks/history.
 *
 * "Reset for a new day" needs no explicit logic: a new calendar date simply
 * has no RoutineCheckIn rows yet, so GET naturally reads back as
 * all-incomplete for a day that hasn't started.
 *
 * Entitlement: getEntitlements() directly, same as Skin/Hair/Beauty
 * Routine — independent of the monthly included-analysis allowance from
 * Step 1, and never consumed by this route (no Report row is ever touched
 * here).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { computeRoutineState, isValidRoutineCategory, todayUtc } from "@/lib/routineStats";

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
        { error: "Routine Tracking requires an active Premium subscription.", plan: entitlements.plan },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: session.user.id };
}

export async function GET() {
  const gate = await requirePremium();
  if (!gate.ok) return gate.response;

  const state = await computeRoutineState(gate.userId);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const gate = await requirePremium();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { category, completed } = (body ?? {}) as { category?: unknown; completed?: unknown };

  if (!isValidRoutineCategory(category)) {
    return NextResponse.json({ error: "Invalid routine category." }, { status: 400 });
  }
  if (typeof completed !== "boolean") {
    return NextResponse.json({ error: "completed must be true or false." }, { status: 400 });
  }

  await prisma.routineCheckIn.upsert({
    where: { userId_date_category: { userId: gate.userId, date: todayUtc(), category } },
    update: { completed },
    create: { userId: gate.userId, date: todayUtc(), category, completed },
  });

  const state = await computeRoutineState(gate.userId);
  return NextResponse.json({ success: true, ...state });
}
