/**
 * GET /api/products
 *
 * Read-only product catalog endpoint for Stage 5B ("Shop Your Look").
 *
 * Returns only active products — inactive/replaced catalog rows (see
 * prisma/seedData/products.ts) must never reach the client. matchProducts()
 * itself also filters on `active`, but this endpoint doesn't rely on that
 * as its only safeguard: an inactive product should never even be sent
 * over the wire.
 *
 * Deliberately dumb: no matching logic lives here. The client fetches the
 * catalog and calls the existing lib/productMatching.ts matchProducts()
 * itself — this endpoint's only job is handing over the data it needs to
 * do that, so there's exactly one recommendation engine, not two.
 *
 * No auth — this is public catalog data (brand, shade, price, retailer
 * link), nothing user-specific or sensitive.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const products = await prisma.product.findMany({ where: { active: true } });
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  }
}
