import { useAtlasProvider } from "@kleros/kleros-app";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { SESSION_NOW } from "@/test/jwt";
import { data, deferred, failure, stubAtlasFetch } from "@/test/network";
import { SHOWN } from "@/test/queries";
import { renderWithQuery } from "@/test/render";

import { EmailCard } from "../EmailCard";

vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));
let atlas: ReturnType<typeof testAtlas>;
beforeEach(() => {
  atlas = testAtlas();
  vi.mocked(useAtlasProvider).mockReturnValue({
    ...atlas,
    user: { email: "reader@example.com", isEmailVerified: false, emailUpdateableAt: null },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("explains unconfirmed email delivery and resends to the same address", async () => {
  const response = deferred<Response>();
  const { requests } = stubAtlasFetch(() => response.promise);
  renderWithQuery(<EmailCard />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Confirm your email to start receiving notificationsWe sent a link to reader@example.com. Nothing is delivered until you open it; the link works for 2 days.",
  );
  expect(screen.getByText("Not confirmed", SHOWN)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Resend link" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(atlas.updateEmail).toHaveBeenCalledExactlyOnceWith({ newEmail: "reader@example.com" });
  await act(async () => response.resolve(data({ updateEmail: true })));
  expect(await screen.findByRole("button", { name: "Sent" })).toBeEnabled();
  expect(requests).toEqual([
    { operationName: "UpdateEmail", variables: { newEmail: "reader@example.com", product: "CourtV2" } },
  ]);
});

it("disables change and resend during cooldown and shows the exact time", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SESSION_NOW);
  vi.mocked(useAtlasProvider).mockReturnValue({
    ...atlas,
    user: { email: "reader@example.com", isEmailVerified: false, emailUpdateableAt: "2026-10-27T14:05:00Z" },
  });
  renderWithQuery(<EmailCard />);
  expect(screen.getByRole("button", { name: "Change email" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Resend link" })).toBeDisabled();
  expect(screen.getByText("You can change or resend again at 02:05 PM.", SHOWN)).toBeVisible();
});

it("validates a change, submits only a valid email and closes on success", async () => {
  const response = deferred<Response>();
  const { requests } = stubAtlasFetch(() => response.promise);
  renderWithQuery(<EmailCard />);
  await userEvent.click(screen.getByRole("button", { name: "Change email" }));
  const input = screen.getByRole("textbox", { name: "Email address" });
  expect(input).toHaveValue("reader@example.com");
  await userEvent.clear(input);
  await userEvent.type(input, "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: "Send confirmation" }));
  expect(screen.getByText("Enter a valid email address", SHOWN)).toBeVisible();
  expect(requests).toEqual([]);
  expect(atlas.updateEmail).not.toHaveBeenCalled();
  await userEvent.clear(input);
  await userEvent.type(input, "new@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Send confirmation" }));
  expect(atlas.updateEmail).toHaveBeenCalledExactlyOnceWith({ newEmail: "new@example.com" });
  expect(screen.getByRole("textbox", { name: "Email address" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await act(async () => response.resolve(data({ updateEmail: true })));
  expect(await screen.findByRole("button", { name: "Change email" })).toBeEnabled();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(requests).toEqual([
    { operationName: "UpdateEmail", variables: { newEmail: "new@example.com", product: "CourtV2" } },
  ]);
});

it("keeps a failed change open with Atlas's message", async () => {
  const { requests } = stubAtlasFetch(() => failure("Email is already registered"));
  renderWithQuery(<EmailCard />);
  await userEvent.click(screen.getByRole("button", { name: "Change email" }));
  await userEvent.click(screen.getByRole("button", { name: "Send confirmation" }));
  expect(await screen.findByText("Email is already registered", SHOWN)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue("reader@example.com");
  expect(requests).toEqual([
    { operationName: "UpdateEmail", variables: { newEmail: "reader@example.com", product: "CourtV2" } },
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Change email" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Change email" }));
  expect(screen.queryByText("Email is already registered", SHOWN)).not.toBeInTheDocument();
});

it("shows Atlas's error when resend fails", async () => {
  const { requests } = stubAtlasFetch(() => failure("Please wait before resending"));
  renderWithQuery(<EmailCard />);
  await userEvent.click(screen.getByRole("button", { name: "Resend link" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please wait before resending");
  expect(requests).toEqual([
    { operationName: "UpdateEmail", variables: { newEmail: "reader@example.com", product: "CourtV2" } },
  ]);
});

it("shows a confirmed email without a resend banner", () => {
  vi.mocked(useAtlasProvider).mockReturnValue({
    ...atlas,
    user: { email: "reader@example.com", isEmailVerified: true, emailUpdateableAt: null },
  });
  renderWithQuery(<EmailCard />);
  expect(screen.getByText("Confirmed", SHOWN)).toBeVisible();
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Change email"]);
});

it("renders no email card for a user without an email", () => {
  vi.mocked(useAtlasProvider).mockReturnValue(atlas);
  const { container } = renderWithQuery(<EmailCard />);
  expect(container).toBeEmptyDOMElement();
});

it("enables Change email exactly when the cooldown expires", () => {
  vi.useFakeTimers();
  vi.setSystemTime(SESSION_NOW);
  vi.mocked(useAtlasProvider).mockReturnValue({
    ...atlas,
    user: {
      email: "reader@example.com",
      isEmailVerified: false,
      emailUpdateableAt: new Date(SESSION_NOW.getTime() + 1000).toISOString(),
    },
  });
  renderWithQuery(<EmailCard />);
  act(() => vi.advanceTimersByTime(999));
  expect(screen.getByRole("button", { name: "Change email" })).toBeDisabled();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("button", { name: "Change email" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Resend link" })).toBeEnabled();
});
