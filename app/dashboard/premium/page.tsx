// /dashboard/premium — Premium dashboard (server component).
// Middleware already protects /dashboard/*; entitlement is re-checked here
// server-side via getEntitlements() (never trusting anything client-sent).
//
// Report history, skin/hair plan summaries, and the makeup summary are all
// fetched directly here (mirroring app/dashboard/page.tsx's existing SSR
// pattern) rather than through a new API route — Beauty Routine (Step 5)
// already owns the full "assemble makeup + skin + hair" API, and this page
// deliberately doesn't duplicate that; the Routine/Photos/Monthly Check-In
// sections below are the only genuinely new, interactive pieces, and those
// are the three small client components that call the three new routes.
import { auth } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { buildMakeupPlan } from "@/lib/makeupPlan";
import { matchProducts } from "@/lib/productMatching";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ListChecks, TrendingUp, Droplet, Scissors, Palette, ShoppingBag, CalendarCheck, ArrowRight } from "lucide-react";
import { UpgradeButton } from "@/app/dashboard/UpgradeButton";
import { RoutineTracker } from "@/components/premium/RoutineTracker";
import { ProgressPhotos } from "@/components/premium/ProgressPhotos";
import { MonthlyCheckIn } from "@/components/premium/MonthlyCheckIn";
// This page is a server component, so importing types from lib/skinPlan.ts
// / lib/hairPlan.ts directly would be safe — pointed at the shared,
// client-safe modules anyway for consistency with the other dashboard
// pages (Stage 6 Step 8/9 fix).
import type { SkinPlan } from "@/lib/skinPlanShared";
import type { HairPlan } from "@/lib/hairPlanShared";
import type { GlamPreview, StoredAnalysis } from "@/lib/types";
import type { BudgetTier } from "@/lib/productMatching";

const INK = "#242024";
const MUTED = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";

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

