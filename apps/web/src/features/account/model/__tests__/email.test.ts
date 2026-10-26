import { afterEach, describe, expect, it, vi } from "vitest";

import { cooldownUntil, formatCooldown, isValidEmail, normaliseEmail } from "../email";

afterEach(() => vi.unstubAllEnvs());

describe("email validation", () => {
  it.each(["me@example.com", " first.last+court@sub.example.org ", "\tme@example.co\n", "a@b.co", "A@EXAMPLE.COM"])(
    "accepts %j",
    (email) => {
      expect(isValidEmail(email)).toBe(true);
    },
  );
  it.each([
    "",
    "  ",
    "me",
    "@example.com",
    "me@",
    "me@example",
    "me@example.c",
    "me@@example.com",
    "me@ex ample.com",
    "m e@example.com",
    "me@example.com.",
  ])("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
  // Bug: EMAIL's TLD class accepts digits and punctuation despite the documented letters-only rule.
  it.each(["me@example.12", "me@example.!!"])("rejects a non-letter TLD in %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
  it("normalises only surrounding whitespace", () => {
    expect(normaliseEmail(" \tMe+Court@Example.COM\n")).toBe("Me+Court@Example.COM");
  });
});

const now = Date.parse("2026-10-27T12:00:00Z");
describe("cooldownUntil", () => {
  it.each([null, undefined, "", "garbage", "2026-10-26T12:00:00Z", "2026-10-27T12:00:00Z"])(
    "has no cooldown for %j",
    (at) => {
      expect(cooldownUntil(at, now)).toBeNull();
    },
  );
  it("returns the future instant, including timezone offsets", () => {
    expect(cooldownUntil("2026-10-27T15:05:00+01:00", now)).toEqual(new Date("2026-10-27T14:05:00Z"));
  });
});

describe("formatCooldown", () => {
  it.each([
    ["2026-10-27T14:05:00Z", "02:05 PM"],
    ["2026-10-28T14:05:00Z", "Oct 28, 02:05 PM"],
    ["2026-11-27T00:05:00Z", "Nov 27, 12:05 AM"],
    ["2027-10-27T14:05:00Z", "Oct 27, 02:05 PM"],
  ])("formats %s against a fixed UTC day", (until, expected) => {
    vi.stubEnv("TZ", "UTC");
    expect(formatCooldown(new Date(until), new Date(now))).toBe(expected);
  });
});
