// @vitest-environment node

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

it("passes the mock email cooldown through Turbo to dev tasks", () => {
  const config = JSON.parse(readFileSync(new URL("../../../../../turbo.json", import.meta.url), "utf8"));
  expect(config.globalEnv).toContain("MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS");
});

it.each(["E2E_PROD", "REAL_ATLAS_EMAIL_COOLDOWN", "REAL_ATLAS_SESSION_SECONDS"])(
  "passes %s through Turbo",
  (variable) => {
    const config = JSON.parse(readFileSync(new URL("../../../../../turbo.json", import.meta.url), "utf8"));
    expect(config.globalPassThroughEnv).toContain(variable);
  },
);
