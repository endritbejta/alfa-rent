import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

/**
 * Database-backed tests.
 *
 * Vitest does not read `.env` the way Next.js does, so without `loadEnv` these
 * tests could only ever run where DATABASE_URL was already exported — which in
 * practice meant CI and nowhere else. The empty prefix loads every variable,
 * not just VITE_-prefixed ones.
 *
 * `prisma/**` is included as well: the objects that schema.prisma does not
 * model (the exclusion constraint, btree_gist, RLS, the CHECKs) are asserted
 * from there, and the previous glob silently skipped anything outside src/.
 */
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    env: loadEnv(mode, process.cwd(), ""),
    // Refuses a non-local DATABASE_URL before any test runs.
    setupFiles: ["./vitest.integration.setup.ts"],
    include: [
      "src/**/*.integration.test.ts",
      "prisma/**/*.integration.test.ts",
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // These tests write real rows, so they must not run concurrently against
    // one database.
    fileParallelism: false,
  },
}));
