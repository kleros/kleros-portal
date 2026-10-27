import { useAtlasProvider } from "@kleros/kleros-app";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { ADDRESS, SESSION_NOW, storeSession } from "@/test/jwt";
import { data, deferred, failure, stubAtlasFetch, type AtlasRequest } from "@/test/network";
import { SHOWN } from "@/test/queries";
import { renderWithQuery } from "@/test/render";

import { NotificationSettings } from "../NotificationSettings";

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS }) }));
vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));

// Atlas's GraphQL DTOs serialize enum member names, not the lower-camel storage values.
// Source: packages/api/test/integration/user/notification-subscriptions.integration-spec.ts.
const catalogue = [
  { product: "CourtV2", topic: "JurorDraw", defaultEnabled: true },
  { product: "PohV2", topic: "Rewards", defaultEnabled: false },
  { product: "CourtV2", topic: "JurorCanVote", defaultEnabled: true },
  { product: "Foresight", topic: "MarketResolved", defaultEnabled: true },
  { product: "CourtV2", topic: "CaseWon", defaultEnabled: true },
];
const subscriptions = [
  { product: "CourtV2", topic: "JurorDraw", enabled: true },
  { product: "CourtV2", topic: "JurorCanVote", enabled: false },
  { product: "CourtV2", topic: "CaseWon", enabled: true },
  { product: "PohV2", topic: "Rewards", enabled: false },
  { product: "Foresight", topic: "MarketResolved", enabled: true },
];

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

function renderSettings(requestedProduct?: string) {
  return renderWithQuery(
    <NotificationSettings
      requestedProduct={requestedProduct}
      noUser={<p>Add an email first</p>}
      header={<p>reader@example.com</p>}
      dangerZone={<p>Remove email here</p>}
    />,
  );
}
function serveSettings(
  update: (request: AtlasRequest) => Response | Promise<Response> = () =>
    data({ updateNotificationSubscriptions: true }),
) {
  let rows = subscriptions.map((row) => ({ ...row }));
  return stubAtlasFetch(async (request) => {
    if (request.operationName === "NotificationTopics") return data({ notificationTopics: catalogue });
    if (request.operationName === "NotificationSubscriptions")
      return data({ user: { email: "reader@example.com", notificationSubscriptions: rows } });
    const response = await update(request);
    const body = await response.clone().json();
    if (body.data?.updateNotificationSubscriptions) {
      const changes = request.variables?.subscriptions as { topic: string; enabled: boolean }[];
      rows = rows.map((row) => {
        const change =
          row.product === request.variables?.product ? changes.find((entry) => entry.topic === row.topic) : undefined;
        return change ? { ...row, enabled: change.enabled } : row;
      });
    }
    return response;
  });
}
const writes = (requests: AtlasRequest[]) =>
  requests.filter(({ operationName }) => operationName === "UpdateNotificationSubscriptions");
function navRows() {
  return within(screen.getByRole("navigation", { name: "Products" }))
    .getAllByRole("link")
    .map((link) => ({
      href: link.getAttribute("href"),
      summary: within(link).getByText(/^(Nothing on|\d+ of \d+ on)$/, SHOWN).textContent,
      current: link.getAttribute("aria-current"),
    }));
}

it("shows loading until both catalogue and subscriptions resolve, then renders slots and products", async () => {
  const topics = deferred<Response>();
  const rows = deferred<Response>();
  const { requests, fetch } = stubAtlasFetch(({ operationName }) =>
    operationName === "NotificationTopics" ? topics.promise : rows.promise,
  );
  renderSettings();
  expect(screen.getByRole("status")).toHaveTextContent("Loading your notifications…");
  await act(async () => topics.resolve(data({ notificationTopics: catalogue })));
  expect(screen.getByRole("status")).toHaveTextContent("Loading your notifications…");
  await act(async () =>
    rows.resolve(data({ user: { email: "reader@example.com", notificationSubscriptions: subscriptions } })),
  );
  expect(await screen.findByRole("navigation", { name: "Products" })).toBeVisible();
  expect(screen.getByText("reader@example.com", SHOWN)).toBeVisible();
  expect(screen.getByText("Remove email here", SHOWN)).toBeVisible();
  expect(requests).toEqual([{ operationName: "NotificationTopics" }, { operationName: "NotificationSubscriptions" }]);
  const subscriptionCall = fetch.mock.calls[1];
  expect(new Headers(subscriptionCall?.[1]?.headers).get("authorization")).toBe(
    `Bearer ${JSON.parse(sessionStorage.getItem("authToken") ?? "null")}`,
  );
});

