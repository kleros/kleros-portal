"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { atlasClient } from "@/lib/atlas/client";

import { useAtlasSession } from "@/hooks/useAtlasSession";

import { subscriptionsQueryKey } from "./useNotificationSettings";
import { updateSubscriptions } from "../api/notifications";
import type { Subscription, TopicChange } from "../model/settings";

const failedSinceDrain = new Set<string>();

export function resetFailedTopicWrites() {
  failedSinceDrain.clear();
}

export const updateTopicsMutationKey = ["updateNotificationSubscriptions"] as const;

/** Rows with `changes` applied to `product`. */
export const patchRows = (rows: readonly Subscription[], product: string, changes: readonly TopicChange[]) => {
  const next = new Map(changes.map((change) => [change.topic, change.enabled]));
  return rows.map((row) => (row.product === product ? { ...row, enabled: next.get(row.topic) ?? row.enabled } : row));
};

/**
 * Saves `changes` for `product` at once and shows them before Atlas answers. Writes for one product
 * run in order, so a quick off-on cannot land out of order; a failed write puts back only its own topics.
 */
export function useUpdateTopics(product: string) {
  const queryClient = useQueryClient();
  const { address, token } = useAtlasSession();
  const key = subscriptionsQueryKey(address);

  return useMutation({
    mutationKey: [...updateTopicsMutationKey, product],
    scope: { id: `notificationSubscriptions:${product}` },
    mutationFn: async (changes: TopicChange[]) => {
      if (!token) throw new Error("Sign in again to save changes.");
      return updateSubscriptions(atlasClient(token), product, changes);
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: key });
      const rows = queryClient.getQueryData<Subscription[] | null>(key) ?? [];
      const previous = changes.map((change) => ({
        topic: change.topic,
        enabled: rows.find((row) => row.product === product && row.topic === change.topic)?.enabled ?? !change.enabled,
      }));
      queryClient.setQueryData<Subscription[] | null>(
        key,
        (current) => current && patchRows(current, product, changes),
      );
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (!context) return;
      queryClient.setQueryData<Subscription[] | null>(
        key,
        (current) => current && patchRows(current, product, context.previous),
      );
    },
    onSettled: (_data, error) => {
      if (error) failedSinceDrain.add(`${address}:${product}`);
      // An address-wide refetch must wait for optimistic writes across every product.
      if (queryClient.isMutating({ mutationKey: updateTopicsMutationKey }) <= 1 && failedSinceDrain.size > 0) {
        const addresses = new Set([...failedSinceDrain].map((entry) => entry.split(":")[0]));
        failedSinceDrain.clear();
        void Promise.all(
          [...addresses].map((failedAddress) =>
            queryClient.invalidateQueries({
              queryKey: subscriptionsQueryKey(failedAddress === "undefined" ? undefined : failedAddress),
            }),
          ),
        );
      }
    },
  });
}
