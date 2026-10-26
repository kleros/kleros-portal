"use client";

import { useState } from "react";

import { Button, TextField } from "@kleros/ui-components-library";

import { isValidEmail } from "../model/email";

interface EmailFormProps {
  initial?: string;
  submitText: string;
  busyText: string;
  isBusy: boolean;
  /** Shown under the field when the last submit failed. */
  error?: string | null;
  onSubmit: (email: string) => void;
  onCancel?: () => void;
}

/** One email field with its submit; validates on submit, then live until the value is valid. */
export function EmailForm({ initial = "", submitText, busyText, isBusy, error, onSubmit, onCancel }: EmailFormProps) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const invalid = touched && !isValidEmail(value);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (isValidEmail(value) && !isBusy) onSubmit(value);
      }}
    >
      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={value}
        onChange={setValue}
        isDisabled={isBusy}
        variant={invalid || error ? "error" : undefined}
        message={invalid ? "Enter a valid email address" : (error ?? undefined)}
        className="w-full [&_input]:w-full"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" small text={isBusy ? busyText : submitText} isDisabled={isBusy} />
        {onCancel ? <Button small variant="secondary" text="Cancel" isDisabled={isBusy} onPress={onCancel} /> : null}
      </div>
    </form>
  );
}
