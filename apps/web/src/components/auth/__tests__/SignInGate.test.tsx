import { useAtlasProvider } from "@kleros/kleros-app";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRejectedRequestError } from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { testAtlas } from "@/test/atlas";
import { ADDRESS } from "@/test/jwt";
import { deferred } from "@/test/network";
import { SHOWN } from "@/test/queries";

import { SignInGate } from "../SignInGate";

const wallet = vi.hoisted(() => ({ address: undefined as string | undefined, open: vi.fn() }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: wallet.address }) }));
vi.mock("@reown/appkit/react", () => ({ useAppKit: () => ({ open: wallet.open }) }));
vi.mock("@kleros/kleros-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kleros/kleros-app")>()),
  useAtlasProvider: vi.fn(),
}));

let atlas: ReturnType<typeof testAtlas>;
beforeEach(() => {
  atlas = testAtlas();
  atlas.isVerified = false;
  wallet.address = ADDRESS;
  wallet.open.mockReset();
  vi.mocked(useAtlasProvider).mockReturnValue(atlas);
});
afterEach(() => vi.restoreAllMocks());
const gate = (
  <SignInGate>
    <h2>Private settings</h2>
  </SignInGate>
);

it("asks a disconnected user to connect and opens the wallet picker", async () => {
  wallet.address = undefined;
  render(gate);
  expect(screen.getByText("Connect the wallet you use on Court, Proof of Humanity or Foresight.", SHOWN)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  expect(wallet.open).toHaveBeenCalledExactlyOnceWith({ view: "Connect" });
  expect(atlas.authoriseUser).not.toHaveBeenCalled();
});

it("signs in once and disables the action while the wallet is waiting", async () => {
  const signing = deferred<void>();
  atlas.authoriseUser.mockReturnValue(signing.promise);
  const view = render(gate);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(atlas.authoriseUser).toHaveBeenCalledExactlyOnceWith();
  atlas.isSigningIn = true;
  view.rerender(
    <SignInGate>
      <h2>Private settings</h2>
    </SignInGate>,
  );
  expect(screen.getByRole("button", { name: "Waiting for your wallet…" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Waiting for your wallet…" }));
  expect(atlas.authoriseUser).toHaveBeenCalledTimes(1);
  await act(async () => signing.resolve());
});

it.each([
  [
    new UserRejectedRequestError(new Error("User denied message signature.")),
    "You declined the signature in your wallet.",
  ],
  [new Error("Nonce unavailable"), "Sign-in failed: Nonce unavailable"],
])("shows the appropriate failure for %s", async (error, message) => {
  atlas.authoriseUser.mockRejectedValue(error);
  render(gate);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText(message, SHOWN)).toHaveAttribute("role", "alert");
  expect(atlas.authoriseUser).toHaveBeenCalledExactlyOnceWith();
});

it("clears an old failure when sign-in is retried", async () => {
  atlas.authoriseUser.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(undefined);
  render(gate);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Sign-in failed: Offline", SHOWN)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  expect(atlas.authoriseUser).toHaveBeenCalledTimes(2);
});

it("shows only the children for a verified connected wallet", () => {
  atlas.isVerified = true;
  render(gate);
  expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Private settings"]);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("still requires a connection if Atlas has a stale verified flag", () => {
  atlas.isVerified = true;
  wallet.address = undefined;
  render(gate);
  expect(screen.getByRole("button", { name: "Connect wallet" })).toBeEnabled();
});
