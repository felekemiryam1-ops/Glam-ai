import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // See test/server-only-stub.ts — `server-only` throws unconditionally
      // under Vitest's plain Node resolution unless stubbed out here.
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
