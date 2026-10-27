"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AtlasProvider } from "@kleros/kleros-app";
import { WagmiProvider } from "wagmi";

import { getAppKit } from "@/lib/web3/appkit";
import { installTestWallet } from "@/lib/web3/test-wallet";
import { wagmiConfig } from "@/lib/web3/wagmi";

import { SIGNUP_PRODUCT } from "@/config/atlas";
import { env } from "@/config/env";

import { useSessionSignOut } from "@/hooks/useSessionSignOut";

import { SessionContext } from "./SessionContext";

export default function Web3Providers({ children }: { children: ReactNode }) {
  getAppKit();
  const [session, setSession] = useState(0);
  const signOut = useSessionSignOut(() => setSession((value) => value + 1));

  useEffect(installTestWallet, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <SessionContext.Provider value={signOut}>
        <AtlasProvider key={session} config={{ uri: env.ATLAS_URI, signupProduct: SIGNUP_PRODUCT, wagmiConfig }}>
          {children}
        </AtlasProvider>
      </SessionContext.Provider>
    </WagmiProvider>
  );
}
