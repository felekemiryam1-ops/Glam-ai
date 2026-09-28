"use client";

/**
 * HairTransformation — hairstyle & hair-color recommendations, display only.
 *
 * AI photo visualization is disabled — see app/api/generate-hair/route.ts's
 * header for the full reasoning (real tests showed the model altering the
 * person's actual face, for both a full hairstyle change and a
 * color-only-restricted attempt). This component now only renders the
 * recommendations themselves as plain, non-interactive cards; there is no
 * photo upload, no selection state, and no call to /api/generate-hair.
 */

import type { HairstyleRecommendation, HairColorRecommendation } from "@/lib/hairPlanShared";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";

function RecommendationCard({ item }: { item: { name: string; description: string; whySuitable: string } }) {
  return (
    <div style={{ textAlign: "left", padding: "16px", borderRadius: "14px", border: `1.5px solid ${BORDER}`, background: "#FFFFFF" }}>
      <p style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 4px", color: INK }}>{item.name}</p>
      <p style={{ fontSize: "12.5px", color: MUTED, margin: "0 0 6px" }}>{item.description}</p>
      <p style={{ fontSize: "11.5px", color: MUTED, margin: 0, fontStyle: "italic" }}>{item.whySuitable}</p>
    </div>
  );
}

export function HairTransformation({
  hairstyles,
  colors,
}: {
  hairstyles: HairstyleRecommendation[];
  colors: HairColorRecommendation[];
}) {
  if (hairstyles.length === 0 && colors.length === 0) return null;

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: "18px", padding: "24px", background: "#FFFFFF", marginTop: "20px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px", color: INK }}>
        Hairstyle & Color Ideas
      </h3>
      <p style={{ fontSize: "12.5px", color: MUTED, margin: "0 0 20px" }}>
        Personalized suggestions for your next look.
      </p>

      {hairstyles.length > 0 && (
        <div style={{ marginBottom: colors.length > 0 ? "24px" : 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 10px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Recommended Hairstyles
          </p>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            {hairstyles.map((h) => (
              <RecommendationCard key={h.name} item={h} />
            ))}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div>
          <p style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 10px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Recommended Colors
          </p>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            {colors.map((c) => (
              <RecommendationCard key={c.name} item={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
