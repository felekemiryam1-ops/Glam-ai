// /privacy — Privacy Policy.
//
// PLACEHOLDER CONTENT: structured, professional scaffold only — not
// reviewed legal copy. Deliberately avoids stating specific data-retention
// periods, specific third-party lists, specific jurisdictions, or any other
// concrete claim that would create a real legal/contractual obligation.
// Replace the body text section-by-section with reviewed legal copy before
// this is relied on. Section structure mirrors what a beauty-tech app
// handling photos and payments would typically need to cover.
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

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: "13px", color: MUTED_B, margin: "0 0 8px" }}>Last updated: [date]</p>
        <div style={{ padding: "14px 18px", borderRadius: "12px", background: "#FDF5F7", border: `1px solid ${BORDER}`, fontSize: "13px", color: MUTED_A, margin: "0 0 44px" }}>
          This page is a structural placeholder pending final legal review — it is not yet finished legal copy.
        </div>

        <Section title="Overview">
          <p>
            This Privacy Policy describes how Glam AI collects, uses, and protects information when you use our
            website and services, including photo uploads, AI-generated beauty analyses and images, and account and
            subscription features. [Replace with reviewed introductory language.]
          </p>
        </Section>

        <Section title="Information We Collect">
          <p>
            We may collect information you provide directly (such as your email address, uploaded photos, and beauty
            preferences), information generated through your use of the service (such as AI analysis results and
            generated images), and information related to payment processing, which is handled by our payment
            processor. [Replace with the specific, reviewed list of data types collected.]
          </p>
        </Section>

        <Section title="How We Use Information">
          <p>
            Information is used to provide and improve the service, including generating personalized beauty
            recommendations and images, processing payments, and communicating with you about your account.
            [Replace with the specific, reviewed description of use.]
          </p>
        </Section>

        <Section title="Photo and Image Data">
          <p>
            Photos you upload are used to generate your requested analysis and images. [Replace with the specific,
            reviewed description of how photos are stored, for how long, and how they may be used.]
          </p>
        </Section>

        <Section title="Third-Party Services">
          <p>
            We use third-party services to operate the product, including payment processing and AI processing
            providers. [Replace with the specific, reviewed list of third-party processors and their roles.]
          </p>
        </Section>

        <Section title="Data Retention">
          <p>[Replace with the specific, reviewed data retention policy.]</p>
        </Section>

        <Section title="Your Rights and Choices">
          <p>
            You may be entitled to access, correct, or delete certain information we hold about you, depending on
            your location. [Replace with the specific, reviewed description of user rights and how to exercise them.]
          </p>
        </Section>

        <Section title="Cookies">
          <p>[Replace with the specific, reviewed cookie/tracking disclosure.]</p>
        </Section>

        <Section title="Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. [Replace with the specific, reviewed change-notice language.]</p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this Privacy Policy can be sent to{" "}
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
