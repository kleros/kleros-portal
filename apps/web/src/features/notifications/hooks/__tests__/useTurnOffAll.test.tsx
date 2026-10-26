import { useAtlasProvider } from "@kleros/kleros-app";
import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { ADDRESS, SESSION_NOW, storeSession } from "@/test/jwt";
import { data, deferred, failure, stubAtlasFetch } from "@/test/network";
import { renderHookWithQuery } from "@/test/render";

import { subscriptionsQueryKey } from "../useNotificationSettings";
import { useTurnOffAll } from "../useTurnOffAll";

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS }) }));
vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SESSION_NOW);
  sessionStorage.clear();
  await storeSession();
  vi.mocked(useAtlasProvider).mockReturnValue(testAtlas());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

it("patches each successful product only after its response, collecting failures in write order", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const third = deferred<Response>();
  const { requests } = stubAtlasFetch(({ variables }) => {
    if (variables?.product === "CourtV2") return first.promise;
    if (variables?.product === "PohV2") return second.promise;
    return third.promise;
  });
  const { result, client } = renderHookWithQuery(() =>
    useTurnOffAll([
      {
        product: "CourtV2",
        topics: [
          { topic: "JurorDraw", enabled: true },
          { topic: "CaseWon", enabled: false },
        ],
      },
      { product: "CourtV1", topics: [{ topic: "JurorDraw", enabled: false }] },
      { product: "PohV2", topics: [{ topic: "Rewards", enabled: true }] },
      { product: "Foresight", topics: [{ topic: "MarketResolved", enabled: true }] },
    ]),
  );
  const key = subscriptionsQueryKey(ADDRESS);
  const initial = [
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "CourtV2", topic: "CaseWon", enabled: false },
    { product: "CourtV1", topic: "JurorDraw", enabled: false },
    { product: "PohV2", topic: "Rewards", enabled: true },
    { product: "Foresight", topic: "MarketResolved", enabled: true },
  ];
  client.setQueryData(key, initial);
  const otherKey = subscriptionsQueryKey("0xother");
  client.setQueryData(otherKey, initial);
  expect(result.current.state).toEqual({ status: "idle" });
  let run!: Promise<void>;
  act(() => {
    run = result.current.run();
  });
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(result.current.state).toEqual({ status: "running" });
  expect(client.getQueryData(key)).toEqual(initial);
  await act(async () => {
    first.resolve(data({ updateNotificationSubscriptions: true }));
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(client.getQueryData(key)).toEqual([
    { product: "CourtV2", topic: "JurorDraw", enabled: false },
    { product: "CourtV2", topic: "CaseWon", enabled: false },
    { product: "CourtV1", topic: "JurorDraw", enabled: false },
    { product: "PohV2", topic: "Rewards", enabled: true },
    { product: "Foresight", topic: "MarketResolved", enabled: true },
  ]);
  await act(async () => {
    second.resolve(failure("PoH is unavailable"));
  });
  await waitFor(() => expect(requests).toHaveLength(3));
  await act(async () => {
    third.resolve(failure("Markets are unavailable"));
    await run;
  });
  expect(result.current.state).toEqual({
    status: "partial",
    failures: [
      { product: "PohV2", message: "PoH is unavailable" },
      { product: "Foresight", message: "Markets are unavailable" },
    ],
  });
  expect(requests).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "PohV2", subscriptions: [{ topic: "Rewards", enabled: false }] },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "Foresight", subscriptions: [{ topic: "MarketResolved", enabled: false }] },
    },
  ]);
  expect(client.getQueryData(key)).toEqual([
    { product: "CourtV2", topic: "JurorDraw", enabled: false },
    { product: "CourtV2", topic: "CaseWon", enabled: false },
    { product: "CourtV1", topic: "JurorDraw", enabled: false },
    { product: "PohV2", topic: "Rewards", enabled: true },
    { product: "Foresight", topic: "MarketResolved", enabled: true },
  ]);
  expect(client.getQueryData(otherKey)).toEqual(initial);
  act(() => result.current.reset());
  expect(result.current.state).toEqual({ status: "idle" });
});

it("reports a session failure without sending any writes when there is no token", async () => {
  sessionStorage.clear();
  const { requests } = stubAtlasFetch(() => data({ updateNotificationSubscriptions: true }));
  const { result, client } = renderHookWithQuery(() =>
    useTurnOffAll([{ product: "CourtV2", topics: [{ topic: "JurorDraw", enabled: true }] }]),
  );
  const key = subscriptionsQueryKey(ADDRESS);
  client.setQueryData(key, [{ product: "CourtV2", topic: "JurorDraw", enabled: true }]);
  await act(async () => {
    await result.current.run();
  });
  expect(result.current.state).toEqual({
    status: "partial",
    failures: [{ product: "", message: "Sign in again to save changes." }],
  });
  expect(requests).toEqual([]);
  expect(client.getQueryData(key)).toEqual([{ product: "CourtV2", topic: "JurorDraw", enabled: true }]);
  act(() => result.current.reset());
  expect(result.current.state).toEqual({ status: "idle" });
});
