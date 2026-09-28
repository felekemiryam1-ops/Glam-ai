"use client";

/**
 * /glow-up — Makeup Glow-Up result page ($4.99 paid product)
 *
 * Flow:
 *  1. Reads session_id from URL search params (set by Stripe success_url)
 *  2. Reads glamai_image_base64 + glamai_preview from sessionStorage
 *  3. Calls POST /api/generate-makeup with all three
 *  4. Displays the visual-first analysis: Beauty Snapshot, Face Map,
 *     Feature Enhancement Map, Color Palette, Makeup Blueprint, Aesthetic
 *     Identity, Before/After, What Changed, First Move, Summary, then the
 *     Pro/Premium upsell.
 *
 * `report` (the full GlamReport — aestheticIdentity, featureEnhancements,
 * etc.) may be null: older purchases made before this existed, or a rare
 * case where the analysis call failed independently of image generation
 * (see app/api/generate-makeup/route.ts §12). Every section that depends on
 * `report` renders conditionally rather than fabricating placeholder
 * content — `preview` (color palette, direction, first move) is always
 * present since it's required to reach this page at all, so those sections
 * always render.
 *
 * Refresh safety:
 *  - /api/generate-makeup returns the stored imageUrl (+ report/faceMap if
 *    persisted) if already generated — no second FAL/Claude call
 *
 * Security:
 *  - FAL_KEY never touches the browser — only server handles image gen
 *  - session_id comes from Stripe's redirect; server verifies payment before generating
 */

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import type { GlamPreview, GlamReport, FaceMapAnchor, MakeupAttempt } from "@/lib/types";
import { buildMakeupPlan } from "@/lib/makeupPlan";
import { SubscribeButton } from "@/components/SubscribeButton";
import { PLAN_COPY } from "@/lib/plans";
import { BeforeAfterSlider } from "@/components/analysis/BeforeAfterSlider";
import { PaletteSwatches } from "@/components/analysis/PaletteSwatches";
import { FaceMapOverlay } from "@/components/analysis/FaceMapOverlay";
import { LearnMore } from "@/components/analysis/LearnMore";
import { ShopYourLook } from "@/components/analysis/ShopYourLook";

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | {
      status: "done";
      imageUrl: string;
      preview: GlamPreview;
      report: GlamReport | null;
      faceMap: FaceMapAnchor[];
      imageWidth: number | null;
      imageHeight: number | null;
      // Every look generated for this purchase so far — attempts[0] is
      // always the original. activeAttemptIndex is which one the viewer
      // currently has selected (defaults to the latest after any successful
      // generate/regenerate). regenerating/regenerateError track an
      // in-flight or failed "Try Another Application" request WITHOUT
      // hiding the currently-viewed result — see handleRegenerate below.
      attempts: MakeupAttempt[];
      activeAttemptIndex: number;
      regenerationsRemaining: number;
      regenerating: boolean;
      regenerateError: string | null;
    }
  | { status: "error"; message: string; canRetry: boolean; maxRetriesReached?: boolean };

type GenerateResponse = {
  success?: boolean;
  imageUrl?: string;
  preview?: GlamPreview;
  report?: GlamReport | null;
  faceMap?: FaceMapAnchor[];
  imageWidth?: number | null;
  imageHeight?: number | null;
  attempts?: MakeupAttempt[];
  regenerationsRemaining?: number;
  error?: string;
  canRetry?: boolean;
  maxRetriesReached?: boolean;
  alreadyGenerated?: boolean;
  regenerationLimitReached?: boolean;
};

// ── Small shared display bits ───────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px" }}>
      {children}
    </p>
  );
}

function Chip({ children, tone = "pink" }: { children: React.ReactNode; tone?: "pink" | "dark" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "9px 18px",
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: tone === "dark" ? "#242024" : "#FCE7EF",
        color: tone === "dark" ? "#FFFFFF" : "#C4487A",
      }}
    >
      {children}
    </span>
  );
}

