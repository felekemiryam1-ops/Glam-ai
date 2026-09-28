"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { SubscribeButton } from "@/components/SubscribeButton";
import { PLAN_COPY } from "@/lib/plans";

// ─────────────────────────────────────────────────────────────────────────────
// Plan data
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "one-time" as const,
    tag: "One-Time",
    labelColor: "#a49da2",
    price: "$4.99",
    period: "",
    priceNote: "one report, forever yours",
    name: "Glow-Up Report",
    desc: "A full AI beauty consultation in under 90 seconds. Perfect for trying Glam AI.",
    features: [
      "Full AI beauty analysis",
      "Makeup & hair recommendations",
      "Personal colour palette",
      "Style directions & priorities",
      "Printable / saveable report",
    ],
    cta: "Get My Glow-Up",
    bg: "transparent",
    color: "#242024",
    border: "1px solid #242024",
  },
  {
    id: "pro" as const,
    tag: "Most Popular · Glam AI Pro",
    labelColor: "#E88BA8",
    price: PLAN_COPY.pro.price,
    period: PLAN_COPY.pro.priceNote,
    priceNote: "cancel anytime",
    name: PLAN_COPY.pro.positioning,
    desc: "Personalized beauty guidance that gets smarter with every analysis.",
    features: PLAN_COPY.pro.features,
    cta: "Start Pro",
    bg: "#242024",
    hoverBg: "#3a333a",
    color: "#FFFFFF",
    border: "none",
  },
  {
    id: "premium" as const,
    tag: "Glam AI Premium",
    labelColor: "#a99ba1",
    price: PLAN_COPY.premium.price,
    period: PLAN_COPY.premium.priceNote,
    priceNote: "cancel anytime",
    name: PLAN_COPY.premium.positioning,
    desc: "Full AI beauty stylist — advanced transformations and complete looks.",
    features: PLAN_COPY.premium.features,
    cta: "Start Premium",
    bg: "transparent",
    hoverBg: "#FAF6F7",
    color: "#242024",
    border: "1px solid #242024",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * currentPlan is resolved server-side (see page.tsx) from the DB-synced
 * Subscription row via getEntitlements() — never trusted from the client.
 * It changes what each paid card's CTA does:
 *   - viewing your own current plan → a disabled "Current Plan" badge, not
 *     a button at all (nothing to click, nothing to spoof).
 *   - an existing Pro/Premium subscriber viewing the OTHER paid plan →
 *     "Manage Subscription" (routes to Stripe's Billing Portal), never a
 *     fresh Checkout session — POST /api/subscription/checkout always
 *     creates a NEW subscription object in Stripe, so sending an
 *     already-subscribed user through it again would double-bill them
 *     rather than change their existing plan. The Portal is Stripe's own
 *     mechanism for modifying an existing subscription safely.
 *   - a free user → the existing real Checkout flow, unchanged.
 */
function PricingPageInner({ currentPlan }: { currentPlan: "free" | "pro" | "premium" }) {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled") === "true";
  // Present right after returning from the login step in the upgrade flow —
  // tells the matching plan's SubscribeButton to resume checkout automatically.
  const autoCheckoutPlan = searchParams.get("autoCheckout");
  const hasSubscription = currentPlan === "pro" || currentPlan === "premium";

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#242024", overflowX: "hidden" }}>

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px clamp(20px,5vw,64px)", borderBottom: "1px solid #F1E6EA" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500 }}>Glam AI</span>
        </Link>
        <div style={{ display: "flex", gap: "28px" }}>
          <Link href="/upload" style={{ fontSize: "13px", color: "#777177" }}>Get Report</Link>
          <Link href="/dashboard" style={{ fontSize: "13px", color: "#777177" }}>Dashboard</Link>
        </div>
      </nav>

      {cancelled && (
        <div style={{ maxWidth: "1200px", margin: "16px auto 0", padding: "0 clamp(20px,5vw,64px)" }}>
          <div
            className="animate-fade-in"
            style={{
              padding: "16px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "14px",
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              color: "#92400E",
            }}
          >
            <AlertCircle size={16} />
            Payment was cancelled. Your plan hasn&apos;t changed.
          </div>
        </div>
      )}

      <section style={{ padding: "clamp(72px,10vw,112px) clamp(20px,5vw,64px) clamp(64px,8vw,96px)", textAlign: "center" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
          Simple, Transparent Pricing
        </p>
        <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.4rem,5vw,3.6rem)", lineHeight: 1.15, margin: "0 auto 24px", maxWidth: "700px" }}>
          Your beauty companion, on your terms
        </h1>
        <p style={{ fontSize: "17px", color: "#777177", maxWidth: "480px", margin: "0 auto", fontWeight: 300, lineHeight: 1.6 }}>
          Start with a one-time report. Upgrade for an ongoing companion that learns your style.
        </p>
      </section>

      <section style={{ padding: "0 clamp(20px,5vw,64px) clamp(96px,12vw,140px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 0 }}>
          {PLANS.map((plan) => {
            const isCurrent = plan.id !== "one-time" && plan.id === currentPlan;
            const isOtherPaidPlan = plan.id !== "one-time" && hasSubscription && !isCurrent;

            return (
              <div key={plan.id} style={{ padding: "48px 36px", borderTop: "1px solid #F1E6EA" }}>
                <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: plan.labelColor, margin: "0 0 20px" }}>
                  {plan.tag}
                </p>
                <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "44px", fontWeight: 400, margin: "0 0 4px" }}>
                  {plan.price}
                  <span style={{ fontSize: "16px", color: "#a49da2", fontFamily: "var(--font-sans)" }}>{plan.period}</span>
                </p>
                <p style={{ fontSize: "13px", color: "#a49da2", margin: "0 0 28px" }}>{plan.priceNote}</p>
                <p style={{ fontSize: "17px", fontFamily: "var(--font-cormorant)", margin: "0 0 8px" }}>{plan.name}</p>
                <p style={{ fontSize: "14px", color: "#777177", lineHeight: 1.6, margin: "0 0 32px" }}>{plan.desc}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "36px" }}>
                  {plan.features.map((f) => (
                    <p key={f} style={{ fontSize: "14px", color: "#4a454a", margin: 0, lineHeight: 1.5 }}>{f}</p>
                  ))}
                </div>

                {plan.id === "one-time" ? (
                  <Link
                    href="/upload"
                    style={{
                      display: "flex", width: "100%", height: "52px", borderRadius: "9999px",
                      border: plan.border, background: plan.bg, color: plan.color,
                      fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600,
                      alignItems: "center", justifyContent: "center", boxSizing: "border-box",
                    }}
                  >
                    {plan.cta}
                  </Link>
                ) : isCurrent ? (
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      width: "100%", height: "52px", borderRadius: "9999px",
                      border: `1px solid ${plan.bg === "#242024" ? "rgba(255,255,255,0.3)" : "#242024"}`,
                      background: "transparent", color: plan.bg === "#242024" ? "#FFFFFF" : "#242024",
                      fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, boxSizing: "border-box",
                    }}
                  >
                    <CheckCircle2 size={15} />
                    Current Plan
                  </div>
                ) : isOtherPaidPlan ? (
                  <Link
                    href="/dashboard/settings"
                    style={{
                      display: "flex", width: "100%", height: "52px", borderRadius: "9999px",
                      border: plan.border, background: plan.bg, color: plan.color,
                      fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600,
                      alignItems: "center", justifyContent: "center", boxSizing: "border-box",
                    }}
                  >
                    Manage Subscription
                  </Link>
                ) : (
                  <SubscribeButton
                    plan={plan.id}
                    label={plan.cta}
                    bg={plan.bg}
                    hoverBg={plan.hoverBg}
                    color={plan.color}
                    border={plan.border}
                    callbackUrl="/pricing"
                    autoTrigger={autoCheckoutPlan === plan.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ padding: "0 clamp(20px,5vw,64px) 80px", textAlign: "center" }}>
        <p style={{ fontSize: "13px", color: "#a49da2", margin: "0 0 8px" }}>
          All plans use Stripe for secure payment processing. Glam AI never stores your card details.
        </p>
        <p style={{ fontSize: "13px", color: "#a49da2", margin: "0 0 8px" }}>
          Subscriptions renew monthly. Cancel anytime from your account settings.
        </p>
        <p style={{ fontSize: "13px", color: "#a49da2", margin: 0 }}>
          Questions? <a href="mailto:support@glamai.app">support@glamai.app</a>
        </p>
      </section>

    </div>
  );
}

export function PricingContent({ currentPlan }: { currentPlan: "free" | "pro" | "premium" }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-[#777177] text-sm">Loading…</div>
      </div>
    }>
      <PricingPageInner currentPlan={currentPlan} />
    </Suspense>
  );
}
