"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { atlasClient, atlasErrorMessage } from "@/lib/atlas/client";

import { useAtlasSession } from "@/hooks/useAtlasSession";

import { subscriptionsQueryKey } from "./useNotificationSettings";
import { patchRows, updateTopicsMutationKey } from "./useUpdateTopics";
import { fetchSubscriptions, updateSubscriptions } from "../api/notifications";
import { buildSettings, productsWithAnyOn, setAll, type ProductSettings, type Subscription } from "../model/settings";

export const turnOffAllMutationKey = ["turnOffAllEmails"] as const;

export interface TurnOffFailure {
  product: string;
  message: string;
}

export type TurnOffState =
  { status: "idle" } | { status: "running" } | { status: "done" } | { status: "partial"; failures: TurnOffFailure[] };

function waitForTopicWrites(queryClient: QueryClient): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (queryClient.isMutating({ mutationKey: updateTopicsMutationKey }) === 0) {
        unsubscribe();
        resolve();
      }
    };
    const unsubscribe = queryClient.getMutationCache().subscribe(check);
    check();
  });
}

/** Bulk writes wait for topic mutations and verify the server's final subscriptions. */
export function useTurnOffAll(settings: readonly ProductSettings[]) {
  const queryClient = useQueryClient();
  const { address, token } = useAtlasSession();
  const mutation = useMutation({
    mutationKey: turnOffAllMutationKey,
    mutationFn: async (): Promise<TurnOffState> => {
      if (!token) return { status: "partial", failures: [{ product: "", message: "Sign in again to save changes." }] };
      await waitForTopicWrites(queryClient);
      const key = subscriptionsQueryKey(address);
      const failures: TurnOffFailure[] = [];
      const catalogue = settings.flatMap((entry) =>
        entry.topics.map((topic) => ({
          product: entry.product,
          topic: topic.topic,
          defaultEnabled: topic.enabled,
        })),
      );
      const current = buildSettings(catalogue, queryClient.getQueryData<Subscription[] | null>(key) ?? []);

      for (const entry of productsWithAnyOn(current)) {
        const changes = setAll(entry.topics, false);
        try {
          await updateSubscriptions(atlasClient(token), entry.product, changes);
          queryClient.setQueryData<Subscription[] | null>(
            key,
            (rows) => rows && patchRows(rows, entry.product, changes),
          );
        } catch (error) {
          failures.push({ product: entry.product, message: atlasErrorMessage(error) });
        }
      }

      try {
        await queryClient.cancelQueries({ queryKey: key });
        await queryClient.invalidateQueries({ queryKey: key, refetchType: "none" });
        const rows = await queryClient.fetchQuery({
          queryKey: key,
          queryFn: () => fetchSubscriptions(atlasClient(token)),
          staleTime: 0,
        });
        if (!rows) throw new Error("Could not verify email preferences. Try again.");
        for (const product of new Set(rows.filter((row) => row.enabled).map((row) => row.product))) {
          if (!failures.some((failure) => failure.product === product)) {
            failures.push({ product, message: "Some emails are still on. Try again." });
          }
        }
      } catch (error) {
        failures.push({ product: "", message: atlasErrorMessage(error) });
      }
      return failures.length === 0 ? { status: "done" } : { status: "partial", failures };
    },
  });

  const state: TurnOffState = mutation.isPending ? { status: "running" } : (mutation.data ?? { status: "idle" });
  return {
    state,
    run: async () => {
      await mutation.mutateAsync();
    },
    reset: mutation.reset,
  };
}
