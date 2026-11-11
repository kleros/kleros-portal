import { connect, createConnector, disconnect } from "@wagmi/core";
import { getAddress, numberToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { DEFAULT_CHAIN } from "@/config/chains";

import { wagmiConfig } from "./wagmi";

export interface TestWalletOptions {
  /** The chain the wallet starts on; any id, including ones the portal does not list. */
  chainId?: number;
  /** Answer every signature request with EIP-1193's user-rejected error. */
  rejectSignatures?: boolean;
}

declare global {
  interface Window {
    /** Present only when enabled below; Playwright connects through it. */
    __connectTestWallet?: (privateKey: Hex, options?: TestWalletOptions) => Promise<void>;
  }
}

/**
 * Compiled out of production builds unless NEXT_PUBLIC_E2E_TEST_WALLET is "true" at build time, which only the
 * production-mode e2e run sets; CI fails a build that ships it without the flag.
 */
export const isTestWalletEnabled =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E_TEST_WALLET === "true";

const TEST_CONNECTOR_ID = "test-wallet";

/** EIP-1193 code for a request the user declined in their wallet. */
const USER_REJECTED = 4001;

/** A connector that signs locally with `privateKey`, so SIWE works without a chain node or wallet extension. */
const testConnector = (privateKey: Hex, options: TestWalletOptions = {}) => {
  const account = privateKeyToAccount(privateKey);
  let chainId: number = options.chainId ?? DEFAULT_CHAIN.id;

  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account.address];
        case "eth_chainId":
          return numberToHex(chainId);
        case "personal_sign":
          if (options.rejectSignatures) {
            throw Object.assign(new Error("User rejected the request."), { code: USER_REJECTED });
          }
          return account.signMessage({ message: { raw: (params as [Hex])[0] } });
        case "wallet_switchEthereumChain":
          chainId = Number((params as [{ chainId: Hex }])[0].chainId);
          return null;
        default:
          throw new Error(`test wallet: ${method} is not supported`);
      }
    },
  };

  return createConnector((config) => ({
    id: TEST_CONNECTOR_ID,
    name: "Test wallet",
    type: "test",
    async connect<withCapabilities extends boolean = false>(parameters?: {
      chainId?: number;
      withCapabilities?: withCapabilities;
    }) {
      if (parameters?.chainId) chainId = parameters.chainId;
      const accounts = [account.address];
      return {
        accounts: (parameters?.withCapabilities
          ? accounts.map((address) => ({ address, capabilities: {} }))
          : accounts) as never,
        chainId,
      };
    },
    async disconnect() {},
    async getAccounts() {
      return [getAddress(account.address)];
    },
    async getChainId() {
      return chainId;
    },
    async getProvider() {
      return provider;
    },
    async isAuthorized() {
      return true;
    },
    async switchChain({ chainId: next }) {
      chainId = next;
      const chain = config.chains.find((each) => each.id === next);
      if (!chain) throw new Error(`test wallet: chain ${next} is not configured`);
      config.emitter.emit("change", { chainId: next });
      return chain;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
};

export const connectTestWallet = async (privateKey: Hex, options?: TestWalletOptions) => {
  for (const stale of wagmiConfig.connectors.filter((connector) => connector.id === TEST_CONNECTOR_ID)) {
    await disconnect(wagmiConfig, { connector: stale }).catch(() => {});
  }
  const connector = wagmiConfig._internal.connectors.setup(testConnector(privateKey, options));
  wagmiConfig._internal.connectors.setState((connectors) => [
    ...connectors.filter((existing) => existing.id !== TEST_CONNECTOR_ID),
    connector,
  ]);
  await connect(wagmiConfig, { connector });
};

export const installTestWallet = () => {
  if (!isTestWalletEnabled || typeof window === "undefined") return;
  window.__connectTestWallet = connectTestWallet;
};