it.each(["NotificationTopics", "NotificationSubscriptions"] as const)(
  "retries a failed %s query with Try again",
  async (failedOperation) => {
    let failing = true;
    const { requests } = stubAtlasFetch(({ operationName }) => {
      if (operationName === failedOperation && failing) return failure("Atlas unavailable");
      return operationName === "NotificationTopics"
        ? data({ notificationTopics: catalogue })
        : data({ user: { notificationSubscriptions: subscriptions } });
    });
    renderSettings();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your notifications did not loadAtlas did not answer. Nothing was changed.",
    );
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Products" })).toBeVisible();
    expect(requests).toEqual([
      { operationName: "NotificationTopics" },
      { operationName: "NotificationSubscriptions" },
      { operationName: failedOperation },
    ]);
  },
);

it.each([null, { notificationSubscriptions: null }])("renders the noUser slot when user is %j", async (user) => {
  const { requests } = stubAtlasFetch(({ operationName }) =>
    operationName === "NotificationTopics" ? data({ notificationTopics: catalogue }) : data({ user }),
  );
  renderSettings();
  expect(await screen.findByText("Add an email first", SHOWN)).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "Products" })).not.toBeInTheDocument();
  expect(requests).toEqual([{ operationName: "NotificationTopics" }, { operationName: "NotificationSubscriptions" }]);
});

it("lists exactly catalogue products in first-seen order with their enabled counts", async () => {
  serveSettings();
  renderSettings();
  await screen.findByRole("navigation", { name: "Products" });
  expect(navRows()).toEqual([
    { href: "/notifications?product=CourtV2", summary: "2 of 3 on", current: "page" },
    { href: "/notifications?product=PohV2", summary: "Nothing on", current: null },
    { href: "/notifications?product=Foresight", summary: "1 of 1 on", current: null },
  ]);
});

it("selects the requested catalogue product", async () => {
  serveSettings();
  renderSettings("Foresight");
  expect(await screen.findByRole("heading", { name: "Foresight" })).toBeVisible();
  expect(navRows().filter(({ current }) => current === "page")).toEqual([
    { href: "/notifications?product=Foresight", summary: "1 of 1 on", current: "page" },
  ]);
  expect(screen.getAllByRole("switch")).toHaveLength(1);
});

it("falls back to the first catalogue product for an unknown request", async () => {
  serveSettings();
  renderSettings("removed-product");
  await screen.findByRole("navigation", { name: "Products" });
  expect(navRows().filter(({ current }) => current === "page")).toEqual([
    { href: "/notifications?product=CourtV2", summary: "2 of 3 on", current: "page" },
  ]);
});

it("uses product names and known topic groups for Atlas's actual wire catalogue", async () => {
  serveSettings();
  renderSettings();
  await screen.findByRole("navigation", { name: "Products" });
  expect(
    within(screen.getByRole("navigation", { name: "Products" }))
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Court2 of 3 on", "Proof of HumanityNothing on", "Foresight1 of 1 on"]);
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "Jury duty",
    "Rulings",
    "Turn off all emails",
  ]);
});

it("handles an empty catalogue without manufacturing products", async () => {
  stubAtlasFetch(({ operationName }) =>
    operationName === "NotificationTopics"
      ? data({ notificationTopics: [] })
      : data({ user: { notificationSubscriptions: [] } }),
  );
  renderSettings();
  expect(await screen.findByText("No Kleros product offers email notifications yet.", SHOWN)).toBeVisible();
  expect(screen.getByRole("button", { name: "All off" })).toBeDisabled();
  expect(screen.queryByRole("navigation", { name: "Products" })).not.toBeInTheDocument();
});

it("flips a topic optimistically and sends exactly one product/topic update", async () => {
  const response = deferred<Response>();
  const { requests } = serveSettings(() => response.promise);
  renderSettings();
  const toggle = await screen.findByRole("switch", { name: "I'm drawn as a juror" });
  expect(toggle).toBeChecked();
  await userEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(screen.getByText("Saving…", SHOWN)).toBeVisible();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
    },
  ]);
  await act(async () => response.resolve(data({ updateNotificationSubscriptions: true })));
  expect(await screen.findByText("Saved", SHOWN)).toBeVisible();
  expect(toggle).not.toBeChecked();
  expect(screen.getByRole("switch", { name: /^I earn rewards on a case$/i })).toBeChecked();
  expect(writes(requests)).toHaveLength(1);
});

