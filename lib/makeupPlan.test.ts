import { describe, it, expect } from "vitest";
import { buildMakeupPlan, buildPromptFromPlan } from "./makeupPlan";
import type { GlamPreview } from "./types";

// ── Fixtures ──────────────────────────────────────────────────────────────

function preview(overrides: Partial<GlamPreview> = {}): GlamPreview {
  return {
    headline: "Warm and radiant",
    colorDirection: "warm",
    makeupStyle: "Soft Glam",
    beautyVibe: "Dewy Glow",
    palette: {
      primary: { name: "Warm Terracotta", hex: "#C4826A", use: "Best for blush and warm lipstick" },
      supporting: { name: "Peachy Nude", hex: "#E8B4A0", use: "Best for transition eyeshadow and soft blush" },
      definition: { name: "Warm Bronze", hex: "#A66B4F", use: "Best for outer-corner eyeshadow and bronzer" },
    },
    bestColors: [],
    makeupDirection: "A warm, radiant soft glam look.",
    firstMove: "Start with a warm bronze eye.",
    ...overrides,
  };
}

function hexDistance(a: string, b: string): number {
  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

const FORBIDDEN_DRIFT_WORDS = ["yellow", "olive", "lime", "mustard", "chartreuse"];

// ── Color-family lock: aesthetic/hue-drift constraints ──────────────────────

describe("colorFamilyLock (via plan.colorFamilyRule)", () => {
  it("warm direction explicitly forbids yellow/olive/lime/mustard/chartreuse", () => {
    const plan = buildMakeupPlan(preview({ colorDirection: "warm" }));
    const rule = plan.colorFamilyRule.toLowerCase();
    for (const word of FORBIDDEN_DRIFT_WORDS) {
      expect(rule).toContain(word);
    }
  });

  it("neutral direction explicitly forbids yellow/olive/lime/mustard/chartreuse", () => {
    const plan = buildMakeupPlan(preview({ colorDirection: "neutral" }));
    const rule = plan.colorFamilyRule.toLowerCase();
    for (const word of FORBIDDEN_DRIFT_WORDS) {
      expect(rule).toContain(word);
    }
  });

  it("cool direction still forbids the warm/yellow-green drift family", () => {
    const plan = buildMakeupPlan(preview({ colorDirection: "cool" }));
    const rule = plan.colorFamilyRule.toLowerCase();
    expect(rule).toContain("yellow");
    expect(rule).toContain("olive");
  });

  it("every direction carries an explicit wearability/mutedness constraint, not just a hue-family fence", () => {
    for (const dir of ["warm", "cool", "neutral"]) {
      const rule = buildMakeupPlan(preview({ colorDirection: dir })).colorFamilyRule.toLowerCase();
      expect(rule).toContain("muted");
      expect(rule).toContain("theatrical");
      expect(rule).toContain("looks more beautiful"); // frames the goal positively, not as a color statement
    }
  });

  it("the wearability constraint reaches the actual image-generation prompt, not just the plan object", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview()).toLowerCase();
    expect(prompt).toContain("muted");
    expect(prompt).toContain("theatrical");
    for (const word of FORBIDDEN_DRIFT_WORDS) {
      expect(prompt).toContain(word);
    }
  });
});

// ── Blush/lips derivation: distinctness + harmony (Stage 5B follow-up) ──────

describe("blush/lips color derivation", () => {
  it("blush, lips, and both eye colors are mutually distinct (no two regions share a color)", () => {
    const plan = buildMakeupPlan(preview());
    const hexes = {
      eyesTransition: plan.eyeshadow.transition.hex,
      eyesLid: plan.eyeshadow.lid.hex,
      blush: plan.blush.hex,
      lips: plan.lips.hex,
    };
    const entries = Object.entries(hexes);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        expect(entries[i][1]).not.toBe(entries[j][1]);
      }
    }
  });

  it("stays distinct even when the AI's three analyzed colors happen to collide (primary === definition)", () => {
    const collidingPreview = preview({
      palette: {
        primary: { name: "Warm Bronze", hex: "#A66B4F", use: "" },
        supporting: { name: "Peachy Nude", hex: "#E8B4A0", use: "" },
        definition: { name: "Warm Bronze", hex: "#A66B4F", use: "" },
      },
    });
    const plan = buildMakeupPlan(collidingPreview);
    const MIN_DISTANCE = 40; // comfortably distinguishable, well below a full hue-family jump
    expect(hexDistance(plan.blush.hex, plan.eyeshadow.lid.hex)).toBeGreaterThan(MIN_DISTANCE);
    expect(hexDistance(plan.lips.hex, plan.eyeshadow.lid.hex)).toBeGreaterThan(MIN_DISTANCE);
    expect(hexDistance(plan.blush.hex, plan.lips.hex)).toBeGreaterThan(MIN_DISTANCE);
  });

  it("blush and lips names are distinct from each other and from the raw eye color names", () => {
    const plan = buildMakeupPlan(preview());
    expect(plan.blush.colorName).not.toBe(plan.lips.colorName);
    expect(plan.blush.colorName).not.toBe(plan.eyeshadow.transition.colorName);
    expect(plan.blush.colorName).not.toBe(plan.eyeshadow.lid.colorName);
    expect(plan.lips.colorName).not.toBe(plan.eyeshadow.transition.colorName);
    expect(plan.lips.colorName).not.toBe(plan.eyeshadow.lid.colorName);
  });

  it("eyes are untouched by the blush/lip derivation — still the raw analyzed supporting/definition colors", () => {
    const p = preview();
    const plan = buildMakeupPlan(p);
    expect(plan.eyeshadow.transition.hex).toBe(p.palette.supporting.hex);
    expect(plan.eyeshadow.lid.hex).toBe(p.palette.definition.hex);
  });
});

