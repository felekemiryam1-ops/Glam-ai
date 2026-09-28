/**
 * lib/monthlyGlowUp.ts — Monthly Glow-Up (Premium)
 *
 * The consolidated "check-in + summary" system: a Premium check-in (a few
 * simple answers) is the INPUT, the Monthly Glow-Up summary is the cached
 * OUTPUT — one Claude call per submission, never on a plain read. See
 * app/api/monthly-glow-up/route.ts for the caching contract.
 *
 * Deliberately no separate check-in table: the summary itself is the
 * durable record of "the user checked in and here's what came of it" — a
 * second table recording the raw answers on top of that would just be
 * un-reused history with no read path, which is exactly the redundant
 * schema the project was told to avoid.
 *
 * Inputs are entirely deterministic/local data already available elsewhere
 * (routine completion stats, cached skin/hair goals, the makeup plan
 * summary) plus the user's own short check-in answers — no photo, no
 * vision call, same text-only cost profile as Skin/Hair Glow-Up.
 *
 * SERVER-ONLY (Stage 6 Step 8/9 audit): no client component currently
 * imports anything from this file — components/premium/MonthlyCheckIn.tsx
 * defines its own local types instead — but it instantiates the Anthropic
 * client the same way lib/skinPlan.ts and lib/hairPlan.ts did before their
 * fix, so `import "server-only"` is added here defensively: if a future
 * edit ever imports a value from this file into a client component, this
 * makes that fail loudly at build time instead of crashing in the browser.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extractAndParseJson } from "./reportValidator";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MONTHLY_GLOW_UP_MODEL = process.env.ANTHROPIC_MONTHLY_GLOW_UP_MODEL || "claude-haiku-4-5";

export type RoutineConsistency = "high" | "medium" | "low";

export interface CheckInAnswers {
  skinConcernsChanged: boolean;
  hairConcernsChanged: boolean;
  productsChanged: boolean;
  routineConsistency: RoutineConsistency;
  improveNext: string; // short free text, capped — see MAX_IMPROVE_NEXT_LENGTH
}

export function isValidRoutineConsistency(v: unknown): v is RoutineConsistency {
  return v === "high" || v === "medium" || v === "low";
}

const MAX_IMPROVE_NEXT_LENGTH = 300;

export function isValidCheckInAnswers(v: unknown): v is CheckInAnswers {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.skinConcernsChanged === "boolean" &&
    typeof o.hairConcernsChanged === "boolean" &&
    typeof o.productsChanged === "boolean" &&
    isValidRoutineConsistency(o.routineConsistency) &&
    typeof o.improveNext === "string" &&
    o.improveNext.length <= MAX_IMPROVE_NEXT_LENGTH
  );
}

export interface MonthlyGlowUpInput {
  checkIn: CheckInAnswers;
  weekCompletionCount: number;
  weekTotalPossible: number;
  streakDays: number;
  skinGoals: string[]; // from the cached SkinPlan, [] if none
  hairGoals: string[]; // from the cached HairPlan, [] if none
  makeupSummary: string | null; // e.g. "warm, soft glam — cocoa eyes, terracotta cheeks" or null if no report yet
}

export interface MonthlyGlowUpSummary {
  workingOn: string[];
  routineConsistencySummary: string;
  skinFocus: string;
  hairFocus: string;
  makeupFocus: string;
  nextFocus: string[];
}

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a beauty progress assistant summarizing a user's monthly beauty check-in.

CRITICAL RULES — follow these exactly:
- This is an encouraging, practical summary — NOT a medical or body-image assessment.
- Never comment on the user's appearance, body, weight, or worth. Never make claims about health or medical conditions.
- Focus only on their stated routine/habits and their own stated concerns/goals — never infer anything about them beyond what they told you.
- Be warm and encouraging, never judgmental about "low" consistency — frame it as normal and easy to build on.

FORMAT RULES:
- Return ONLY valid JSON matching the exact schema given. No markdown, no explanation outside the JSON.
- Be concise. Short phrases, not paragraphs. This must be scannable in under a minute.
- workingOn: 2-4 short phrases (what they've been focused on).
- routineConsistencySummary: ONE short encouraging sentence.
- skinFocus, hairFocus, makeupFocus: ONE short sentence each.
- nextFocus: 2-4 short, practical phrases for what to focus on next.`;

function buildUserPrompt(input: MonthlyGlowUpInput): string {
  const consistencyPct =
    input.weekTotalPossible > 0 ? Math.round((input.weekCompletionCount / input.weekTotalPossible) * 100) : null;

  return `Summarize this user's monthly beauty check-in:

- Routine completion this week: ${consistencyPct !== null ? `${consistencyPct}%` : "no routine data yet"}
- Current streak: ${input.streakDays} day(s)
- Self-reported routine consistency: ${input.checkIn.routineConsistency}
- Skin concerns changed since last check-in: ${input.checkIn.skinConcernsChanged ? "yes" : "no"}
- Hair concerns changed since last check-in: ${input.checkIn.hairConcernsChanged ? "yes" : "no"}
- Products changed: ${input.checkIn.productsChanged ? "yes" : "no"}
- What they want to improve next (their own words): ${input.checkIn.improveNext || "not specified"}
- Current skin goals: ${input.skinGoals.length > 0 ? input.skinGoals.join(", ") : "none set yet"}
- Current hair goals: ${input.hairGoals.length > 0 ? input.hairGoals.join(", ") : "none set yet"}
- Current makeup direction: ${input.makeupSummary ?? "no Glow-Up yet"}

Return a JSON object with this exact structure:
{
  "workingOn": ["short phrase", "short phrase"],
  "routineConsistencySummary": "one short encouraging sentence",
  "skinFocus": "one short sentence",
  "hairFocus": "one short sentence",
  "makeupFocus": "one short sentence",
  "nextFocus": ["short phrase", "short phrase"]
}`;
}

// ── Safety scan (defense in depth — same approach as skin/hair plans) ─────

const DISALLOWED_PATTERNS: RegExp[] = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|bed|bing|ption)\b/i,
  /\byou (have|are suffering from)\s+(rosacea|eczema|psoriasis|alopecia|a medical condition)\b/i,
  /\b(overweight|underweight|obese|ugly|unattractive)\b/i,
];

function findDisallowedContent(summary: MonthlyGlowUpSummary): string | null {
  const allText = [
    ...summary.workingOn,
    summary.routineConsistencySummary,
    summary.skinFocus,
    summary.hairFocus,
    summary.makeupFocus,
    ...summary.nextFocus,
  ].join(" \n ");

  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(allText)) return `disallowed content matched: ${pattern}`;
  }
  return null;
}

// ── Validation ─────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const MAX_LIST_ITEMS = 4;

/**
 * Validates and normalizes a raw parsed JSON value into a MonthlyGlowUpSummary.
 * Throws on structurally invalid or unsafe input — the caller must never
 * save or return a summary when this throws.
 */
