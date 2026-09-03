import { defineConfig } from "vitest/config";
import path from "node:path";

// Fast tests: no database, no DOM. `npm test` must stay runnable on a clone
// with nothing set up.
//
// The exclude glob is rooted at `**` rather than `src` on purpose: the earlier
// src-rooted pattern did not cover prisma/, so a database-backed test placed
// there was collected here and failed for want of a DATABASE_URL.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
