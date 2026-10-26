"use client";

import { useMemo } from "react";

import { useAtlasProvider } from "@kleros/kleros-app";
import { useAccount } from "wagmi";

import { readAuthToken } from "@/lib/atlas/session";

/** The connected address and, once signed in, the JWT that authorises Atlas calls for it. */
export function useAtlasSession() {
  const { address } = useAccount();
  const { isVerified } = useAtlasProvider();

  const token = useMemo(() => (isVerified ? readAuthToken(address) : undefined), [address, isVerified]);

  return { address, token, isSignedIn: Boolean(token) };
}
