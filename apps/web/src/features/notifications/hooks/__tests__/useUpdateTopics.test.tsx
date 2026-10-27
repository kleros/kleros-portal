import { useAtlasProvider } from "@kleros/kleros-app";
import { useQuery } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { atlasClient } from "@/lib/atlas/client";

import { testAtlas } from "@/test/atlas";
import { ADDRESS, SESSION_NOW, storeSession } from "@/test/jwt";
import { data, deferred, failure, stubAtlasFetch } from "@/test/network";
import { renderHookWithQuery, testQueryClient } from "@/test/render";

import { fetchSubscriptions } from "../../api/notifications";
import type { Subscription } from "../../model/settings";
import { subscriptionsQueryKey } from "../useNotificationSettings";
import { resetFailedTopicWrites, useUpdateTopics } from "../useUpdateTopics";

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS }) }));
vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));

const key = subscriptionsQueryKey(ADDRESS);
beforeEach(async () => {
  resetFailedTopicWrites();
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

it("serializes writes across hook instances for one product without blocking another product", async () => {
  const first = deferred<Response>();
  const { requests } = stubAtlasFetch(({ variables }) =>
    variables?.product === "CourtV2" && requests.length === 1
      ? first.promise
      : data({ updateNotificationSubscriptions: true }),
  );
  const { result, client } = renderHookWithQuery(() => ({
    court: useUpdateTopics("CourtV2"),
    anotherCourt: useUpdateTopics("CourtV2"),
    poh: useUpdateTopics("PohV2"),
  }));
  client.setQueryData(key, [
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "PohV2", topic: "Rewards", enabled: false },
  ]);
  let off!: Promise<boolean>;
  act(() => {
    off = result.current.court.mutateAsync([{ topic: "JurorDraw", enabled: false }]);
  });
  await waitFor(() => expect(requests).toHaveLength(1));
  let on!: Promise<boolean>;
  act(() => {
    on = result.current.anotherCourt.mutateAsync([{ topic: "JurorDraw", enabled: true }]);
  });
  await waitFor(() => expect(result.current.anotherCourt.isPaused).toBe(true));
  await act(async () => {
    await result.current.poh.mutateAsync([{ topic: "Rewards", enabled: true }]);
  });
  expect(requests).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "PohV2", subscriptions: [{ topic: "Rewards", enabled: true }] },
    },
  ]);
  expect(client.getQueryData(key)).toEqual([
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "PohV2", topic: "Rewards", enabled: true },
  ]);
  await act(async () => {
    first.resolve(data({ updateNotificationSubscriptions: true }));
    await Promise.all([off, on]);
  });
  expect(requests).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "PohV2", subscriptions: [{ topic: "Rewards", enabled: true }] },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: true }] },
    },
  ]);
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});

it.each([true, false])(
  "restores the cached %s value after a failed idempotent write, not the opposite request",
  async (enabled) => {
    const response = deferred<Response>();
    stubAtlasFetch(() => response.promise);
    const { result, client } = renderHookWithQuery(() => useUpdateTopics("CourtV2"));
    const rows = [
      { product: "CourtV1", topic: "JurorDraw", enabled: !enabled },
      { product: "CourtV2", topic: "CaseWon", enabled: !enabled },
      { product: "CourtV2", topic: "JurorDraw", enabled },
    ];
    client.setQueryData(key, rows);
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.mutateAsync([{ topic: "JurorDraw", enabled }]).catch((error: unknown) => error);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    await act(async () => {
      response.resolve(failure("Write rejected"));
      await pending;
    });
    expect(client.getQueryData(key)).toEqual(rows);
  },
);

it("rolls back only the failed topics while retaining a queued edit to another topic", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const { requests } = stubAtlasFetch(() => (requests.length === 1 ? first.promise : second.promise));
  const { result, client } = renderHookWithQuery(() => useUpdateTopics("CourtV2"));
  client.setQueryData(key, [
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "CourtV2", topic: "JurorCanVote", enabled: false },
    { product: "PohV2", topic: "Rewards", enabled: true },
  ]);
  let off!: Promise<unknown>;
  act(() => {
    off = result.current.mutateAsync([{ topic: "JurorDraw", enabled: false }]).catch((error: unknown) => error);
  });
  await waitFor(() => expect(requests).toHaveLength(1));
  let on!: Promise<boolean>;
  act(() => {
    on = result.current.mutateAsync([{ topic: "JurorCanVote", enabled: true }]);
  });
  await waitFor(() =>
    expect(client.getQueryData(key)).toEqual([
      { product: "CourtV2", topic: "JurorDraw", enabled: false },
      { product: "CourtV2", topic: "JurorCanVote", enabled: true },
      { product: "PohV2", topic: "Rewards", enabled: true },
    ]),
  );
  await act(async () => {
    first.resolve(failure("Cannot update draw"));
    await off;
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(client.getQueryData(key)).toEqual([
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "CourtV2", topic: "JurorCanVote", enabled: true },
    { product: "PohV2", topic: "Rewards", enabled: true },
  ]);
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  await act(async () => {
    second.resolve(data({ updateNotificationSubscriptions: true }));
    await on;
  });
});

