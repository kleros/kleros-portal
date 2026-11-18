// @vitest-environment-options {"url":"https://portal.example/notifications"}
import { createAppKit } from "@reown/appkit/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@reown/appkit/react", () => ({ createAppKit: vi.fn() }));

/** A fresh module, so the cached AppKit instance is built again with this env. */
async function buildWith(siteUrl: string | undefined) {
  vi.resetModules();
  const { env } = await import("@/config/env");
  vi.doMock("@/config/env", () => ({ env: { ...env, SITE_URL: siteUrl } }));
  const { getAppKit } = await import("../appkit");
  getAppKit();
  const { createAppKit: create } = await import("@reown/appkit/react");
  return vi.mocked(create).mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.mocked(createAppKit).mockClear();
  vi.doUnmock("@/config/env");
});

it("does not offer aliased Coinbase or Base Account connectors", async () => {
  expect(await buildWith(undefined)).toEqual(
    expect.objectContaining({
      enableCoinbase: false,
      enableBaseAccount: false,
    }),
  );
});

describe("wallet metadata url", () => {
  it("is the configured site url", async () => {
    const options = await buildWith("https://kleros-portal.netlify.app");
    expect(options?.metadata?.url).toBe("https://kleros-portal.netlify.app");
  });

  it("is the page's own origin when no site url is configured", async () => {
    const options = await buildWith(undefined);
    expect(options?.metadata?.url).toBe("https://portal.example");
  });
});
