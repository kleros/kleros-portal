import { useAtlasProvider } from "@kleros/kleros-app";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { connect, disconnect } from "@wagmi/core";
import { afterEach, expect, it, vi } from "vitest";

import { atlasQueryKeys } from "@/lib/atlas/queryKeys";
import { wagmiConfig } from "@/lib/web3/wagmi";

import { ADDRESS, SESSION_NOW, storeSession } from "@/test/jwt";
import { data } from "@/test/network";
import { renderWithQuery } from "@/test/render";

import { AccountMenu } from "../../wallet/AccountMenu";
import Web3Providers from "../Web3Providers";

vi.mock("@/lib/web3/appkit", () => ({ getAppKit: vi.fn() }));
vi.mock("@/lib/web3/test-wallet", () => ({ installTestWallet: vi.fn() }));
vi.mock("@reown/appkit/react", () => ({ useAppKit: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/web3/wagmi", async () => {
  const { createConfig, http } = await import("wagmi");
  const { mainnet } = await import("wagmi/chains");
  const { mock } = await import("wagmi/connectors");
  return {
    wagmiConfig: createConfig({
      chains: [mainnet],
      transports: { [mainnet.id]: http() },
      connectors: [mock({ accounts: ["0xabcdef0000000000000000000000000000001234"] })],
      ssr: true,
    }),
  };
});

function SessionStatus() {
  const atlas = useAtlasProvider();
  return <output>{atlas.isVerified ? "Verified" : "Signature required"}</output>;
}

afterEach(async () => {
  await disconnect(wagmiConfig);
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("requires a new signature after signing out and reconnecting the same wallet", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SESSION_NOW);
  await storeSession();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => data({ user: null })),
  );
  const connector = wagmiConfig.connectors[0]!;
  const { client } = renderWithQuery(
    <Web3Providers>
      <AccountMenu />
      <SessionStatus />
    </Web3Providers>,
  );
  await act(async () => {
    await connect(wagmiConfig, { connector });
  });
  await waitFor(() => expect(screen.getByText("Verified")).toBeVisible());
  client.setQueryData(atlasQueryKeys.subscriptions(ADDRESS), [
    { product: "CourtV2", topic: "JurorDraw", enabled: true },
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Connect wallet" })).toBeVisible());
  await act(async () => {
    await connect(wagmiConfig, { connector });
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible());
  expect(screen.getByText("Signature required")).toBeVisible();
  expect(sessionStorage.getItem("authToken")).toBeNull();
  expect(client.getQueryData(atlasQueryKeys.user)).toBeUndefined();
  expect(client.getQueryData(atlasQueryKeys.subscriptions(ADDRESS))).toBeUndefined();
});
