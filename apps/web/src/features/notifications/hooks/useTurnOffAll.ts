"use client";

import { useCallback, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { atlasClient, atlasErrorMessage } from "@/lib/atlas/client";

import { useAtlasSession } from "@/hooks/useAtlasSession";

import { subscriptionsQueryKey } from "./useNotificationSettings";
import { patchRows } from "./useUpdateTopics";
import { updateSubscriptions } from "../api/notifications";
import { productsWithAnyOn, setAll, type ProductSettings, type Subscription } from "../model/settings";

export interface TurnOffFailure {
  product: string;
  message: string;
}

export type TurnOffState =
  { status: "idle" } | { status: "running" } | { status: "done" } | { status: "partial"; failures: TurnOffFailure[] };

/**
 * Turns every topic off, one Atlas call per product that has any on, in order. Atlas has no
 * cross-product write, so a failure leaves the products before it off; `run` again retries what is left.
 */
export function useTurnOffAll(settings: readonly ProductSettings[]) {
  const queryClient = useQueryClient();
  const { address, token } = useAtlasSession();
  const [state, setState] = useState<TurnOffState>({ status: "idle" });

  const run = useCallback(async () => {
    if (!token) {
      setState({ status: "partial", failures: [{ product: "", message: "Sign in again to save changes." }] });
      return;
    }
    setState({ status: "running" });
    const key = subscriptionsQueryKey(address);
    const failures: TurnOffFailure[] = [];

    for (const entry of productsWithAnyOn(settings)) {
      const changes = setAll(entry.topics, false);
      try {
        await updateSubscriptions(atlasClient(token), entry.product, changes);
        queryClient.setQueryData<Subscription[] | null>(
          key,
          (current) => current && patchRows(current, entry.product, changes),
        );
      } catch (error) {
        failures.push({ product: entry.product, message: atlasErrorMessage(error) });
      }
    }

    setState(failures.length === 0 ? { status: "done" } : { status: "partial", failures });
  }, [address, queryClient, settings, token]);

  return { state, run, reset: () => setState({ status: "idle" }) };
}
