import { defineConfig, devices } from "@playwright/test";

import { MOCK_ATLAS_PORT, MOCK_ATLAS_URL } from "./e2e/fixtures/atlas";

/** Off the default 3000 so a dev server already running there is never mistaken for this one. */
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${APP_PORT}`;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "yarn workspace @kleros-portal/mock-atlas start",
      url: `${MOCK_ATLAS_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_ATLAS_PORT: String(MOCK_ATLAS_PORT) },
    },
    {
      command: `yarn next dev -p ${APP_PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_ATLAS_URI: MOCK_ATLAS_URL,
        NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "e2e-placeholder",
      },
    },
  ],
});
