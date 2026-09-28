"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ArrowRight } from "lucide-react";

const PALETTE = [
  { color: "#C4826A", name: "Terracotta" },
  { color: "#D4A996", name: "Blush" },
  { color: "#B8927A", name: "Nude" },
  { color: "#E8C4B0", name: "Cream" },
  { color: "#8B6F5E", name: "Mocha" },
  { color: "#F0D4C4", name: "Peach" },
];

const WHAT_YOU_GET = [
  { num: "01", title: "Makeup", desc: "Foundation, blush, eyes and lips — tailored to your undertone and features." },
  { num: "02", title: "Hair", desc: "Cuts, styling and colour directions that suit your face shape." },
  { num: "03", title: "Colors", desc: "Your personal palette for makeup, clothing and accessories." },
  { num: "04", title: "Style", desc: "The aesthetics and key pieces that define your direction." },
];

const STEPS = [
  {
    number: "01",
    title: "Upload",
    desc: "Share a clear, well-lit photo with your face visible. Natural lighting works best.",
  },
  {
    number: "02",
    title: "Preview",
    desc: "Get your free Glam Preview — your colour direction, makeup style, 3 best colours, and your #1 first move. Completely free, no card required.",
  },
  {
    number: "03",
    title: "Transform",
    desc: "Unlock your AI Makeup Glow-Up for $4.99 — see a personalised before & after photo transformation, colour palette, and product guide.",
  },
];

const PRICING_FEATURES = [
  "Free Glam Preview — colour direction, makeup style, top colours",
  "AI-generated before & after photo transformation",
  "Personalised makeup colour palette",
  "Product recommendations for your features",
  "Step-by-step makeup guide",
];

