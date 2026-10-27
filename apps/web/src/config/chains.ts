import { arbitrum } from "viem/chains";

/**
 * The portal sends no transactions; a chain is only the `chainId` in the SIWE message. Arbitrum One
 * is Court V2's chain; src/lib/web3/wagmi.ts lists the networks a wallet may sign on.
 */
export const DEFAULT_CHAIN = arbitrum;