it.each([undefined, null] as const)("does not invent cached rows when subscriptions are %s", async (initial) => {
  const { requests } = stubAtlasFetch(() => data({ updateNotificationSubscriptions: true }));
  const { result, client } = renderHookWithQuery(() => useUpdateTopics("CourtV2"));
  if (initial === null) client.setQueryData(key, null);
  await act(async () => {
    await result.current.mutateAsync([{ topic: "JurorDraw", enabled: false }]);
  });
  expect(client.getQueryData(key)).toBe(initial);
  expect(requests).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
    },
  ]);
});

it("restores a toggled topic missing from the pre-write cache when rows arrive before the rejection", async () => {
  const response = deferred<Response>();
  const { requests } = stubAtlasFetch(() => response.promise);
  const { result, client } = renderHookWithQuery(() => useUpdateTopics("CourtV2"));
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current.mutateAsync([{ topic: "JurorDraw", enabled: false }]).catch((error: unknown) => error);
  });
  await waitFor(() => expect(requests).toHaveLength(1));
  client.setQueryData(key, [{ product: "CourtV2", topic: "JurorDraw", enabled: false }]);
  await act(async () => {
    response.resolve(failure("Write rejected"));
    await pending;
  });
  expect(client.getQueryData(key)).toEqual([{ product: "CourtV2", topic: "JurorDraw", enabled: true }]);
});

it("requires a session before sending a write and restores the optimistic cache", async () => {
  sessionStorage.clear();
  const { requests } = stubAtlasFetch(() => data({ updateNotificationSubscriptions: true }));
  const { result, client } = renderHookWithQuery(() => useUpdateTopics("CourtV2"));
  client.setQueryData(key, [{ product: "CourtV2", topic: "JurorDraw", enabled: true }]);
  await act(async () => {
    await expect(result.current.mutateAsync([{ topic: "JurorDraw", enabled: false }])).rejects.toThrow(
      "Sign in again to save changes.",
    );
  });
  expect(requests).toEqual([]);
  expect(client.getQueryData(key)).toEqual([{ product: "CourtV2", topic: "JurorDraw", enabled: true }]);
});

it("reconciles Court's server value only after the pending PoH write succeeds", async () => {
  const courtWrite = deferred<Response>();
  const pohWrite = deferred<Response>();
  let server = [
    { product: "CourtV2", topic: "JurorDraw", enabled: false },
    { product: "PohV2", topic: "Rewards", enabled: false },
  ];
  const { requests } = stubAtlasFetch(({ operationName, variables }) => {
    if (operationName === "NotificationSubscriptions") return data({ user: { notificationSubscriptions: server } });
    return variables?.product === "CourtV2" ? courtWrite.promise : pohWrite.promise;
  });
  const client = testQueryClient();
  client.setQueryData(key, [
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "PohV2", topic: "Rewards", enabled: false },
  ]);
  const { result } = renderHookWithQuery(() => {
    useQuery({ queryKey: key, queryFn: () => fetchSubscriptions(atlasClient()), staleTime: Infinity });
    return { court: useUpdateTopics("CourtV2"), poh: useUpdateTopics("PohV2") };
  }, client);
  let court!: Promise<unknown>;
  let poh!: Promise<boolean>;
  act(() => {
    court = result.current.court.mutateAsync([{ topic: "JurorDraw", enabled: false }]).catch((error: unknown) => error);
    poh = result.current.poh.mutateAsync([{ topic: "Rewards", enabled: true }]);
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  await act(async () => {
    courtWrite.resolve(failure("Court rejected"));
    await court;
  });
  expect(client.getQueryData(key)).toEqual([
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "PohV2", topic: "Rewards", enabled: true },
  ]);
  await act(async () => {
    server = [
      { product: "CourtV2", topic: "JurorDraw", enabled: false },
      { product: "PohV2", topic: "Rewards", enabled: true },
    ];
    pohWrite.resolve(data({ updateNotificationSubscriptions: true }));
    await poh;
  });
  await waitFor(() => expect(client.getQueryData(key)).toEqual(server));
});

