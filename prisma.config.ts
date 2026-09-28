// Prisma 7 config — moves datasource URL out of schema.prisma.
// Used by the Prisma CLI (generate, migrate, db push, studio).
// Runtime connections use the driver adapter in lib/db.ts.
//
// DATABASE_URL for dev:  file:./dev.db  (set in .env or .env.local)
// DATABASE_URL for prod: postgresql://... (set in hosting platform env vars)
import { defineConfig } from "@prisma/config";

export default defineConfig({
  datasource: {
    // Use DATABASE_URL from environment; fall back to dev SQLite if not set.
    // Never throws — safe to run prisma generate in CI without a live DB.
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
