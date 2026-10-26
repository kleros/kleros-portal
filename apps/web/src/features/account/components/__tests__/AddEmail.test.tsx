import { useAtlasProvider } from "@kleros/kleros-app";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { data, deferred, failure, stubAtlasFetch } from "@/test/network";
import { SHOWN } from "@/test/queries";
import { renderWithQuery } from "@/test/render";

import { AddEmail } from "../AddEmail";

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

it("requires a valid email and sends one addUser request", async () => {
  const response = deferred<Response>();
  const { requests } = stubAtlasFetch(() => response.promise);
  renderWithQuery(<AddEmail />);
  expect(screen.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Save email" }));
  expect(screen.getByText("Enter a valid email address", SHOWN)).toBeVisible();
  const input = screen.getByRole("textbox", { name: "Email address" });
  await userEvent.type(input, "reader@example");
  await userEvent.click(screen.getByRole("button", { name: "Save email" }));
  expect(atlas.addUser).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
  await userEvent.clear(input);
  await userEvent.type(input, "reader+court@example.com");
  expect(screen.queryByText("Enter a valid email address", SHOWN)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save email" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(input).toBeDisabled();
  expect(atlas.addUser).toHaveBeenCalledExactlyOnceWith({ email: "reader+court@example.com" });
  await act(async () => response.resolve(data({ addUser: true })));
  expect(await screen.findByRole("button", { name: "Save email" })).toBeEnabled();
  expect(requests).toEqual([
    { operationName: "AddUser", variables: { settings: { email: "reader+court@example.com", product: "CourtV2" } } },
  ]);
});

it("shows an Atlas add error without discarding the draft", async () => {
  const { requests } = stubAtlasFetch(() => failure("Address is already registered"));
  renderWithQuery(<AddEmail />);
  await userEvent.type(screen.getByRole("textbox", { name: "Email address" }), "reader@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Save email" }));
  expect(await screen.findByText("Address is already registered", SHOWN)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue("reader@example.com");
  expect(requests).toEqual([
    { operationName: "AddUser", variables: { settings: { email: "reader@example.com", product: "CourtV2" } } },
  ]);
});

it("treats the provider's false result as an ended session", async () => {
  atlas.addUser.mockResolvedValue(false);
  renderWithQuery(<AddEmail />);
  await userEvent.type(screen.getByRole("textbox", { name: "Email address" }), "reader@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Save email" }));
  expect(await screen.findByText("Your session ended. Sign in again.", SHOWN)).toBeVisible();
  expect(atlas.addUser).toHaveBeenCalledExactlyOnceWith({ email: "reader@example.com" });
});
