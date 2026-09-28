"use client";

/**
 * Monthly Glow-Up — Premium.
 * GET (on mount) reads the cached summary — zero Claude calls. The check-in
 * form only ever calls Claude when the user explicitly submits it (POST).
 */

import { useEffect, useState } from "react";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";
const PINK_BG = "#FCE7EF";

interface Summary {
  workingOn: string[];
  routineConsistencySummary: string;
  skinFocus: string;
  hairFocus: string;
  makeupFocus: string;
  nextFocus: string[];
}

type Consistency = "high" | "medium" | "low";

export function MonthlyCheckIn() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [skinChanged, setSkinChanged] = useState(false);
  const [hairChanged, setHairChanged] = useState(false);
  const [productsChanged, setProductsChanged] = useState(false);
  const [consistency, setConsistency] = useState<Consistency>("medium");
  const [improveNext, setImproveNext] = useState("");

  useEffect(() => {
    fetch("/api/monthly-glow-up")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSummary(data.summary);
          setUpdatedAt(data.updatedAt);
        }
      });
  }, []);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/monthly-glow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skinConcernsChanged: skinChanged,
          hairConcernsChanged: hairChanged,
          productsChanged,
          routineConsistency: consistency,
          improveNext: improveNext.slice(0, 300),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSummary(data.summary);
      setUpdatedAt(data.updatedAt);
      setCheckingIn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingIn) {
    return (
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <input type="checkbox" checked={skinChanged} onChange={(e) => setSkinChanged(e.target.checked)} />
            My skin concerns have changed
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <input type="checkbox" checked={hairChanged} onChange={(e) => setHairChanged(e.target.checked)} />
            My hair concerns have changed
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <input type="checkbox" checked={productsChanged} onChange={(e) => setProductsChanged(e.target.checked)} />
            I&apos;ve changed products recently
          </label>

          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>How consistent has your routine been?</p>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["low", "medium", "high"] as Consistency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setConsistency(c)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "9999px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    textTransform: "capitalize",
                    border: `1.5px solid ${consistency === c ? PINK : BORDER}`,
                    background: consistency === c ? PINK_BG : "#FFFFFF",
                    color: consistency === c ? "#C4487A" : INK,
                    cursor: "pointer",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>What do you want to improve next?</p>
            <textarea
              value={improveNext}
              onChange={(e) => setImproveNext(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="A sentence or two…"
              style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${BORDER}`, fontSize: "13px", fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: "12.5px", color: "#C4487A", marginBottom: "12px" }}>{error}</p>}

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-6 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ background: PINK, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Checking in…" : "Submit Check-In"}
          </button>
          <button
            onClick={() => setCheckingIn(false)}
            disabled={submitting}
            style={{ fontSize: "13px", color: MUTED, background: "none", border: "none", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div>
        <p style={{ fontSize: "13.5px", color: MUTED, marginBottom: "16px" }}>
          Check in once a month to see a summary of your progress and what to focus on next.
        </p>
        <button onClick={() => setCheckingIn(true)} className="px-6 py-3 rounded-xl text-white text-sm font-semibold" style={{ background: PINK }}>
          Start Your Check-In
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        {summary.workingOn.map((w) => (
          <span key={w} style={{ padding: "6px 14px", borderRadius: "9999px", background: PINK_BG, color: "#C4487A", fontSize: "12.5px", fontWeight: 600 }}>
            {w}
          </span>
        ))}
      </div>
      <p style={{ fontSize: "13.5px", margin: "0 0 12px" }}>{summary.routineConsistencySummary}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
        <p style={{ fontSize: "13px", margin: 0 }}><strong>Skin:</strong> {summary.skinFocus}</p>
        <p style={{ fontSize: "13px", margin: 0 }}><strong>Hair:</strong> {summary.hairFocus}</p>
        <p style={{ fontSize: "13px", margin: 0 }}><strong>Makeup:</strong> {summary.makeupFocus}</p>
      </div>
      <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, margin: "0 0 8px" }}>
        Next focus
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
        {summary.nextFocus.map((n) => (
          <span key={n} style={{ padding: "6px 14px", borderRadius: "9999px", border: `1px solid ${BORDER}`, fontSize: "12.5px" }}>
            {n}
          </span>
        ))}
      </div>
      {updatedAt && <p style={{ fontSize: "11.5px", color: MUTED, margin: "0 0 12px" }}>Last checked in {new Date(updatedAt).toLocaleDateString()}</p>}
      <button onClick={() => setCheckingIn(true)} style={{ fontSize: "13px", color: PINK, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
        Check in again →
      </button>
    </div>
  );
}
