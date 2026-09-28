// /terms — Terms of Service.
//
// PLACEHOLDER CONTENT: structured, professional scaffold only — not
// reviewed legal copy. Deliberately avoids stating specific liability caps,
// specific refund policies, specific jurisdictions, or any other concrete
// claim that would create a real legal/contractual obligation. Replace the
// body text section-by-section with reviewed legal copy before this is
// relied on.
import Link from "next/link";

const INK = "#242024";
const MUTED_A = "#777177";
const MUTED_B = "#a49da2";
const BORDER = "#F1E6EA";
const PINK = "#E88BA8";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "36px" }}>
      <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 500, fontSize: "20px", margin: "0 0 12px" }}>{title}</h2>
      <div style={{ fontSize: "14.5px", color: MUTED_A, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: INK }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px clamp(20px,5vw,64px)", borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)" }} />
          <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500 }}>Glam AI</span>
        </Link>
        <Link href="/" style={{ fontSize: "13px", color: MUTED_A }}>← Back home</Link>
      </nav>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "clamp(48px,7vw,80px) clamp(20px,5vw,64px) 96px" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: PINK, margin: "0 0 16px" }}>
          Legal
        </p>
        <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2rem,4vw,2.8rem)", margin: "0 0 8px" }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: "13px", color: MUTED_B, margin: "0 0 8px" }}>Last updated: [date]</p>
        <div style={{ padding: "14px 18px", borderRadius: "12px", background: "#FDF5F7", border: `1px solid ${BORDER}`, fontSize: "13px", color: MUTED_A, margin: "0 0 44px" }}>
          This page is a structural placeholder pending final legal review — it is not yet finished legal copy.
        </div>

        <Section title="Acceptance of Terms">
          <p>
            By using Glam AI, you agree to these Terms of Service. [Replace with the specific, reviewed acceptance
            language.]
          </p>
        </Section>

        <Section title="Description of Service">
          <p>
            Glam AI provides AI-generated beauty analyses, recommendations, and images based on photos you upload,
            offered as a one-time purchase and as recurring subscription plans. [Replace with the specific, reviewed
            service description.]
          </p>
        </Section>

        <Section title="Accounts">
          <p>
            You are responsible for maintaining access to your account and for all activity under it. [Replace with
            the specific, reviewed account-responsibility language.]
          </p>
        </Section>

        <Section title="Payments and Subscriptions">
          <p>
            One-time purchases and recurring subscriptions are processed by our third-party payment processor.
            Subscriptions renew automatically until cancelled. [Replace with the specific, reviewed billing, renewal,
            and refund policy.]
          </p>
        </Section>

        <Section title="User Content">
          <p>
            You retain rights to the photos you upload. [Replace with the specific, reviewed license/usage terms
            covering uploaded photos and generated images.]
          </p>
        </Section>

        <Section title="Acceptable Use">
          <p>[Replace with the specific, reviewed acceptable-use restrictions.]</p>
        </Section>

        <Section title="Disclaimers">
          <p>
            Glam AI provides beauty recommendations for inspiration only; they do not constitute professional,
            medical, or dermatological advice. [Replace with the specific, reviewed disclaimer language.]
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>[Replace with the specific, reviewed limitation-of-liability language.]</p>
        </Section>

        <Section title="Changes to These Terms">
          <p>We may update these Terms from time to time. [Replace with the specific, reviewed change-notice language.]</p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these Terms can be sent to{" "}
            <a href="mailto:support@glamai.app" style={{ color: PINK }}>support@glamai.app</a>.
          </p>
        </Section>
      </main>

      <footer style={{ padding: "32px clamp(20px,5vw,64px)", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "19px", fontWeight: 400, margin: 0 }}>Glam AI</p>
          <div style={{ display: "flex", gap: "28px" }}>
            <a href="/privacy" style={{ fontSize: "12px", color: MUTED_A }}>Privacy</a>
            <a href="/terms" style={{ fontSize: "12px", color: MUTED_A }}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
