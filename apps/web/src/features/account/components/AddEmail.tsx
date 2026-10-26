"use client";

import { EmailForm } from "./EmailForm";
import { useEmail } from "../hooks/useEmail";

/** First step for an address Atlas does not know yet: no topics exist until there is an email. */
export function AddEmail() {
  const { add, errorMessage } = useEmail();

  return (
    <section
      aria-labelledby="add-email-title"
      className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base mx-auto flex max-w-[480px] flex-col gap-5 border p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 id="add-email-title" className="text-2xl font-semibold tracking-tight">
          Where should we email you?
        </h1>
        <p className="text-klerosUIComponentsSecondaryText text-sm leading-5">
          One address for every Kleros product. You choose what each one sends next.
        </p>
      </div>
      <EmailForm
        submitText="Save email"
        busyText="Saving…"
        isBusy={add.isPending}
        error={add.isError ? errorMessage(add.error) : null}
        onSubmit={(email) => add.mutate(email)}
      />
    </section>
  );
}
