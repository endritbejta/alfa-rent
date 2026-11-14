import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke test: `npm run test:e2e`.
 *
 * Needs DATABASE_URL pointing at a local, migrated database (the fixture
 * refuses anything else). Locally it starts `next dev` on E2E_PORT (3100),
 * or reuses a server already listening there; in CI it runs `next start`
 * against the build the workflow made. E2E_BASE_URL points it at a server
 * you started yourself, and then nothing is started.
 *
 * The server gets no third-party credentials: Resend, Cloudinary and online
 * payments are blank or off, so the app's own "not configured" paths run and
 * nothing leaves the machine. CSP_ENFORCE is blank, which is report-only.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // One flow that writes to a shared database: no parallelism, and a retry
  // in CI only, where a cold `next start` can be slow on its first pages.
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    video: CI ? "retain-on-failure" : "off",
    // The business runs on Belgrade time, and the booking calendar's "today"
    // is the browser's: pin it so a run near midnight UTC sees the same day
    // as the server.
    timezoneId: "Europe/Belgrade",
    locale: "en-GB",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          // A throwaway signing key per run; never a real one.
          AUTH_SECRET:
            process.env.AUTH_SECRET ?? randomBytes(32).toString("base64"),
          AUTH_URL: baseURL,
          AUTH_TRUST_HOST: "true",
          // Explicitly blank so a developer's .env cannot switch them on.
          RESEND_API_KEY: "",
          EMAIL_FROM: "",
          STAFF_NOTIFICATION_EMAILS: "",
          CLOUDINARY_CLOUD_NAME: "",
          CLOUDINARY_API_KEY: "",
          CLOUDINARY_API_SECRET: "",
          PAYMENTS_ENABLED: "false",
          PAYMENT_PROVIDER: "",
          CRON_SECRET: "",
          CSP_ENFORCE: "",
        },
      },
});
