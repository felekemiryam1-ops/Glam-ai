"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, RotateCcw, RefreshCw } from "lucide-react";
import LoadingAnalysis from "@/components/LoadingAnalysis";
import type { GlamReport, RecommendationItem, GlowUpPriority } from "@/lib/types";

// ──────────────────────────────────────────────────────────────────────────────
// sessionStorage keys (must match upload/page.tsx)
// ──────────────────────────────────────────────────────────────────────────────
const SS_IMAGE_BASE64 = "glamai_image_base64";
const SS_IMAGE_MIME   = "glamai_image_mime";
const SS_IMAGE_HASH   = "glamai_image_hash";
const SS_REPORT       = "glamai_report";
const SS_REPORT_SID   = "glamai_report_session_id";

const NAV_SECTIONS = [
  { id: "section-makeup", label: "Makeup" },
  { id: "section-hair", label: "Hair" },
  { id: "section-colors", label: "Colors" },
  { id: "section-style", label: "Style" },
  { id: "section-priorities", label: "Priorities" },
  { id: "section-plan", label: "Quick Plan" },
];

function ResultsPageInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  type PageStatus = "loading" | "success" | "error";

  const [status, setStatus]           = useState<PageStatus>("loading");
  const [report, setReport]           = useState<GlamReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [canRetry, setCanRetry]       = useState(false);
  const [alreadyConsumed, setAlreadyConsumed] = useState(false);
  const [isRetrying, setIsRetrying]   = useState(false);

  // Prevent React Strict Mode (dev) from firing useEffect twice and sending
  // two concurrent requests to /api/analyze (which triggers the 429 lock).
  const fetchStartedRef = useRef(false);

  // ── fetch + full error handling ──────────────────────────────────────────
  const fetchReport = useCallback(async (sid: string, imageBase64: string, mimeType: string) => {
    // Inner recursive helper so we can retry on 429 without the useCallback
    // referencing itself (which ESLint's react-hooks/immutability forbids).
    async function doFetch(attempt: number): Promise<void> {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, imageBase64, mimeType }),
        });

        const data = await res.json();

        // ── Already consumed (409 alreadyConsumed) ─────────────────────────
        if (data.alreadyConsumed) {
          setAlreadyConsumed(true);
          setErrorMessage(
            "This report has already been generated for your payment session. If you closed the tab before seeing it, please contact support — we're happy to help."
          );
          setCanRetry(false);
          setStatus("error");
          return;
        }

        // ── Max retries reached ────────────────────────────────────────────
        if (data.maxRetriesReached) {
          setErrorMessage(
            "Our AI was unable to generate your report after several attempts. Please contact support for a full refund or to try again."
          );
          setCanRetry(false);
          setStatus("error");
          return;
        }

        // ── 429 — server lock is held by the concurrent Strict Mode request ──
        // Wait 5 s then retry (up to 12 times = 60 s total) so the loading
        // screen resolves to success once the first request's AI call finishes.
        if (res.status === 429 && data.canRetry && attempt < 12) {
          await new Promise<void>((resolve) => setTimeout(resolve, 5000));
          return doFetch(attempt + 1);
        }

        // ── Retryable server-side error ────────────────────────────────────
        if (!res.ok || !data.success) {
          const msg = data.error || "Analysis failed. Please try again.";
          setErrorMessage(msg);
          setCanRetry(!!data.canRetry);
          setStatus("error");
          return;
        }

        // ── Success ────────────────────────────────────────────────────────
        const glamReport = data.report as GlamReport;
        setReport(glamReport);
        setStatus("success");

        // Cache the report so a page refresh shows it without re-calling the API
        try {
          sessionStorage.setItem(SS_REPORT, JSON.stringify(glamReport));
          sessionStorage.setItem(SS_REPORT_SID, sid);
        } catch {
          // sessionStorage full — non-fatal
        }

        // Clear image data now that the report is safely cached
        sessionStorage.removeItem(SS_IMAGE_BASE64);
        sessionStorage.removeItem(SS_IMAGE_MIME);
        sessionStorage.removeItem(SS_IMAGE_HASH);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        setCanRetry(true);
        setStatus("error");
      }
    }

    return doFetch(0);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function initialize() {
      // Guard against React Strict Mode double-invocation in development.
      // The ref persists across the simulated unmount/remount cycle so only
      // the first invocation proceeds — the second returns immediately.
      if (fetchStartedRef.current) return;
      fetchStartedRef.current = true;

      if (!sessionId) {
        setErrorMessage("No payment session found. Please complete the payment flow.");
        setStatus("error");
        return;
      }

      // 1. Check for a cached report for this exact session
      const cachedReport    = sessionStorage.getItem(SS_REPORT);
      const cachedSessionId = sessionStorage.getItem(SS_REPORT_SID);

      if (cachedReport && cachedSessionId === sessionId) {
        try {
          const parsed = JSON.parse(cachedReport) as GlamReport;
          setReport(parsed);
          setStatus("success");
          return;
        } catch {
          // Corrupted cache — fall through to fresh analysis
          sessionStorage.removeItem(SS_REPORT);
          sessionStorage.removeItem(SS_REPORT_SID);
        }
      }

      // 2. Need to call the API — check image is still in sessionStorage
      const imageBase64 = sessionStorage.getItem(SS_IMAGE_BASE64);
      const mimeType    = sessionStorage.getItem(SS_IMAGE_MIME) || "image/jpeg";

      if (!imageBase64) {
        // No cached report AND no image — user refreshed after clearing storage,
        // or opened this URL in a different browser/tab.
        setErrorMessage(
          "We couldn't find your photo. This happens if you refreshed the page in a new tab or switched browsers. " +
          "If you already received your report, it may have expired from this session."
        );
        setCanRetry(false);
        setStatus("error");
        return;
      }

      await fetchReport(sessionId, imageBase64, mimeType);
    }

    initialize().catch(console.error);
  }, [sessionId, fetchReport]);

  // ── Retry handler (re-uses image still in sessionStorage) ─────────────────
  const handleRetry = () => {
    if (!sessionId) return;

    const imageBase64 = sessionStorage.getItem(SS_IMAGE_BASE64);
    const mimeType    = sessionStorage.getItem(SS_IMAGE_MIME) || "image/jpeg";

    if (!imageBase64) {
      setErrorMessage("Your photo is no longer available. Please start over to upload it again.");
      setCanRetry(false);
      return;
    }

    setIsRetrying(true);
    setStatus("loading");
    setCanRetry(false);
    setAlreadyConsumed(false);

    fetchReport(sessionId, imageBase64, mimeType).finally(() => {
      setIsRetrying(false);
    });
  };

  const handlePrint = () => window.print();

  // ── Render states ─────────────────────────────────────────────────────────

  if (status === "loading") return <LoadingAnalysis />;

  if (status === "error") {
    return (
      <div className="min-h-screen bg-white text-[#242024] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
          >
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2
            className="text-2xl font-light mb-3"
            style={{ fontFamily: "var(--font-cormorant)" }}
          >
            {alreadyConsumed ? "Report already generated" : "Something went wrong"}
          </h2>
          <p className="text-sm text-[#777177] mb-8 leading-relaxed">{errorMessage}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {canRetry && !alreadyConsumed && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="btn-primary inline-flex items-center justify-center gap-2 py-3 px-6 rounded-full font-medium text-sm disabled:opacity-50"
              >
                <RotateCcw size={15} />
                {isRetrying ? "Trying again…" : "Try Again"}
              </button>
            )}
            <Link
              href="/upload"
              className={`inline-flex items-center justify-center gap-2 py-3 px-6 rounded-full font-medium text-sm transition-colors ${
                canRetry && !alreadyConsumed
                  ? "text-[#777177] hover:text-[#242024]"
                  : "btn-primary"
              }`}
              style={
                canRetry && !alreadyConsumed
                  ? { border: "1px solid #F1E6EA" }
                  : {}
              }
            >
              <RefreshCw size={15} />
              Start Over
            </Link>
            <a
              href="mailto:support@glamai.app"
              className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-full font-medium text-sm text-[#777177] hover:text-[#242024] transition-colors"
              style={{ border: "1px solid #F1E6EA" }}
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#242024", fontFamily: "var(--font-sans)", overflowX: "hidden" }} id="glam-report">

      {/* ── Nav ── */}
      <nav className="print:hidden" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px clamp(20px,5vw,64px)", borderBottom: "1px solid #F1E6EA" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500 }}>Glam AI</span>
        </Link>
        <button
          onClick={handlePrint}
          style={{ background: "none", border: "none", fontSize: "13px", color: "#777177", cursor: "pointer", fontFamily: "var(--font-sans)" }}
        >
          Save Report
        </button>
      </nav>

      {/* ── Hero ── */}
      <header style={{ background: "linear-gradient(180deg,#FDF5F7 0%,#FFFFFF 100%)", padding: "clamp(56px,9vw,96px) clamp(20px,5vw,64px) clamp(48px,7vw,80px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            Your Personalized Glow-Up Report
          </p>
          <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.4rem,5vw,3.8rem)", lineHeight: 1.15, margin: "0 0 28px", maxWidth: "820px" }}>
            {report.profile.headline}
          </h1>
          <p style={{ fontSize: "17px", lineHeight: 1.7, color: "#4a454a", maxWidth: "600px", margin: "0 0 40px", fontWeight: 300 }}>
            {report.profile.summary}
          </p>
          <p className="print:hidden" style={{ fontSize: "13px", color: "#a49da2", margin: 0 }}>
            {NAV_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} style={{ marginRight: "20px" }}>{s.label}</a>
            ))}
          </p>
        </div>
      </header>

      {/* ── Makeup ── */}
      <section id="section-makeup" style={{ padding: "clamp(64px,8vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", fontWeight: 400, margin: "0 0 40px" }}>Makeup</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "clamp(32px,4vw,48px)" }}>
            {Object.values(report.makeup).map((item: RecommendationItem) => (
              <RecItem key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Hair ── */}
      <section id="section-hair" style={{ padding: "clamp(64px,8vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", fontWeight: 400, margin: "0 0 40px" }}>Hair</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "clamp(32px,4vw,48px)" }}>
            {Object.values(report.hair).map((item: RecommendationItem) => (
              <RecItem key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Colors ── */}
      <section id="section-colors" style={{ padding: "clamp(64px,8vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", fontWeight: 400, margin: "0 0 40px" }}>Your Colour Palette</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "clamp(32px,4vw,48px)" }}>
            {Object.values(report.colors).map((item: RecommendationItem) => (
              <RecItem key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Style Directions ── */}
      <section id="section-style" style={{ padding: "clamp(64px,8vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", fontWeight: 400, margin: "0 0 40px" }}>Style Directions</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "clamp(32px,4vw,48px)" }}>
            {report.style.map((direction, i) => (
              <div key={i} style={{ borderTop: "1px solid #F1E6EA", paddingTop: "20px" }}>
                <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", margin: "0 0 10px" }}>{direction.name}</p>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#4a454a", margin: "0 0 10px" }}>{direction.description}</p>
                {direction.keyPieces && direction.keyPieces.length > 0 && (
                  <p style={{ fontSize: "12px", color: "#a49da2", margin: 0 }}>{direction.keyPieces.join(" · ")}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Priorities ── */}
      <section id="section-priorities" style={{ padding: "clamp(64px,8vw,96px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", fontWeight: 400, margin: "0 0 40px" }}>Glow-Up Priorities</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {report.priorities.map((priority: GlowUpPriority) => (
              <div key={priority.rank} style={{ display: "flex", gap: "28px", alignItems: "baseline", borderTop: "1px solid #F1E6EA", padding: "20px 0" }}>
                <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", color: "#E88BA8", margin: 0, width: "36px", flexShrink: 0 }}>
                  {priority.rank}
                </p>
                <div>
                  <p style={{ fontSize: "15px", fontWeight: 500, margin: "0 0 4px" }}>
                    {priority.title}{" "}
                    <span style={{ fontWeight: 400, color: "#a49da2", fontSize: "13px" }}>— {priority.impact} impact</span>
                  </p>
                  <p style={{ fontSize: "14px", color: "#777177", lineHeight: 1.6, margin: 0 }}>{priority.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick Plan ── */}
      <section id="section-plan" style={{ padding: "clamp(64px,8vw,96px) clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "28px", fontWeight: 400, margin: "0 0 40px" }}>Your Quick Glow-Up Plan</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "clamp(32px,4vw,56px)" }}>
            <PlanColumn title="Today" items={report.quickPlan.today} color="#E88BA8" />
            <PlanColumn title="This Week" items={report.quickPlan.thisWeek} color="#9a7fd0" />
            <PlanColumn title="Next Purchase" items={report.quickPlan.nextPurchase} color="#6ab89a" />
          </div>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section className="print:hidden" style={{ padding: "0 clamp(20px,5vw,64px) clamp(80px,10vw,112px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", background: "#FDF5F7", borderRadius: "8px", padding: "clamp(40px,6vw,64px)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "32px" }}>
          <div>
            <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "26px", fontWeight: 400, margin: "0 0 8px" }}>Love your report?</p>
            <p style={{ fontSize: "14px", color: "#777177", margin: 0 }}>Share with a friend who deserves their own glow-up.</p>
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button
              onClick={handlePrint}
              style={{ height: "52px", paddingInline: "28px", borderRadius: "9999px", border: "none", background: "#242024", color: "#FFFFFF", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
            >
              Save My Report
            </button>
            <Link
              href="/"
              style={{ display: "inline-flex", alignItems: "center", height: "52px", paddingInline: "28px", borderRadius: "9999px", border: "1px solid #E8D8E0", color: "#777177", fontSize: "14px" }}
            >
              Back to Glam AI
            </Link>
          </div>
        </div>
      </section>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white; color: #242024; }
          nav, button, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RecItem({ item }: { item: RecommendationItem }) {
  return (
    <div style={{ borderTop: "1px solid #F1E6EA", paddingTop: "20px" }}>
      <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "#E88BA8", margin: "0 0 10px" }}>
        {item.title}
      </p>
      <p style={{ fontSize: "15px", lineHeight: 1.6, margin: "0 0 8px" }}>{item.recommendation}</p>
      <p style={{ fontSize: "13px", lineHeight: 1.6, color: "#a49da2", fontStyle: "italic", margin: 0 }}>{item.why}</p>
      {item.products && item.products.length > 0 && (
        <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {item.products.map((product, i) => (
            <span key={i} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "9999px", background: "#FCE7EF", color: "#C4637E", border: "1px solid #F1E6EA" }}>
              {product}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanColumn({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color, margin: "0 0 20px", borderBottom: "1px solid #F1E6EA", paddingBottom: "14px" }}>
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {items.map((item, i) => (
          <p key={i} style={{ fontSize: "14px", color: "#4a454a", lineHeight: 1.5, margin: 0 }}>{item}</p>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<LoadingAnalysis />}>
      <ResultsPageInner />
    </Suspense>
  );
}
