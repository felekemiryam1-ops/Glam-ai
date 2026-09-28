"use client";

// Client component so it can handle the fetch + redirect interactively.
import { useState } from "react";
import { CreditCard } from "lucide-react";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/subscription/portal", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error || "Could not open billing portal. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Could not connect to billing portal. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
        style={{
          background: "#FFFFFF",
          border: "1px solid #F1E6EA",
          color: "#242024",
        }}
      >
        <CreditCard size={14} />
        {loading ? "Opening portal…" : "Manage Subscription"}
      </button>
      {error && <p className="mt-2 text-xs" style={{ color: "#C4487A" }}>{error}</p>}
    </div>
  );
}
