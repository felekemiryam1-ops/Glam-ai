"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Tap-to-expand detail — the default report stays scannable (short text
 * only); the fuller AI reasoning already present in the data (e.g.
 * RecommendationItem.why) is revealed only when the user asks for it.
 */
export function LearnMore({ children, label = "Learn more" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          minHeight: "36px",
          padding: "6px 2px",
          background: "none",
          border: "none",
          color: "#E88BA8",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {open ? "Show less" : label}
        <ChevronDown
          size={14}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>
      {open && (
        <div style={{ marginTop: "4px", fontSize: "14px", lineHeight: 1.65, color: "#4a454a", fontWeight: 300 }}>
          {children}
        </div>
      )}
    </div>
  );
}
