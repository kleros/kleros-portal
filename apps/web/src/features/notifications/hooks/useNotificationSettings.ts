"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { atlasClient } from "@/lib/atlas/client";
import { atlasQueryKeys } from "@/lib/atlas/queryKeys";

import { useAtlasSession } from "@/hooks/useAtlasSession";

import { fetchSubscriptions, fetchTopics } from "../api/notifications";
import { buildSettings, type ProductSettings } from "../model/settings";

export const topicsQueryKey = atlasQueryKeys.topics;
export const subscriptionsQueryKey = atlasQueryKeys.subscriptions;

export type NotificationSettingsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  /** Signed in, but Atlas has no user for this address yet: an email comes first. */
  | { status: "no-user" }
  | { status: "ready"; settings: ProductSettings[] };

export function useNotificationSettings(): NotificationSettingsState {
  const { address, token } = useAtlasSession();

  const topics = useQuery({
    queryKey: topicsQueryKey,
    queryFn: () => fetchTopics(atlasClient()),
    staleTime: Infinity,
  });

  const subscriptions = useQuery({
    queryKey: subscriptionsQueryKey(address),
    queryFn: () => fetchSubscriptions(atlasClient(token)),
    enabled: Boolean(token),
  });

  return useMemo((): NotificationSettingsState => {
    if (topics.isError || subscriptions.isError) {
      return {
        status: "error",
        retry: () => {
          if (topics.isError) void topics.refetch();
          if (subscriptions.isError) void subscriptions.refetch();
        },
      };
    }
    if (!topics.data || subscriptions.data === undefined) return { status: "loading" };
    if (subscriptions.data === null) return { status: "no-user" };
    return { status: "ready", settings: buildSettings(topics.data, subscriptions.data) };
  }, [topics, subscriptions]);
}
