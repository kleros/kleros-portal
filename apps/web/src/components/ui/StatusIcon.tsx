import ErrorIcon from "@/assets/svgs/error.svg";
import InfoIcon from "@/assets/svgs/info.svg";
import SuccessIcon from "@/assets/svgs/success.svg";
import SyncIcon from "@/assets/svgs/sync.svg";
import WarningIcon from "@/assets/svgs/warning.svg";

import { cn } from "@/utils/cn";

/** The library's status artwork; the library exports no icon component. */
const ICONS = {
  success: { Icon: SuccessIcon, className: "fill-klerosUIComponentsSuccess" },
  warning: { Icon: WarningIcon, className: "fill-klerosUIComponentsWarning" },
  error: { Icon: ErrorIcon, className: "fill-klerosUIComponentsError" },
  info: { Icon: InfoIcon, className: "fill-klerosUIComponentsSecondaryText" },
  sync: { Icon: SyncIcon, className: "fill-klerosUIComponentsWarning motion-safe:animate-spin" },
} as const;

export type StatusIconName = keyof typeof ICONS;

export function StatusIcon({ name, className }: { name: StatusIconName; className?: string }) {
  const { Icon, className: tone } = ICONS[name];
  return <Icon aria-hidden focusable={false} className={cn("size-4 shrink-0", tone, className)} />;
}
