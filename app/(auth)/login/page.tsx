"use client";

/**
 * /login — dual purpose:
 *
 *  1. Upgrade-flow auth step (when `?plan=pro|premium` is present): reached
 *     only from SubscribeButton's "Choose Pro/Premium" CTA when the user
 *     isn't signed in. Framed entirely around the plan they already picked
 *     — "Continue to Pro", plan summary, no competing $4.99 offer — because
 *     by the time someone is here, they've already decided. The
 *     `callbackUrl` SubscribeButton hands us already carries
 *     `autoCheckout=<plan>`, so after the magic link is clicked, the user
 *     lands back on /pricing or /glow-up and SubscribeButton's `autoTrigger`
 *     resumes checkout for that exact plan with no second click.
 *
 *  2. Generic sign-in (nav "Sign in" link, dashboard/settings auth guard,
 *     proxy.ts middleware redirects): no `plan` param, so it shows the
 *     plain welcome copy and keeps the $4.99 one-time-report link, which
 *     would be a non-sequitur mid-upgrade but is a reasonable option here.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, AlertCircle, CheckCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { PLAN_COPY, isPaidPlan } from "@/lib/plans";

// ─────────────────────────────────────────────────────────────────────────────
// Error messages mapped from NextAuth error codes
// ─────────────────────────────────────────────────────────────────────────────
const AUTH_ERRORS: Record<string, string> = {
  Signin: "Something went wrong signing in. Please try again.",
  OAuthSignin: "Error connecting to the provider. Please try again.",
  OAuthCallback: "Error during authentication. Please try again.",
  OAuthCreateAccount: "Could not create account. Please try again.",
  EmailCreateAccount: "Could not create account. Please try again.",
  Callback: "Authentication error. Please try again.",
  OAuthAccountNotLinked: "This email is already linked to another account.",
  EmailSignin: "Could not send magic link. Please try again.",
  CredentialsSignin: "Invalid credentials. Please try again.",
  SessionRequired: "Please sign in to continue.",
  default: "Something went wrong. Please try again.",
};

function LoginPageInner() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const isVerify = searchParams.get("verify") === "true";
  const errorCode = searchParams.get("error") ?? "";
  const errorMessage = errorCode ? (AUTH_ERRORS[errorCode] ?? AUTH_ERRORS.default) : null;

  const planParam = searchParams.get("plan");
  // Compact plan summary — reassurance, not a sales pitch, so only the
  // first few benefits from the shared plan copy are shown here (the full
  // list appears on /pricing and /glow-up).
  const plan = isPaidPlan(planParam)
    ? { ...PLAN_COPY[planParam], features: PLAN_COPY[planParam].features.slice(0, 5) }
    : null;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // If we've already been redirected here after sending a link, skip straight to verify state
  const showVerify = isVerify || status === "sent";

  // Dev-only resend: real magic-link resending is a legitimate feature for
  // any environment, but the rate-limit backstop in lib/auth.ts is an
  // in-memory Map that doesn't survive across serverless instances — not
  // durable enough to expose broadly in production yet. Gated to dev until
  // that's backed by something persistent (DB/Redis).
  const isDev = process.env.NODE_ENV !== "production";
  const RESEND_COOLDOWN_SECONDS = 30;
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Single persistent ticker — decrements resendCooldown once a second
  // whenever it's above zero.
  useEffect(() => {
    const t = setInterval(() => {
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setSubmitError(null);

    try {
      const result = await signIn("email", {
        email: email.trim().toLowerCase(),
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setSubmitError(AUTH_ERRORS[result.error] ?? AUTH_ERRORS.default);
        setStatus("error");
        return;
      }

      setStatus("sent");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setSubmitError("Could not send magic link. Please try again.");
      setStatus("error");
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending || !email.trim()) return;
    setResending(true);
    setResendError(null);
    setResendSuccess(false);

    try {
      const result = await signIn("email", {
        email: email.trim().toLowerCase(),
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setResendError(AUTH_ERRORS[result.error] ?? AUTH_ERRORS.default);
        return;
      }

      setResendSuccess(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setResendError("Could not resend the link. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#242024" }}>
      {/* Nav */}
      <nav style={{ padding: "24px clamp(20px,5vw,64px)", borderBottom: "1px solid #F1E6EA" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500, color: "#242024" }}>Glam AI</span>
        </Link>
      </nav>

      <main style={{ display: "flex", justifyContent: "center", padding: "clamp(56px,9vw,96px) clamp(20px,5vw,64px)" }}>
        <div style={{ width: "100%", maxWidth: plan ? "920px" : "440px" }}>
          <div
            style={{
              display: "grid",
              // auto-fit + minmax wraps to a single column once the viewport
              // can't fit both tracks at their minimum width — same
              // responsive pattern used elsewhere in the app.
              gridTemplateColumns: plan ? "repeat(auto-fit,minmax(300px,1fr))" : "1fr",
              gap: "clamp(40px,5vw,64px)",
              alignItems: "start",
            }}
          >
            {/* ── Plan summary (upgrade flow only) ─────────────────────────── */}
            {plan && (
              <div
                style={{
                  border: "1px solid #F1E6EA",
                  borderRadius: "16px",
                  padding: "clamp(28px,3vw,36px)",
                  background: "#FDF5F7",
                }}
              >
                <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#E88BA8", margin: "0 0 12px" }}>
                  {plan.name}
                </p>
                <p style={{ margin: "0 0 24px" }}>
                  <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "36px", fontWeight: 400 }}>{plan.price}</span>
                  <span style={{ fontSize: "14px", color: "#a49da2" }}> / month</span>
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {plan.features.map((f) => (
                    <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#FCE7EF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      >
                        <CheckCircle size={10} style={{ color: "#E88BA8" }} />
                      </div>
                      <span style={{ fontSize: "14px", lineHeight: 1.5, color: "#4a454a" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Auth card ─────────────────────────────────────────────────── */}
            <div>
              {showVerify ? (
                /* ── Magic link sent state ── */
                <div>
                  <div
                    style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#FCE7EF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}
                  >
                    <CheckCircle size={24} style={{ color: "#E88BA8" }} />
                  </div>
                  <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(1.8rem,3vw,2.2rem)", margin: "0 0 12px" }}>
                    Check your email
                  </h1>
                  <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#4a454a", margin: "0 0 8px" }}>
                    We sent a secure sign-in link to <strong style={{ color: "#242024" }}>{email || "your email"}</strong>.
                  </p>
                  <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#4a454a", margin: "0 0 28px" }}>
                    Open your email and click the link to continue{plan ? ` to ${plan.name}` : ""}.
                  </p>
                  <p style={{ fontSize: "13px", color: "#a49da2" }}>
                    Didn&apos;t get it? Check your spam folder, or{" "}
                    <button
                      onClick={() => setStatus("idle")}
                      style={{ background: "none", border: "none", padding: 0, color: "#E88BA8", cursor: "pointer", fontSize: "13px", textDecoration: "underline" }}
                    >
                      try again
                    </button>
                    .
                  </p>
                  {isDev && (
                    <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #F1E6EA" }}>
                      <p style={{ fontSize: "12px", color: "#a49da2", fontStyle: "italic", margin: "0 0 14px" }}>
                        Development mode: no real email is sent — check your terminal for the magic link URL.
                      </p>
                      <button
                        onClick={handleResend}
                        disabled={resendCooldown > 0 || resending}
                        style={{
                          height: "40px",
                          padding: "0 20px",
                          borderRadius: "9999px",
                          border: "1px solid #E3C9D4",
                          background: "transparent",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: resendCooldown > 0 || resending ? "#c9bfc4" : "#242024",
                          cursor: resendCooldown > 0 || resending ? "not-allowed" : "pointer",
                        }}
                      >
                        {resending
                          ? "Resending…"
                          : resendCooldown > 0
                            ? `Resend available in ${resendCooldown}s`
                            : "Resend magic link"}
                      </button>
                      {resendSuccess && !resending && (
                        <p style={{ marginTop: "10px", fontSize: "12px", color: "#6ab89a" }}>
                          Link resent — check your terminal again.
                        </p>
                      )}
                      {resendError && (
                        <p style={{ marginTop: "10px", fontSize: "12px", color: "#DC2626" }}>{resendError}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ── Email input state ── */
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 16px" }}>
                    {plan ? `Continue to ${plan.name}` : "Sign In"}
                  </p>
                  <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2rem,4vw,2.6rem)", lineHeight: 1.15, margin: "0 0 16px" }}>
                    {plan ? `${plan.price} / month` : "Welcome to Glam AI"}
                  </h1>
                  <p style={{ fontSize: "16px", lineHeight: 1.6, color: "#777177", margin: "0 0 40px", fontWeight: 300 }}>
                    {plan
                      ? `Sign in or create your Glam AI account to continue to your ${plan.name} plan.`
                      : "Enter your email and we'll send you a secure sign-in link."}
                  </p>

                  {errorMessage && (
                    <div
                      style={{ marginBottom: "24px", padding: "16px", borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}
                    >
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                      {errorMessage}
                    </div>
                  )}

                  {submitError && (
                    <div
                      style={{ marginBottom: "24px", padding: "16px", borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}
                    >
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                      {submitError}
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    <label htmlFor="email" style={{ display: "block", fontSize: "13px", color: "#777177", marginBottom: "10px" }}>
                      Email address
                    </label>
                    <div style={{ position: "relative", marginBottom: "20px" }}>
                      <Mail size={16} style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#a49da2", pointerEvents: "none" }} />
                      <input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        autoFocus
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={status === "loading"}
                        style={{
                          width: "100%",
                          height: "52px",
                          paddingLeft: "44px",
                          paddingRight: "16px",
                          borderRadius: "9999px",
                          border: "1px solid #E3C9D4",
                          background: "#FDFAFB",
                          fontSize: "15px",
                          color: "#242024",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!email.trim() || status === "loading"}
                      style={{
                        width: "100%",
                        height: "52px",
                        borderRadius: "9999px",
                        border: "none",
                        background: !email.trim() || status === "loading" ? "#c9bfc4" : "#242024",
                        color: "#FFFFFF",
                        fontSize: "15px",
                        fontWeight: 600,
                        cursor: !email.trim() || status === "loading" ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                    >
                      {status === "loading" ? "Sending your secure link…" : "Send me a login link →"}
                    </button>
                  </form>

                  <p style={{ textAlign: "center", fontSize: "13px", color: "#a49da2", margin: "20px 0 0" }}>
                    Secure sign-in · No password required
                  </p>

                  {/* One-time report — only shown outside the upgrade flow, where it
                      isn't a competing purchase decision mid-checkout. */}
                  {!plan && (
                    <p style={{ textAlign: "center", fontSize: "13px", color: "#a49da2", margin: "32px 0 0" }}>
                      Just here for a one-time report?{" "}
                      <Link href="/upload" style={{ color: "#E88BA8" }}>
                        Get your $4.99 Glow-Up
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#777177", fontSize: "14px" }}>Loading…</div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
