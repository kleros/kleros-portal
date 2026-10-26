import { useAtlasProvider } from "@kleros/kleros-app";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { ADDRESS, SESSION_NOW, signToken, storeSession } from "@/test/jwt";

import { useAtlasSession } from "../useAtlasSession";

const account = vi.hoisted(() => ({ address: "" }));
vi.mock("wagmi", () => ({ useAccount: () => account }));
vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SESSION_NOW);
  account.address = ADDRESS;
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

it("reads the signed-in token when verification changes and drops it when verification is lost", async () => {
  const token = await storeSession();
  const atlas = testAtlas();
  atlas.isVerified = false;
  vi.mocked(useAtlasProvider).mockReturnValue(atlas);
  const { result, rerender } = renderHook(useAtlasSession);
  expect(result.current).toEqual({ address: ADDRESS, token: undefined, isSignedIn: false });
  atlas.isVerified = true;
  rerender();
  expect(result.current).toEqual({ address: ADDRESS, token, isSignedIn: true });
  atlas.isVerified = false;
  rerender();
  expect(result.current).toEqual({ address: ADDRESS, token: undefined, isSignedIn: false });
});

it("rechecks token ownership when the connected account changes", async () => {
  const token = await storeSession();
  vi.mocked(useAtlasProvider).mockReturnValue(testAtlas());
  const { result, rerender } = renderHook(useAtlasSession);
  expect(result.current).toEqual({ address: ADDRESS, token, isSignedIn: true });
  account.address = "0x0000000000000000000000000000000000000001";
  rerender();
  expect(result.current).toEqual({ address: account.address, token: undefined, isSignedIn: false });
  const secondToken = await signToken({ sub: account.address });
  sessionStorage.setItem("authToken", JSON.stringify(secondToken));
  account.address = account.address.toUpperCase();
  rerender();
  expect(result.current).toEqual({ address: account.address, token: secondToken, isSignedIn: true });
});
