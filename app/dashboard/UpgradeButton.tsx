"use client";

// Client component — POSTs to /api/subscription/checkout and redirects to Stripe.
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

interface UpgradeButtonProps {
  plan: "pro" | "premium";
  label: string;
  accent?: "purple";
}

export function UpgradeButton({ plan, label, accent }: UpgradeButtonProps) {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);

    // Not signed in → go to login first
    if (status !== "authenticated") {
      router.push(`/login?plan=${plan}&callbackUrl=${encodeURIComponent("/dashboard")}`);
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

  const background = accent === "purple" ? "#9a7fd0" : "#242024";

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: "100%",
          height: "48px",
          borderRadius: "9999px",
          border: "none",
          background,
          color: "#FFFFFF",
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          "Setting up…"
        ) : (
          <>
            {label}
            <ArrowRight size={14} />
          </>
        )}
      </button>
      {error && <p style={{ marginTop: "8px", fontSize: "12px", color: "#DC2626", textAlign: "center" }}>{error}</p>}
    </div>
  );
}
