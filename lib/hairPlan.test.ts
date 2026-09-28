import { describe, it, expect } from "vitest";
import { validateHairPlan, isValidHairType, isValidHairConcerns, isValidBudget } from "./hairPlan";

function validPlanJson() {
  return {
    hairGoals: ["Less frizz", "More shine"],
    washDayRoutine: [
      { step: "Shampoo", productType: "sulfate-free moisturizing shampoo", why: "Cleanses without stripping." },
      { step: "Conditioner", productType: "lightweight conditioner", why: "Detangles and softens." },
      { step: "Leave-in", productType: "leave-in conditioner", why: "Adds ongoing hydration." },
    ],
    weeklyRoutine: [{ step: "Deep conditioning mask", frequency: "1x/week", why: "Boosts moisture over time." }],
    stylingRecommendations: [{ tip: "Use a microfiber towel to reduce frizz", why: "Less friction than terry cloth." }],
    recommendedProducts: [
      { category: "Shampoo", productType: "sulfate-free moisturizing shampoo", example: "", why: "Gentle daily cleanse." },
    ],
  };
}

describe("validateHairPlan — structural validation", () => {
  it("accepts a well-formed plan", () => {
    const plan = validateHairPlan(validPlanJson());
    expect(plan.hairGoals).toHaveLength(2);
    expect(plan.washDayRoutine).toHaveLength(3);
    expect(plan.stylingRecommendations).toHaveLength(1);
  });

  it("rejects a non-object", () => {
    expect(() => validateHairPlan("just a string")).toThrow();
    expect(() => validateHairPlan(null)).toThrow();
    expect(() => validateHairPlan(42)).toThrow();
  });

  it("rejects missing required arrays", () => {
    const bad = validPlanJson();
    // @ts-expect-error deliberately malformed for the test
    delete bad.washDayRoutine;
    expect(() => validateHairPlan(bad)).toThrow(/washDayRoutine/);
  });

  it("rejects a plan where every wash-day step is malformed (no valid steps survive)", () => {
    const bad = validPlanJson();
    bad.washDayRoutine = [{ step: "", productType: "", why: "" }] as never;
    expect(() => validateHairPlan(bad)).toThrow(/no valid wash-day/);
  });

  it("drops individually malformed steps but keeps the well-formed ones", () => {
    const mixed = validPlanJson();
    mixed.washDayRoutine.push({ step: "", productType: "bad entry", why: "" } as never);
    const plan = validateHairPlan(mixed);
    expect(plan.washDayRoutine).toHaveLength(3);
  });

  it("caps routine/product list lengths rather than accepting an essay-length plan", () => {
    const bloated = validPlanJson();
    bloated.washDayRoutine = Array.from({ length: 20 }, (_, i) => ({
      step: `Step ${i}`,
      productType: "type",
      why: "reason",
    }));
    const plan = validateHairPlan(bloated);
    expect(plan.washDayRoutine.length).toBeLessThanOrEqual(6);
  });
});

describe("validateHairPlan — safety validation rejects medical/diagnostic content", () => {
  it("rejects a definitive diagnosis of a medical condition", () => {
    const bad = validPlanJson();
    bad.washDayRoutine[0].why = "You have alopecia and should treat it accordingly.";
    expect(() => validateHairPlan(bad)).toThrow(/safety validation/);
  });

  it("rejects language that diagnoses a fungal infection", () => {
    const bad = validPlanJson();
    bad.weeklyRoutine[0].why = "This is a fungal infection and needs targeted treatment.";
    expect(() => validateHairPlan(bad)).toThrow(/safety validation/);
  });

  it("rejects the word 'prescribe'", () => {
    const bad = validPlanJson();
    bad.recommendedProducts[0].why = "We prescribe this for your hair type.";
    expect(() => validateHairPlan(bad)).toThrow(/safety validation/);
  });

  it("rejects a named prescription drug", () => {
    const bad = validPlanJson();
    bad.recommendedProducts[0].example = "Minoxidil 5% solution";
    expect(() => validateHairPlan(bad)).toThrow(/safety validation/);
  });

  it("does NOT reject legitimate, non-diagnostic mentions of a 'flaky-looking scalp'", () => {
    const ok = validPlanJson();
    ok.recommendedProducts[0].why = "A good match for a flaky-looking, dry scalp.";
    expect(() => validateHairPlan(ok)).not.toThrow();
  });
});

describe("intake vocabulary validators", () => {
  it("isValidHairType accepts known ids, rejects unknown", () => {
    expect(isValidHairType("curly")).toBe(true);
    expect(isValidHairType("not_sure")).toBe(true);
    expect(isValidHairType("radioactive")).toBe(false);
    expect(isValidHairType(null)).toBe(false);
  });

  it("isValidHairConcerns enforces 1-3 known ids", () => {
    expect(isValidHairConcerns(["frizz"])).toBe(true);
    expect(isValidHairConcerns(["frizz", "dryness", "breakage"])).toBe(true);
    expect(isValidHairConcerns([])).toBe(false);
    expect(isValidHairConcerns(["frizz", "dryness", "breakage", "oiliness"])).toBe(false);
    expect(isValidHairConcerns(["not_a_real_concern"])).toBe(false);
  });

  it("isValidBudget matches the existing onboarding vocabulary exactly", () => {
    expect(isValidBudget("budget")).toBe(true);
    expect(isValidBudget("mid_range")).toBe(true);
    expect(isValidBudget("premium")).toBe(true);
    expect(isValidBudget("luxury")).toBe(false);
  });
});
