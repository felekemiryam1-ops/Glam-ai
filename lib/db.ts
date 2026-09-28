// Prisma 7 requires a driver adapter for runtime database connections.
// The datasource URL is no longer read from schema.prisma — it comes from
// the environment and is passed to the adapter here.
//
// Adapter choice: @prisma/adapter-libsql + @libsql/client
//   - Accepts the same "file:./dev.db" URL format as the old SQLite datasource
//   - Works with local SQLite files and remote Turso databases (easy prod upgrade)
//   - Ships its own TypeScript types — no @types/ package needed
//
// For production Postgres, swap DATABASE_URL to a postgresql:// connection string
// and switch to @prisma/adapter-pg + pg.

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Prevent multiple PrismaClient instances during Next.js dev hot-reloading.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // PrismaLibSql accepts a config object directly — no need to call createClient separately.
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
