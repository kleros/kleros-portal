"use client";

import type { ReactNode } from "react";

import { Button } from "@kleros/ui-components-library";

import { ProductNav } from "./ProductNav";
import { ProductPanel } from "./ProductPanel";
import { TurnOffAll } from "./TurnOffAll";
import { useNotificationSettings } from "../hooks/useNotificationSettings";
import { sortProducts } from "../model/copy";

interface NotificationSettingsProps {
  /** `?product=`; an unknown or missing value shows the first product. */
  requestedProduct?: string;
  /** Shown instead of the settings while Atlas has no user for this address. */
  noUser: ReactNode;
  /** Above the products: the email the settings apply to. */
  header: ReactNode;
  /** Inside the closing "Stop emails" section, after turning everything off. */
  dangerZone: ReactNode;
}

export function NotificationSettings({ requestedProduct, noUser, header, dangerZone }: NotificationSettingsProps) {
  const state = useNotificationSettings();

  if (state.status === "loading") {
    return (
      <p role="status" className="text-klerosUIComponentsSecondaryText py-16 text-center text-sm">
        Loading your notifications…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="mx-auto flex max-w-[480px] flex-col items-start gap-3 py-12">
        <p className="text-base font-semibold">Your notifications did not load</p>
        <p className="text-klerosUIComponentsSecondaryText text-sm">Atlas did not answer. Nothing was changed.</p>
        <Button small text="Try again" onPress={state.retry} />
      </div>
    );
  }

  if (state.status === "no-user") return noUser;

  const settings = sortProducts(state.settings);
  const selected = settings.find((entry) => entry.product === requestedProduct) ?? settings[0];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Notification settings</h1>
      {header}

      {selected ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <ProductNav settings={settings} selected={selected.product} />
          <ProductPanel key={selected.product} entry={selected} />
        </div>
      ) : (
        <p className="text-klerosUIComponentsSecondaryText text-sm">
          No Kleros product offers email notifications yet.
        </p>
      )}

      <section
        aria-labelledby="stop-title"
        className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base flex flex-col gap-5 border p-4 sm:p-5"
      >
        <h2
          id="stop-title"
          className="text-klerosUIComponentsSecondaryText text-xs font-semibold tracking-wider uppercase"
        >
          Stop emails
        </h2>
        <TurnOffAll settings={settings} />
        <hr className="border-klerosUIComponentsStroke" />
        {dangerZone}
      </section>
    </div>
  );
}
