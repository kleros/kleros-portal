"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/wallet/AccountMenu";

import KlerosMark from "@/assets/svgs/kleros-mark.svg";

import { cn } from "@/utils/cn";

import { paths } from "@/config/paths";
import { siteConfig } from "@/config/site";

import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { label: "Notifications", href: paths.notifications.getHref(), soon: false },
  { label: "API keys", href: paths.apiKeys.getHref(), soon: true },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground border-b">
        {/* below sm the nav takes a second row, so the account controls keep their room at 320px */}
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:h-16 sm:flex-nowrap sm:py-0 sm:px-6">
          <Link href={paths.home.getHref()} className="flex shrink-0 items-center gap-2.5">
            <KlerosMark
              aria-hidden
              className="fill-klerosUIComponentsPrimaryPurple dark:fill-klerosUIComponentsPrimaryText size-6"
            />
            <span className="text-[15px] font-semibold tracking-tight">{siteConfig.name}</span>
          </Link>

          <nav
            aria-label="Portal"
            className="order-last -mx-3 flex w-[calc(100%+24px)] min-w-0 items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:ml-2 sm:w-auto"
          >
            {NAV.map((item) => {
              const current = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "rounded-base flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap",
                    current
                      ? "text-klerosUIComponentsPrimaryText bg-klerosUIComponentsLightGrey font-semibold"
                      : "text-klerosUIComponentsSecondaryText hover:text-klerosUIComponentsPrimaryText",
                  )}
                >
                  {item.label}
                  {item.soon ? (
                    <span className="border-klerosUIComponentsStroke text-klerosUIComponentsSecondaryText rounded-full border px-1.5 text-[11px] leading-4 font-normal">
                      Soon
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-klerosUIComponentsStroke border-t">
        <div className="text-klerosUIComponentsSecondaryText mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 text-xs sm:px-6">
          <a
            href={siteConfig.links.kleros}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-klerosUIComponentsPrimaryText"
          >
            Kleros
          </a>
          <div className="flex items-center gap-4">
            <a
              href={siteConfig.links.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-klerosUIComponentsPrimaryText"
            >
              Privacy
            </a>
            <a
              href={siteConfig.links.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-klerosUIComponentsPrimaryText"
            >
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
