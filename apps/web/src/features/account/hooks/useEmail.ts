"use client";

import { useAtlasProvider } from "@kleros/kleros-app";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { atlasErrorMessage } from "@/lib/atlas/client";
import { atlasQueryKeys } from "@/lib/atlas/queryKeys";

import { cooldownUntil, normaliseEmail } from "../model/email";

/** kleros-app resolves false, rather than throwing, when the session is gone. */
const orThrow = (ok: boolean) => {
  if (!ok) throw new Error("Your session ended. Sign in again.");
  return ok;
};

/** The signed-in address's email and the writes that change it. */
export function useEmail() {
  const queryClient = useQueryClient();
  const atlas = useAtlasProvider();
  const email = atlas.user?.email || null;

  // a new or removed user starts from Atlas's defaults, so cached preferences are stale either way
  const resetPreferences = () => queryClient.invalidateQueries({ queryKey: atlasQueryKeys.allSubscriptions });

  const add = useMutation({
    mutationFn: async (value: string) => orThrow(await atlas.addUser({ email: normaliseEmail(value) })),
    onSuccess: resetPreferences,
  });

  const change = useMutation({
    mutationFn: async (value: string) => orThrow(await atlas.updateEmail({ newEmail: normaliseEmail(value) })),
  });

  /** Atlas re-sends the confirmation when the same address is submitted again. */
  const resend = useMutation({
    mutationFn: async () => {
      if (!email) throw new Error("There is no email to confirm.");
      return orThrow(await atlas.updateEmail({ newEmail: email }));
    },
  });

  const remove = useMutation({
    mutationFn: async () => orThrow(await atlas.deleteUser()),
    onSuccess: resetPreferences,
  });

  return {
    email,
    isVerified: Boolean(atlas.user?.isEmailVerified),
    isLoading: atlas.isFetchingUser,
    cooldownUntil: cooldownUntil(atlas.user?.emailUpdateableAt),
    add,
    change,
    resend,
    remove,
    errorMessage: atlasErrorMessage,
  };
}
