"use client";

import { StatusIcon, type StatusIconName } from "@/components/ui/StatusIcon";

import { useSaveStatus, type SaveStatus } from "../hooks/useSaveStatus";

const VIEW: Record<SaveStatus, { icon: StatusIconName; text: string }> = {
  idle: { icon: "info", text: "Changes save as you go" },
  saving: { icon: "sync", text: "Saving…" },
  saved: { icon: "success", text: "Saved" },
  error: { icon: "error", text: "Not saved. Try again" },
};

/** Custom: the library has no inline status chip. */
export function SaveStatusPill() {
  const status = useSaveStatus();
  const { icon, text } = VIEW[status];

  return (
    <p
      role="status"
      aria-live="polite"
      className="bg-klerosUIComponentsLightGrey rounded-base flex w-[232px] shrink-0 items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap"
    >
      <StatusIcon name={icon} />
      {text}
    </p>
  );
}
