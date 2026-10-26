import { StrictMode } from "react";

import { useAtlasProvider } from "@kleros/kleros-app";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { ADDRESS } from "@/test/jwt";
import { data, deferred, failure, stubAtlasFetch } from "@/test/network";

import { EmailConfirmation, outcomeOf } from "../EmailConfirmation";

vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));
let atlas: ReturnType<typeof testAtlas>;
beforeEach(() => {
  atlas = testAtlas();
  vi.mocked(useAtlasProvider).mockReturnValue(atlas);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outcomeOf", () => {
  it.each([
    [false, false, false, false, "invalid"],
    [false, false, false, true, "error"],
    [false, false, true, false, "invalid"],
    [false, false, true, true, "error"],
    [false, true, false, false, "expired"],
    [false, true, false, true, "error"],
    [false, true, true, false, "expired"],
    [false, true, true, true, "error"],
    [true, false, false, false, "confirmed"],
    [true, false, false, true, "confirmed"],
    [true, false, true, false, "confirmed"],
    [true, false, true, true, "confirmed"],
    [true, true, false, false, "confirmed"],
    [true, true, false, true, "confirmed"],
    [true, true, true, false, "confirmed"],
    [true, true, true, true, "confirmed"],
  ] as const)(
    "confirmed=%s expired=%s invalid=%s error=%s => %s",
    (isConfirmed, isTokenExpired, isTokenInvalid, isError, expected) => {
      expect(outcomeOf({ isConfirmed, isTokenExpired, isTokenInvalid, isError })).toBe(expected);
    },
  );
});

it.each([
  {},
  { address: ADDRESS },
  { token: "confirmation-token" },
  { address: "invalid", token: "confirmation-token" },
  { address: ADDRESS, token: "" },
])("shows an invalid link without contacting Atlas for %j", (props) => {
  const { requests } = stubAtlasFetch(() => {
    throw new Error("Invalid link must not reach Atlas");
  });
  render(<EmailConfirmation {...props} />);
  expect(screen.getByRole("heading", { name: "This link does not work" })).toBeVisible();
  expect(atlas.confirmEmail).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});

it("confirms exactly once under StrictMode, including rerenders during an outstanding request", async () => {
  const response = deferred<Response>();
  const { requests } = stubAtlasFetch(() => response.promise);
  const view = render(
    <StrictMode>
      <EmailConfirmation address={ADDRESS} token="confirmation-token" />
    </StrictMode>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Confirming your email…");
  view.rerender(
    <StrictMode>
      <EmailConfirmation address={ADDRESS} token="confirmation-token" />
    </StrictMode>,
  );
  expect(atlas.confirmEmail).toHaveBeenCalledExactlyOnceWith({ address: ADDRESS, token: "confirmation-token" });
  await act(async () =>
    response.resolve(data({ confirmEmail: { isConfirmed: true, isTokenExpired: false, isTokenInvalid: false } })),
  );
  expect(await screen.findByRole("heading", { name: "Your email is confirmed" })).toBeVisible();
  expect(screen.getByText("Kleros products can now email you. Choose what each one sends.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Choose notifications" })).not.toHaveAttribute("target");
  expect(screen.getByRole("link", { name: "Choose notifications" })).toHaveAttribute("href", "/notifications");
  expect(requests).toEqual([
    { operationName: "ConfirmEmail", variables: { address: ADDRESS, token: "confirmation-token" } },
  ]);
});

it.each([
  [
    { isConfirmed: false, isTokenExpired: true, isTokenInvalid: false },
    "This link has expired",
    "Links work for 2 days. Sign in and send yourself a new one.",
  ],
  [
    { isConfirmed: false, isTokenExpired: false, isTokenInvalid: true },
    "This link does not work",
    "It may have been replaced by a newer one. Use the latest email, or send a new link.",
  ],
])("renders the server outcome %j", async (result, title, body) => {
  const { requests } = stubAtlasFetch(() => data({ confirmEmail: result }));
  render(<EmailConfirmation address={ADDRESS} token="confirmation-token" />);
  expect(await screen.findByRole("heading", { name: title })).toBeVisible();
  expect(screen.getByText(body)).toBeVisible();
  const action = screen.getByRole("link", { name: "Send a new link" });
  expect(action).toHaveAttribute("href", "/notifications");
  expect(action).not.toHaveAttribute("target");
  expect(requests).toEqual([
    { operationName: "ConfirmEmail", variables: { address: ADDRESS, token: "confirmation-token" } },
  ]);
});

it("shows the error title when Atlas fails", async () => {
  const { requests } = stubAtlasFetch(() => failure("Service unavailable"));
  render(<EmailConfirmation address={ADDRESS} token="confirmation-token" />);
  expect(await screen.findByRole("heading", { name: "We could not confirm your email" })).toBeVisible();
  expect(screen.getByText("Something went wrong on our side. Try the link again in a moment.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "https://t.me/kleros");
  expect(requests).toEqual([
    { operationName: "ConfirmEmail", variables: { address: ADDRESS, token: "confirmation-token" } },
  ]);
});

it("shows the error title for the provider's resolved isError flag", async () => {
  atlas.confirmEmail.mockResolvedValue({
    isConfirmed: false,
    isTokenExpired: false,
    isTokenInvalid: false,
    isError: true,
  });
  render(<EmailConfirmation address={ADDRESS} token="confirmation-token" />);
  expect(await screen.findByRole("heading", { name: "We could not confirm your email" })).toBeVisible();
  expect(atlas.confirmEmail).toHaveBeenCalledExactlyOnceWith({ address: ADDRESS, token: "confirmation-token" });
});
