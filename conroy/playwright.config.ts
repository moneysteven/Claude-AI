import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build (`npm run build` first) with
 * its own throwaway database. Run: npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E ?? "postgresql://conroy:conroy_dev@localhost:5432/conroy_e2e";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "only-on-failure",
    // The app honours "reduce motion"; tests use it so clicks and colour-contrast scans see settled pages, not mid-animation frames.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node_modules/.bin/next start -p ${PORT}`,
    url: `${BASE_URL}/api/health?scope=app`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      APP_URL: BASE_URL,
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: "e2e-session-secret-at-least-32-characters!!",
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      LLM_PROVIDER: "rules",
      WHATSAPP_PROVIDER: "console",
      JOBS_ENABLED: "false",
      RETELL_VERIFY_SIGNATURES: "true",
      LOG_LEVEL: "warn",
    },
  },
});