function SectionShell({
  eyebrow,
  title,
  children,
  bg = "#FFFFFF",
  maxWidth = "1000px",
}: {
  eyebrow: string;
  title?: string;
  children: React.ReactNode;
  bg?: string;
  maxWidth?: string;
}) {
  return (
    <section style={{ padding: "clamp(56px,8vw,96px) clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA", background: bg }}>
      <div style={{ maxWidth, margin: "0 auto" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {title && (
          <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 40px" }}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </section>
  );
}

/** First segment of a MakeupPlan intensityLabel (e.g. "SOFT WEARABLE — clearly visible…" → "Soft Wearable"). */
function shortIntensity(label: string): string {
  return label.split("—")[0].trim();
}

/**
 * A short default-view excerpt of a longer AI-written field — display only.
 * The full original text is always shown verbatim inside the matching
 * Learn More, never modified or trimmed there. This never touches the AI
 * schema or what's stored; it only decides what's visible by default.
 */
function firstSentence(text: string, maxLen = 130): string {
  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/);
  const dashIdx = text.indexOf(" — ");

  let candidate = sentenceMatch ? sentenceMatch[0] : text;
  if (dashIdx !== -1 && (!sentenceMatch || dashIdx < sentenceMatch[0].length)) {
    candidate = text.slice(0, dashIdx);
  }

  let sentence = candidate.trim();
  if (sentence.length > maxLen) {
    sentence = sentence.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }
  return sentence;
}

function SmallBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        width: "22px",
        height: "22px",
        borderRadius: "50%",
        background: "#242024",
        color: "#FFFFFF",
        fontSize: "11px",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

// ── Mobile Comparison Slider / Desktop side-by-side / Loading / Error / PlanCard ──
// (Loading, Error, and the Pro/Premium PlanCard are unchanged from before.)

function LoadingState() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-[#FCE7EF]" />
          <div className="absolute inset-0 rounded-full border-4 border-[#E88BA8] border-t-transparent animate-spin" />
        </div>

        <h1
          className="text-[#242024] font-light mb-3"
          style={{ fontFamily: "var(--font-cormorant, Georgia, serif)", fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}
        >
          Creating your Makeup Glow-Up…
        </h1>
        <p className="text-[#777177] text-sm leading-relaxed">
          Our AI is applying personalised makeup to your photo. This takes about 15–30 seconds.
        </p>

        <div className="mt-8 space-y-2 text-left">
          {["Analysing your features", "Selecting your best shades", "Applying makeup artfully", "Polishing the final look"].map(
            (step, i) => (
              <div key={step} className="flex items-center gap-3 text-sm text-[#777177]">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ background: i === 0 ? "#E88BA8" : "#F1E6EA" }}
                >
                  {i === 0 ? (
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C4A8B0]" />
                  )}
                </div>
                {step}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  canRetry,
  maxRetriesReached,
  onRetry,
}: {
  message: string;
  canRetry: boolean;
  maxRetriesReached?: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h2 className="text-[#242024] font-light text-2xl mb-3" style={{ fontFamily: "var(--font-cormorant, Georgia, serif)" }}>
          Something went wrong
        </h2>
        <p className="text-[#777177] text-sm mb-6 leading-relaxed">{message}</p>

        {canRetry && !maxRetriesReached && (
          <button onClick={onRetry} className="px-6 py-3 rounded-xl text-white text-sm font-semibold" style={{ background: "#E88BA8" }}>
            Try Again
          </button>
        )}

        {maxRetriesReached && (
          <a href="mailto:support@glamai.com" className="inline-block px-6 py-3 rounded-xl bg-[#FCE7EF] text-[#E88BA8] text-sm font-semibold">
            Contact Support
          </a>
        )}

        <p className="mt-4 text-xs text-[#777177]">Your payment is safe. We will never charge you again for this session.</p>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  features,
  featured = false,
  badgeLabel,
  cta,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  featured?: boolean;
  badgeLabel?: string;
  cta: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        background: featured ? "linear-gradient(180deg,#FFF9FB 0%,#FFFFFF 65%)" : "#FFFFFF",
        border: featured ? "1.5px solid rgba(232,139,168,0.35)" : "1px solid #F1E6EA",
        borderRadius: "20px",
        padding: "clamp(40px,4.5vw,56px) clamp(32px,4vw,44px)",
        boxShadow: featured ? "0 24px 56px rgba(232,139,168,0.14)" : "0 1px 2px rgba(36,32,36,0.02)",
      }}
    >
      {badgeLabel && (
        <span
          style={{
            position: "absolute",
            top: "-15px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#242024",
            color: "#FFFFFF",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "8px 20px",
            borderRadius: "9999px",
            whiteSpace: "nowrap",
          }}
        >
          {badgeLabel}
        </span>
      )}

      <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "26px", fontWeight: 500, margin: "0 0 6px" }}>{name}</p>
      <p style={{ margin: "0 0 8px", display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "44px", fontWeight: 400, lineHeight: 1 }}>{price}</span>
        <span style={{ fontSize: "15px", color: "#a49da2" }}>/ month</span>
      </p>
      <p style={{ fontSize: "14px", color: "#a49da2", margin: "0 0 36px" }}>{tagline}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "40px" }}>
        {features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: featured ? "#FCE7EF" : "#F5F0F2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "2px",
              }}
            >
              <Check size={11} style={{ color: featured ? "#E88BA8" : "#8a8389" }} />
            </div>
            <span style={{ fontSize: "15px", lineHeight: 1.55, color: "#4a454a" }}>{f}</span>
          </div>
        ))}
      </div>

      {cta}
    </div>
  );
}

