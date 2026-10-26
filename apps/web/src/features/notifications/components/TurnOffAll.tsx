"use client";

import { useState } from "react";

import { Button } from "@kleros/ui-components-library";

import { StatusIcon } from "@/components/ui/StatusIcon";

import { useTurnOffAll } from "../hooks/useTurnOffAll";
import { productCopy } from "../model/copy";
import { productsWithAnyOn, type ProductSettings } from "../model/settings";

export function TurnOffAll({ settings }: { settings: readonly ProductSettings[] }) {
  const { state, run } = useTurnOffAll(settings);
  const [confirming, setConfirming] = useState(false);
  const nothingOn = productsWithAnyOn(settings).length === 0;
  const running = state.status === "running";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">Turn off all emails</h3>
          <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
            Switches off every topic for every product. Your current choices are not kept.
          </p>
        </div>
        {!confirming ? (
          <Button
            small
            variant="secondary"
            className="shrink-0 self-start"
            text={nothingOn ? "All off" : "Turn off all"}
            isDisabled={nothingOn || running}
            onPress={() => setConfirming(true)}
          />
        ) : null}
      </div>

      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button
            small
            text={running ? "Turning off…" : "Turn everything off"}
            isDisabled={running}
            onPress={() => {
              void run().then(() => setConfirming(false));
            }}
          />
          <Button small variant="secondary" text="Cancel" isDisabled={running} onPress={() => setConfirming(false)} />
        </div>
      ) : null}

      <div role="status" aria-live="polite">
        {state.status === "done" ? (
          <p className="flex items-center gap-2 text-sm">
            <StatusIcon name="success" />
            All emails are off. Turn on what you want above.
          </p>
        ) : null}
        {state.status === "partial" ? (
          <div className="flex flex-col gap-2">
            {state.failures.map((failure) => (
              <p key={failure.product || "session"} className="flex items-start gap-2 text-sm">
                <StatusIcon name="error" className="mt-0.5" />
                <span>
                  {failure.product ? `${productCopy(failure.product).name} is still on: ` : ""}
                  {failure.message}
                </span>
              </p>
            ))}
            <Button
              small
              variant="secondary"
              className="self-start"
              text={running ? "Retrying…" : "Retry"}
              isDisabled={running}
              onPress={() => void run()}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
