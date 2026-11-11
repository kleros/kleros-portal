import { defineConfig, devices } from "@playwright/test";

import { MOCK_ATLAS_PORT, MOCK_ATLAS_URL } from "./e2e/fixtures/atlas";

/** Off the default 3000 so a dev server already running there is never mistaken for this one. */
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${APP_PORT}`;

/** `E2E_PROD=1` serves `next build` output, which is what the security headers and production code paths are checked against. */
const PROD = process.env.E2E_PROD === "1";

/** The user flows, which every engine runs; the layout matrix and screenshots are measured in Chromium. */
const FLOWS = /(notifications|faults)\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e/tests",
  // one mock Atlas serves every test; tests reset it, so they run one at a time
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: FLOWS, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: FLOWS, use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", testMatch: FLOWS, use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", testMatch: FLOWS, use: { ...devices["iPhone 15"] } },
  ],
  webServer: [
    {
      command: "yarn workspace @kleros-portal/mock-atlas start",
      url: `${MOCK_ATLAS_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_ATLAS_PORT: String(MOCK_ATLAS_PORT) },
    },
    {
      command: PROD ? `yarn next build && yarn next start -p ${APP_PORT}` : `yarn next dev -p ${APP_PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI && !PROD,
      timeout: 300_000,
      env: {
        ...(PROD ? { NEXT_PUBLIC_E2E_TEST_WALLET: "true", NEXT_DIST_DIR: ".next-e2e" } : {}),
        NEXT_PUBLIC_ATLAS_URI: MOCK_ATLAS_URL,
        NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "e2e-placeholder",
      },
    },
  ],
});
