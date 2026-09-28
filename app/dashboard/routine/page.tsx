"use client";

/**
 * /dashboard/routine — Beauty Routine (Pro/Premium)
 *
 * Pure display of GET /api/beauty-routine — a deterministic assembly of
 * already-cached Skin/Hair plans + the existing makeup plan/product
 * matching. This page makes NO POST requests and triggers NO generation of
 * any kind; if a section's underlying data doesn't exist yet, it shows a
 * link to go complete that Glow-Up instead of calling anything here.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sun, Moon, CalendarDays, Sparkles, ShoppingBag, ArrowRight } from "lucide-react";
import { UpgradeButton } from "@/app/dashboard/UpgradeButton";
// Type-only, but sourced from the shared client-safe modules for
// consistency with the other client pages (Stage 6 Step 8/9 fix) — type
// imports are erased at build time either way, but this keeps every
// client-side reference pointed at the same safe source.
import type { SkinPlan } from "@/lib/skinPlanShared";
import type { HairPlan } from "@/lib/hairPlanShared";
import type { CategoryMatchResult } from "@/lib/productMatching";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";
const PINK_BG = "#FCE7EF";

interface MakeupSummary {
  colorDirection: string;
  intensityLabel: string;
  eyeColorName: string;
  blushColorName: string;
  lipColorName: string;
  imageUrl: string | null;
}

interface RoutineData {
  skinPlan: SkinPlan | null;
  hairPlan: HairPlan | null;
  makeup: MakeupSummary | null;
  matchedProducts: CategoryMatchResult[];
}

type ViewState =
  | { status: "loading" }
  | { status: "paywall" }
  | { status: "error"; message: string }
  | { status: "done"; data: RoutineData };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: PINK, margin: "0 0 16px" }}>
      {children}
    </p>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: "18px", padding: "26px", background: "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
        {icon}
        <h2 style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0, color: INK }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SubGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, margin: "0 0 8px" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function CompletePrompt({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "12px 14px", borderRadius: "10px", background: PINK_BG, fontSize: "13px", color: "#C4487A", fontWeight: 600 }}>
      {label}
      <ArrowRight size={13} />
    </Link>
  );
}

function StepList({ items }: { items: { step: string; productType?: string; frequency?: string; why: string }[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
      {items.map((item, i) => (
        <li key={i}>
          <p style={{ fontSize: "13.5px", fontWeight: 600, margin: "0 0 1px" }}>
            {item.step}
            {(item.productType || item.frequency) && (
              <span style={{ color: MUTED, fontWeight: 400 }}> — {item.productType ?? item.frequency}</span>
            )}
          </p>
          <p style={{ fontSize: "12px", color: MUTED, margin: 0 }}>{item.why}</p>
        </li>
      ))}
    </ul>
  );
}

export default function BeautyRoutinePage() {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const fetchStartedRef = useRef(false);

  async function load() {
    setView({ status: "loading" });
    try {
      const res = await fetch("/api/beauty-routine");
      if (res.status === 403) {
        setView({ status: "paywall" });
        return;
      }
      if (!res.ok) {
        setView({ status: "error", message: "Couldn't load your Beauty Routine. Please try again." });
        return;
      }
      const data = (await res.json()) as RoutineData;
      setView({ status: "done", data });
    } catch {
      setView({ status: "error", message: "Network error. Please try again." });
    }
  }

  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    load();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: INK }}>
      <nav style={{ padding: "24px clamp(20px,5vw,64px)", borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: MUTED }}>
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
      </nav>

      <main style={{ maxWidth: "920px", margin: "0 auto", padding: "clamp(48px,7vw,80px) clamp(20px,5vw,64px) 96px" }}>
        {view.status === "loading" && <p style={{ fontSize: "14px", color: MUTED }}>Loading your Beauty Routine…</p>}

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
            <Eyebrow>Beauty Routine</Eyebrow>
            <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 14px" }}>
              Everything you should do today, in one place
            </h1>
            <p style={{ fontSize: "15px", color: MUTED, maxWidth: "440px", margin: "0 auto 32px" }}>
              Beauty Routine is included with Glam AI Pro — your makeup, skin, and hair recommendations, combined
              into one simple daily plan.
            </p>
            <div style={{ maxWidth: "280px", margin: "0 auto" }}>
              <UpgradeButton plan="pro" label="Upgrade to Pro — $9.99/mo" />
            </div>
          </div>
        )}

        {view.status === "done" && (() => {
          const { skinPlan, hairPlan, makeup } = view.data;
          const nothingYet = !skinPlan && !hairPlan && !makeup;

          return (
            <div>
              <Eyebrow>✨ My Beauty Routine</Eyebrow>
              <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 12px" }}>
                What to actually do today
              </h1>
              <p style={{ fontSize: "14.5px", color: MUTED, margin: "0 0 40px", maxWidth: "560px" }}>
                {nothingYet
                  ? "Complete your Glow-Up, Skin Glow-Up, and Hair Glow-Up to see your combined routine here."
                  : "Your makeup, skin, and hair recommendations, brought together — nothing new to read, just what's next."}
              </p>

              {nothingYet ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "360px" }}>
                  <CompletePrompt label="Get your first Glow-Up" href="/upload" />
                  <CompletePrompt label="Complete your Skin Glow-Up" href="/dashboard/skin" />
                  <CompletePrompt label="Complete your Hair Glow-Up" href="/dashboard/hair" />
                </div>
              ) : (
                <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
                  {/* ── MORNING ─────────────────────────────────────────── */}
                  <SectionCard title="Morning" icon={<Sun size={16} style={{ color: PINK }} />}>
                    <SubGroup label="Skin">
                      {skinPlan ? <StepList items={skinPlan.morningRoutine} /> : <CompletePrompt label="Add your Skin Glow-Up" href="/dashboard/skin" />}
                    </SubGroup>
                    <SubGroup label="Hair">
                      {hairPlan && hairPlan.stylingRecommendations.length > 0 ? (
                        <p style={{ fontSize: "13.5px", margin: 0 }}>
                          {hairPlan.stylingRecommendations[0].tip}
                          <span style={{ display: "block", fontSize: "12px", color: MUTED, marginTop: "2px" }}>
                            {hairPlan.stylingRecommendations[0].why}
                          </span>
                        </p>
                      ) : (
                        <CompletePrompt label="Add your Hair Glow-Up" href="/dashboard/hair" />
                      )}
                    </SubGroup>
                    <SubGroup label="Makeup">
                      {makeup ? (
                        <p style={{ fontSize: "13.5px", margin: 0 }}>
                          {makeup.eyeColorName} eyes, {makeup.blushColorName} cheeks, {makeup.lipColorName} lips
                        </p>
                      ) : (
                        <CompletePrompt label="Get your first Glow-Up" href="/upload" />
                      )}
                    </SubGroup>
                  </SectionCard>

                  {/* ── NIGHT ───────────────────────────────────────────── */}
                  <SectionCard title="Night" icon={<Moon size={16} style={{ color: PINK }} />}>
                    <SubGroup label="Skin">
                      {skinPlan ? <StepList items={skinPlan.nightRoutine} /> : <CompletePrompt label="Add your Skin Glow-Up" href="/dashboard/skin" />}
                    </SubGroup>
                  </SectionCard>

                  {/* ── WEEKLY ──────────────────────────────────────────── */}
                  <SectionCard title="Weekly" icon={<CalendarDays size={16} style={{ color: PINK }} />}>
                    <SubGroup label="Skin care">
                      {skinPlan && skinPlan.weeklyCare.length > 0 ? (
                        <StepList items={skinPlan.weeklyCare} />
                      ) : (
                        <CompletePrompt label="Add your Skin Glow-Up" href="/dashboard/skin" />
                      )}
                    </SubGroup>
                    <SubGroup label="Hair care">
                      {hairPlan && hairPlan.weeklyRoutine.length > 0 ? (
                        <StepList items={hairPlan.weeklyRoutine} />
                      ) : (
                        <CompletePrompt label="Add your Hair Glow-Up" href="/dashboard/hair" />
                      )}
                    </SubGroup>
                  </SectionCard>

                  {/* ── MAKEUP ──────────────────────────────────────────── */}
                  <SectionCard title="Makeup" icon={<Sparkles size={16} style={{ color: PINK }} />}>
                    {makeup ? (
                      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                        {makeup.imageUrl && (
                          <a href={makeup.imageUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={makeup.imageUrl}
                              alt="Your latest Glow-Up look"
                              style={{ width: "64px", height: "64px", borderRadius: "12px", objectFit: "cover" }}
                            />
                          </a>
                        )}
                        <div>
                          <p style={{ fontSize: "13.5px", fontWeight: 600, margin: "0 0 2px" }}>
                            {makeup.intensityLabel.split("—")[0].trim()}
                          </p>
                          <p style={{ fontSize: "12.5px", color: MUTED, margin: 0 }}>
                            {makeup.eyeColorName} eyes · {makeup.blushColorName} cheeks · {makeup.lipColorName} lips
                          </p>
                          {makeup.imageUrl && (
                            <a href={makeup.imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: PINK, fontWeight: 600 }}>
                              View your Glow-Up result →
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <CompletePrompt label="Get your first Glow-Up" href="/upload" />
                    )}
                  </SectionCard>

                  {/* ── MY PRODUCTS ─────────────────────────────────────── */}
                  <SectionCard title="My Products" icon={<ShoppingBag size={16} style={{ color: PINK }} />}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {view.data.matchedProducts.some((r) => r.matches.length > 0) && (
                        <SubGroup label="Makeup">
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {view.data.matchedProducts
                              .filter((r) => r.matches.length > 0)
                              .map((r) => (
                                <p key={r.category} style={{ fontSize: "13px", margin: 0 }}>
                                  <strong style={{ textTransform: "capitalize" }}>{r.category}:</strong>{" "}
                                  {r.matches[0].product.brand} {r.matches[0].product.name}
                                </p>
                              ))}
                          </div>
                        </SubGroup>
                      )}
                      {skinPlan && skinPlan.recommendedProducts.length > 0 && (
                        <SubGroup label="Skin">
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {skinPlan.recommendedProducts.map((p, i) => (
                              <p key={i} style={{ fontSize: "13px", margin: 0 }}>
                                <strong>{p.category}:</strong> {p.example || p.productType}
                              </p>
                            ))}
                          </div>
                        </SubGroup>
                      )}
                      {hairPlan && hairPlan.recommendedProducts.length > 0 && (
                        <SubGroup label="Hair">
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {hairPlan.recommendedProducts.map((p, i) => (
                              <p key={i} style={{ fontSize: "13px", margin: 0 }}>
                                <strong>{p.category}:</strong> {p.example || p.productType}
                              </p>
                            ))}
                          </div>
                        </SubGroup>
                      )}
                      {!skinPlan && !hairPlan && view.data.matchedProducts.every((r) => r.matches.length === 0) && (
                        <p style={{ fontSize: "13px", color: MUTED, margin: 0 }}>
                          Complete your Glow-Up sections to see product picks here.
                        </p>
                      )}
                    </div>
                  </SectionCard>
                </div>
              )}
            </div>
          );
        })()}
      </main>
    </div>
  );
}