// ── Prompt density: colors lead, every fact stated exactly once ───────────
//
// An isolated test (a ~700-character prompt containing ONLY the eye-color
// instruction, everything else stripped out) against the same photo and
// model settings correctly rendered the specified colors, while the much
// longer production prompt (colorFamilyRule and the eye-color description
// each repeated 2-3 times across different sections, ~16,000 characters)
// did not — Kontext rendered gray/blue eyeshadow despite the correct color
// being present in the text. The fix is structural: state every fact once,
// lead with the exact colors as Priority 1, and cut anything that doesn't
// change what the model should render (flavor/style context, closing
// restatement paragraphs). These tests guard against that duplication
// creeping back in, not for its own sake but because it was the confirmed
// root cause of a real failure.

describe("buildPromptFromPlan — colors lead, stated once, prompt stays lean", () => {
  it("Priority 1 is the exact-colors section — it's the first thing after the opening line", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    const priority1Index = prompt.indexOf("PRIORITY 1");
    expect(priority1Index).toBeGreaterThan(-1);
    expect(priority1Index).toBeLessThan(150); // right after the one-line opening, not buried
    expect(prompt.slice(priority1Index, priority1Index + 40)).toContain("EXACT COLORS");
  });

  it("colorFamilyRule appears exactly once, not repeated across multiple sections", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    // A fragment unique to colorFamilyRule's text — counts real repeats of
    // the whole constraint block, not just the word "warm" appearing
    // incidentally elsewhere in the prompt.
    const occurrences = (prompt.match(/WARM TONES ONLY/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("each specific analyzed eye color name appears exactly once — no map-then-technique duplication", () => {
    const p = preview({
      palette: {
        primary: { name: "Warm Terracotta", hex: "#C4826A", use: "" },
        supporting: { name: "Soft Copper", hex: "#D4A574", use: "" },
        definition: { name: "Warm Cocoa", hex: "#8B6F47", use: "" },
      },
    });
    const plan = buildMakeupPlan(p);
    const prompt = buildPromptFromPlan(plan, p);
    expect((prompt.match(/Soft Copper/g) ?? []).length).toBe(1);
    expect((prompt.match(/Warm Cocoa/g) ?? []).length).toBe(1);
    expect((prompt.match(/#D4A574/g) ?? []).length).toBe(1);
    expect((prompt.match(/#8B6F47/g) ?? []).length).toBe(1);
  });

  it("explicitly forbids gray/blue as the rendered eye result, right in the colors section", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    const priority1 = prompt.slice(prompt.indexOf("PRIORITY 1"), prompt.indexOf("PRIORITY 2"));
    expect(priority1.toLowerCase()).toContain("gray");
    expect(priority1.toLowerCase()).toContain("blue");
  });

  it("blush is deliberately absent from the Kontext prompt — it's applied afterward by a deterministic composite, not by the AI", () => {
    // Isolated tests proved Kontext can't reliably produce the required
    // sheer/translucent finish no matter how it's worded — blush is now
    // composited separately (lib/imageGen.ts's applyBlushOverlay), so the
    // AI must be told to leave cheeks untouched rather than given a color
    // it would render as an opaque patch.
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    expect(prompt).not.toContain(plan.blush.colorName);
    expect(prompt).not.toContain(plan.blush.hex);
    expect(prompt.toLowerCase()).toContain("cheeks");
    const priority1 = prompt.slice(prompt.indexOf("PRIORITY 1"), prompt.indexOf("PRIORITY 2"));
    expect(priority1.toLowerCase()).toMatch(/cheeks:\s*leave completely untouched/);
  });

  it("stays dramatically shorter than the pre-restructure prompt (was 16,324 chars for an equivalent real palette)", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    expect(prompt.length).toBeLessThan(10000);
  });

  it("drops the flavor-only CONTEXT section and closing restatement — neither changes what the model should render", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    expect(prompt).not.toContain("CONTEXT (for reference only");
    expect(prompt).not.toContain("FINAL COLOR CHECK");
  });

  it("all 6 priorities are present and in order", () => {
    const plan = buildMakeupPlan(preview());
    const prompt = buildPromptFromPlan(plan, preview());
    const indices = [1, 2, 3, 4, 5, 6].map((n) => prompt.indexOf(`PRIORITY ${n}`));
    expect(indices.every((i) => i !== -1)).toBe(true);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});
