"use client";

/**
 * Before/After — extracted from app/glow-up/page.tsx verbatim (same drag
 * behavior, same clip-path reveal, same desktop fallback), just given a
 * home shared components can reuse instead of living inline in one page.
 */

import { useRef, useState } from "react";

// ── Mobile: draggable comparison slider ────────────────────────────────────

function ComparisonSlider({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
}) {
  const [pos, setPos] = useState(45); // percentage 0–100
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  function updatePos(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPos((x / rect.width) * 100);
  }

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden aspect-[3/4] bg-[#F5F0F2] touch-none cursor-ew-resize"
      style={{ borderRadius: "8px" }}
      onPointerDown={(e) => {
        isDragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        updatePos(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!isDragging.current) return;
        updatePos(e.clientX);
      }}
      onPointerUp={() => { isDragging.current = false; }}
      onPointerCancel={() => { isDragging.current = false; }}
    >
      {/* Before (base layer — always visible) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={beforeSrc} alt={beforeAlt} className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* After (top layer — clipped to right of divider) */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterSrc} alt={afterAlt} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-px"
        style={{
          left: `${pos}%`,
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 0 8px rgba(255,255,255,0.6)",
        }}
      >
        {/* Handle */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 14px rgba(0,0,0,0.18)" }}
        >
          <svg className="w-4 h-4 text-[#E88BA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
          </svg>
        </div>
      </div>

      {/* BEFORE label */}
      <span
        className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white rounded-full px-2.5 py-1 transition-opacity duration-150"
        style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", opacity: pos > 12 ? 1 : 0 }}
      >
        Before
      </span>

      {/* AFTER label */}
      <span
        className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white rounded-full px-2.5 py-1 transition-opacity duration-150"
        style={{ background: "rgba(232,139,168,0.85)", backdropFilter: "blur(4px)", opacity: pos < 88 ? 1 : 0 }}
      >
        After
      </span>
    </div>
  );
}

// ── Desktop: side-by-side large images ─────────────────────────────────────

function DesktopBeforeAfter({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(16px,3vw,28px)", maxWidth: "720px" }}>
      <div>
        <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "#a49da2", margin: "0 0 12px", textAlign: "center" }}>
          Before
        </p>
        <div style={{ borderRadius: "8px", overflow: "hidden", aspectRatio: "3/4", background: "#F5F0F2" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeSrc} alt={beforeAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
      <div>
        <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "#E88BA8", margin: "0 0 12px", textAlign: "center" }}>
          After
        </p>
        <div style={{ borderRadius: "8px", overflow: "hidden", aspectRatio: "3/4", background: "#FCE7EF" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={afterSrc} alt={afterAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
    </div>
  );
}

// ── Exported: switches mobile/desktop internally ────────────────────────────

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt = "Before your Glow-Up",
  afterAlt = "After your Glow-Up",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
}) {
  return (
    <>
      <div className="sm:hidden">
        <ComparisonSlider beforeSrc={beforeSrc} afterSrc={afterSrc} beforeAlt={beforeAlt} afterAlt={afterAlt} />
        <p style={{ textAlign: "center", fontSize: "13px", color: "#a49da2", margin: "16px 0 0" }}>
          ← Drag to compare →
        </p>
      </div>
      <div className="hidden sm:block">
        <DesktopBeforeAfter beforeSrc={beforeSrc} afterSrc={afterSrc} beforeAlt={beforeAlt} afterAlt={afterAlt} />
      </div>
    </>
  );
}
