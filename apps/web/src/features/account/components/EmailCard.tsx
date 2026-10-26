"use client";

import { useState } from "react";

import { Button } from "@kleros/ui-components-library";

import { StatusIcon } from "@/components/ui/StatusIcon";

import { EmailForm } from "./EmailForm";
import { useEmail } from "../hooks/useEmail";
import { formatCooldown } from "../model/email";

/** The address every product writes to, its confirmation state, and changing it. */
export function EmailCard() {
  const { email, isVerified, cooldownUntil, change, resend, errorMessage } = useEmail();
  const [editing, setEditing] = useState(false);

  if (!email) return null;

  const locked = cooldownUntil !== null;

  return (
    <section aria-labelledby="email-title" className="flex flex-col gap-4">
      {!isVerified ? (
        <div
          role="status"
          className="border-klerosUIComponentsWarning bg-klerosUIComponentsWarningLight rounded-base flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="flex min-w-0 gap-3">
            <StatusIcon name="warning" className="mt-0.5 size-5" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-base font-semibold">Confirm your email to start receiving notifications</p>
              <p className="text-sm leading-5">
                We sent a link to <span className="font-semibold break-all">{email}</span>. Nothing is delivered until
                you open it; the link works for 2 days.
              </p>
            </div>
          </div>
          <Button
            small
            variant="secondary"
            className="shrink-0 self-start sm:self-center"
            text={resend.isPending ? "Sending…" : resend.isSuccess ? "Sent" : "Resend link"}
            isDisabled={resend.isPending || locked}
            onPress={() => resend.mutate()}
          />
        </div>
      ) : null}

      <div className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base flex flex-col gap-4 border p-4 sm:p-5">
        {editing ? (
          <EmailForm
            initial={email}
            submitText="Send confirmation"
            busyText="Sending…"
            isBusy={change.isPending}
            error={change.isError ? errorMessage(change.error) : null}
            onCancel={() => {
              change.reset();
              setEditing(false);
            }}
            onSubmit={(next) =>
              change.mutate(next, {
                onSuccess: () => setEditing(false),
              })
            }
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <h2
                id="email-title"
                className="text-klerosUIComponentsSecondaryText text-xs font-semibold tracking-wider uppercase"
              >
                Email address
              </h2>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 text-base break-all">{email}</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <StatusIcon name={isVerified ? "success" : "warning"} />
                  {isVerified ? "Confirmed" : "Not confirmed"}
                </span>
              </div>
            </div>
            <Button
              small
              variant="secondary"
              className="shrink-0 self-start sm:self-center"
              text="Change email"
              isDisabled={locked}
              onPress={() => setEditing(true)}
            />
          </div>
        )}

        {resend.isError ? (
          <p role="alert" className="text-klerosUIComponentsError text-sm">
            {errorMessage(resend.error)}
          </p>
        ) : null}
        {locked && cooldownUntil ? (
          <p className="text-klerosUIComponentsSecondaryText text-sm">
            You can change or resend again at {formatCooldown(cooldownUntil)}.
          </p>
        ) : null}
      </div>
    </section>
  );
}