const FAQS = [
  {
    q: "How does Glam AI work?",
    a: "Upload a photo and get your free Glam Preview in seconds — your colour direction, makeup style, and top 3 colours. Then unlock your personalised Makeup Glow-Up for a one-time $4.99 to see an AI-generated before & after photo transformation with a full colour and product guide.",
  },
  {
    q: "What kind of photo should I upload?",
    a: "A clear, well-lit photo with your face visible. Natural lighting works best. JPG and PNG are accepted, up to 10MB.",
  },
  {
    q: "How long does it take?",
    a: "Your free Glam Preview is ready in under 30 seconds. The $4.99 Makeup Glow-Up image takes 15–30 seconds to generate — a live screen shows you progress the whole time.",
  },
  {
    q: "Is this a one-time payment?",
    a: "Yes. The Makeup Glow-Up is a one-time $4.99 charge. No subscriptions, no recurring fees, no hidden costs. The free preview costs nothing.",
  },
  {
    q: "Can I save my Glow-Up image?",
    a: "Yes — right-click the after image on the results page to save it to your device.",
  },
  {
    q: "How is my photo handled?",
    a: "Your photo is used only to generate your results. It is not permanently stored or shared with third parties.",
  },
  {
    q: "Does this replace professional advice?",
    a: "Glam AI provides AI-generated suggestions for inspiration and ideas. It does not replace professional makeup artists, hairstylists, or dermatologists.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#242024", fontFamily: "var(--font-sans)", overflowX: "hidden" }}>

      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50" style={{ background: "#FFFFFF", borderBottom: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,5vw,64px)", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg,#E88BA8,#F5B8CB)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-cormorant)", fontSize: "20px", fontWeight: 500, color: "#242024" }}>Glam AI</span>
          </Link>

          <div className="hidden md:flex" style={{ alignItems: "center", gap: "32px" }}>
            <a href="#how-it-works" style={{ fontSize: "13px", color: "#777177", textDecoration: "none" }}>How It Works</a>
            <a href="#pricing" style={{ fontSize: "13px", color: "#777177", textDecoration: "none" }}>Pricing</a>
            <Link href="/login" style={{ fontSize: "13px", color: "#777177", textDecoration: "none" }}>Sign in</Link>
          </div>

          <Link
            href="/upload"
            style={{
              height: "40px",
              display: "inline-flex",
              alignItems: "center",
              padding: "0 20px",
              borderRadius: "9999px",
              background: "#242024",
              color: "#FFFFFF",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Try Free Preview
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section style={{ background: "linear-gradient(180deg,#FDF5F7 0%,#FFFFFF 100%)", padding: "clamp(56px,9vw,96px) clamp(20px,5vw,64px) clamp(64px,9vw,104px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: "clamp(48px,6vw,80px)", alignItems: "center" }}>

          {/* Left: text */}
          <div>
            <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
              AI-Powered Beauty
            </p>
            <h1 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.6rem,5.5vw,4.2rem)", lineHeight: 1.08, letterSpacing: "-0.01em", margin: "0 0 24px" }}>
              Your glow-up,<br />
              <em style={{ color: "#E88BA8", fontStyle: "italic" }}>personalized.</em>
            </h1>
            <p style={{ fontSize: "17px", lineHeight: 1.7, color: "#777177", maxWidth: "420px", margin: "0 0 36px", fontWeight: 300 }}>
              Discover the colors, makeup, hair and style that bring out your best — all personalized by AI from a single photo.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <Link
                href="/upload"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "fit-content",
                  height: "56px",
                  padding: "0 32px",
                  borderRadius: "9999px",
                  background: "#242024",
                  color: "#FFFFFF",
                  fontSize: "15px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Try Your Free Glam Preview
                <ArrowRight size={16} />
              </Link>
              <span style={{ fontSize: "13px", color: "#a49da2" }}>Free · No card required · Results in seconds</span>
            </div>
          </div>

          {/* Right: report preview panel */}
          <div style={{ border: "1px solid #F1E6EA", borderRadius: "8px", background: "#FFFFFF", overflow: "hidden" }}>
            <div style={{ padding: "clamp(32px,4vw,44px) clamp(28px,4vw,40px) 0" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "#a99ba1", margin: "0 0 16px" }}>
                Glam AI Report
              </p>
              <p style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(1.7rem,2.8vw,2.3rem)", lineHeight: 1.18, margin: 0 }}>
                Your natural radiance<br />is your greatest asset.
              </p>
              <p style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "13px", color: "#a99ba1", margin: "12px 0 0" }}>
                Personalized AI analysis
              </p>
            </div>

            <div style={{ padding: "clamp(28px,4vw,40px)" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "#E88BA8", margin: "28px 0 14px" }}>
                Your Colour Palette
              </p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
                {PALETTE.map((s) => (
                  <div key={s.color} style={{ flex: 1, height: "44px", borderRadius: "6px", background: s.color }} />
                ))}
              </div>
              <p style={{ fontSize: "12px", color: "#a49da2", margin: 0, letterSpacing: "0.02em" }}>
                Warm earth tones · Beachy layers · Elevated casual
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── What You Get ────────────────────────────────────────── */}
      <section style={{ padding: "clamp(80px,10vw,120px) clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            What You Get
          </p>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.2rem)", letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 16px" }}>
            Beauty, but personal.
          </h2>
          <p style={{ fontSize: "16px", lineHeight: 1.7, color: "#777177", maxWidth: "480px", margin: "0 0 56px", fontWeight: 300 }}>
            A complete beauty direction in one report — from the shades you wear to the style that defines you.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "clamp(40px,5vw,56px)" }}>
            {WHAT_YOU_GET.map((item) => (
              <div key={item.num} style={{ borderTop: "1px solid #F1E6EA", paddingTop: "24px" }}>
                <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "32px", fontWeight: 400, color: "#E88BA8", margin: "0 0 16px" }}>{item.num}</p>
                <p style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>{item.title}</p>
                <p style={{ fontSize: "15px", lineHeight: 1.6, color: "#777177", margin: 0, fontWeight: 300 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "clamp(80px,10vw,120px) clamp(20px,5vw,64px)", background: "#FDF5F7" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            The Process
          </p>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.2rem)", letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 56px" }}>
            Three steps to your glow-up.
          </h2>

          <div>
            {STEPS.map((step, i) => (
              <div
                key={step.number}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "0 40px",
                  alignItems: "start",
                  padding: "36px 0",
                  borderTop: i === 0 ? "1px solid #E8D8E0" : undefined,
                  borderBottom: "1px solid #E8D8E0",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontWeight: 300,
                    fontSize: "clamp(3rem,6vw,4.5rem)",
                    color: "rgba(232,139,168,0.25)",
                    lineHeight: 1,
                    minWidth: "72px",
                    textAlign: "right",
                  }}
                >
                  {step.number}
                </div>
                <div style={{ paddingTop: "4px" }}>
                  <h3 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(1.6rem,2.6vw,2.1rem)", margin: "0 0 10px", letterSpacing: "-0.01em" }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: "15px", color: "#777177", lineHeight: 1.7, maxWidth: "480px", margin: 0, fontWeight: 300 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "48px" }}>
            <Link
              href="/upload"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                height: "56px",
                padding: "0 32px",
                borderRadius: "9999px",
                background: "#242024",
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Try Your Free Glam Preview
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Colors that make you glow ───────────────────────────── */}
      <section style={{ padding: "clamp(80px,10vw,120px) clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            Your Color Palette
          </p>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.2rem)", letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 16px" }}>
            Colors that make you glow.
          </h2>
          <p style={{ fontSize: "16px", lineHeight: 1.7, color: "#777177", maxWidth: "440px", margin: "0 0 56px", fontWeight: 300 }}>
            Every report includes a personalized color palette — the exact tones that work best on you.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(24px,3vw,40px)" }}>
            {PALETTE.map((swatch) => (
              <div key={swatch.color} style={{ width: "112px" }}>
                <div style={{ width: "100%", height: "112px", borderRadius: "6px", background: swatch.color, marginBottom: "14px" }} />
                <p style={{ fontSize: "12px", letterSpacing: "0.08em", color: "#777177", margin: 0, textAlign: "center" }}>{swatch.name}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "13px", color: "#a49da2", margin: "40px 0 0", fontStyle: "italic" }}>
            Example — your palette is generated from your unique photo.
          </p>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: "clamp(80px,10vw,120px) clamp(20px,5vw,64px)", background: "#FDF5F7" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            Simple Pricing
          </p>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.2rem)", letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 40px" }}>
            Start free, then unlock.
          </h2>

          <p style={{ fontFamily: "var(--font-cormorant)", fontWeight: 400, fontSize: "clamp(3.4rem,7vw,5rem)", letterSpacing: "-0.02em", lineHeight: 1, margin: "0 0 12px" }}>
            $4.99
          </p>
          <p style={{ fontSize: "13px", color: "#a49da2", margin: "0 0 40px" }}>
            Makeup Glow-Up · One-time · After your free preview
          </p>

          <div style={{ textAlign: "left", marginBottom: "40px" }}>
            {PRICING_FEATURES.map((feature) => (
              <p key={feature} style={{ fontSize: "15px", color: "#4a454a", margin: 0, lineHeight: 1.6, borderTop: "1px solid #E8D8E0", padding: "16px 0" }}>
                {feature}
              </p>
            ))}
          </div>

          <Link
            href="/upload"
            style={{
              display: "flex",
              width: "100%",
              height: "56px",
              borderRadius: "9999px",
              background: "#242024",
              color: "#FFFFFF",
              fontSize: "15px",
              fontWeight: 600,
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            Try Your Free Glam Preview
            <ArrowRight size={16} />
          </Link>
          <p style={{ fontSize: "13px", color: "#a49da2", margin: "16px 0 0" }}>
            Free preview · Glow-Up $4.99 · No subscription
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section style={{ padding: "clamp(80px,10vw,120px) clamp(20px,5vw,64px)" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            Questions
          </p>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.2rem)", letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 48px" }}>
            Frequently asked.
          </h2>

          <div>
            {FAQS.map((faq, i) => (
              <div key={faq.q} style={{ borderTop: i === 0 ? "1px solid #F1E6EA" : undefined, borderBottom: "1px solid #F1E6EA", cursor: "pointer" }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0" }}>
                  <span style={{ fontSize: "16px", fontFamily: "var(--font-cormorant)", color: "#242024", paddingRight: "24px" }}>{faq.q}</span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: "#E88BA8",
                      flexShrink: 0,
                      transition: "transform 0.3s ease",
                      transform: openFaq === i ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
                <div style={{ maxHeight: openFaq === i ? "240px" : "0px", overflow: "hidden", transition: "max-height 0.3s ease" }}>
                  <p style={{ paddingBottom: "22px", fontSize: "14px", color: "#777177", lineHeight: 1.75, margin: 0, maxWidth: "600px" }}>
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section style={{ padding: "clamp(96px,12vw,140px) clamp(20px,5vw,64px)", background: "#FCE7EF", textAlign: "center" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "#E88BA8", margin: "0 0 24px" }}>
            Start Your Journey
          </p>
          <h2 style={{ fontFamily: "var(--font-cormorant)", fontWeight: 300, fontSize: "clamp(2.4rem,5vw,3.6rem)", letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 24px" }}>
            Ready for your<br /><em style={{ color: "#E88BA8", fontStyle: "italic" }}>glow-up?</em>
          </h2>
          <p style={{ fontSize: "16px", color: "#777177", maxWidth: "360px", margin: "0 auto 40px", lineHeight: 1.7, fontWeight: 300 }}>
            Your free Glam Preview is one photo away. No card required.
          </p>
          <Link
            href="/upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              height: "56px",
              padding: "0 36px",
              borderRadius: "9999px",
              background: "#242024",
              color: "#FFFFFF",
              fontSize: "15px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Try Your Free Glam Preview
            <ArrowRight size={16} />
          </Link>
          <p style={{ fontSize: "13px", color: "#8a8389", margin: "20px 0 0" }}>
            Free · No card required · Glow-Up unlocks for $4.99
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{ padding: "32px clamp(20px,5vw,64px)", borderTop: "1px solid #F1E6EA" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <p style={{ fontFamily: "var(--font-cormorant)", fontSize: "19px", fontWeight: 400, margin: 0 }}>Glam AI</p>
          <div style={{ display: "flex", gap: "28px" }}>
            <a href="/privacy" style={{ fontSize: "12px", color: "#777177" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: "12px", color: "#777177" }}>Terms</a>
          </div>
        </div>
        <p style={{ maxWidth: "1200px", margin: "16px auto 0", fontSize: "12px", color: "#a49da2" }}>
          © 2025 Glam AI. Beauty recommendations are for inspiration only and do not constitute professional advice.
        </p>
      </footer>
    </div>
  );
}
