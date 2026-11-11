import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { metadata as apiKeys } from "../(portal)/api-keys/page";
import { metadata as confirmation } from "../(portal)/email-confirmation/page";
import { metadata as notifications } from "../(portal)/notifications/page";
import { metadata, viewport } from "../layout";
import robots from "../robots";

vi.mock("next/font/local", () => ({ default: () => ({ variable: "--font-inter" }) }));

describe("portal metadata", () => {
  it("names the site and supplies a template for route titles", () => {
    expect(metadata.title).toEqual({ default: "Kleros Portal", template: "%s · Kleros Portal" });
    expect(notifications.title).toBe("Notifications");
    expect(apiKeys.title).toBe("API keys");
    expect(confirmation.title).toBe("Email confirmation");
  });

  it("keeps confirmation tokens out of referrers and search indexes", () => {
    expect(confirmation.referrer).toBe("no-referrer");
    expect(confirmation.robots).toEqual({ index: false, follow: true });
    expect(metadata.robots).toBeUndefined();
    expect(notifications.robots).toBeUndefined();
    expect(apiKeys.robots).toBeUndefined();
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });

  it("matches the light and dark portal backgrounds", () => {
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#fafbfc" },
      { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
    ]);
  });

  it("uses the existing Kleros mark with an explicit purple fill", () => {
    const icon = readFileSync("src/app/icon.svg", "utf8");
    const mark = readFileSync("src/assets/svgs/kleros-mark.svg", "utf8");
    const parser = new DOMParser();
    const iconDoc = parser.parseFromString(icon, "image/svg+xml");
    const markDoc = parser.parseFromString(mark, "image/svg+xml");
    expect(iconDoc.documentElement.getAttribute("fill")).toBe("#4d00b4");
    expect(iconDoc.documentElement.getAttribute("viewBox")).toBe(markDoc.documentElement.getAttribute("viewBox"));
    expect(iconDoc.querySelector("path")?.getAttribute("d")).toBe(markDoc.querySelector("path")?.getAttribute("d"));
  });
});
