"use client";

import { useState } from "react";

import { Button, Modal } from "@kleros/ui-components-library";

import { useEmail } from "../hooks/useEmail";

export function RemoveEmail() {
  const { remove, errorMessage } = useEmail();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Remove my email</h3>
        <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
          Deletes your address and every choice above, for all Kleros products.
        </p>
      </div>
      <Button
        small
        variant="secondary"
        className="shrink-0 self-start"
        text="Remove email"
        onPress={() => setOpen(true)}
      />

      <Modal
        isOpen={open}
        onOpenChange={(next) => {
          if (!remove.isPending) setOpen(next);
        }}
        isDismissable={!remove.isPending}
        ariaLabel="Remove your email"
        className="flex h-auto w-[min(440px,calc(100vw-32px))] flex-col gap-5 p-6"
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Remove your email?</h2>
          <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
            Every Kleros product stops emailing you, and your notification choices are deleted. You can add an email
            again later; it starts from the defaults.
          </p>
        </div>
        {remove.isError ? (
          <p role="alert" className="text-klerosUIComponentsError text-sm">
            {errorMessage(remove.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            small
            variant="secondary"
            text="Keep my email"
            isDisabled={remove.isPending}
            onPress={() => setOpen(false)}
          />
          <Button
            small
            text={remove.isPending ? "Removing…" : "Remove email"}
            isDisabled={remove.isPending}
            onPress={() => remove.mutate(undefined, { onSuccess: () => setOpen(false) })}
          />
        </div>
      </Modal>
    </div>
  );
}