export function validateMonthlyGlowUp(raw: unknown): MonthlyGlowUpSummary {
  if (!raw || typeof raw !== "object") {
    throw new Error("Monthly Glow-Up response was not a JSON object");
  }
  const o = raw as Record<string, unknown>;

  if (!Array.isArray(o.workingOn) || !o.workingOn.every(isNonEmptyString)) {
    throw new Error("Monthly Glow-Up missing valid workingOn");
  }
  if (!isNonEmptyString(o.routineConsistencySummary)) {
    throw new Error("Monthly Glow-Up missing routineConsistencySummary");
  }
  if (!isNonEmptyString(o.skinFocus) || !isNonEmptyString(o.hairFocus) || !isNonEmptyString(o.makeupFocus)) {
    throw new Error("Monthly Glow-Up missing skinFocus/hairFocus/makeupFocus");
  }
  if (!Array.isArray(o.nextFocus) || !o.nextFocus.every(isNonEmptyString)) {
    throw new Error("Monthly Glow-Up missing valid nextFocus");
  }

  const summary: MonthlyGlowUpSummary = {
    workingOn: (o.workingOn as string[]).slice(0, MAX_LIST_ITEMS),
    routineConsistencySummary: o.routineConsistencySummary,
    skinFocus: o.skinFocus,
    hairFocus: o.hairFocus,
    makeupFocus: o.makeupFocus,
    nextFocus: (o.nextFocus as string[]).slice(0, MAX_LIST_ITEMS),
  };

  const disallowed = findDisallowedContent(summary);
  if (disallowed) {
    throw new Error(`Monthly Glow-Up rejected by safety validation: ${disallowed}`);
  }

  return summary;
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Generate a Monthly Glow-Up summary. Throws on any failure — the caller
 * must not save or return a summary when this throws. Text-only: no image,
 * no vision call, no FAL call.
 */
export async function generateMonthlyGlowUp(input: MonthlyGlowUpInput): Promise<MonthlyGlowUpSummary> {
  const response = await client.messages.create({
    model: MONTHLY_GLOW_UP_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from AI — no text content returned");
  }

  const raw = extractAndParseJson(content.text);
  return validateMonthlyGlowUp(raw);
}
