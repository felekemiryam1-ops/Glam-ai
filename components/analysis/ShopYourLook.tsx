"use client";

/**
 * Stage 5B — visual "Shop Your Look" section.
 *
 * Deliberately thin: all matching logic already lives in
 * lib/productMatching.ts (Stage 5A/5A.1, approved and untouched here). This
 * component only fetches the active catalog and calls matchProducts()
 * against the report's own MakeupPlan — there is exactly one recommendation
 * engine, not a second one reimplemented for the UI.
 *
 * Honesty rules carried over from the matching engine, preserved in how
 * this renders:
 *   - never pad a category to 3 — matchProducts() already caps at 3 and
 *     never pads, so this only ever renders what it's given
 *   - a category with zero matches shows a tasteful empty state, never a
 *     random/weak product substituted in
 *   - inactive products can't reach this component at all (filtered at the
 *     /api/products level and again inside matchProducts())
 *   - no affiliate links, no invented URLs — the Shop button always uses
 *     the product's real, stored productUrl
 */

import { useEffect, useState } from "react";
import type { Product } from "@prisma/client";
import type { MakeupPlan } from "@/lib/makeupPlan";
import { matchProducts, type CategoryMatchResult, type ProductMatch, type ShoppableCategory } from "@/lib/productMatching";

const CATEGORY_META: Record<ShoppableCategory, { label: string; colorNoun: string }> = {
  cheeks: { label: "Cheeks", colorNoun: "blush" },
  eyes: { label: "Eyes", colorNoun: "eye color" },
  lips: { label: "Lips", colorNoun: "lip color" },
};

function formatPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(priceCents / 100);
  } catch {
    return `$${(priceCents / 100).toFixed(2)}`;
  }
}

/** A short, honest reason grounded only in fields the matching engine already returns — never a fabricated claim about the product itself. */
function matchReason(category: CategoryMatchResult, match: ProductMatch): string {
  const { colorNoun } = CATEGORY_META[category.category];
  if (match.productType === "palette") {
    return `A documented shade in this palette echoes your ${category.recommendedColorName} ${colorNoun}.`;
  }
  return `Chosen to echo your ${category.recommendedColorName} ${colorNoun}.`;
}

function ProductImage({ product }: { product: Product }) {
  if (product.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.imageUrl}
        alt={`${product.brand} ${product.name} — ${product.shadeName}`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  // No fabricated product photo when none was verified — a soft, honest
  // placeholder instead (matches the catalog's own "skip rather than
  // invent" rule from Stage 5A/5A.1).
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#FDF5F7,#FCE7EF)",
      }}
    >
      <p
        style={{
          fontFamily: "'Cormorant Garamond',Georgia,serif",
          fontSize: "17px",
          color: "#C4487A",
          textAlign: "center",
          margin: 0,
          padding: "0 16px",
        }}
      >
        {product.brand}
      </p>
    </div>
  );
}

function ProductCard({ category, match }: { category: CategoryMatchResult; match: ProductMatch }) {
  const { product } = match;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        borderRadius: "18px",
        overflow: "hidden",
        border: "1px solid #F1E6EA",
        boxShadow: "0 2px 14px rgba(36,32,36,0.05)",
      }}
    >
      <div style={{ width: "100%", aspectRatio: "1", background: "#FDF5F7" }}>
        <ProductImage product={product} />
      </div>

      <div style={{ padding: "20px", display: "flex", flexDirection: "column", flex: 1 }}>
        <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#a49da2", margin: "0 0 6px" }}>
          {product.brand}
        </p>
        <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "19px", fontWeight: 600, color: "#242024", margin: "0 0 2px", lineHeight: 1.25 }}>
          {product.name}
        </p>
        <p style={{ fontSize: "13px", color: "#777177", margin: "0 0 12px" }}>{product.shadeName}</p>

        <p style={{ fontSize: "13px", lineHeight: 1.5, color: "#4a454a", margin: "0 0 16px", flex: 1 }}>{matchReason(category, match)}</p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: "20px", fontWeight: 500, color: "#242024", margin: 0 }}>
            {formatPrice(product.priceCents, product.currency)}
          </p>
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: "9999px",
              background: "#242024",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Shop
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyCategory({ colorNoun }: { colorNoun: string }) {
  return (
    <div
      style={{
        border: "1px dashed #F1E6EA",
        borderRadius: "18px",
        padding: "32px 24px",
        textAlign: "center",
        background: "#FDF5F7",
      }}
    >
      <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#a49da2", margin: 0, maxWidth: "320px", marginLeft: "auto", marginRight: "auto" }}>
        We don&apos;t have a strong catalog match for your {colorNoun} yet — we&apos;d rather show nothing than a color that isn&apos;t genuinely right for you.
      </p>
    </div>
  );
}

function CategoryBlock({ result }: { result: CategoryMatchResult }) {
  const { label } = CATEGORY_META[result.category];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "18px" }}>
        <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#a49da2", margin: 0 }}>
          {label}
        </p>
        <p style={{ fontSize: "13px", color: "#C4487A", margin: 0, fontWeight: 500 }}>{result.recommendedColorName}</p>
      </div>

      {result.matches.length === 0 ? (
        <EmptyCategory colorNoun={CATEGORY_META[result.category].colorNoun} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "20px" }}>
          {result.matches.map((m) => (
            <ProductCard key={m.product.id} category={result} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopYourLookSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div style={{ width: "120px", height: "12px", borderRadius: "6px", background: "#F1E6EA", marginBottom: "18px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "20px" }}>
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ borderRadius: "18px", overflow: "hidden", border: "1px solid #F1E6EA" }}>
                <div style={{ width: "100%", aspectRatio: "1", background: "#FDF5F7" }} />
                <div style={{ padding: "20px" }}>
                  <div style={{ width: "60%", height: "10px", borderRadius: "5px", background: "#F1E6EA", marginBottom: "10px" }} />
                  <div style={{ width: "80%", height: "14px", borderRadius: "5px", background: "#F1E6EA" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShopYourLook({ plan }: { plan: MakeupPlan }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | { status: "done"; results: CategoryMatchResult[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("Failed to load products");
        const data = (await res.json()) as { products?: Product[] };
        if (cancelled) return;
        const results = matchProducts(plan, data.products ?? []);
        setState({ status: "done", results });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A network hiccup on an additive section shouldn't put an error box in
  // front of a report the user already paid for and can already see —
  // fail quiet rather than fail loud, same principle as the rest of this
  // page treating optional data (e.g. `report`) as conditionally rendered.
  if (state.status === "error") return null;

  if (state.status === "loading") return <ShopYourLookSkeleton />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      {state.results.map((result) => (
        <CategoryBlock key={result.category} result={result} />
      ))}
    </div>
  );
}