it("rolls back a failed optimistic update and shows Not saved", async () => {
  const response = deferred<Response>();
  const readBack = deferred<Response>();
  let subscriptionReads = 0;
  const { requests } = stubAtlasFetch(({ operationName }) => {
    if (operationName === "NotificationTopics") return data({ notificationTopics: catalogue });
    if (operationName === "NotificationSubscriptions") {
      subscriptionReads += 1;
      return subscriptionReads === 1 ? data({ user: { notificationSubscriptions: subscriptions } }) : readBack.promise;
    }
    return response.promise;
  });
  renderSettings();
  const toggle = await screen.findByRole("switch", { name: "I'm drawn as a juror" });
  await userEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  await act(async () => response.resolve(failure("Write failed")));
  expect(await screen.findByText("Not saved. Try again", SHOWN)).toBeVisible();
  // A fast refetch can hide a missing optimistic rollback; keep readback pending here.
  await waitFor(() => expect(subscriptionReads).toBe(2));
  expect(toggle).toBeChecked();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
    },
  ]);
  await act(async () => readBack.resolve(data({ user: { notificationSubscriptions: subscriptions } })));
});

it("sends only changed topics when a partially enabled group is switched on", async () => {
  const { requests } = serveSettings();
  renderSettings();
  const group = await screen.findByRole("switch", { name: "All jury duty emails" });
  expect(group).not.toBeChecked();
  await userEvent.click(group);
  expect(await screen.findByText("Saved", SHOWN)).toBeVisible();
  expect(group).toBeChecked();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorCanVote", enabled: true }] },
    },
  ]);
  for (const input of screen.getAllByRole("switch")) expect(input).toBeChecked();
});

it("switches Jury duty without changing a Court ruling topic", async () => {
  const { requests } = serveSettings();
  renderSettings();
  await screen.findByRole("navigation", { name: "Products" });
  await userEvent.click(screen.getByRole("switch", { name: "All jury duty emails" }));
  await screen.findByText("Saved", SHOWN);
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "CourtV2", subscriptions: [{ topic: "JurorCanVote", enabled: true }] },
    },
  ]);
  expect(screen.getByRole("switch", { name: /^I earn rewards on a case$/i })).toBeChecked();
});

it("cancels Turn off all without writing", async () => {
  const { requests } = serveSettings();
  renderSettings();
  await userEvent.click(await screen.findByRole("button", { name: "Turn off all" }));
  expect(screen.getByRole("button", { name: "Turn everything off" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Turn off all" })).toBeEnabled();
  expect(writes(requests)).toEqual([]);
});

it("turns off enabled products sequentially in catalogue order, skipping all-off products", async () => {
  const first = deferred<Response>();
  const { requests } = serveSettings(({ variables }) =>
    variables?.product === "CourtV2" ? first.promise : data({ updateNotificationSubscriptions: true }),
  );
  renderSettings();
  await userEvent.click(await screen.findByRole("button", { name: "Turn off all" }));
  expect(writes(requests)).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "Turn everything off" }));
  expect(screen.getByRole("button", { name: "Turning off…" })).toBeDisabled();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: {
        product: "CourtV2",
        subscriptions: [
          { topic: "JurorDraw", enabled: false },
          { topic: "CaseWon", enabled: false },
        ],
      },
    },
  ]);
  await act(async () => first.resolve(data({ updateNotificationSubscriptions: true })));
  expect(await screen.findByText("All emails are off. Turn on what you want above.", SHOWN)).toBeVisible();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: {
        product: "CourtV2",
        subscriptions: [
          { topic: "JurorDraw", enabled: false },
          { topic: "CaseWon", enabled: false },
        ],
      },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "Foresight", subscriptions: [{ topic: "MarketResolved", enabled: false }] },
    },
  ]);
  expect(navRows().map(({ href, summary }) => ({ href, summary }))).toEqual([
    { href: "/notifications?product=CourtV2", summary: "Nothing on" },
    { href: "/notifications?product=PohV2", summary: "Nothing on" },
    { href: "/notifications?product=Foresight", summary: "Nothing on" },
  ]);
  expect(screen.getByRole("button", { name: "All off" })).toBeDisabled();
});

