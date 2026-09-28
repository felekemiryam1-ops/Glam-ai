// Test-only stub for the `server-only` package.
//
// `server-only`'s real implementation throws unconditionally unless the
// bundler resolves it with Next.js's own "react-server" export condition —
// something only Next.js's build pipeline sets. Vitest's plain Vite/Node
// resolution never sets that condition, so every test that imports a file
// tagged `import "server-only"` (lib/skinPlan.ts, lib/hairPlan.ts,
// lib/monthlyGlowUp.ts) would otherwise crash at import time, even though
// those tests are correctly running server-side. This stub is aliased in
// vitest.config.ts so `import "server-only"` is a no-op under test, exactly
// like Next.js's own "react-server" condition makes it in production.
export {};
