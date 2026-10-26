import { arbitrum, gnosis, mainnet } from "viem/chains";

/**
 * The portal sends no transactions; a chain is only the `chainId` in the SIWE message,
 * which Atlas accepts from any of these. Arbitrum One is Court V2's chain.
 */
export const SUPPORTED_CHAINS = [arbitrum, mainnet, gnosis] as const;

export const DEFAULT_CHAIN = arbitrum;

export const isSupportedChain = (chainId: number | undefined) => SUPPORTED_CHAINS.some((chain) => chain.id === chainId);
