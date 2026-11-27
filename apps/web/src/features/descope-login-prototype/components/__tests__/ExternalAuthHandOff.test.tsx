/**
 * PROTOTYPE, throwaway. The navigation to Descope's redirect is not observable under jsdom; the route and the
 * browser fetcher are covered in their own suites.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useAtlasSession } from "@/hooks/useAtlasSession";
import { renderWithQuery } from "@/test/render";

import { ExternalAuthHandOff } from "../ExternalAuthHandOff";

vi.mock("@/hooks/useAtlasSession", () => ({ useAtlasSession: vi.fn() }));

const ADDRESS = "0xabcdef0000000000000000000000000000001234";

beforeEach(() => {
  vi.mocked(useAtlasSession).mockReturnValue({ address: ADDRESS, token: "eyJh.eyJz.c2ln", isSignedIn: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("names the signed-in wallet before handing it over", () => {
  renderWithQuery(<ExternalAuthHandOff externalAuthReqId="req-1" />);

  expect(screen.getByRole("heading", { name: "Continue to your agent" })).toBeVisible();
  expect(screen.getByText(ADDRESS)).toBeVisible();
});

it("shows the route's refusal and lets the user try again", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: "descope_rejected", message: "Start again from your agent." } },
          { status: 502 },
        ),
      ),
  );
  renderWithQuery(<ExternalAuthHandOff externalAuthReqId="req-1" />);

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Start again from your agent.");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});

it("holds the button while the hand-off is in flight", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(() => new Promise(() => {})),
  );
  renderWithQuery(<ExternalAuthHandOff externalAuthReqId="req-1" />);

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByRole("button", { name: "Handing over…" })).toBeDisabled();
});

it("offers nothing to press without an Atlas token", () => {
  vi.mocked(useAtlasSession).mockReturnValue({ address: ADDRESS, token: undefined, isSignedIn: false });
  renderWithQuery(<ExternalAuthHandOff externalAuthReqId="req-1" />);

  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
});