it("reconciles a failed unmounted panel after the remounted panel's queued write succeeds", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const server = [{ product: "CourtV2", topic: "JurorDraw", enabled: true }];
  let writes = 0;
  stubAtlasFetch(({ operationName }) => {
    if (operationName === "NotificationSubscriptions") return data({ user: { notificationSubscriptions: server } });
    return ++writes === 1 ? first.promise : second.promise;
  });
  const client = testQueryClient();
  client.setQueryData(key, [{ product: "CourtV2", topic: "JurorDraw", enabled: false }]);
  const old = renderHookWithQuery(() => useUpdateTopics("CourtV2"), client);
  let off!: Promise<unknown>;
  act(() => {
    off = old.result.current.mutateAsync([{ topic: "JurorDraw", enabled: true }]).catch((error: unknown) => error);
  });
  await waitFor(() => expect(writes).toBe(1));
  old.unmount();
  const next = renderHookWithQuery(() => {
    useQuery({ queryKey: key, queryFn: () => fetchSubscriptions(atlasClient()), staleTime: Infinity });
    return useUpdateTopics("CourtV2");
  }, client);
  let on!: Promise<boolean>;
  act(() => {
    on = next.result.current.mutateAsync([{ topic: "JurorDraw", enabled: true }]);
  });
  await waitFor(() => expect(next.result.current.isPaused).toBe(true));
  await act(async () => {
    first.resolve(failure("Rejected"));
    await off;
  });
  await waitFor(() => expect(writes).toBe(2));
  await act(async () => {
    second.resolve(data({ updateNotificationSubscriptions: true }));
    await on;
  });
  await waitFor(() => expect(client.getQueryData(key)).toEqual(server));
});

it("refetches once a product queue drains after an earlier failure followed by success", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  let writes = 0;
  const { requests } = stubAtlasFetch(({ operationName }) => {
    if (operationName === "NotificationSubscriptions") return data({ user: { notificationSubscriptions: [] } });
    writes += 1;
    return writes === 1 ? first.promise : second.promise;
  });
  const client = testQueryClient();
  client.setQueryData<Subscription[]>(key, [{ product: "CourtV2", topic: "JurorDraw", enabled: true }]);
  const { result } = renderHookWithQuery(() => {
    useQuery({ queryKey: key, queryFn: () => fetchSubscriptions(atlasClient()), staleTime: Infinity });
    return useUpdateTopics("CourtV2");
  }, client);
  let off!: Promise<unknown>;
  let on!: Promise<boolean>;
  act(() => {
    off = result.current.mutateAsync([{ topic: "JurorDraw", enabled: false }]).catch((error: unknown) => error);
  });
  await waitFor(() => expect(writes).toBe(1));
  act(() => {
    on = result.current.mutateAsync([{ topic: "JurorDraw", enabled: true }]);
  });
  await waitFor(() => expect(result.current.isPaused).toBe(true));
  await act(async () => {
    first.resolve(failure("Rejected"));
    await off;
  });
  await waitFor(() => expect(writes).toBe(2));
  expect(requests.filter(({ operationName }) => operationName === "NotificationSubscriptions")).toEqual([]);
  await act(async () => {
    second.resolve(data({ updateNotificationSubscriptions: true }));
    await on;
  });
  expect(requests.filter(({ operationName }) => operationName === "NotificationSubscriptions")).toEqual([
    { operationName: "NotificationSubscriptions" },
  ]);
});

it("cancels stale reads for the edited wallet without cancelling another wallet's read", async () => {
  const currentRead = deferred<Subscription[]>();
  const otherRead = deferred<Subscription[]>();
  const write = deferred<Response>();
  const { requests } = stubAtlasFetch(() => write.promise);
  const { result, client } = renderHookWithQuery(() => useUpdateTopics("CourtV2"));
  const otherKey = subscriptionsQueryKey("0xother");
  const before = [{ product: "CourtV2", topic: "JurorDraw", enabled: true }];
  client.setQueryData(key, before);
  client.setQueryData(otherKey, []);
  const readingCurrent = client
    .fetchQuery({ queryKey: key, queryFn: () => currentRead.promise })
    .catch((error: unknown) => error);
  const readingOther = client
    .fetchQuery({ queryKey: otherKey, queryFn: () => otherRead.promise })
    .catch((error: unknown) => error);
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.mutateAsync([{ topic: "JurorDraw", enabled: false }]);
  });
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(client.getQueryData(key)).toEqual([{ product: "CourtV2", topic: "JurorDraw", enabled: false }]);
  await act(async () => {
    currentRead.resolve(before);
    otherRead.resolve([{ product: "PohV2", topic: "Rewards", enabled: true }]);
    await Promise.all([readingCurrent, readingOther]);
  });
  expect(client.getQueryData(key)).toEqual([{ product: "CourtV2", topic: "JurorDraw", enabled: false }]);
  expect(client.getQueryData(otherKey)).toEqual([{ product: "PohV2", topic: "Rewards", enabled: true }]);
  await act(async () => {
    write.resolve(data({ updateNotificationSubscriptions: true }));
    await pending;
  });
});
