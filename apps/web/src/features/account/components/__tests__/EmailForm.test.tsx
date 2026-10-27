import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { EmailForm } from "../EmailForm";

it("waits until submission before showing validation, then clears it as the draft becomes valid", async () => {
  const onSubmit = vi.fn<(email: string) => void>();
  render(<EmailForm submitText="Save" busyText="Saving" isBusy={false} onSubmit={onSubmit} />);
  const input = screen.getByRole("textbox", { name: "Email address" });
  expect(input).toHaveValue("");
  expect(screen.queryByText("Enter a valid email address")).not.toBeInTheDocument();
  await userEvent.type(input, "reader@");
  expect(screen.queryByText("Enter a valid email address")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(input).toHaveAccessibleDescription("Enter a valid email address");
  expect(onSubmit).not.toHaveBeenCalled();
  await userEvent.type(input, "example.com");
  expect(input).not.toHaveAccessibleDescription();
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("reader@example.com");
});

it("handles submission locally rather than navigating the browser", () => {
  const onSubmit = vi.fn<(email: string) => void>();
  const { container } = render(
    <EmailForm initial="reader@example.com" submitText="Save" busyText="Saving" isBusy={false} onSubmit={onSubmit} />,
  );
  const form = container.querySelector("form");
  if (!form) throw new Error("Email form is missing");
  expect(fireEvent.submit(form)).toBe(false);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("reader@example.com");
});

it("announces invalid submission once and focuses the invalid input", async () => {
  render(<EmailForm submitText="Save" busyText="Saving" isBusy={false} onSubmit={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  const input = screen.getByRole("textbox", { name: "Email address" });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  expect(screen.getAllByText("Enter a valid email address")).toHaveLength(1);
  expect(input).toHaveFocus();
});

it("announces a server error on the invalid field", () => {
  render(<EmailForm submitText="Save" busyText="Saving" isBusy={false} error="Email rejected" onSubmit={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Email rejected");
  expect(screen.getAllByText("Email rejected")).toHaveLength(1);
});
