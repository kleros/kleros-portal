"use client";

import { createContext, useContext } from "react";

export const SessionContext = createContext<(() => void) | null>(null);

export function useSignOut() {
  const signOut = useContext(SessionContext);
  if (!signOut) throw new Error("useSignOut requires Web3Providers");
  return signOut;
}
