"use client";

/**
 * Today's Routine — Premium Routine Tracking.
 * Reads/writes app/api/routine-checkin — zero AI calls, pure DB state.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Flame } from "lucide-react";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";

const CATEGORY_LABELS: Record<string, string> = {
  skin_am: "Morning skin",
  skin_pm: "Night skin",
  hair: "Hair",
  makeup: "Makeup",
};

interface RoutineState {
  today: Record<string, boolean>;
  weekCompletionCount: number;
  weekTotalPossible: number;
  streakDays: number;
}

export function RoutineTracker() {
  const [state, setState] = useState<RoutineState | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/routine-checkin")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setState(data));
  }, []);

  async function toggle(category: string) {
    if (!state) return;
    const completed = !state.today[category];
    setPending(category);
    // Optimistic update for a snappy feel — reconciled with the server response below.
    setState({ ...state, today: { ...state.today, [category]: completed } });
    try {
      const res = await fetch("/api/routine-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, completed }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } finally {
      setPending(null);
    }
  }

  if (!state) return <p style={{ fontSize: "13px", color: MUTED }}>Loading…</p>;

  const weekPct = state.weekTotalPossible > 0 ? Math.round((state.weekCompletionCount / state.weekTotalPossible) * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
          const done = state.today[key];
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              disabled={pending === key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: `1px solid ${done ? PINK : BORDER}`,
                background: done ? "#FCE7EF" : "#FFFFFF",
                cursor: "pointer",
                textAlign: "left",
                opacity: pending === key ? 0.6 : 1,
              }}
            >
              {done ? <CheckCircle2 size={17} style={{ color: PINK, flexShrink: 0 }} /> : <Circle size={17} style={{ color: "#c9bfc4", flexShrink: 0 }} />}
              <span style={{ fontSize: "13.5px", fontWeight: 600, color: INK }}>{label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: "12.5px", color: MUTED }}>
        <span>{weekPct}% this week</span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Flame size={13} style={{ color: state.streakDays > 0 ? "#E8A34F" : "#c9bfc4" }} />
          {state.streakDays} day streak
        </span>
      </div>
    </div>
  );
}
