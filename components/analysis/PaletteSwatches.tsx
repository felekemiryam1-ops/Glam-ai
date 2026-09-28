"use client";

/**
 * Real color blocks, not a developer color picker — categories map to
 * lib/makeupPlan.ts's buildMakeupPlan() output, which already assigns each
 * of the analysis's 3 real palette colors (from GlamPreview.palette) to a
 * specific product/region. "Complexion" has no real hex in the data (no
 * foundation-shade analysis exists), so it's shown as text guidance rather
 * than a fabricated swatch — see lib/faceMap.ts's header comment for the
 * same "don't invent what isn't there" approach applied to face-map anchors.
 */

import type { MakeupPlan } from "@/lib/makeupPlan";
import type { BeautyPalette } from "@/lib/types";

// Short, generic color-theory guidance tied to the user's real analyzed
// colorDirection — not per-user AI content, just standard seasonal-color
// framing applied to a real finding, kept intentionally brief.
const MINDFUL_COLORS: Record<string, { name: string; hex: string }[]> = {
  warm: [
    { name: "Icy silver", hex: "#C8CDD6" },
    { name: "Blue-based fuchsia", hex: "#C13584" },
    { name: "Ashy taupe", hex: "#A79E96" },
  ],
  cool: [
    { name: "Golden orange", hex: "#D98A3D" },
    { name: "Warm yellow-gold", hex: "#D4AC3F" },
    { name: "Terracotta", hex: "#C4826A" },
  ],
  neutral: [
    { name: "Neon brights", hex: "#E0E020" },
    { name: "Extreme jewel tones", hex: "#5B1A8C" },
  ],
};

function Swatch({ name, hex, use }: { name: string; hex: string; use?: string }) {
  return (
    <div style={{ width: "100px", flexShrink: 0 }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          borderRadius: "12px",
          background: hex,
          marginBottom: "10px",
          boxShadow: "0 2px 10px rgba(36,32,36,0.08)",
        }}
      />
      <p style={{ fontSize: "13px", margin: "0 0 2px", color: "#242024", fontWeight: 500 }}>{name}</p>
      <p style={{ fontSize: "10px", letterSpacing: "0.08em", color: "#a49da2", margin: use ? "0 0 4px" : 0, textTransform: "uppercase" }}>{hex}</p>
      {use && <p style={{ fontSize: "11px", color: "#a49da2", margin: 0, lineHeight: 1.4 }}>{use}</p>}
    </div>
  );
}

function Category({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 16px" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

export function PaletteSwatches({
  plan,
  palette,
  complexionGuidance,
}: {
  plan: MakeupPlan;
  palette: BeautyPalette;
  complexionGuidance?: string;
}) {
  const overallSwatches = [palette.primary, palette.supporting, palette.definition];
  const mindful = MINDFUL_COLORS[plan.colorFamilyRule.includes("WARM") ? "warm" : plan.colorFamilyRule.includes("COOL") ? "cool" : "neutral"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
      <Category title="Overall Palette">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
          {overallSwatches.map((c) => (
            <Swatch key={c.hex} name={c.name} hex={c.hex} use={c.use} />
          ))}
        </div>
      </Category>

      <Category title="Eyes">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
          <Swatch name={plan.eyeshadow.transition.colorName} hex={plan.eyeshadow.transition.hex} use="Transition" />
          <Swatch name={plan.eyeshadow.lid.colorName} hex={plan.eyeshadow.lid.hex} use="Lid + definition" />
        </div>
      </Category>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "24px" }}>
        <Category title="Blush">
          <Swatch name={plan.blush.colorName} hex={plan.blush.hex} />
        </Category>
        <Category title="Lips">
          <Swatch name={plan.lips.colorName} hex={plan.lips.hex} />
        </Category>
      </div>

      {complexionGuidance && (
        <Category title="Complexion">
          <p style={{ fontSize: "14px", lineHeight: 1.65, color: "#4a454a", margin: 0, fontWeight: 300, maxWidth: "480px" }}>
            {complexionGuidance}
          </p>
        </Category>
      )}

      {mindful && mindful.length > 0 && (
        <Category title="Colors to Be Mindful Of">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
            {mindful.map((c) => (
              <div key={c.hex} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: c.hex, flexShrink: 0, border: "1px solid rgba(36,32,36,0.08)" }} />
                <span style={{ fontSize: "13px", color: "#777177" }}>{c.name}</span>
              </div>
            ))}
          </div>
        </Category>
      )}
    </div>
  );
}
