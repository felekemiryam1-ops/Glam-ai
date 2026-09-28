// Dashboard — server component.
// Middleware ensures only authenticated users reach this route.
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, FileText, Settings, LogOut, Plus, Crown, User, CheckCircle2, ArrowRight, Droplet, Scissors, ListChecks, TrendingUp } from "lucide-react";
import { UpgradeButton } from "./UpgradeButton";
import { PLAN_COPY, isPaidPlan } from "@/lib/plans";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const session = await auth();

  // Middleware already blocks unauthenticated users but double-check here
  // so TypeScript knows session.user exists below.
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { user } = session;
  const { subscribed } = await searchParams;
  const justSubscribed = subscribed === "true";

  // Fetch the user's most recent reports
  const reports = await prisma.report.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Fetch subscription status (null = free tier)
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  const isActiveSub = subscription?.status === "active" || subscription?.status === "trialing";
  const plan = isActiveSub && isPaidPlan(subscription?.plan) ? subscription.plan : "free";

  // Temporary diagnostic (Stage 6 Step 9 investigation) — safe identifiers
  // only. Remove once the "Pro subscription active but UI shows Free" issue
  // is confirmed resolved in production.
  console.log(
    `[dashboard] userId=${user.id} dbSubscriptionRow=${subscription ? "found" : "none"} dbPlan=${subscription?.plan ?? "<none>"} dbStatus=${subscription?.status ?? "<none>"} → renderedPlan=${plan}`
  );

  // Stripe's webhook updates the Subscription row asynchronously — it's
  // usually near-instant but can lag a checkout redirect by a second or two.
  // If we land here with ?subscribed=true but the DB still shows "free",
  // don't guess or claim a plan we haven't confirmed — show a brief
  // finalizing state instead.
  const stillFinalizing = justSubscribed && plan === "free";
  const showWelcome = justSubscribed && isPaidPlan(plan);

  // Check if the user has completed their beauty profile onboarding
  const beautyProfile = await prisma.beautyProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, aesthetic: true },
  });
  const hasProfile = !!beautyProfile;

  const planLabelColor = plan === "premium" ? "#9a7fd0" : plan === "pro" ? "#E88BA8" : "#a49da2";
  const planLabelBg = plan === "premium" ? "rgba(154,127,208,0.1)" : plan === "pro" ? "rgba(232,139,168,0.1)" : "#F5F0F2";
  const planLabelBorder = plan === "premium" ? "rgba(154,127,208,0.28)" : plan === "pro" ? "rgba(232,139,168,0.3)" : "#E9E0E4";

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#242024" }}>
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          rowGap: "12px",
          padding: "24px clamp(20px,5vw,64px)",
          borderBottom: "1px solid #F1E6EA",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500 }}>Glam AI</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", rowGap: "10px" }}>
          {plan !== "free" && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "capitalize",
                letterSpacing: "0.04em",
                padding: "6px 14px",
                borderRadius: "9999px",
                background: planLabelBg,
                color: planLabelColor,
                border: `1px solid ${planLabelBorder}`,
              }}
            >
              {plan}
            </span>
          )}
          <span style={{ fontSize: "13px", color: "#a49da2" }}>{user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "#a49da2",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "clamp(56px,8vw,96px) clamp(20px,5vw,64px) 96px" }}>
        {stillFinalizing && (
          <div
            style={{
              marginBottom: "40px",
              padding: "18px 24px",
              borderRadius: "14px",
              background: "#FDF5F7",
              border: "1px solid #F1E6EA",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <p style={{ fontSize: "14px", color: "#4a454a", margin: 0 }}>
              Payment received — finalizing your subscription. This usually takes just a few seconds.
            </p>
            <a href="/dashboard?subscribed=true" style={{ fontSize: "13px", fontWeight: 600, color: "#E88BA8", whiteSpace: "nowrap" }}>
              Refresh →
            </a>
          </div>
        )}

        {/* ── Post-checkout welcome moment ─────────────────────────────────── */}
        {showWelcome && isPaidPlan(plan) && (
          <section style={{ textAlign: "center", marginBottom: "88px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 16px",
                borderRadius: "9999px",
                background: planLabelBg,
                border: `1px solid ${planLabelBorder}`,
                color: planLabelColor,
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                marginBottom: "28px",
              }}
            >
              <CheckCircle2 size={12} />
              Subscription confirmed
            </div>

            <h1
              style={{
                fontFamily: "var(--font-cormorant)",
                fontWeight: 300,
                fontSize: "clamp(2.4rem,5vw,3.4rem)",
                lineHeight: 1.15,
                margin: "0 0 16px",
              }}
            >
              {PLAN_COPY[plan].welcomeHeadline}
            </h1>
            <p style={{ fontSize: "18px", color: "#777177", margin: "0 auto 48px", maxWidth: "440px", fontWeight: 300 }}>
              {PLAN_COPY[plan].welcomeSubline}
            </p>

            <div
              style={{
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: "14px 32px",
                maxWidth: "560px",
                margin: "0 auto 48px",
                padding: "36px clamp(28px,4vw,44px)",
                borderRadius: "20px",
                background: "#FDF5F7",
              }}
            >
              {PLAN_COPY[plan].features.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <CheckCircle2 size={15} style={{ color: "#E88BA8", flexShrink: 0, marginTop: "2px" }} />
                  <span style={{ fontSize: "14px", color: "#4a454a", lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>

            <Link
              href="/upload"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                height: "52px",
                padding: "0 32px",
                borderRadius: "9999px",
                background: "#242024",
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: 600,
              }}
            >
              {PLAN_COPY[plan].ctaLabel}
              <ArrowRight size={16} />
            </Link>
          </section>
        )}

        {/* ── Beauty profile completion banner ─────────────────────────────── */}
        {!hasProfile && !showWelcome && (
          <Link
            href="/onboarding"
            style={{
              display: "block",
              marginBottom: "40px",
              padding: "22px 28px",
              borderRadius: "16px",
              background: "#FDF5F7",
              border: "1px solid #F1E6EA",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: "#FCE7EF",
                }}
              >
                <Sparkles size={17} style={{ color: "#E88BA8" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>
                  Personalize your AI recommendations
                </div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  Complete your beauty profile (2 min) so every analysis is tailored to your goals and aesthetic.
                </div>
              </div>
              <ArrowRight size={16} style={{ color: "#E88BA8", flexShrink: 0 }} />
            </div>
          </Link>
        )}

        {/* ── Welcome back (normal return visit) ───────────────────────────── */}
        {!showWelcome && (
          <div style={{ marginBottom: "56px" }}>
            <h1
              style={{
                fontFamily: "var(--font-cormorant)",
                fontWeight: 300,
                fontSize: "clamp(2rem,4vw,2.8rem)",
                margin: "0 0 8px",
              }}
            >
              Welcome back
            </h1>
            <p style={{ fontSize: "15px", color: "#a49da2", margin: 0 }}>Your personal AI beauty companion.</p>
          </div>
        )}

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        {!showWelcome && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "20px", marginBottom: "64px" }}>
            <Link
              href="/upload"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: "1px solid #F1E6EA",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FCE7EF",
                }}
              >
                <Plus size={17} style={{ color: "#E88BA8" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>New Analysis</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>Get a fresh Glow-Up Report</div>
              </div>
            </Link>

            <Link
              href="/onboarding"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: hasProfile ? "1px solid rgba(154,127,208,0.28)" : "1px solid #F1E6EA",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(154,127,208,0.1)",
                }}
              >
                <User size={17} style={{ color: "#9a7fd0" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>Beauty Profile</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  {hasProfile ? `${beautyProfile!.aesthetic?.replace(/_/g, " ")} — edit` : "Set your goals & aesthetic"}
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/skin"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: plan !== "free" ? "1px solid rgba(232,139,168,0.3)" : "1px solid #F1E6EA",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FCE7EF",
                }}
              >
                <Droplet size={17} style={{ color: "#E88BA8" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>Skin Glow-Up</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  {plan !== "free" ? "Your personalized routine" : "Upgrade to Pro to unlock"}
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/hair"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: plan !== "free" ? "1px solid rgba(232,139,168,0.3)" : "1px solid #F1E6EA",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FCE7EF",
                }}
              >
                <Scissors size={17} style={{ color: "#E88BA8" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>Hair Glow-Up</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  {plan !== "free" ? "Your personalized routine" : "Upgrade to Pro to unlock"}
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/routine"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: plan !== "free" ? "1px solid rgba(232,139,168,0.3)" : "1px solid #F1E6EA",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FCE7EF",
                }}
              >
                <ListChecks size={17} style={{ color: "#E88BA8" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>Beauty Routine</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  {plan !== "free" ? "Your combined daily plan" : "Upgrade to Pro to unlock"}
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/premium"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: plan === "premium" ? "1px solid rgba(154,127,208,0.3)" : "1px solid #F1E6EA",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(154,127,208,0.1)",
                }}
              >
                <TrendingUp size={17} style={{ color: "#9a7fd0" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>Your Transformation System</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  {plan === "premium" ? "Progress, routine tracking & more" : "Upgrade to Premium to unlock"}
                </div>
              </div>
            </Link>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "28px",
                borderRadius: "18px",
                border: "1px solid #F1E6EA",
                opacity: 0.55,
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#F3F0EC",
                }}
              >
                <Crown size={17} style={{ color: "#b39b6a" }} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>Lookbooks</div>
                <div style={{ fontSize: "13px", color: "#a49da2" }}>
                  {plan === "premium" ? "Coming soon" : "Upgrade to unlock"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Reports ────────────────────────────────────────────────────────── */}
        {!showWelcome && (
          <div style={{ marginBottom: "56px" }}>
            <h2 style={{ fontFamily: "var(--font-cormorant)", fontSize: "22px", fontWeight: 400, margin: "0 0 24px" }}>
              My Reports
            </h2>

            {reports.length === 0 ? (
              <div style={{ padding: "56px 24px", textAlign: "center", borderRadius: "18px", border: "1px solid #F1E6EA" }}>
                <FileText size={26} style={{ color: "#c9bfc4", margin: "0 auto 18px" }} />
                <p style={{ fontSize: "14px", color: "#a49da2", margin: "0 0 24px" }}>
                  You don&apos;t have any saved reports yet.
                </p>
                <Link
                  href="/upload"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    height: "44px",
                    padding: "0 24px",
                    borderRadius: "9999px",
                    background: "#242024",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} />
                  Get your first Glow-Up Report
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {reports.map((report: { id: string; type: string; stripeSessionId: string | null; createdAt: Date }) => (
                  <div
                    key={report.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "18px 22px",
                      borderRadius: "14px",
                      border: "1px solid #F1E6EA",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          background: "#FCE7EF",
                        }}
                      >
                        <FileText size={14} style={{ color: "#E88BA8" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, textTransform: "capitalize" }}>
                          {report.type.replace("_", " ")} Report
                        </div>
                        <div style={{ fontSize: "12px", color: "#a49da2" }}>
                          {new Date(report.createdAt).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                    </div>

                    {report.stripeSessionId && (
                      <Link href={`/results?session_id=${report.stripeSessionId}`} style={{ fontSize: "13px", color: "#E88BA8", fontWeight: 600 }}>
                        View →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Upgrade prompt (free users only) ─────────────────────────────── */}
        {!showWelcome && plan === "free" && (
          <div
            style={{
              padding: "36px clamp(28px,4vw,40px)",
              borderRadius: "20px",
              background: "#FDF5F7",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#E88BA8", margin: "0 0 10px" }}>
                Glam AI Pro
              </p>
              <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "22px", fontWeight: 400, margin: "0 0 8px" }}>
                {PLAN_COPY.pro.price}/month — {PLAN_COPY.pro.positioning}
              </h3>
              <p style={{ fontSize: "14px", color: "#777177", lineHeight: 1.6, margin: 0 }}>
                10 analyses/month, a persistent beauty profile, saved reports, and personalized recommendations.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "220px" }}>
              <UpgradeButton plan="pro" label="Upgrade to Pro" />
              <Link href="/pricing" style={{ textAlign: "center", fontSize: "12px", color: "#a49da2" }}>
                Compare all plans →
              </Link>
            </div>
          </div>
        )}

        {/* ── Pro → Premium upsell ──────────────────────────────────────────── */}
        {!showWelcome && plan === "pro" && (
          <div
            style={{
              padding: "36px clamp(28px,4vw,40px)",
              borderRadius: "20px",
              background: "#FBF9FD",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#9a7fd0", margin: "0 0 10px" }}>
                Glam AI Premium
              </p>
              <h3 style={{ fontFamily: "var(--font-cormorant)", fontSize: "22px", fontWeight: 400, margin: "0 0 8px" }}>
                {PLAN_COPY.premium.price}/month — {PLAN_COPY.premium.positioning}
              </h3>
              <p style={{ fontSize: "14px", color: "#777177", lineHeight: 1.6, margin: 0 }}>
                Multiple complete looks, progress tracking, full color analysis, and 30 generations/month.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "220px" }}>
              <UpgradeButton plan="premium" label="Upgrade to Premium" accent="purple" />
              <Link href="/pricing" style={{ textAlign: "center", fontSize: "12px", color: "#a49da2" }}>
                See what&apos;s included →
              </Link>
            </div>
          </div>
        )}

        {/* ── Settings link ──────────────────────────────────────────────────── */}
        <div style={{ marginTop: "40px", textAlign: "right" }}>
          <Link href="/dashboard/settings" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#c9bfc4" }}>
            <Settings size={12} />
            Account settings
          </Link>
        </div>
      </main>
    </div>
  );
}
