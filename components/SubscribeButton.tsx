"use client";

/**
 * Shared subscribe/checkout button — the single place that talks to
 * POST /api/subscription/checkout. Auth check, Stripe redirect, and error
 * handling live here once so /pricing and any upsell section (e.g.
 * /glow-up) can't drift into two different checkout implementations.
 *
 * Not signed in → redirected to /login with the selected `plan` (so the
 * login screen can say "Continue to Pro/Premium" instead of being a plain
 * sign-in page) and a `callbackUrl` that already carries `autoCheckout`.
 * After the user authenticates and lands back on `callbackUrl`, the
 * `autoTrigger` prop (set by the page reading `autoCheckout` from its own
 * URL) fires this exact same handleClick() once — so the user reaches
 * Stripe checkout for the SAME plan they picked, without a second click.
 */

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function SubscribeButton({
  plan,
  label,
  loadingLabel = "Setting up…",
  bg,
  hoverBg,
  color,
  border,
  callbackUrl = "/pricing",
  autoTrigger = false,
}: {
  plan: "pro" | "premium";
  label: string;
  loadingLabel?: string;
  bg: string;
  hoverBg: string;
  color: string;
  border: string;
  callbackUrl?: string;
  /** When true and the user is authenticated, fires checkout automatically
   *  on mount (once) — used to resume checkout right after login. */
  autoTrigger?: boolean;
}) {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFiredRef = useRef(false);

  const handleClick = async () => {
    setError(null);

    // Not signed in → go to login, carrying the selected plan and a
    // callback that will auto-resume this exact checkout after auth.
    if (status !== "authenticated") {
      const separator = callbackUrl.includes("?") ? "&" : "?";
      const resumeUrl = `${callbackUrl}${separator}autoCheckout=${plan}`;
      router.push(`/login?plan=${plan}&callbackUrl=${encodeURIComponent(resumeUrl)}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Could not start checkout. Please try again.");
      setLoading(false);
    }
  };

  // Resume checkout automatically once, right after returning from login.
  useEffect(() => {
    if (autoTrigger && status === "authenticated" && !autoFiredRef.current) {
      autoFiredRef.current = true;
      handleClick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger, status]);

  return (
    <div>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={loading}
        aria-busy={loading}
        style={{
          width: "100%",
          height: "52px",
          borderRadius: "9999px",
          border,
          background: hovered && !loading ? hoverBg : bg,
          color,
          fontFamily: "var(--font-sans)",
          fontSize: "15px",
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.75 : 1,
          transition: "background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
          transform: hovered && !loading ? "translateY(-1px)" : "none",
          boxShadow: hovered && !loading ? "0 8px 20px rgba(36,32,36,0.16)" : "none",
        }}
      >
        {loading ? loadingLabel : label}
      </button>
      {error && (
        <p style={{ marginTop: "10px", fontSize: "13px", color: "#DC2626", textAlign: "center" }}>
          {error}
        </p>
      )}
    </div>
  );
}
