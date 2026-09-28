"use client";
// /onboarding — protected by proxy.ts (requires login).
// 3-step wizard: goals → aesthetic → budget.
// Submits to POST /api/profile/onboarding, then redirects to /dashboard.

import { useState } from "react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Step data
// ─────────────────────────────────────────────────────────────────────────────

const GOALS = [
  { id: "everyday_glow", label: "Everyday glow-up" },
  { id: "better_makeup", label: "Better makeup skills" },
  { id: "hair_transformation", label: "Hair transformation" },
  { id: "style_upgrade", label: "Style upgrade" },
  { id: "occasion_prep", label: "Special occasion prep" },
  { id: "confidence_boost", label: "Confidence boost" },
] as const;

const AESTHETICS = [
  { id: "soft_glam", label: "Soft Glam", desc: "Dewy skin, warm bronze, blended neutrals" },
  { id: "clean_girl", label: "Clean Girl", desc: "Minimal makeup, slicked hair, effortless glow" },
  { id: "bold_colorful", label: "Bold & Colorful", desc: "Statement eyes, vivid lips, graphic shapes" },
  { id: "natural", label: "Natural & Minimal", desc: "Enhance what you have — barely-there beauty" },
  { id: "vintage", label: "Vintage & Retro", desc: "Classic red lip, winged liner, old Hollywood" },
  { id: "edgy", label: "Edgy & Avant-Garde", desc: "Dark tones, unexpected looks, editorial edge" },
  { id: "classic", label: "Classic & Timeless", desc: "Polished, sophisticated, always-appropriate" },
] as const;

const BUDGETS = [
  {
    id: "budget",
    label: "Budget-friendly",
    desc: "Drugstore finds that perform just as well",
    range: "Under $25/product",
  },
  {
    id: "mid_range",
    label: "Mid-range",
    desc: "A mix of drugstore and mid-tier brands",
    range: "$25–$60/product",
  },
  {
    id: "premium",
    label: "Premium & Luxury",
    desc: "Investment pieces and luxury brands",
    range: "$60+/product",
  },
] as const;

