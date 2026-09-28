// Dashboard → Settings — server component.
// Shows subscription status + usage and provides a link to Stripe Customer
// Portal. Restyled (Stage 6 Step 7) to match the rest of the app's light
// theme — this page previously used a leftover dark palette inconsistent
// with every other page (dashboard, pricing, glow-up, skin/hair/routine,
// premium). Subscription state handling itself is unchanged, and now goes
// through getEntitlements() (unmodified) instead of re-deriving the same
// active/trialing → paid logic inline a second time — same behavior, one
// source of truth, and usage/remaining come along for free.
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEntitlements } from "@/lib/entitlements";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard, User, Zap, Crown, AlertCircle } from "lucide-react";
import { ManageBillingButton } from "./ManageBillingButton";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";
const PINK_BG = "#FCE7EF";
const PREMIUM_PURPLE = "#9a7fd0";
const PREMIUM_BG = "rgba(154,127,208,0.1)";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { user } = session;

  const [subscription, entitlements] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId: user.id } }),
    getEntitlements(user.id),
  ]);

  const { plan, monthlyLimit, usedThisPeriod, remaining } = entitlements;

  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: INK }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px clamp(20px,5vw,64px)", borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500 }}>Glam AI</span>
        </Link>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
          <button type="submit" style={{ fontSize: "13px", color: MUTED, background: "none", border: "none", cursor: "pointer" }}>
            Sign out
          </button>
        </form>
      </nav>

      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "clamp(48px,7vw,80px) clamp(20px,5vw,64px) 96px" }}>
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: MUTED, marginBottom: "32px" }}>
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>

        <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 40px" }}>
          Account settings
        </h1>

        {/* ── Account ────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 12px" }}>Account</p>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: PINK_BG, flexShrink: 0 }}>
              <User size={18} style={{ color: PINK }} />
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{user.name ?? "Glam AI User"}</div>
              <div style={{ fontSize: "12.5px", color: MUTED, marginTop: "2px" }}>{user.email}</div>
            </div>
          </div>
        </section>

        {/* ── Subscription ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 12px" }}>Subscription</p>

          {plan === "free" ? (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "20px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F0F2", flexShrink: 0 }}>
                  <CreditCard size={16} style={{ color: MUTED }} />
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>Free plan</div>
                  <div style={{ fontSize: "12.5px", color: MUTED, marginTop: "2px" }}>
                    One-time reports only. Upgrade for ongoing AI beauty guidance.
                  </div>
                </div>
              </div>
              <Link
                href="/pricing"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 22px", borderRadius: "9999px", background: INK, color: "#FFFFFF", fontSize: "13.5px", fontWeight: 600 }}
              >
                <Zap size={14} />
                Upgrade to Pro — $9.99/month
              </Link>
            </div>
          ) : (
            <div style={{ border: `1px solid ${plan === "premium" ? "rgba(154,127,208,0.3)" : "rgba(232,139,168,0.3)"}`, borderRadius: "16px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: plan === "premium" ? PREMIUM_BG : PINK_BG, flexShrink: 0,
                    }}
                  >
                    {plan === "premium" ? <Crown size={16} style={{ color: PREMIUM_PURPLE }} /> : <Zap size={16} style={{ color: PINK }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, textTransform: "capitalize" }}>Glam AI {plan}</div>
                    <div style={{ fontSize: "12.5px", marginTop: "2px", textTransform: "capitalize", color: subscription?.status === "past_due" ? "#C4487A" : MUTED }}>
                      {subscription?.status === "past_due"
                        ? "⚠ Payment failed — please update billing"
                        : subscription?.cancelAtPeriodEnd
                          ? `Cancels on ${periodEnd}`
                          : periodEnd
                            ? `Renews ${periodEnd}`
                            : subscription?.status}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: "11px", fontWeight: 600, padding: "5px 12px", borderRadius: "9999px", textTransform: "capitalize", flexShrink: 0,
                    background: subscription?.status === "active" || subscription?.status === "trialing" ? "#E8F1EA" : subscription?.status === "past_due" ? "#FBEAE8" : "#F5F0F2",
                    color: subscription?.status === "active" || subscription?.status === "trialing" ? "#4d7c5f" : subscription?.status === "past_due" ? "#C4487A" : MUTED,
                  }}
                >
                  {subscription?.status}
                </span>
              </div>

              {/* ── Usage ──────────────────────────────────────────────── */}
              {monthlyLimit !== null && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 600, color: INK }}>
                      {remaining} / {monthlyLimit} analyses remaining
                    </span>
                    <span style={{ fontSize: "11.5px", color: MUTED }}>{usedThisPeriod} used this period</span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "9999px", background: "#F1E6EA", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${monthlyLimit > 0 ? Math.min(100, (usedThisPeriod / monthlyLimit) * 100) : 0}%`,
                        background: plan === "premium" ? PREMIUM_PURPLE : PINK,
                        borderRadius: "9999px",
                      }}
                    />
                  </div>
                  <p style={{ fontSize: "11.5px", color: MUTED, margin: "8px 0 0" }}>
                    Included Glow-Up analyses only — the $4.99 one-time report, Skin/Hair Glow-Up, Beauty Routine, and
                    Premium features never count against this.
                  </p>
                </div>
              )}

              {subscription?.status === "past_due" && (
                <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "12px", background: "#FBEAE8", border: "1px solid rgba(160,74,69,0.25)", display: "flex", gap: "10px", fontSize: "13px", color: "#A04A45" }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
                  Your last payment failed. Update your payment method to keep your subscription active.
                </div>
              )}

              <ManageBillingButton />
            </div>
          )}
        </section>

        {plan !== "free" && (
          <p style={{ fontSize: "12px", color: MUTED, lineHeight: 1.6 }}>
            You can cancel your subscription at any time through Stripe&apos;s billing portal above. Your access
            continues until the end of the current billing period.
          </p>
        )}
      </main>
    </div>
  );
}
