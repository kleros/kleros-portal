"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useDisconnect } from "wagmi";

import { atlasQueryKeys } from "@/lib/atlas/queryKeys";
import { clearAuthToken } from "@/lib/atlas/session";
import { wagmiConfig } from "@/lib/web3/wagmi";

export function useSessionSignOut(resetProvider: () => void) {
  const queryClient = useQueryClient();
  const { disconnect } = useDisconnect({ config: wagmiConfig });
  return () => {
    clearAuthToken();
    disconnect();
    queryClient.removeQueries({ queryKey: atlasQueryKeys.user });
    queryClient.removeQueries({ queryKey: atlasQueryKeys.allSubscriptions });
    resetProvider();
  };
}
