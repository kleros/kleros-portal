"use client";

import { useMutationState } from "@tanstack/react-query";

import { updateTopicsMutationKey } from "./useUpdateTopics";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface SaveRecord {
  status: "idle" | "pending" | "success" | "error";
  submittedAt: number;
}

/** Saving while any write is in flight, else how the latest write ended. */
export function saveStatusOf(records: readonly SaveRecord[]): SaveStatus {
  if (records.some((record) => record.status === "pending")) return "saving";
  const latest = records.reduce<SaveRecord | undefined>(
    (last, record) => (!last || record.submittedAt >= last.submittedAt ? record : last),
    undefined,
  );
  if (latest?.status === "error") return "error";
  if (latest?.status === "success") return "saved";
  return "idle";
}

export function useSaveStatus(): SaveStatus {
  const records = useMutationState({
    filters: { mutationKey: updateTopicsMutationKey },
    select: (mutation) => ({ status: mutation.state.status, submittedAt: mutation.state.submittedAt }),
  });
  return saveStatusOf(records);
}