it("reports a product failure and Retry writes only products still enabled", async () => {
  let fail = true;
  const { requests } = serveSettings(({ variables }) =>
    variables?.product === "CourtV2" && fail ? failure("Try later") : data({ updateNotificationSubscriptions: true }),
  );
  renderSettings();
  await userEvent.click(await screen.findByRole("button", { name: "Turn off all" }));
  await userEvent.click(screen.getByRole("button", { name: "Turn everything off" }));
  expect(await screen.findByText("Court is still on: Try later", SHOWN)).toBeVisible();
  expect(navRows().map(({ summary }) => summary)).toEqual(["2 of 3 on", "Nothing on", "Nothing on"]);
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("All emails are off. Turn on what you want above.", SHOWN)).toBeVisible();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: {
        product: "CourtV2",
        subscriptions: [
          { topic: "JurorDraw", enabled: false },
          { topic: "CaseWon", enabled: false },
        ],
      },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: { product: "Foresight", subscriptions: [{ topic: "MarketResolved", enabled: false }] },
    },
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: {
        product: "CourtV2",
        subscriptions: [
          { topic: "JurorDraw", enabled: false },
          { topic: "CaseWon", enabled: false },
        ],
      },
    },
  ]);
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});

it("switches an all-on Jury duty group off without touching Rulings", async () => {
  const rows = [
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
    { product: "CourtV2", topic: "JurorCanVote", enabled: true },
    { product: "CourtV2", topic: "CaseWon", enabled: true },
  ];
  const { requests } = stubAtlasFetch(({ operationName }) => {
    if (operationName === "NotificationTopics") return data({ notificationTopics: catalogue });
    if (operationName === "NotificationSubscriptions") return data({ user: { notificationSubscriptions: rows } });
    return data({ updateNotificationSubscriptions: true });
  });
  renderSettings();
  const group = await screen.findByRole("switch", { name: "All jury duty emails" });
  expect(group).toBeChecked();
  await userEvent.click(group);
  expect(await screen.findByText("Saved", SHOWN)).toBeVisible();
  expect(group).not.toBeChecked();
  expect(screen.getByRole("switch", { name: "I'm drawn as a juror" })).not.toBeChecked();
  expect(screen.getByRole("switch", { name: "It's time to vote" })).not.toBeChecked();
  expect(screen.getByRole("switch", { name: /^I earn rewards on a case$/i })).toBeChecked();
  expect(writes(requests)).toEqual([
    {
      operationName: "UpdateNotificationSubscriptions",
      variables: {
        product: "CourtV2",
        subscriptions: [
          { topic: "JurorDraw", enabled: false },
          { topic: "JurorCanVote", enabled: false },
        ],
      },
    },
  ]);
});

it("shows a plain sign-in message when the session ends before Turn off all", async () => {
  serveSettings();
  const view = renderSettings();
  await screen.findByRole("navigation", { name: "Products" });
  const atlas = testAtlas();
  atlas.isVerified = false;
  vi.mocked(useAtlasProvider).mockReturnValue(atlas);
  view.rerender(<NotificationSettings noUser={null} header={null} dangerZone={null} />);
  await userEvent.click(screen.getByRole("button", { name: "Turn off all" }));
  expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual(["Changes save as you go", ""]);
  await userEvent.click(screen.getByRole("button", { name: "Turn everything off" }));
  expect(await screen.findByText("Sign in again to save changes.", SHOWN)).toBeVisible();
  expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual([
    "Changes save as you go",
    "Sign in again to save changes.Retry",
  ]);
});

it("disables every topic and group switch while turning off all emails", async () => {
  const response = deferred<Response>();
  serveSettings(() => response.promise);
  renderSettings();
  await screen.findByRole("switch", { name: "All jury duty emails" });
  await userEvent.click(screen.getByRole("button", { name: "Turn off all" }));
  await userEvent.click(screen.getByRole("button", { name: "Turn everything off" }));
  expect(screen.getByRole("button", { name: "Turning off…" })).toBeDisabled();
  for (const control of screen.getAllByRole("switch")) expect(control).toBeDisabled();
  await act(async () => response.resolve(data({ updateNotificationSubscriptions: true })));
  await waitFor(() => {
    for (const control of screen.getAllByRole("switch")) expect(control).toBeEnabled();
  });
});

it("styles visible keyboard focus on every topic and group switch label", async () => {
  serveSettings();
  renderSettings();
  await screen.findByRole("switch", { name: "All jury duty emails" });
  for (const control of screen.getAllByRole("switch")) {
    expect(control.closest("label")).toHaveClass(
      "data-focus-visible:outline-2",
      "data-focus-visible:outline-offset-2",
      "data-focus-visible:outline-klerosUIComponentsPrimaryBlue",
      "rounded-full",
    );
  }
});
