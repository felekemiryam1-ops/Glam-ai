/**
 * lib/routineStats.ts — shared Routine Tracking math (Premium, Stage 6 Step 6)
 *
 * Extracted so app/api/routine-checkin/route.ts and
 * app/api/monthly-glow-up/route.ts both compute today/week/streak the same
 * way, rather than drifting apart. Pure DB reads + arithmetic — no AI.
 */

import { prisma } from "./db";

export const ROUTINE_CATEGORIES = ["skin_am", "skin_pm", "hair", "makeup"] as const;
export type RoutineCategory = (typeof ROUTINE_CATEGORIES)[number];

export function isValidRoutineCategory(v: unknown): v is RoutineCategory {
  return typeof v === "string" && (ROUTINE_CATEGORIES as readonly string[]).includes(v);
}

/** Today's date, truncated to UTC midnight — the only date this system ever reads/writes. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface RoutineState {
  today: Record<RoutineCategory, boolean>;
  weekCompletionCount: number;
  weekTotalPossible: number;
  streakDays: number;
}

export async function computeRoutineState(userId: string): Promise<RoutineState> {
  const today = todayUtc();
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6); // last 7 days including today

  const [todayRows, weekRows] = await Promise.all([
    prisma.routineCheckIn.findMany({ where: { userId, date: today } }),
    prisma.routineCheckIn.findMany({ where: { userId, date: { gte: weekStart } }, orderBy: { date: "desc" } }),
  ]);

  const todayState: Record<RoutineCategory, boolean> = { skin_am: false, skin_pm: false, hair: false, makeup: false };
  for (const row of todayRows) {
    if (isValidRoutineCategory(row.category)) todayState[row.category] = row.completed;
  }

  const weekCompletionCount = weekRows.filter((r) => r.completed).length;
  const weekTotalPossible = ROUTINE_CATEGORIES.length * 7;

  // Streak: consecutive calendar days, walking backward from today, with at
  // least one completed category each day. A day with zero completed rows
  // breaks the streak.
  const completedDatesDesc = Array.from(
    new Set(weekRows.filter((r) => r.completed).map((r) => r.date.toISOString().slice(0, 10)))
  ).sort((a, b) => (a < b ? 1 : -1));

  let streakDays = 0;
  const cursor = new Date(today);
  for (const dateStr of completedDatesDesc) {
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (dateStr === cursorStr) {
      streakDays++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else if (dateStr < cursorStr) {
      break;
    }
  }

  return { today: todayState, weekCompletionCount, weekTotalPossible, streakDays };
}