// ── Main page (inner — needs useSearchParams) ─────────────────────────────────

function GlowUpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const autoCheckoutPlan = params.get("autoCheckout");

  const [originalBase64] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("glamai_image_base64") : null
  );
  const [originalMime] = useState<string>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("glamai_image_mime") ?? "image/jpeg") : "image/jpeg"
  );
  const [preview] = useState<GlamPreview | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem("glamai_preview");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GlamPreview;
    } catch {
      return null;
    }
  });

  const [generation, setGeneration] = useState<GenerationState>({ status: "generating" });
  const fetchStartedRef = useRef(false);

  // Builds the "done" state from a successful response, defaulting to the
  // LATEST attempt as the active/viewed one — used by initial load, normal
  // failure-retry, and a successful regeneration alike, so all three stay
  // in sync on exactly the same shape.
  function toDoneState(data: GenerateResponse, fallbackPreview: GlamPreview): GenerationState & { status: "done" } {
    const attempts = data.attempts && data.attempts.length > 0
      ? data.attempts
      : [{ imageUrl: data.imageUrl!, imagePrompt: "", createdAt: new Date().toISOString() }];
    return {
      status: "done",
      imageUrl: data.imageUrl!,
      preview: data.preview ?? fallbackPreview,
      report: data.report ?? null,
      faceMap: data.faceMap ?? [],
      imageWidth: data.imageWidth ?? null,
      imageHeight: data.imageHeight ?? null,
      attempts,
      activeAttemptIndex: attempts.length - 1,
      regenerationsRemaining: data.regenerationsRemaining ?? 0,
      regenerating: false,
      regenerateError: null,
    };
  }

  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;

    async function doGenerate() {
      if (!sessionId) {
        router.replace("/upload");
        return;
      }
      if (!originalBase64 || !preview) {
        setGeneration({
          status: "error",
          message: "Your photo session has expired. Please upload your photo again to get your Glow-Up.",
          canRetry: false,
        });
        return;
      }

      try {
        // Initial load — MUST NOT regenerate. `regenerate` is intentionally
        // omitted rather than set to false; the server treats anything
        // other than exactly `true` as a non-regenerating request.
        const res = await fetch("/api/generate-makeup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, imageBase64: originalBase64, preview }),
        });
        const data = (await res.json()) as GenerateResponse;

        if (!res.ok || !data.success) {
          setGeneration({
            status: "error",
            message: data.error ?? "Something went wrong. Please try again.",
            canRetry: data.canRetry ?? false,
            maxRetriesReached: data.maxRetriesReached ?? false,
          });
          return;
        }
        if (!data.imageUrl) {
          setGeneration({ status: "error", message: "Image URL missing from response. Please contact support.", canRetry: false });
          return;
        }

        setGeneration(toDoneState(data, preview));
      } catch (err) {
        setGeneration({
          status: "error",
          message: err instanceof Error ? err.message : "Network error. Please check your connection and try again.",
          canRetry: true,
        });
      }
    }

    doGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(() => {
    fetchStartedRef.current = false;
    setGeneration({ status: "generating" });

    if (!sessionId || !originalBase64 || !preview) {
      setGeneration({ status: "error", message: "Your photo session has expired. Please upload your photo again.", canRetry: false });
      return;
    }

    async function retryGenerate() {
      try {
        // Failure retry — same as initial load, MUST NOT regenerate. This
        // fires from ErrorState, i.e. there is no successful result yet to
        // regenerate from; the server would ignore the flag here anyway
        // (see isRegeneration in route.ts), but it's never sent regardless.
        const res = await fetch("/api/generate-makeup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, imageBase64: originalBase64, preview }),
        });
        const data = (await res.json()) as GenerateResponse;
        if (!res.ok || !data.success) {
          setGeneration({
            status: "error",
            message: data.error ?? "Something went wrong. Please try again.",
            canRetry: data.canRetry ?? false,
            maxRetriesReached: data.maxRetriesReached ?? false,
          });
          return;
        }
        if (!data.imageUrl) {
          setGeneration({ status: "error", message: "Image URL missing. Please contact support.", canRetry: false });
          return;
        }
        setGeneration(toDoneState(data, preview!));
      } catch (err) {
        setGeneration({ status: "error", message: err instanceof Error ? err.message : "Network error. Please try again.", canRetry: true });
      }
    }
    retryGenerate();
  }, [sessionId, originalBase64, preview]);

  // "Try Another Application" — the ONLY place regenerate:true is ever
  // sent. Keeps the current result fully visible while the new one
  // generates (per requirement), and on failure restores the current
  // result untouched with an inline error rather than the full-page
  // ErrorState (which would otherwise hide an already-paid-for result).
  const handleRegenerate = useCallback(() => {
    if (generation.status !== "done" || !sessionId || !originalBase64 || !preview) return;

    setGeneration((prev) => (prev.status === "done" ? { ...prev, regenerating: true, regenerateError: null } : prev));

    async function regenerate() {
      try {
        const res = await fetch("/api/generate-makeup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, imageBase64: originalBase64, preview, regenerate: true }),
        });
        const data = (await res.json()) as GenerateResponse;

        if (!res.ok || !data.success || !data.imageUrl) {
          setGeneration((prev) =>
            prev.status === "done"
              ? { ...prev, regenerating: false, regenerateError: data.error ?? "Generating another look hit a snag. Please try again." }
              : prev
          );
          return;
        }

        setGeneration(toDoneState(data, preview!));
      } catch (err) {
        setGeneration((prev) =>
          prev.status === "done"
            ? {
                ...prev,
                regenerating: false,
                regenerateError: err instanceof Error ? err.message : "Network error. Please try again.",
              }
            : prev
        );
      }
    }
    regenerate();
  }, [generation.status, sessionId, originalBase64, preview]);

  const handleDownload = useCallback(async () => {
    if (generation.status !== "done") return;
    const url = generation.attempts[generation.activeAttemptIndex]?.imageUrl ?? generation.imageUrl;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "glam-ai-glow-up.jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch {
      window.open(url, "_blank");
    }
  }, [generation]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (generation.status === "generating") return <LoadingState />;

  if (generation.status === "error") {
    return <ErrorState message={generation.message} canRetry={generation.canRetry} maxRetriesReached={generation.maxRetriesReached} onRetry={handleRetry} />;
  }

  if (generation.status !== "done") return null;
  const { preview: p, report, faceMap, imageWidth, imageHeight, attempts, activeAttemptIndex, regenerating, regenerateError, regenerationsRemaining } = generation;
  // The displayed image always reflects whichever attempt is currently
  // selected (defaults to latest, but the viewer can switch back to an
  // earlier one) — not necessarily the most-recently-generated one.
  const imageUrl = attempts[activeAttemptIndex]?.imageUrl ?? generation.imageUrl;

  const viewAttempt = (index: number) => {
    setGeneration((prev) => (prev.status === "done" ? { ...prev, activeAttemptIndex: index } : prev));
  };

  const originalSrc = originalBase64 ? `data:${originalMime};base64,${originalBase64}` : null;
  const plan = buildMakeupPlan(p);

  const snapshotChips = [p.colorDirection, p.makeupStyle, p.beautyVibe, report?.aestheticIdentity?.name].filter(
    (v): v is string => !!v
  );

  const supportingDirections = (report?.style ?? []).filter((s) => s.name !== report?.aestheticIdentity?.name).slice(0, 3);

  const whatChanged = [
    { label: "Eyes", value: `${plan.eyeshadow.lid.colorName} definition` },
    { label: "Cheeks", value: `${plan.blush.colorName} blush` },
    { label: "Lips", value: `${plan.lips.colorName} lip color` },
    { label: "Complexion", value: `${shortIntensity(plan.intensityLabel)} finish` },
  ];

  const glamDirectionChips = [p.colorDirection, shortIntensity(plan.intensityLabel), p.makeupStyle].filter(Boolean);

  // Same top-to-bottom sort FaceMapOverlay uses internally for its own dot
  // numbers — recomputed here (not exported from that component, which
  // stays untouched) purely so Feature Enhancement cards can show the same
  // number as their matching Face Map dot, visually tying the two sections
  // together.
  const sortedFaceMap = [...faceMap].sort((a, b) => a.y - b.y);
  const regionNumber = (region: string): number | null => {
    const idx = sortedFaceMap.findIndex((a) => a.region === region);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Inter',system-ui,-apple-system,sans-serif", color: "#242024", overflowX: "hidden" }}>
      {/* ── BEAUTY SNAPSHOT (opening) ─────────────────────────────────────────── */}
      <section style={{ background: "linear-gradient(180deg,#FDF5F7 0%,#FFFFFF 100%)", padding: "clamp(56px,9vw,96px) clamp(20px,5vw,64px) clamp(48px,7vw,80px)" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <Eyebrow>Your Beauty Snapshot</Eyebrow>
          <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.2rem)", lineHeight: 1.15, margin: "0 0 32px", maxWidth: "760px" }}>
            {p.headline}
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "clamp(20px,4vw,40px)" }}>
            {originalSrc && (
              <div style={{ width: "104px", height: "104px", borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "3px solid #FFFFFF", boxShadow: "0 4px 18px rgba(36,32,36,0.12)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={originalSrc} alt="Your photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", maxWidth: "560px" }}>
              {snapshotChips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FACE MAP ──────────────────────────────────────────────────────────── */}
      {originalSrc && faceMap.length > 0 && (
        <SectionShell eyebrow="Face Map" title="Where your best features stand out" maxWidth="640px">
          <FaceMapOverlay imageSrc={originalSrc} imageWidth={imageWidth} imageHeight={imageHeight} anchors={faceMap} />
          <p style={{ fontSize: "13px", color: "#a49da2", margin: "16px 0 0", textAlign: "center" }}>
            Tap a number to see what it&apos;s pointing to.
          </p>
        </SectionShell>
      )}

      {/* ── FEATURE ENHANCEMENT MAP ──────────────────────────────────────────── */}
      {report && report.featureEnhancements.length > 0 && (
        <SectionShell eyebrow="Feature Enhancements">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "28px" }}>
            {report.featureEnhancements.map((fe, i) => {
              const num = regionNumber(fe.region);
              return (
                <div key={`${fe.region}-${i}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    {num !== null && <SmallBadge>{num}</SmallBadge>}
                    <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: 0 }}>
                      {fe.region}
                    </p>
                  </div>
                  <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "19px", fontWeight: 600, color: "#242024", margin: "0 0 6px" }}>
                    {fe.title}
                  </p>
                  <p style={{ fontSize: "14px", lineHeight: 1.5, color: "#4a454a", margin: "0 0 10px", fontWeight: 400 }}>{fe.recommendation}</p>
                  {fe.why && <LearnMore>{fe.why}</LearnMore>}
                </div>
              );
            })}
          </div>
        </SectionShell>
      )}

      {/* ── COLOR PALETTE ─────────────────────────────────────────────────────── */}
      <SectionShell eyebrow="Your Color Palette" bg="#FDF5F7">
        <PaletteSwatches plan={plan} palette={p.palette} complexionGuidance={report?.makeup.base.recommendation} />
      </SectionShell>

      {/* ── MAKEUP BLUEPRINT ──────────────────────────────────────────────────── */}
      <SectionShell eyebrow="Makeup Blueprint">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "32px", marginBottom: "28px" }}>
          {report && (
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 10px" }}>Base</p>
              <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{firstSentence(report.makeup.base.recommendation)}</p>
            </div>
          )}
          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 10px" }}>Cheeks</p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: plan.blush.hex, flexShrink: 0, boxShadow: "0 1px 4px rgba(36,32,36,0.15)" }} />
              <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{plan.blush.colorName}</p>
            </div>
          </div>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 10px" }}>Eyes</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: plan.eyeshadow.transition.hex, flexShrink: 0, boxShadow: "0 1px 4px rgba(36,32,36,0.15)" }} />
                <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{plan.eyeshadow.transition.colorName}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: plan.eyeshadow.lid.hex, flexShrink: 0, boxShadow: "0 1px 4px rgba(36,32,36,0.15)" }} />
                <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{plan.eyeshadow.lid.colorName}</p>
              </div>
            </div>
          </div>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 10px" }}>Lips</p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: plan.lips.hex, flexShrink: 0, boxShadow: "0 1px 4px rgba(36,32,36,0.15)" }} />
              <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{plan.lips.colorName}</p>
            </div>
          </div>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 10px" }}>Highlight</p>
            <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{firstSentence(plan.eyeshadow.highlight.placement)}</p>
          </div>
        </div>

        <LearnMore label="Learn more about this look">
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {report && (
              <div>
                <strong style={{ color: "#242024" }}>Base — </strong>
                {report.makeup.base.recommendation} {report.makeup.base.why}
              </div>
            )}
            <div>
              <strong style={{ color: "#242024" }}>Cheeks — </strong>
              {plan.blush.intensity}
            </div>
            <div>
              <strong style={{ color: "#242024" }}>Eyes — </strong>
              {plan.eyeshadow.technique}
            </div>
            <div>
              <strong style={{ color: "#242024" }}>Lips — </strong>
              {plan.lips.finish}
            </div>
          </div>
        </LearnMore>
      </SectionShell>

      {/* ── AESTHETIC IDENTITY ────────────────────────────────────────────────── */}
      {report?.aestheticIdentity && (
        <SectionShell eyebrow="Your Aesthetic Identity" bg="#FDF5F7" maxWidth="760px">
          <h3 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, fontSize: "clamp(1.8rem,3.5vw,2.6rem)", margin: "0 0 12px" }}>
            {report.aestheticIdentity.name}
          </h3>
          <p style={{ fontSize: "16px", lineHeight: 1.5, color: "#4a454a", fontWeight: 400, margin: "0 0 24px", maxWidth: "560px" }}>
            {firstSentence(report.aestheticIdentity.description)}
          </p>
          {report.aestheticIdentity.keyPieces.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
              {report.aestheticIdentity.keyPieces.map((kp) => (
                <Chip key={kp} tone="dark">
                  {kp}
                </Chip>
              ))}
            </div>
          )}
          {supportingDirections.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 12px" }}>
                Also felt in your look
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {supportingDirections.map((s) => (
                  <Chip key={s.name}>{s.name}</Chip>
                ))}
              </div>
            </div>
          )}
          <LearnMore>{report.aestheticIdentity.description}</LearnMore>
        </SectionShell>
      )}

      {/* ── BEFORE / AFTER ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "clamp(64px,9vw,104px) clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <Eyebrow>Your Transformation</Eyebrow>
          {originalSrc ? (
            <BeforeAfterSlider beforeSrc={originalSrc} afterSrc={imageUrl} />
          ) : (
            <div style={{ maxWidth: "360px" }}>
              <div style={{ borderRadius: "8px", overflow: "hidden", aspectRatio: "3/4", background: "#FCE7EF" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Your Makeup Glow-Up" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </div>
          )}
          <p onClick={handleDownload} style={{ fontSize: "13px", color: "#a49da2", margin: "20px 0 0", cursor: "pointer" }}>
            Right-click the After image to save your Glow-Up.
          </p>

          {/* ── Attempt switcher / regeneration control ──────────────────────── */}
          <div style={{ marginTop: "28px" }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#242024", margin: "0 0 12px" }}>
              Viewing look {activeAttemptIndex + 1} of {attempts.length}
            </p>

            {attempts.length > 1 && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                {attempts.map((attempt, index) => (
                  <button
                    key={attempt.imageUrl}
                    onClick={() => viewAttempt(index)}
                    disabled={regenerating}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      padding: 0,
                      cursor: regenerating ? "default" : "pointer",
                      border: index === activeAttemptIndex ? "2px solid #E88BA8" : "2px solid transparent",
                      opacity: regenerating ? 0.6 : 1,
                      background: "none",
                    }}
                    aria-label={`View look ${index + 1}`}
                    aria-current={index === activeAttemptIndex}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={attempt.imageUrl} alt={`Look ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}

            {attempts.length < 3 && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-6 py-3 rounded-xl text-white text-sm font-semibold"
                style={{ background: "#E88BA8", opacity: regenerating ? 0.7 : 1, cursor: regenerating ? "default" : "pointer" }}
              >
                {regenerating ? "Generating another look…" : "Try Another Application"}
              </button>
            )}

            {regenerateError && (
              <p style={{ fontSize: "13px", color: "#C4487A", margin: "12px 0 0" }}>{regenerateError}</p>
            )}

            {attempts.length < 3 && !regenerating && (
              <p style={{ fontSize: "12px", color: "#a49da2", margin: "10px 0 0" }}>
                {regenerationsRemaining} more {regenerationsRemaining === 1 ? "try" : "tries"} included with this Glow-Up.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── WHAT CHANGED ──────────────────────────────────────────────────────── */}
      <SectionShell eyebrow="What Changed?" bg="#FDF5F7">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "24px" }}>
          {whatChanged.map((wc) => (
            <div key={wc.label}>
              <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: "0 0 6px" }}>
                {wc.label}
              </p>
              <p style={{ fontSize: "15px", color: "#242024", margin: 0, fontWeight: 500 }}>{wc.value}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* ── SHOP YOUR LOOK ────────────────────────────────────────────────────── */}
      <SectionShell eyebrow="Shop Your Look" title="Products that recreate this exact look">
        <ShopYourLook plan={plan} />
      </SectionShell>

      {/* ── FIRST MOVE ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "clamp(56px,8vw,88px) clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
          <div style={{ background: "linear-gradient(135deg,#FDF5F7,#FCE7EF)", borderRadius: "20px", padding: "clamp(36px,5vw,52px)", textAlign: "center" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Sparkles size={19} style={{ color: "#E88BA8" }} />
            </div>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#C4487A", margin: "0 0 16px" }}>
              Your First Move
            </p>
            <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "clamp(1.5rem,3vw,1.9rem)", lineHeight: 1.4, margin: 0 }}>{p.firstMove}</p>
          </div>
        </div>
      </section>

      {/* ── SUMMARY ───────────────────────────────────────────────────────────── */}
      <SectionShell eyebrow="Your Glam Direction" bg="#FDF5F7" maxWidth="820px">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: report?.priorities?.length ? "40px" : 0 }}>
          {glamDirectionChips.map((c) => (
            <Chip key={c} tone="dark">
              {c}
            </Chip>
          ))}
        </div>
        {report && report.priorities.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "24px" }}>
            {report.priorities.slice(0, 3).map((pr) => (
              <div key={pr.rank} style={{ background: "#FFFFFF", borderRadius: "14px", padding: "24px" }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "#C4487A",
                    background: "#FCE7EF",
                    padding: "4px 10px",
                    borderRadius: "9999px",
                    marginBottom: "12px",
                  }}
                >
                  PRIORITY {pr.rank}
                </span>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#242024", margin: "0 0 6px" }}>{pr.title}</p>
                <p style={{ fontSize: "13px", lineHeight: 1.6, color: "#777177", margin: "0 0 10px" }}>{firstSentence(pr.description)}</p>
                <LearnMore>{pr.description}</LearnMore>
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      {/* ── UPSELL: Pro + Premium ────────────────────────────────────────────── */}
      <section style={{ padding: "clamp(96px,12vw,140px) clamp(24px,6vw,80px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "clamp(56px,7vw,80px)" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px" }}>
              Continue Your Glow-Up
            </p>
            <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(2rem,4vw,2.8rem)", margin: "0 0 16px" }}>
              Choose your plan
            </h2>
            <p style={{ fontSize: "16px", lineHeight: 1.6, color: "#777177", maxWidth: "480px", margin: "0 auto" }}>
              Ongoing access to your AI beauty analysis — more looks, more guidance, every month.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "clamp(28px,3.5vw,40px)", alignItems: "start" }}>
            <PlanCard
              name={PLAN_COPY.pro.name}
              price={PLAN_COPY.pro.price}
              tagline={PLAN_COPY.pro.positioning}
              features={PLAN_COPY.pro.features}
              cta={
                <SubscribeButton
                  plan="pro"
                  label="Choose Pro"
                  bg="#242024"
                  hoverBg="#3a333a"
                  color="#FFFFFF"
                  border="none"
                  // NOT back to /glow-up?session_id=... — this page's content
                  // (including this very button) depends on sessionStorage
                  // (the cached original photo/preview), which a magic-link
                  // click typically does NOT share, since email links almost
                  // always open in a new tab/window. Resuming to /pricing
                  // instead avoids that dependency entirely — its autoTrigger
                  // flow needs no session data at all.
                  callbackUrl="/pricing"
                  autoTrigger={autoCheckoutPlan === "pro"}
                />
              }
            />
            <PlanCard
              name={PLAN_COPY.premium.name}
              price={PLAN_COPY.premium.price}
              tagline={PLAN_COPY.premium.positioning}
              featured
              badgeLabel="Most Popular"
              features={PLAN_COPY.premium.features}
              cta={
                <SubscribeButton
                  plan="premium"
                  label="Choose Premium"
                  bg="#242024"
                  hoverBg="#3a333a"
                  color="#FFFFFF"
                  border="none"
                  // See the identical comment on the Pro button above.
                  callbackUrl="/pricing"
                  autoTrigger={autoCheckoutPlan === "premium"}
                />
              }
            />
          </div>

          <p style={{ textAlign: "center", fontSize: "13px", color: "#a49da2", margin: "40px 0 0" }}>Cancel anytime · Secure checkout via Stripe</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ padding: "32px clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "19px", fontWeight: 400, margin: 0 }}>Glam AI</p>
          <div style={{ display: "flex", gap: "28px" }}>
            <a href="/upload" style={{ fontSize: "12px", color: "#777177", textDecoration: "none" }}>New Preview</a>
            <a href="/privacy" style={{ fontSize: "12px", color: "#777177", textDecoration: "none" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: "12px", color: "#777177", textDecoration: "none" }}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Export: wrap in Suspense for useSearchParams ───────────────────────────────

export default function GlowUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#E88BA8] border-t-transparent animate-spin" />
        </div>
      }
    >
      <GlowUpInner />
    </Suspense>
  );
}
