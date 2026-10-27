"use client";

import { useEffect, useRef, useState } from "react";

import { useAtlasProvider } from "@kleros/kleros-app";
import { useQueryClient } from "@tanstack/react-query";
import { isAddress } from "viem";

import { atlasQueryKeys } from "@/lib/atlas/queryKeys";

export type ConfirmationOutcome = "confirmed" | "expired" | "invalid" | "error";

/** Maps Atlas's confirmEmail answer to what the page says. */
export function outcomeOf(result: {
  isConfirmed: boolean;
  isTokenExpired: boolean;
  isTokenInvalid: boolean;
  isError: boolean;
}): ConfirmationOutcome {
  if (result.isConfirmed) return "confirmed";
  if (result.isError) return "error";
  if (result.isTokenExpired) return "expired";
  return "invalid";
}

export function useEmailConfirmation(address?: string, token?: string) {
  const queryClient = useQueryClient();
  const { confirmEmail } = useAtlasProvider();
  const [outcome, setOutcome] = useState<ConfirmationOutcome | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Confirmation tokens are single-use.
    if (started.current) return;
    started.current = true;

    if (!address || !isAddress(address) || !token) {
      setOutcome("invalid");
      return;
    }
    confirmEmail({ address, token })
      .then((result) => {
        const next = outcomeOf(result);
        if (next === "confirmed") void queryClient.invalidateQueries({ queryKey: atlasQueryKeys.user });
        setOutcome(next);
      })
      .catch(() => setOutcome("error"));
  }, [address, token, confirmEmail, queryClient]);

  return outcome;
}
