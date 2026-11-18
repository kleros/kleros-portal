import { arbitrum } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";

import { env } from "@/config/env";
import { siteConfig } from "@/config/site";

import { networks, wagmiAdapter } from "./wagmi";

let instance: ReturnType<typeof createAppKit> | undefined;

export const getAppKit = () =>
  (instance ??= createAppKit({
    adapters: [wagmiAdapter],
    networks,
    defaultNetwork: arbitrum,
    projectId: env.REOWN_PROJECT_ID,
    metadata: {
      name: siteConfig.name,
      description: siteConfig.description,
      // wallets compare this with the page origin; the server render never reaches a wallet
      url: env.SITE_URL ?? (typeof window === "undefined" ? "http://localhost:3000" : window.location.origin),
      icons: [],
    },
    enableCoinbase: false,
    enableBaseAccount: false,
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
    },
  }));
