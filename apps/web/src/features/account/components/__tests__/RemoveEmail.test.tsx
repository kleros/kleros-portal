import { useAtlasProvider } from "@kleros/kleros-app";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { data, deferred, failure, stubAtlasFetch } from "@/test/network";
import { renderWithQuery } from "@/test/render";

import { RemoveEmail } from "../RemoveEmail";

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

it("opens a confirmation dialog and Keep my email closes without deleting", async () => {
  const { requests } = stubAtlasFetch(() => {
    throw new Error("Cancellation must not delete");
  });
  renderWithQuery(<RemoveEmail />);
  await userEvent.click(screen.getByRole("button", { name: "Remove email" }));
  const dialog = screen.getByRole("dialog", { name: "Remove your email" });
  expect(within(dialog).getByRole("heading", { name: "Remove your email?" })).toBeVisible();
  await userEvent.click(within(dialog).getByRole("button", { name: "Keep my email" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Remove email" })).toBeEnabled();
  expect(atlas.deleteUser).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});

it("deletes once after confirmation and closes only after success", async () => {
  const response = deferred<Response>();
  const { requests } = stubAtlasFetch(() => response.promise);
  renderWithQuery(<RemoveEmail />);
  await userEvent.click(screen.getByRole("button", { name: "Remove email" }));
  const dialog = screen.getByRole("dialog", { name: "Remove your email" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove email" }));
  expect(atlas.deleteUser).toHaveBeenCalledExactlyOnceWith();
  expect(within(dialog).getByRole("button", { name: "Removing…" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Keep my email" })).toBeDisabled();
  await act(async () => response.resolve(data({ deleteUser: true })));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(requests).toEqual([{ operationName: "DeleteUser", variables: {} }]);
});

it("keeps a failed deletion visible in the open dialog", async () => {
  const { requests } = stubAtlasFetch(() => failure("Unable to remove email"));
  renderWithQuery(<RemoveEmail />);
  await userEvent.click(screen.getByRole("button", { name: "Remove email" }));
  const dialog = screen.getByRole("dialog", { name: "Remove your email" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove email" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to remove email");
  expect(within(dialog).getByRole("button", { name: "Remove email" })).toBeEnabled();
  expect(requests).toEqual([{ operationName: "DeleteUser", variables: {} }]);
});

it("allows Escape to dismiss the confirmation before a removal starts", async () => {
  const { requests } = stubAtlasFetch(() => data({ deleteUser: true }));
  renderWithQuery(<RemoveEmail />);
  await userEvent.click(screen.getByRole("button", { name: "Remove email" }));
  expect(screen.getByRole("dialog", { name: "Remove your email" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(requests).toEqual([]);
  expect(screen.getByRole("button", { name: "Remove email" })).toBeEnabled();
});

it("keeps the pending removal dialog open when Escape is pressed", async () => {
  const response = deferred<Response>();
  stubAtlasFetch(() => response.promise);
  renderWithQuery(<RemoveEmail />);
  await userEvent.click(screen.getByRole("button", { name: "Remove email" }));
  const dialog = screen.getByRole("dialog", { name: "Remove your email" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove email" }));
  await within(dialog).findByRole("button", { name: "Removing…" });
  await userEvent.click(dialog);
  expect(dialog).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(dialog).toBeVisible();
  await act(async () => response.resolve(failure("Removal failed")));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Removal failed");
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("dismisses the confirmation when clicking outside before a removal starts", async () => {
  const { requests } = stubAtlasFetch(() => data({ deleteUser: true }));
  renderWithQuery(<RemoveEmail />);
  await userEvent.click(screen.getByRole("button", { name: "Remove email" }));
  expect(screen.getByRole("dialog", { name: "Remove your email" })).toBeVisible();
  await userEvent.click(document.body);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(requests).toEqual([]);
});
