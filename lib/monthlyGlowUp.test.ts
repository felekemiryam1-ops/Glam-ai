import { describe, it, expect } from "vitest";
import { validateMonthlyGlowUp, isValidCheckInAnswers, isValidRoutineConsistency } from "./monthlyGlowUp";

function validSummaryJson() {
  return {
    workingOn: ["Hydration", "Less frizz"],
    routineConsistencySummary: "You're building a solid habit.",
    skinFocus: "Keep it simple and consistent.",
    hairFocus: "Stay consistent with your wash day.",
    makeupFocus: "You're finding your everyday look.",
    nextFocus: ["Add SPF", "Try a deep conditioner"],
  };
}

describe("validateMonthlyGlowUp — structural validation", () => {
  it("accepts a well-formed summary", () => {
    const summary = validateMonthlyGlowUp(validSummaryJson());
    expect(summary.workingOn).toHaveLength(2);
    expect(summary.nextFocus).toHaveLength(2);
  });

  it("rejects a non-object", () => {
    expect(() => validateMonthlyGlowUp("just a string")).toThrow();
    expect(() => validateMonthlyGlowUp(null)).toThrow();
  });

  it("rejects missing required fields", () => {
    const bad = validSummaryJson();
    // @ts-expect-error deliberately malformed for the test
    delete bad.skinFocus;
    expect(() => validateMonthlyGlowUp(bad)).toThrow(/skinFocus/);
  });

  it("caps list lengths", () => {
    const bloated = validSummaryJson();
    bloated.workingOn = Array.from({ length: 10 }, (_, i) => `goal ${i}`);
    const summary = validateMonthlyGlowUp(bloated);
    expect(summary.workingOn.length).toBeLessThanOrEqual(4);
  });
});

describe("validateMonthlyGlowUp — safety validation", () => {
  it("rejects diagnostic phrasing", () => {
    const bad = validSummaryJson();
    bad.skinFocus = "You have rosacea and should treat it.";
    expect(() => validateMonthlyGlowUp(bad)).toThrow(/safety validation/);
  });

  it("rejects the word 'prescribe'", () => {
    const bad = validSummaryJson();
    bad.hairFocus = "We prescribe a weekly mask.";
    expect(() => validateMonthlyGlowUp(bad)).toThrow(/safety validation/);
  });

  it("rejects body-image judgment language", () => {
    const bad = validSummaryJson();
    bad.makeupFocus = "Your look would be less unattractive with a bold lip.";
    expect(() => validateMonthlyGlowUp(bad)).toThrow(/safety validation/);
  });

  it("does not reject encouraging, non-judgmental language", () => {
    const ok = validSummaryJson();
    ok.routineConsistencySummary = "You're doing great — small steps add up.";
    expect(() => validateMonthlyGlowUp(ok)).not.toThrow();
  });
});

describe("check-in answer validation", () => {
  it("isValidRoutineConsistency accepts only high/medium/low", () => {
    expect(isValidRoutineConsistency("high")).toBe(true);
    expect(isValidRoutineConsistency("medium")).toBe(true);
    expect(isValidRoutineConsistency("low")).toBe(true);
    expect(isValidRoutineConsistency("extreme")).toBe(false);
  });

  it("isValidCheckInAnswers accepts a well-formed answer set", () => {
    expect(
      isValidCheckInAnswers({
        skinConcernsChanged: true,
        hairConcernsChanged: false,
        productsChanged: false,
        routineConsistency: "medium",
        improveNext: "More hydration",
      })
    ).toBe(true);
  });

  it("isValidCheckInAnswers rejects missing/invalid fields", () => {
    expect(isValidCheckInAnswers(null)).toBe(false);
    expect(isValidCheckInAnswers({})).toBe(false);
    expect(
      isValidCheckInAnswers({
        skinConcernsChanged: "yes", // wrong type
        hairConcernsChanged: false,
        productsChanged: false,
        routineConsistency: "medium",
        improveNext: "",
      })
    ).toBe(false);
    expect(
      isValidCheckInAnswers({
        skinConcernsChanged: true,
        hairConcernsChanged: false,
        productsChanged: false,
        routineConsistency: "not_a_level",
        improveNext: "",
      })
    ).toBe(false);
  });

  it("isValidCheckInAnswers rejects an improveNext that's too long", () => {
    expect(
      isValidCheckInAnswers({
        skinConcernsChanged: false,
        hairConcernsChanged: false,
        productsChanged: false,
        routineConsistency: "high",
        improveNext: "a".repeat(500),
      })
    ).toBe(false);
  });
});
