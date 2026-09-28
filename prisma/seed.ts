/**
 * prisma/seed.ts — idempotent seed for the Stage 5A curated product catalog.
 *
 * Uses Product's natural unique key (brand + name + shadeName — see
 * schema.prisma) via upsert, so running this repeatedly never creates
 * duplicates and safely updates a product's other fields (price, URL, etc.)
 * if the seed data changes later.
 *
 * Run: npx tsx prisma/seed.ts
 */

import { prisma } from "../lib/db";
import { PRODUCT_SEED_DATA } from "./seedData/products";

async function main() {
  let created = 0;
  let updated = 0;

  for (const item of PRODUCT_SEED_DATA) {
    const existing = await prisma.product.findUnique({
      where: {
        brand_name_shadeName: {
          brand: item.brand,
          name: item.name,
          shadeName: item.shadeName,
        },
      },
    });

    await prisma.product.upsert({
      where: {
        brand_name_shadeName: {
          brand: item.brand,
          name: item.name,
          shadeName: item.shadeName,
        },
      },
      update: {
        category: item.category,
        hex: item.hex ?? null,
        undertone: item.undertone ?? null,
        priceCents: item.priceCents,
        currency: item.currency,
        imageUrl: item.imageUrl ?? null,
        retailer: item.retailer,
        productUrl: item.productUrl,
        tags: item.tags ? JSON.stringify(item.tags) : null,
        active: item.active ?? true,
      },
      create: {
        brand: item.brand,
        name: item.name,
        shadeName: item.shadeName,
        category: item.category,
        hex: item.hex ?? null,
        undertone: item.undertone ?? null,
        priceCents: item.priceCents,
        currency: item.currency,
        imageUrl: item.imageUrl ?? null,
        retailer: item.retailer,
        productUrl: item.productUrl,
        tags: item.tags ? JSON.stringify(item.tags) : null,
        active: item.active ?? true,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.log(`[seed] Products: ${created} created, ${updated} updated, ${PRODUCT_SEED_DATA.length} total.`);
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
