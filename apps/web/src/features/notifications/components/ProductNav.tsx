"use client";

import Link from "next/link";

import { cn } from "@/utils/cn";

import { paths } from "@/config/paths";

import { productCopy } from "../model/copy";
import { countOn, type ProductSettings } from "../model/settings";

export const countLabel = (on: number, total: number) => (on === 0 ? "Nothing on" : `${on} of ${total} on`);

/** Custom: the library has no navigation list. A link per product, so a product can be linked to. */
export function ProductNav({ settings, selected }: { settings: readonly ProductSettings[]; selected: string }) {
  return (
    <nav aria-label="Products">
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {settings.map((entry) => {
          const active = entry.product === selected;
          return (
            <li key={entry.product} className="shrink-0 lg:shrink">
              <Link
                href={paths.notifications.getHref(entry.product)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-base flex min-w-[148px] flex-col gap-0.5 border px-3 py-2.5",
                  active
                    ? "border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsWhiteBackground"
                    : "bg-klerosUIComponentsWhiteBackground hover:border-klerosUIComponentsSecondaryText border-klerosUIComponentsStroke",
                )}
              >
                <span className={cn("text-sm", active ? "font-semibold" : "font-medium")}>
                  {productCopy(entry.product).name}
                </span>
                <span className="text-klerosUIComponentsSecondaryText text-xs tabular-nums">
                  {countLabel(countOn(entry.topics), entry.topics.length)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
