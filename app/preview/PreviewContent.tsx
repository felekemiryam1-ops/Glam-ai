"use client";

/**
 * /preview — Free Glam Preview
 *
 * Reads glamai_preview + glamai_image_hash from sessionStorage.
 * Shows the free GlamPreview result and the next step to see the full
 * makeup Glow-Up — which CTA that is depends on `canUseIncludedAnalysis`
 * (resolved server-side in page.tsx via getEntitlements(), never trusted
 * from the client):
 *   - Pro/Premium with remaining monthly allowance → an included analysis,
 *     via POST /api/generate-makeup/included (no charge).
 *   - Everyone else (free/anonymous/allowance exhausted) → the existing
 *     $4.99 one-time Glow-Up checkout, completely unchanged.
 * Redirects to /upload if preview data is missing.
 */

import { useEffect, useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { GlamPreview, GlamReport, FaceMapAnchor } from "@/lib/types";
import { buildMakeupPlan } from "@/lib/makeupPlan";
import { FaceMapOverlay } from "@/components/analysis/FaceMapOverlay";
import { ShopYourLook } from "@/components/analysis/ShopYourLook";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckoutState {
  loading: boolean;
  error: string | null;
}

interface IncludedResult {
  imageUrl: string;
  report: GlamReport | null;
  faceMap: FaceMapAnchor[];
  imageWidth: number | null;
  imageHeight: number | null;
}

const noopSubscribe = () => () => {};
const getServerSnapshot = () => null;

const CTA_FEATURES = [
  "AI-generated before & after",
  "Full makeup recommendations",
  "Personalized colour palette",
  "Step-by-step beauty direction",
];

const RECEIVE_ITEMS = [
  { num: "01", title: "AI Before + After", desc: "See how your recommended makeup looks on you." },
  { num: "02", title: "Full Makeup Report", desc: "Foundation, blush, eyes and lips tailored to you." },
  { num: "03", title: "Personalized Colour Palette", desc: "Makeup, clothing and accessory colours." },
  { num: "04", title: "Quick-Start Beauty Plan", desc: "Simple recommendations you can actually use." },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export function PreviewContent({ canUseIncludedAnalysis }: { canUseIncludedAnalysis: boolean }) {
  const router = useRouter();
  // sessionStorage is an external store React doesn't know about, so it's
  // read via useSyncExternalStore rather than a lazy useState initializer.
  // getServerSnapshot (null) is what both the server render and the client's
  // very first hydrating render use — they match, so no hydration mismatch —
  // and React reconciles to the real client value (getSnapshot) immediately
  // after hydration completes, all without a manual setState-in-effect.
  const rawPreview = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_preview"),
    getServerSnapshot
  );
  const imageHash = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_image_hash"),
    getServerSnapshot
  );
  // The original uploaded photo — needed to render the Face Map overlay
  // (dots placed over the ORIGINAL photo, never the generated image; see
  // components/analysis/FaceMapOverlay.tsx).
  const rawOriginalBase64 = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_image_base64"),
    getServerSnapshot
  );
  const rawOriginalMime = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_image_mime"),
    getServerSnapshot
  );
  const originalSrc = rawOriginalBase64 ? `data:${rawOriginalMime ?? "image/jpeg"};base64,${rawOriginalBase64}` : null;

  // Free-tier Face Map — computed server-side in /api/preview (local
  // landmark detection, no AI cost) and cached by /upload alongside the
  // preview itself. Present for every plan tier, per the product
  // requirement that Face Map is a core makeup feature, not a paid upsell.
  const rawFreeFaceMap = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_face_map"),
    getServerSnapshot
  );
  const rawFreeImageWidth = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_image_width"),
    getServerSnapshot
  );
  const rawFreeImageHeight = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem("glamai_image_height"),
    getServerSnapshot
  );
  const freeFaceMap = useMemo<FaceMapAnchor[]>(() => {
    if (!rawFreeFaceMap) return [];
    try {
      return JSON.parse(rawFreeFaceMap) as FaceMapAnchor[];
    } catch {
      return [];
    }
  }, [rawFreeFaceMap]);
  const freeImageWidth = rawFreeImageWidth ? Number(rawFreeImageWidth) : null;
  const freeImageHeight = rawFreeImageHeight ? Number(rawFreeImageHeight) : null;

  const preview = useMemo<GlamPreview | null>(() => {
    if (!rawPreview) return null;
    try {
      return JSON.parse(rawPreview) as GlamPreview;
    } catch {
      return null;
    }
  }, [rawPreview]);

  const [checkout, setCheckout] = useState<CheckoutState>({ loading: false, error: null });
  const [includedState, setIncludedState] = useState<CheckoutState>({ loading: false, error: null });
  const [includedResult, setIncludedResult] = useState<IncludedResult | null>(null);

  // Redirect if session data is truly missing. `preview` itself (derived via
  // useSyncExternalStore) is what's rendered — but immediately after
  // hydration there's a brief window where this effect can run before that
  // hook's client resync has landed, so `preview` can still read as null
  // here even though sessionStorage already has real data. Re-checking
  // sessionStorage directly (not for rendering — only for this decision)
  // avoids redirecting a real Pro/Premium user away during that window.
  useEffect(() => {
    if (preview === null && !sessionStorage.getItem("glamai_preview")) {
      router.replace("/upload");
    }
  }, [preview, router]);

  const handleUpgrade = useCallback(async () => {
    setCheckout({ loading: true, error: null });

    const imageBase64 = sessionStorage.getItem("glamai_image_base64");

    if (!imageBase64 || !imageHash) {
      setCheckout({ loading: false, error: "Session data is missing. Please re-upload your photo." });
      return;
    }

    try {
      // POST to the new V2 makeup-checkout endpoint — product: "glam_ai_makeup_glow_up"
      // The old /api/checkout (V1 text report) remains for backward compatibility.
      const res = await fetch("/api/makeup-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageHash }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Server error (${res.status})`);
      }

      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setCheckout({
        loading: false,
        error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  }, [imageHash]);

  // Pro/Premium path — no Stripe Checkout at all, just the existing
  // included-analysis route. Entitlement was already confirmed server-side
  // before this button could even render (see page.tsx); the route itself
  // re-checks it again server-side regardless, so this is never the only guard.
  const handleIncludedAnalysis = useCallback(async () => {
    setIncludedState({ loading: true, error: null });

    const imageBase64 = sessionStorage.getItem("glamai_image_base64");
    if (!imageBase64 || !preview) {
      setIncludedState({ loading: false, error: "Session data is missing. Please re-upload your photo." });
      return;
    }

    try {
      const res = await fetch("/api/generate-makeup/included", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, preview }),
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.imageUrl) {
        throw new Error(data.error ?? `Server error (${res.status})`);
      }

      setIncludedResult({
        imageUrl: data.imageUrl,
        report: data.report ?? null,
        faceMap: data.faceMap ?? [],
        imageWidth: data.imageWidth ?? null,
        imageHeight: data.imageHeight ?? null,
      });
      setIncludedState({ loading: false, error: null });
    } catch (err) {
      setIncludedState({
        loading: false,
        error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  }, [preview]);

  // ── Loading / redirect state ───────────────────────────────────────────────
  if (!preview) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#E88BA8] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const colorLabel =
    preview.colorDirection === "warm"
      ? "Warm Tones"
      : preview.colorDirection === "cool"
        ? "Cool Tones"
        : "Neutral Tones";

  const ctaBg = checkout.loading ? "#4a444a" : "#242024";
  const ctaButtonLabel = checkout.loading ? "Preparing your checkout…" : "See My Makeup Glow-Up — $4.99";
  const includedCtaBg = includedState.loading ? "#4a444a" : "#242024";
  const includedCtaLabel = includedState.loading ? "Generating your Glow-Up…" : "See My Makeup Glow-Up — Included";

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#242024", overflowX: "hidden" }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{ background: "linear-gradient(180deg,#FDF5F7 0%,#FFFFFF 100%)", padding: "clamp(72px,12vw,128px) clamp(20px,5vw,64px) clamp(56px,8vw,96px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 28px" }}>
            Your Free Glam Preview
          </p>
          <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.6rem,6vw,4.4rem)", lineHeight: 1.12, letterSpacing: "-0.01em", margin: "0 0 28px", maxWidth: "920px" }}>
            {preview.headline}
          </h1>
          <p style={{ fontSize: "18px", lineHeight: 1.7, color: "#777177", maxWidth: "560px", margin: "0 0 40px", fontWeight: 300 }}>
            A personalized read on the colors, textures and finishes that work with your natural coloring.
          </p>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "#a99ba1", margin: 0 }}>
            {colorLabel} &nbsp;·&nbsp; {preview.makeupStyle} &nbsp;·&nbsp; {preview.beautyVibe}
          </p>
        </div>
      </section>

      {/* ── Free Face Map — core feature, present at every plan tier ── */}
      {originalSrc && freeFaceMap.length > 0 && (
        <section style={{ padding: "0 clamp(20px,5vw,64px) clamp(56px,8vw,96px)" }}>
          <div style={{ maxWidth: "480px", margin: "0 auto" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px", textAlign: "center" }}>
              Your Face Map
            </p>
            <FaceMapOverlay imageSrc={originalSrc} imageWidth={freeImageWidth} imageHeight={freeImageHeight} anchors={freeFaceMap} />
          </div>
        </section>
      )}

      {/* ── Colour palette ───────────────────────────────────────── */}
      <section style={{ padding: "clamp(56px,8vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 40px" }}>
            Your Best Colour Palette
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(32px,5vw,64px)" }}>
            {preview.bestColors.map((swatch) => (
              <div key={swatch.hex} style={{ width: "168px" }}>
                <div style={{ width: "100%", height: "200px", borderRadius: "6px", background: swatch.hex, marginBottom: "20px" }} />
                <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "22px", fontWeight: 500, margin: "0 0 4px" }}>{swatch.name}</p>
                <p style={{ fontSize: "12px", letterSpacing: "0.12em", color: "#777177", margin: 0, textTransform: "uppercase" }}>{swatch.hex}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Makeup direction ─────────────────────────────────────── */}
      <section style={{ padding: "clamp(64px,9vw,104px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 20px" }}>
            Your Makeup Direction
          </p>
          <p style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "clamp(1.4rem,2.4vw,1.8rem)", fontWeight: 400, margin: "0 0 24px", color: "#242024" }}>
            {preview.makeupStyle} · {preview.beautyVibe}
          </p>
          <p style={{ fontSize: "18px", lineHeight: 1.8, color: "#4a454a", maxWidth: "680px", margin: 0, fontWeight: 300 }}>
            {preview.makeupDirection}
          </p>
        </div>
      </section>

      {/* ── First move ───────────────────────────────────────────── */}
      <section style={{ padding: "clamp(56px,8vw,88px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ background: "#FDF5F7", borderRadius: "8px", padding: "clamp(36px,5vw,56px) clamp(28px,5vw,64px)" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 16px" }}>
              Your First Move
            </p>
            <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "clamp(1.4rem,2.6vw,1.9rem)", fontWeight: 400, lineHeight: 1.4, color: "#242024", margin: 0, maxWidth: "760px" }}>
              {preview.firstMove}
            </p>
          </div>
        </div>
      </section>

      {/* ── Included-analysis result (Pro/Premium only) ──────────── */}
      {includedResult && (
        <>
          <section style={{ marginTop: "clamp(72px,10vw,120px)", padding: "clamp(56px,8vw,88px) clamp(20px,5vw,64px)", background: "#FDF5F7" }}>
            <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px", textAlign: "center" }}>
                Your Makeup Glow-Up
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "32px", alignItems: "start" }}>
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={includedResult.imageUrl}
                    alt="Your Makeup Glow-Up"
                    style={{ width: "100%", borderRadius: "12px" }}
                  />
                  <p style={{ fontSize: "12px", color: "#a49da2", textAlign: "center", margin: "10px 0 0" }}>After</p>
                </div>
                {originalSrc && includedResult.faceMap.length > 0 && (
                  <div>
                    <FaceMapOverlay
                      imageSrc={originalSrc}
                      imageWidth={includedResult.imageWidth}
                      imageHeight={includedResult.imageHeight}
                      anchors={includedResult.faceMap}
                    />
                    <p style={{ fontSize: "12px", color: "#a49da2", textAlign: "center", margin: "10px 0 0" }}>Your Face Map</p>
                  </div>
                )}
              </div>
              <div style={{ textAlign: "center", marginTop: "32px" }}>
                <a
                  href="/dashboard"
                  style={{
                    display: "inline-flex", alignItems: "center", height: "52px", padding: "0 32px",
                    borderRadius: "9999px", background: "#242024", color: "#FFFFFF",
                    fontSize: "15px", fontWeight: 600, textDecoration: "none",
                  }}
                >
                  Go to Dashboard
                </a>
              </div>
            </div>
          </section>

          {/* ── Shop Your Look — reuses the same catalog/matching engine as the $4.99 flow ── */}
          <section style={{ padding: "clamp(56px,8vw,88px) clamp(20px,5vw,64px)" }}>
            <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 32px", textAlign: "center" }}>
                Shop Your Look
              </p>
              <ShopYourLook plan={buildMakeupPlan(preview)} />
            </div>
          </section>
        </>
      )}

      {/* ── Paid Glow-Up CTA ─────────────────────────────────────── */}
      {!includedResult && (
        <section style={{ marginTop: "clamp(72px,10vw,120px)", padding: "clamp(80px,10vw,128px) clamp(20px,5vw,64px)", background: "linear-gradient(160deg,#FCE7EF 0%,#FDF5F7 55%,#FFFFFF 100%)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: "clamp(48px,6vw,80px)", alignItems: "center" }}>

            <div style={{ maxWidth: "460px" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
                Ready to See It on You?
              </p>
              <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.2rem,4vw,3rem)", lineHeight: 1.18, margin: "0 0 32px" }}>
                See your personalized makeup Glow-Up.
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", margin: "0 0 44px" }}>
                {CTA_FEATURES.map((feat) => (
                  <p key={feat} style={{ fontSize: "16px", lineHeight: 1.6, color: "#4a454a", margin: 0, fontWeight: 300 }}>{feat}</p>
                ))}
              </div>

              {canUseIncludedAnalysis ? (
                <>
                  {includedState.error && (
                    <p style={{ fontSize: "14px", color: "#b23b52", margin: "0 0 20px" }}>{includedState.error}</p>
                  )}
                  <button
                    onClick={handleIncludedAnalysis}
                    disabled={includedState.loading}
                    style={{
                      height: "56px", paddingInline: "36px", borderRadius: "9999px", border: "none",
                      background: includedCtaBg, color: "#FFFFFF", fontFamily: "var(--font-sans)",
                      fontSize: "16px", fontWeight: 600, letterSpacing: "0.01em",
                      cursor: includedState.loading ? "not-allowed" : "pointer", transition: "all 0.2s ease",
                    }}
                  >
                    {includedCtaLabel}
                  </button>
                  <p style={{ fontSize: "13px", color: "#8a8389", margin: "20px 0 0" }}>Included with your Glam AI subscription</p>
                </>
              ) : (
                <>
                  {checkout.error && (
                    <p style={{ fontSize: "14px", color: "#b23b52", margin: "0 0 20px" }}>{checkout.error}</p>
                  )}
                  <button
                    onClick={handleUpgrade}
                    disabled={checkout.loading}
                    style={{
                      height: "56px", paddingInline: "36px", borderRadius: "9999px", border: "none",
                      background: ctaBg, color: "#FFFFFF", fontFamily: "var(--font-sans)",
                      fontSize: "16px", fontWeight: 600, letterSpacing: "0.01em",
                      cursor: checkout.loading ? "not-allowed" : "pointer", transition: "all 0.2s ease",
                    }}
                  >
                    {ctaButtonLabel}
                  </button>
                  <p style={{ fontSize: "13px", color: "#8a8389", margin: "20px 0 0" }}>One-time payment · No subscription</p>
                </>
              )}
            </div>

            <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", borderRadius: "10px", overflow: "hidden", background: "linear-gradient(135deg,#f3d4de 0%,#e9b8c9 45%,#d99cb2 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Before &amp; after preview</span>
            </div>

          </div>
        </section>
      )}

      {/* ── What you'll receive ──────────────────────────────────── */}
      <section style={{ padding: "clamp(88px,11vw,128px) clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 56px" }}>
            What You&apos;ll Receive
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "clamp(40px,5vw,56px)" }}>
            {RECEIVE_ITEMS.map((item) => (
              <div key={item.num} style={{ borderTop: "1px solid #F1E6EA", paddingTop: "24px" }}>
                <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "32px", fontWeight: 400, color: "#E88BA8", margin: "0 0 16px" }}>{item.num}</p>
                <p style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>{item.title}</p>
                <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#777177", margin: 0, fontWeight: 300 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      {!includedResult && (
        <section style={{ padding: "clamp(96px,12vw,140px) clamp(20px,5vw,64px)", textAlign: "center", borderTop: "1px solid #F1E6EA" }}>
          <div style={{ maxWidth: "640px", margin: "0 auto" }}>
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2rem,4vw,2.8rem)", lineHeight: 1.3, margin: "0 0 44px" }}>
              Your best look starts with understanding what works for you.
            </h2>
            <button
              onClick={canUseIncludedAnalysis ? handleIncludedAnalysis : handleUpgrade}
              disabled={canUseIncludedAnalysis ? includedState.loading : checkout.loading}
              style={{
                height: "56px", paddingInline: "36px", borderRadius: "9999px", border: "none",
                background: canUseIncludedAnalysis ? includedCtaBg : ctaBg, color: "#FFFFFF",
                fontFamily: "var(--font-sans)", fontSize: "16px", fontWeight: 600, letterSpacing: "0.01em",
                cursor: (canUseIncludedAnalysis ? includedState.loading : checkout.loading) ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {canUseIncludedAnalysis ? includedCtaLabel : ctaButtonLabel}
            </button>
            <p style={{ fontSize: "13px", color: "#8a8389", margin: "20px 0 0" }}>
              {canUseIncludedAnalysis ? "Included with your Glam AI subscription" : "One-time · No subscription"}
            </p>
          </div>
        </section>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{ padding: "32px clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "19px", fontWeight: 400, margin: 0 }}>Glam AI</p>
          <div style={{ display: "flex", gap: "28px" }}>
            <a href="/upload" style={{ fontSize: "12px", color: "#777177" }}>New Preview</a>
            <a href="/privacy" style={{ fontSize: "12px", color: "#777177" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: "12px", color: "#777177" }}>Terms</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
