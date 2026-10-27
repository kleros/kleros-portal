// @vitest-environment node

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

it("passes the mock email cooldown through Turbo to dev tasks", () => {
  const config = JSON.parse(readFileSync(new URL("../../../../../turbo.json", import.meta.url), "utf8"));
  expect(config.globalEnv).toContain("MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS");
});
