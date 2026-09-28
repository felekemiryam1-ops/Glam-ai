import { describe, it, expect } from "vitest";
import { validateSkinPlan, isValidSkinType, isValidSkinConcerns, isValidBudget } from "./skinPlan";

function validPlanJson() {
  return {
    skinGoals: ["Even-looking tone", "More hydration"],
    morningRoutine: [
      { step: "Cleanser", productType: "gentle gel cleanser", why: "Removes overnight buildup without stripping skin." },
      { step: "Moisturizer", productType: "lightweight lotion", why: "Locks in hydration for the day." },
      { step: "SPF", productType: "broad-spectrum SPF 30+", why: "Protects against sun damage." },
    ],
    nightRoutine: [
      { step: "Cleanser", productType: "gentle gel cleanser", why: "Removes makeup and daily buildup." },
      { step: "Moisturizer", productType: "richer night cream", why: "Supports skin repair overnight." },
    ],
    weeklyCare: [{ step: "Exfoliation", frequency: "2x/week", why: "Helps smooth texture over time." }],
    recommendedProducts: [
      { category: "Cleanser", productType: "gentle gel cleanser", example: "", why: "Non-stripping for daily use." },
    ],
  };
}

describe("validateSkinPlan — structural validation", () => {
  it("accepts a well-formed plan", () => {
    const plan = validateSkinPlan(validPlanJson());
    expect(plan.skinGoals).toHaveLength(2);
    expect(plan.morningRoutine).toHaveLength(3);
    expect(plan.nightRoutine).toHaveLength(2);
  });

  it("10. rejects a non-object", () => {
    expect(() => validateSkinPlan("just a string")).toThrow();
    expect(() => validateSkinPlan(null)).toThrow();
    expect(() => validateSkinPlan(42)).toThrow();
  });

  it("10. rejects missing required arrays", () => {
    const bad = validPlanJson();
    // @ts-expect-error deliberately malformed for the test
    delete bad.morningRoutine;
    expect(() => validateSkinPlan(bad)).toThrow(/morningRoutine/);
  });

  it("10. rejects a plan where every routine step is malformed (no valid steps survive)", () => {
    const bad = validPlanJson();
    bad.morningRoutine = [{ step: "", productType: "", why: "" }] as never;
    bad.nightRoutine = [{ step: "", productType: "", why: "" }] as never;
    expect(() => validateSkinPlan(bad)).toThrow(/no valid morning\/night/);
  });

  it("drops individually malformed steps but keeps the well-formed ones", () => {
    const mixed = validPlanJson();
    mixed.morningRoutine.push({ step: "", productType: "bad entry", why: "" } as never);
    const plan = validateSkinPlan(mixed);
    // the malformed extra entry is dropped, the 3 valid ones remain
    expect(plan.morningRoutine).toHaveLength(3);
  });

  it("caps routine/product list lengths rather than accepting an essay-length plan", () => {
    const bloated = validPlanJson();
    bloated.morningRoutine = Array.from({ length: 20 }, (_, i) => ({
      step: `Step ${i}`,
      productType: "type",
      why: "reason",
    }));
    const plan = validateSkinPlan(bloated);
    expect(plan.morningRoutine.length).toBeLessThanOrEqual(6);
  });
});

describe("validateSkinPlan — 11. safety validation rejects medical/diagnostic content", () => {
  it("rejects a definitive diagnosis of a medical condition", () => {
    const bad = validPlanJson();
    bad.morningRoutine[0].why = "You have rosacea and should treat it accordingly.";
    expect(() => validateSkinPlan(bad)).toThrow(/safety validation/);
  });

  it("rejects language that diagnoses eczema", () => {
    const bad = validPlanJson();
    bad.nightRoutine[0].why = "This is eczema and needs targeted treatment.";
    expect(() => validateSkinPlan(bad)).toThrow(/safety validation/);
  });

  it("rejects the word 'prescribe'", () => {
    const bad = validPlanJson();
    bad.recommendedProducts[0].why = "We prescribe this for your skin type.";
    expect(() => validateSkinPlan(bad)).toThrow(/safety validation/);
  });

  it("rejects a named prescription drug", () => {
    const bad = validPlanJson();
    bad.recommendedProducts[0].example = "Tretinoin cream";
    expect(() => validateSkinPlan(bad)).toThrow(/safety validation/);
  });

  it("does NOT reject legitimate, non-diagnostic mentions of 'acne-prone' skin", () => {
    // "acne-prone" is one of our own intake concern categories — must not
    // be caught by the diagnostic-phrasing scan.
    const ok = validPlanJson();
    ok.recommendedProducts[0].why = "A good match for acne-prone, oily skin types.";
    expect(() => validateSkinPlan(ok)).not.toThrow();
  });
});

describe("intake vocabulary validators", () => {
  it("isValidSkinType accepts known ids, rejects unknown", () => {
    expect(isValidSkinType("oily")).toBe(true);
    expect(isValidSkinType("not_sure")).toBe(true);
    expect(isValidSkinType("radioactive")).toBe(false);
    expect(isValidSkinType(null)).toBe(false);
  });

  it("isValidSkinConcerns enforces 1-3 known ids", () => {
    expect(isValidSkinConcerns(["dryness"])).toBe(true);
    expect(isValidSkinConcerns(["dryness", "oiliness", "dullness"])).toBe(true);
    expect(isValidSkinConcerns([])).toBe(false); // must pick at least 1
    expect(isValidSkinConcerns(["dryness", "oiliness", "dullness", "texture"])).toBe(false); // max 3
    expect(isValidSkinConcerns(["not_a_real_concern"])).toBe(false);
  });

  it("isValidBudget matches the existing onboarding vocabulary exactly", () => {
    expect(isValidBudget("budget")).toBe(true);
    expect(isValidBudget("mid_range")).toBe(true);
    expect(isValidBudget("premium")).toBe(true);
    expect(isValidBudget("luxury")).toBe(false);
  });
});
