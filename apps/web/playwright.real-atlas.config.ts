import { defineConfig, devices } from "@playwright/test";

/**
 * The portal against a real Atlas (its docker compose `api`, `postgres` and `sendgrid` services).
 * Atlas's SIWE_DOMAINS must list this app's host, e.g. `localhost:3100`.
 */
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const ATLAS_URI = process.env.REAL_ATLAS_URI ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e/real-atlas",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `yarn next dev -p ${APP_PORT}`,
    url: `http://localhost:${APP_PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_ATLAS_URI: ATLAS_URI,
      NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "e2e-placeholder",
    },
  },
});
