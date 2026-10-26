import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADDRESS, signToken } from "@/test/jwt";

import { clearAuthToken, readAuthToken } from "../session";

const now = 1_800_000_000;
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("readAuthToken", () => {
  it.each([ADDRESS, ADDRESS.toUpperCase()])("reads the JSON-encoded JWT for matching subject %s", async (sub) => {
    const token = await signToken({ sub, exp: now + 1 });
    sessionStorage.setItem("authToken", JSON.stringify(token));
    expect(readAuthToken(ADDRESS, now)).toBe(token);
  });
  it.each([
    { sub: "0x0000000000000000000000000000000000000001", exp: now + 1 },
    { sub: ADDRESS, exp: now - 1 },
    { exp: now + 1 },
  ])("rejects wrong, missing or expired subject: %j", async (payload) => {
    sessionStorage.setItem("authToken", JSON.stringify(await signToken(payload)));
    expect(readAuthToken(ADDRESS, now)).toBeUndefined();
  });
  // Bug: exp < now accepts a JWT at its expiration instant; JWT expiration is exclusive.
  it("rejects a token exactly at exp", async () => {
    sessionStorage.setItem("authToken", JSON.stringify(await signToken({ sub: ADDRESS, exp: now })));
    expect(readAuthToken(ADDRESS, now)).toBeUndefined();
  });
  it("allows a matching token with no optional exp claim", async () => {
    const token = await signToken({ sub: ADDRESS });
    sessionStorage.setItem("authToken", JSON.stringify(token));
    expect(readAuthToken(ADDRESS, now)).toBe(token);
  });
  it.each(["{", "null", "123", "true", "{}", "[]", '"not.a.jwt"', '""'])("rejects invalid stored value %s", (raw) => {
    sessionStorage.setItem("authToken", raw);
    expect(readAuthToken(ADDRESS, now)).toBeUndefined();
  });
  it("requires a connected address even with a valid token", async () => {
    sessionStorage.setItem("authToken", JSON.stringify(await signToken({ sub: ADDRESS, exp: now + 1 })));
    expect(readAuthToken(undefined, now)).toBeUndefined();
    expect(readAuthToken("", now)).toBeUndefined();
  });
  it("handles absent or unavailable storage", () => {
    expect(readAuthToken(ADDRESS, now)).toBeUndefined();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(readAuthToken(ADDRESS, now)).toBeUndefined();
  });
});

describe("clearAuthToken", () => {
  it("removes only the auth token", async () => {
    sessionStorage.setItem("authToken", JSON.stringify(await signToken({ sub: ADDRESS })));
    sessionStorage.setItem("unrelated", "keep");
    clearAuthToken();
    expect(sessionStorage.getItem("authToken")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
    expect(() => clearAuthToken()).not.toThrow();
  });
  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => clearAuthToken()).not.toThrow();
  });
});

it("treats a blocked sessionStorage getter as an unavailable session", () => {
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw new DOMException("Storage denied", "SecurityError");
  });
  expect(readAuthToken(ADDRESS, now)).toBeUndefined();
  expect(() => clearAuthToken()).not.toThrow();
});

it("can read and clear a session without a browser window", () => {
  vi.stubGlobal("window", undefined);
  try {
    expect(readAuthToken(ADDRESS, now)).toBeUndefined();
    expect(() => clearAuthToken()).not.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