type GoalId = (typeof GOALS)[number]["id"];
type AestheticId = (typeof AESTHETICS)[number]["id"];
type BudgetId = (typeof BUDGETS)[number]["id"];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(0); // 0 = goals, 1 = aesthetic, 2 = budget
  const [goals, setGoals] = useState<GoalId[]>([]);
  const [aesthetic, setAesthetic] = useState<AestheticId | null>(null);
  const [budget, setBudget] = useState<BudgetId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Step navigation ────────────────────────────────────────────────────────

  function canAdvance() {
    if (step === 0) return goals.length > 0;
    if (step === 1) return aesthetic !== null;
    if (step === 2) return budget !== null;
    return false;
  }

  function toggleGoal(id: GoalId) {
    setGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (!canAdvance()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/profile/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals, aesthetic, budget }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const canGo = canAdvance();
  const rowStyle: React.CSSProperties = {
    all: "unset",
    boxSizing: "border-box",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 4px",
    borderTop: "1px solid #F1E6EA",
    cursor: "pointer",
    gap: "16px",
  };

  const dot = (selected: boolean): React.CSSProperties => ({
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: `1px solid ${selected ? "#E88BA8" : "#D8CBD1"}`,
    background: selected ? "#E88BA8" : "transparent",
    flexShrink: 0,
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#242024", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "24px clamp(20px,5vw,64px) 0" }}>
        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
        <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "19px", fontWeight: 500 }}>Glam AI</span>
      </div>

      {/* Progress bar */}
      <div style={{ maxWidth: "640px", margin: "40px auto 0", width: "100%", padding: "0 clamp(20px,5vw,64px)" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: "2px",
                flex: 1,
                borderRadius: "2px",
                background: i <= step ? "#E88BA8" : "#F1E6EA",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>
        <p style={{ textAlign: "right", fontSize: "12px", color: "#a49da2", margin: 0 }}>Step {step + 1} of 3</p>
      </div>

      {/* Content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "56px clamp(20px,5vw,64px) 40px" }}>
        <div style={{ width: "100%", maxWidth: "640px" }}>

          {/* Step 0: Goals */}
          {step === 0 && (
            <>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px" }}>
                Your Beauty Goals
              </p>
              <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2rem,4.5vw,2.8rem)", lineHeight: 1.2, margin: "0 0 16px" }}>
                What are you working towards?
              </h1>
              <p style={{ fontSize: "15px", color: "#777177", margin: "0 0 44px", fontWeight: 300 }}>
                Select everything that applies — your AI will prioritize accordingly.
              </p>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {GOALS.map(({ id, label }) => {
                  const selected = goals.includes(id);
                  return (
                    <button key={id} onClick={() => toggleGoal(id)} style={rowStyle}>
                      <span style={{ fontSize: "17px", fontFamily: "var(--font-cormorant)", color: selected ? "#242024" : "#4a454a" }}>
                        {label}
                      </span>
                      <span style={dot(selected)} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Step 1: Aesthetic */}
          {step === 1 && (
            <>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px" }}>
                Your Aesthetic
              </p>
              <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2rem,4.5vw,2.8rem)", lineHeight: 1.2, margin: "0 0 16px" }}>
                What&apos;s your vibe?
              </h1>
              <p style={{ fontSize: "15px", color: "#777177", margin: "0 0 44px", fontWeight: 300 }}>
                Pick the aesthetic that resonates most with you right now.
              </p>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {AESTHETICS.map(({ id, label, desc }) => {
                  const selected = aesthetic === id;
                  return (
                    <button key={id} onClick={() => setAesthetic(id)} style={rowStyle}>
                      <span>
                        <span style={{ display: "block", fontSize: "17px", fontFamily: "var(--font-cormorant)", color: selected ? "#242024" : "#4a454a", marginBottom: "4px" }}>
                          {label}
                        </span>
                        <span style={{ display: "block", fontSize: "13px", color: "#a49da2" }}>{desc}</span>
                      </span>
                      <span style={dot(selected)} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Step 2: Budget */}
          {step === 2 && (
            <>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px" }}>
                Your Budget
              </p>
              <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2rem,4.5vw,2.8rem)", lineHeight: 1.2, margin: "0 0 16px" }}>
                What&apos;s your beauty budget?
              </h1>
              <p style={{ fontSize: "15px", color: "#777177", margin: "0 0 44px", fontWeight: 300 }}>
                Your AI will recommend products in this range.
              </p>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {BUDGETS.map(({ id, label, desc, range }) => {
                  const selected = budget === id;
                  return (
                    <button key={id} onClick={() => setBudget(id)} style={rowStyle}>
                      <span>
                        <span style={{ display: "block", fontSize: "17px", fontFamily: "var(--font-cormorant)", color: selected ? "#242024" : "#4a454a", marginBottom: "4px" }}>
                          {label}
                        </span>
                        <span style={{ display: "block", fontSize: "13px", color: "#a49da2" }}>{desc}</span>
                      </span>
                      <span style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ display: "block", fontSize: "12px", color: "#a49da2" }}>{range}</span>
                        <span style={{ display: "inline-block", marginTop: "6px", ...dot(selected), width: "18px", height: "18px" }} />
                      </span>
                    </button>
                  );
                })}
              </div>

              {error && <p style={{ color: "#DC2626", fontSize: "14px", marginTop: "16px" }}>{error}</p>}
            </>
          )}

          {/* Nav buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "48px" }}>
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                style={{ background: "none", border: "none", fontSize: "14px", color: "#777177", cursor: "pointer", padding: "14px 4px", fontFamily: "var(--font-sans)" }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={step < 2 ? () => canGo && setStep((s) => s + 1) : handleSubmit}
              disabled={!canGo || loading}
              style={{
                marginLeft: "auto",
                height: "52px",
                paddingInline: "32px",
                borderRadius: "9999px",
                border: "none",
                background: canGo ? "#242024" : "#E8DFE3",
                color: "#FFFFFF",
                fontFamily: "var(--font-sans)",
                fontSize: "15px",
                fontWeight: 600,
                cursor: !canGo || loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Saving…" : step < 2 ? "Continue →" : "Start my Glam AI"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
