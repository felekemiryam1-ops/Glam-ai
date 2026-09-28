"use client";

/**
 * Renders numbered callout dots over the user's ORIGINAL photo — never the
 * generated image, and never anything sent to the image-generation model.
 * Positions come from lib/faceMap.ts (real landmark-derived pixel
 * coordinates), placed here as plain absolutely-positioned HTML markers
 * sized in real CSS pixels (not SVG viewBox units) so tap targets stay a
 * consistent, comfortable size regardless of the source photo's resolution
 * or how much the container has been scaled down to fit the screen.
 */

import { useState } from "react";
import type { FaceMapAnchor } from "@/lib/types";

export function FaceMapOverlay({
  imageSrc,
  imageAlt = "Your photo with Face Map callouts",
  imageWidth,
  imageHeight,
  anchors,
}: {
  imageSrc: string;
  imageAlt?: string;
  imageWidth: number | null;
  imageHeight: number | null;
  anchors: FaceMapAnchor[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // No usable coordinates (e.g. landmark detection failed or didn't run for
  // this analysis) — fall back to the plain photo rather than guessing.
  if (!imageWidth || !imageHeight || anchors.length === 0) {
    return (
      <div style={{ width: "100%", aspectRatio: "3/4", borderRadius: "8px", overflow: "hidden", background: "#F5F0F2" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt={imageAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  // Top-to-bottom numbering reads more naturally than data order.
  const sorted = [...anchors].sort((a, b) => a.y - b.y);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${imageWidth} / ${imageHeight}`, background: "#F5F0F2" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={imageAlt}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "8px" }}
      />

      {sorted.map((anchor, i) => {
        const leftPct = Math.min(98, Math.max(2, (anchor.x / imageWidth) * 100));
        const topPct = Math.min(98, Math.max(2, (anchor.y / imageHeight) * 100));
        const isActive = activeIndex === i;
        // Keep the popover from overflowing near the left/right edges.
        const popoverTransform = leftPct < 22 ? "translateX(-12%)" : leftPct > 78 ? "translateX(-88%)" : "translateX(-50%)";

        return (
          <div
            key={`${anchor.region}-${i}`}
            style={{ position: "absolute", left: `${leftPct}%`, top: `${topPct}%`, transform: "translate(-50%,-50%)" }}
          >
            <button
              onClick={() => setActiveIndex((cur) => (cur === i ? null : i))}
              aria-label={`${anchor.region}: ${anchor.label}`}
              aria-expanded={isActive}
              style={{
                width: "34px",
                height: "34px",
                minWidth: "34px",
                minHeight: "34px",
                borderRadius: "50%",
                border: "2px solid #FFFFFF",
                background: isActive ? "#E88BA8" : "rgba(36,32,36,0.72)",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(36,32,36,0.3)",
                padding: 0,
                transition: "background 0.15s",
              }}
            >
              {i + 1}
            </button>

            {isActive && (
              <div
                role="tooltip"
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: "50%",
                  transform: popoverTransform,
                  minWidth: "150px",
                  maxWidth: "190px",
                  background: "#242024",
                  color: "#FFFFFF",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  lineHeight: 1.45,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
                  zIndex: 5,
                }}
              >
                <p style={{ margin: "0 0 3px", fontWeight: 700, textTransform: "capitalize" }}>{anchor.region}</p>
                <p style={{ margin: 0, opacity: 0.9 }}>{anchor.label}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
