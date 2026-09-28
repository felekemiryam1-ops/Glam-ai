"use client";

/**
 * /dashboard/hair — Hair Glow-Up (Pro/Premium)
 *
 * Mirrors app/dashboard/skin/page.tsx's structure and behavior exactly —
 * see that file's header for the full flow explanation, not repeated here.
 * Entitlement is enforced server-side; the paywall state below is UX only.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Droplets, CalendarDays, Scissors, ShoppingBag, Pencil } from "lucide-react";
import { UpgradeButton } from "@/app/dashboard/UpgradeButton";
// Imported from the shared, client-safe module — NOT lib/hairPlan.ts,
// which instantiates the Anthropic client at module scope and must never
// be bundled into client code (Stage 6 Step 8/9 fix).
import { HAIR_TYPES, HAIR_CONCERNS, type HairPlan } from "@/lib/hairPlanShared";
import { HairTransformation } from "@/components/hair/HairTransformation";

const BUDGETS = [
  { id: "budget", label: "Budget-friendly" },
  { id: "mid_range", label: "Mid-range" },
  { id: "premium", label: "Premium & Luxury" },
] as const;

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";
const PINK_BG = "#FCE7EF";

type Intake = { hairType: string | null; hairConcerns: string[]; budget: string | null };

type ViewState =
  | { status: "loading" }
  | { status: "paywall" }
  | { status: "error"; message: string }
  | { status: "intake"; intake: Intake }
  | { status: "plan"; intake: Intake; plan: HairPlan; updatedAt: string | null; editing: boolean };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: PINK, margin: "0 0 16px" }}>
      {children}
    </p>
  );
}

function PillButton({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: "9999px",
        fontSize: "13.5px",
        fontWeight: 600,
        border: `1.5px solid ${selected ? PINK : BORDER}`,
        background: selected ? PINK_BG : "#FFFFFF",
        color: selected ? "#C4487A" : disabled ? "#c9bfc4" : INK,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: "18px", padding: "24px", background: "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        {icon}
        <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0, color: INK }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function HairGlowUpPage() {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Intake>({ hairType: null, hairConcerns: [], budget: null });
  const fetchStartedRef = useRef(false);

  async function load() {
    setView({ status: "loading" });
    try {
      const res = await fetch("/api/hair-glow-up");
      if (res.status === 403) {
        setView({ status: "paywall" });
        return;
      }
      if (!res.ok) {
        setView({ status: "error", message: "Couldn't load your Hair Glow-Up. Please try again." });
        return;
      }
      const data = await res.json();
      const intake: Intake = data.intake;
      if (data.hairPlan) {
        setView({ status: "plan", intake, plan: data.hairPlan, updatedAt: data.hairPlanUpdatedAt, editing: false });
      } else {
        setDraft(intake);
        setView({ status: "intake", intake });
      }
    } catch {
      setView({ status: "error", message: "Network error. Please try again." });
    }
  }

  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    load();
  }, []);

  async function submit(intake: Intake, refresh: boolean) {
    if (!intake.hairType || intake.hairConcerns.length === 0 || !intake.budget) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/hair-glow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hairType: intake.hairType, hairConcerns: intake.hairConcerns, budget: intake.budget, refresh }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setView({ status: "plan", intake, plan: data.hairPlan, updatedAt: data.hairPlanUpdatedAt, editing: false });
      setSubmitting(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error. Please try again.");
      setSubmitting(false);
    }
  }

  function toggleConcern(id: string) {
    setDraft((d) => {
      if (d.hairConcerns.includes(id)) return { ...d, hairConcerns: d.hairConcerns.filter((c) => c !== id) };
      if (d.hairConcerns.length >= 3) return d;
      return { ...d, hairConcerns: [...d.hairConcerns, id] };
    });
  }

  const canSubmit = !!draft.hairType && draft.hairConcerns.length > 0 && !!draft.budget;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: INK }}>
      <nav style={{ padding: "24px clamp(20px,5vw,64px)", borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: MUTED }}>
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
      </nav>

      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "clamp(48px,7vw,80px) clamp(20px,5vw,64px) 96px" }}>
        {view.status === "loading" && <p style={{ fontSize: "14px", color: MUTED }}>Loading your Hair Glow-Up…</p>}

        {view.status === "error" && (
          <div style={{ padding: "40px", textAlign: "center", border: `1px solid ${BORDER}`, borderRadius: "18px" }}>
            <p style={{ fontSize: "14px", color: MUTED, marginBottom: "20px" }}>{view.message}</p>
            <button onClick={load} className="px-6 py-3 rounded-xl text-white text-sm font-semibold" style={{ background: PINK }}>
              Try again
            </button>
          </div>
        )}

        {view.status === "paywall" && (
          <div style={{ textAlign: "center", padding: "64px 24px" }}>
            <Eyebrow>Hair Glow-Up</Eyebrow>
            <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 14px" }}>
              A personalized hair routine, made for you
            </h1>
            <p style={{ fontSize: "15px", color: MUTED, maxWidth: "440px", margin: "0 auto 32px" }}>
              Hair Glow-Up is included with Glam AI Pro — a short intake, then a concise wash-day, weekly, and
              styling routine built around your hair type and goals.
            </p>
            <div style={{ maxWidth: "280px", margin: "0 auto" }}>
              <UpgradeButton plan="pro" label="Upgrade to Pro — $9.99/mo" />
            </div>
          </div>
        )}

        {(view.status === "intake" || (view.status === "plan" && view.editing)) && (
          <div>
            <Eyebrow>Hair Glow-Up</Eyebrow>
            <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 8px" }}>
              A few quick questions
            </h1>
            <p style={{ fontSize: "14px", color: MUTED, margin: "0 0 40px" }}>
              This takes under a minute and shapes your entire routine.
            </p>

            <p style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px" }}>Hair type</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "32px" }}>
              {HAIR_TYPES.map((t) => (
                <PillButton key={t.id} selected={draft.hairType === t.id} onClick={() => setDraft((d) => ({ ...d, hairType: t.id }))}>
                  {t.label}
                </PillButton>
              ))}
            </div>

            <p style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 4px" }}>Main concerns</p>
            <p style={{ fontSize: "12.5px", color: MUTED, margin: "0 0 12px" }}>Choose 1–3.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "32px" }}>
              {HAIR_CONCERNS.map((c) => {
                const selected = draft.hairConcerns.includes(c.id);
                const disabled = !selected && draft.hairConcerns.length >= 3;
                return (
                  <PillButton key={c.id} selected={selected} disabled={disabled} onClick={() => toggleConcern(c.id)}>
                    {c.label}
                  </PillButton>
                );
              })}
            </div>

            <p style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px" }}>Budget</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "40px" }}>
              {BUDGETS.map((b) => (
                <PillButton key={b.id} selected={draft.budget === b.id} onClick={() => setDraft((d) => ({ ...d, budget: b.id }))}>
                  {b.label}
                </PillButton>
              ))}
            </div>

            {submitError && <p style={{ fontSize: "13px", color: "#C4487A", marginBottom: "16px" }}>{submitError}</p>}

            <button
              onClick={() => submit(draft, false)}
              disabled={!canSubmit || submitting}
              className="px-8 py-3 rounded-xl text-white text-sm font-semibold"
              style={{ background: canSubmit ? PINK : "#e6d5dc", cursor: canSubmit && !submitting ? "pointer" : "default" }}
            >
              {submitting ? "Building your routine…" : "Get My Hair Glow-Up"}
            </button>
          </div>
        )}

        {view.status === "plan" && !view.editing && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
              <div>
                <Eyebrow>✨ Your Hair Glow-Up</Eyebrow>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => {
                    setDraft(view.intake);
                    setView({ ...view, editing: true });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: MUTED, background: "none", border: `1px solid ${BORDER}`, borderRadius: "9999px", padding: "8px 16px", cursor: "pointer" }}
                >
                  <Pencil size={13} />
                  Edit my answers
                </button>
                <button
                  onClick={() => submit(view.intake, true)}
                  disabled={submitting}
                  style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#C4487A", background: PINK_BG, border: "none", borderRadius: "9999px", padding: "8px 16px", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}
                >
                  <RefreshCw size={13} />
                  {submitting ? "Refreshing…" : "Refresh My Plan"}
                </button>
              </div>
            </div>

            {submitError && <p style={{ fontSize: "13px", color: "#C4487A", marginBottom: "16px" }}>{submitError}</p>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "36px" }}>
              {view.plan.hairGoals.map((g) => (
                <span key={g} style={{ padding: "8px 16px", borderRadius: "9999px", background: PINK_BG, color: "#C4487A", fontSize: "13px", fontWeight: 600 }}>
                  {g}
                </span>
              ))}
            </div>

            <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
              <Card title="Wash Day" icon={<Droplets size={16} style={{ color: PINK }} />}>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {view.plan.washDayRoutine.map((step, i) => (
                    <li key={i}>
                      <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>
                        {i + 1}. {step.step} <span style={{ color: MUTED, fontWeight: 400 }}>— {step.productType}</span>
                      </p>
                      <p style={{ fontSize: "12.5px", color: MUTED, margin: 0 }}>{step.why}</p>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card title="Weekly Care" icon={<CalendarDays size={16} style={{ color: PINK }} />}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {view.plan.weeklyRoutine.map((step, i) => (
                    <li key={i}>
                      <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>
                        {step.step} <span style={{ color: MUTED, fontWeight: 400 }}>— {step.frequency}</span>
                      </p>
                      <p style={{ fontSize: "12.5px", color: MUTED, margin: 0 }}>{step.why}</p>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="Styling" icon={<Scissors size={16} style={{ color: PINK }} />}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {view.plan.stylingRecommendations.map((s, i) => (
                    <li key={i}>
                      <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>{s.tip}</p>
                      <p style={{ fontSize: "12.5px", color: MUTED, margin: 0 }}>{s.why}</p>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="What to look for" icon={<ShoppingBag size={16} style={{ color: PINK }} />}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {view.plan.recommendedProducts.map((p, i) => (
                    <li key={i}>
                      <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>
                        {p.category} <span style={{ color: MUTED, fontWeight: 400 }}>— {p.productType}</span>
                      </p>
                      {p.example && <p style={{ fontSize: "12.5px", color: PINK, margin: "0 0 2px", fontWeight: 600 }}>{p.example}</p>}
                      <p style={{ fontSize: "12.5px", color: MUTED, margin: 0 }}>{p.why}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <HairTransformation hairstyles={view.plan.recommendedHairstyles ?? []} colors={view.plan.recommendedColors ?? []} />

            {view.updatedAt && (
              <p style={{ fontSize: "12px", color: MUTED, marginTop: "28px" }}>
                Updated {new Date(view.updatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
