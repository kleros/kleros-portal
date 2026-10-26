import { arbitrum, gnosis, mainnet, type AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "viem";
import { cookieStorage, createStorage } from "wagmi";

import { env } from "@/config/env";

/** The order AppKit offers them in; the first is the default. */
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [arbitrum, mainnet, gnosis];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: env.REOWN_PROJECT_ID,
  transports: {
    [arbitrum.id]: http(),
    [mainnet.id]: http(),
    [gnosis.id]: http(),
  },
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
