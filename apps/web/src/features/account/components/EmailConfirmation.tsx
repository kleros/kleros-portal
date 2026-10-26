"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAtlasProvider } from "@kleros/kleros-app";
import { isAddress } from "viem";

import { StatusIcon, type StatusIconName } from "@/components/ui/StatusIcon";

import { paths } from "@/config/paths";
import { siteConfig } from "@/config/site";

export type ConfirmationOutcome = "confirmed" | "expired" | "invalid" | "error";

const OUTCOMES: Record<
  ConfirmationOutcome,
  { title: string; body: string; icon: StatusIconName; action: { label: string; href: string } }
> = {
  confirmed: {
    title: "Your email is confirmed",
    body: "Kleros products can now email you. Choose what each one sends.",
    icon: "success",
    action: { label: "Choose notifications", href: paths.notifications.getHref() },
  },
  expired: {
    title: "This link has expired",
    body: "Links work for 2 days. Sign in and send yourself a new one.",
    icon: "warning",
    action: { label: "Send a new link", href: paths.notifications.getHref() },
  },
  invalid: {
    title: "This link does not work",
    body: "It may have been replaced by a newer one. Use the latest email, or send a new link.",
    icon: "error",
    action: { label: "Send a new link", href: paths.notifications.getHref() },
  },
  error: {
    title: "We could not confirm your email",
    body: "Something went wrong on our side. Try the link again in a moment.",
    icon: "error",
    action: { label: "Contact support", href: siteConfig.links.support },
  },
};

/** Maps Atlas's confirmEmail answer to what the page says. */
export function outcomeOf(result: {
  isConfirmed: boolean;
  isTokenExpired: boolean;
  isTokenInvalid: boolean;
  isError: boolean;
}): ConfirmationOutcome {
  if (result.isConfirmed) return "confirmed";
  if (result.isError) return "error";
  if (result.isTokenExpired) return "expired";
  return "invalid";
}

export function EmailConfirmation({ address, token }: { address?: string; token?: string }) {
  const { confirmEmail } = useAtlasProvider();
  const [outcome, setOutcome] = useState<ConfirmationOutcome | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // a token confirms once; a second call would report it invalid
    if (started.current) return;
    started.current = true;

    if (!address || !isAddress(address) || !token) {
      setOutcome("invalid");
      return;
    }
    confirmEmail({ address, token })
      .then((result) => setOutcome(outcomeOf(result)))
      .catch(() => setOutcome("error"));
  }, [address, token, confirmEmail]);

  if (!outcome) {
    return (
      <p role="status" className="text-klerosUIComponentsSecondaryText py-16 text-center text-sm">
        Confirming your email…
      </p>
    );
  }

  const { title, body, icon, action } = OUTCOMES[outcome];
  const external = action.href.startsWith("http");

  return (
    <section
      aria-labelledby="confirmation-title"
      className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base mx-auto flex max-w-[480px] flex-col gap-4 border p-6 sm:p-8"
    >
      <StatusIcon name={icon} className="size-8" />
      <h1 id="confirmation-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">{body}</p>
      <Link
        href={action.href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="bg-klerosUIComponentsPrimaryBlue text-klerosUIComponentsWhiteBackground rounded-base hover:bg-klerosUIComponentsSecondaryBlue self-start px-6 py-1.5 text-base font-semibold"
      >
        {action.label}
      </Link>
    </section>
  );
}
