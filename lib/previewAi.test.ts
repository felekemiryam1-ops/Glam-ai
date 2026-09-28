import { describe, it, expect } from "vitest";
import { USER_PROMPT } from "./previewAi";

// Asserts on the prompt text itself (no live AI call) — verifies the
// aesthetic/wearability guidance that steers the "definition" color
// (the one most likely to become eyeshadow) away from theatrical/costume
// drift is actually present in what gets sent to the model.
describe("previewAi USER_PROMPT — aesthetic guidance", () => {
  it("biases the 'definition' role toward sophisticated warm-neutral eyeshadow shades", () => {
    const lower = USER_PROMPT.toLowerCase();
    expect(lower).toContain("cocoa");
    expect(lower).toContain("espresso");
    expect(lower).toContain("bronze");
    expect(lower).toContain("taupe");
  });

  it("explicitly warns against yellow/olive drift even when 'gold'/'bronze' technically applies", () => {
    const lower = USER_PROMPT.toLowerCase();
    expect(lower).toContain("yellow");
    expect(lower).toContain("olive");
  });

  it("ties the bold/saturated exception to an explicit style signal, not an unconditional default", () => {
    const lower = USER_PROMPT.toLowerCase();
    expect(lower).toMatch(/bold, dramatic, editorial/);
  });

  it("does not use 'golden-bronze' as a differentiation example (too close to the yellow drift target)", () => {
    expect(USER_PROMPT.toLowerCase()).not.toContain("golden-bronze");
  });
});
