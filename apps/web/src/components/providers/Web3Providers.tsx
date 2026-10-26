"use client";

import { useEffect, type ReactNode } from "react";

import { AtlasProvider } from "@kleros/kleros-app";
import { WagmiProvider } from "wagmi";

import { getAppKit } from "@/lib/web3/appkit";
import { installTestWallet } from "@/lib/web3/test-wallet";
import { wagmiConfig } from "@/lib/web3/wagmi";

import { SIGNUP_PRODUCT } from "@/config/atlas";
import { env } from "@/config/env";

export default function Web3Providers({ children }: { children: ReactNode }) {
  getAppKit();

  useEffect(installTestWallet, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <AtlasProvider config={{ uri: env.ATLAS_URI, signupProduct: SIGNUP_PRODUCT, wagmiConfig }}>
        {children}
      </AtlasProvider>
    </WagmiProvider>
  );
}