export default async function PremiumDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const entitlements = await getEntitlements(userId);

  if (entitlements.plan !== "premium") {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", maxWidth: "440px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: PINK, margin: "0 0 16px" }}>
            Premium
          </p>
          <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 14px" }}>
            Your complete beauty transformation system
          </h1>
          <p style={{ fontSize: "15px", color: MUTED, margin: "0 0 32px" }}>
            Glow-Up Progress, Routine Tracking, Progress Photos, and your Monthly Glow-Up are all part of Premium.
          </p>
          <div style={{ maxWidth: "280px", margin: "0 auto" }}>
            <UpgradeButton plan="premium" label="Upgrade to Premium — $19.99/mo" accent="purple" />
          </div>
          <Link href="/dashboard" style={{ display: "block", marginTop: "20px", fontSize: "13px", color: MUTED }}>
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const [profile, reports] = await Promise.all([
    prisma.beautyProfile.findUnique({ where: { userId } }),
    prisma.report.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const skinPlan: SkinPlan | null = profile?.skinPlan ? (JSON.parse(profile.skinPlan) as SkinPlan) : null;
  const hairPlan: HairPlan | null = profile?.hairPlan ? (JSON.parse(profile.hairPlan) as HairPlan) : null;

  // Same pattern as Beauty Routine (Step 5) — reused, not reinvented.
  // The most recent MAKEUP report specifically — `reports` (all types,
  // newest first) can have a "hair_transformation" row (a different shape,
  // no `preview`) more recent than the user's last makeup analysis; using
  // reports[0] unconditionally would silently drop real makeup data in
  // that case rather than actually having none.
  const latestMakeupReport = reports.find((r) => r.type === "glow_up" || r.type === "pro_analysis" || r.type === "premium_analysis");
  let makeupSummaryLine: string | null = null;
  let matchedProductLines: string[] = [];
  if (latestMakeupReport) {
    try {
      const parsed = JSON.parse(latestMakeupReport.data) as Partial<StoredAnalysis> & { preview?: GlamPreview };
      if (parsed.preview) {
        const plan = buildMakeupPlan(parsed.preview);
        makeupSummaryLine = `${plan.eyeshadow.lid.colorName} eyes, ${plan.blush.colorName} cheeks, ${plan.lips.colorName} lips`;
        const catalog = await prisma.product.findMany({ where: { active: true } });
        const budget = (profile?.budget as BudgetTier | null) ?? undefined;
        matchedProductLines = matchProducts(plan, catalog, budget)
          .filter((r) => r.matches.length > 0)
          .map((r) => `${r.category}: ${r.matches[0].product.brand} ${r.matches[0].product.name}`);
      }
    } catch {
      // Malformed legacy row — treat as no makeup data, same as Beauty Routine does.
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: INK }}>
      <nav style={{ padding: "24px clamp(20px,5vw,64px)", borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/dashboard" style={{ fontSize: "13px", color: MUTED }}>
          ← Back to dashboard
        </Link>
      </nav>

      <main style={{ maxWidth: "1040px", margin: "0 auto", padding: "clamp(48px,7vw,80px) clamp(20px,5vw,64px) 96px" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: PINK, margin: "0 0 16px" }}>
          ✨ Your Glow-Up
        </p>
        <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)", margin: "0 0 40px" }}>
          Your personalized beauty transformation system
        </h1>

        <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
          <SectionCard title="Today's Routine" icon={<ListChecks size={16} style={{ color: PINK }} />}>
            <RoutineTracker />
          </SectionCard>

          <SectionCard title="Your Progress" icon={<TrendingUp size={16} style={{ color: PINK }} />}>
            {reports.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, margin: "0 0 8px" }}>
                  Glow-Up history
                </p>
                <div style={{ display: "flex", gap: "8px", overflowX: "auto" }}>
                  {reports.map((r) => {
                    let thumb: string | null = null;
                    try {
                      thumb = (JSON.parse(r.data) as { imageUrl?: string }).imageUrl ?? null;
                    } catch {
                      thumb = null;
                    }
                    return thumb ? (
                      <a key={r.id} href={thumb} target="_blank" rel="noopener noreferrer" title={new Date(r.createdAt).toLocaleDateString()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumb} alt="Glow-Up result" style={{ width: "52px", height: "52px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 }} />
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            )}
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, margin: "0 0 8px" }}>
              Progress photos
            </p>
            <ProgressPhotos />
          </SectionCard>

          <SectionCard title="Skin" icon={<Droplet size={16} style={{ color: PINK }} />}>
            {skinPlan ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                  {skinPlan.skinGoals.map((g) => (
                    <span key={g} style={{ padding: "5px 12px", borderRadius: "9999px", background: "#FCE7EF", color: "#C4487A", fontSize: "12px", fontWeight: 600 }}>
                      {g}
                    </span>
                  ))}
                </div>
                <Link href="/dashboard/skin" style={{ fontSize: "12.5px", color: PINK, fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  View full plan <ArrowRight size={12} />
                </Link>
              </>
            ) : (
              <Link href="/dashboard/skin" style={{ fontSize: "13px", color: PINK, fontWeight: 600 }}>
                Complete your Skin Glow-Up →
              </Link>
            )}
          </SectionCard>

          <SectionCard title="Hair" icon={<Scissors size={16} style={{ color: PINK }} />}>
            {hairPlan ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                  {hairPlan.hairGoals.map((g) => (
                    <span key={g} style={{ padding: "5px 12px", borderRadius: "9999px", background: "#FCE7EF", color: "#C4487A", fontSize: "12px", fontWeight: 600 }}>
                      {g}
                    </span>
                  ))}
                </div>
                <Link href="/dashboard/hair" style={{ fontSize: "12.5px", color: PINK, fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  View full plan <ArrowRight size={12} />
                </Link>
              </>
            ) : (
              <Link href="/dashboard/hair" style={{ fontSize: "13px", color: PINK, fontWeight: 600 }}>
                Complete your Hair Glow-Up →
              </Link>
            )}
          </SectionCard>

          <SectionCard title="Makeup" icon={<Palette size={16} style={{ color: PINK }} />}>
            {makeupSummaryLine ? (
              <>
                <p style={{ fontSize: "13.5px", margin: "0 0 12px" }}>{makeupSummaryLine}</p>
                <Link href="/dashboard/routine" style={{ fontSize: "12.5px", color: PINK, fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  View your routine <ArrowRight size={12} />
                </Link>
              </>
            ) : (
              <Link href="/upload" style={{ fontSize: "13px", color: PINK, fontWeight: 600 }}>
                Get your first Glow-Up →
              </Link>
            )}
          </SectionCard>

          <SectionCard title="Products" icon={<ShoppingBag size={16} style={{ color: PINK }} />}>
            {matchedProductLines.length > 0 || (skinPlan && skinPlan.recommendedProducts.length > 0) || (hairPlan && hairPlan.recommendedProducts.length > 0) ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                  {matchedProductLines.slice(0, 3).map((line) => (
                    <p key={line} style={{ fontSize: "13px", margin: 0 }}>
                      {line}
                    </p>
                  ))}
                </div>
                <Link href="/dashboard/routine" style={{ fontSize: "12.5px", color: PINK, fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  View all products <ArrowRight size={12} />
                </Link>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: MUTED, margin: 0 }}>Complete a Glow-Up section to see products here.</p>
            )}
          </SectionCard>

          <SectionCard title="Monthly Check-In" icon={<CalendarCheck size={16} style={{ color: PINK }} />}>
            <MonthlyCheckIn />
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
