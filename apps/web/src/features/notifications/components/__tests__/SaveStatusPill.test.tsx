import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useSaveStatus } from "../../hooks/useSaveStatus";
import { SaveStatusPill } from "../SaveStatusPill";

vi.mock("../../hooks/useSaveStatus", () => ({ useSaveStatus: vi.fn() }));

it.each([
  ["idle", "Changes save as you go"],
  ["saving", "Saving…"],
  ["saved", "Saved"],
  ["error", "Not saved. Try again"],
] as const)("keeps a bordered, fixed-width surface for %s", (status, copy) => {
  vi.mocked(useSaveStatus).mockReturnValue(status);
  render(<SaveStatusPill />);
  expect(screen.getByRole("status")).toHaveTextContent(copy);
  expect(screen.getByRole("status")).toHaveClass(
    "w-[232px]",
    "shrink-0",
    "border",
    "border-klerosUIComponentsStroke",
    "bg-klerosUIComponentsLightBackground",
  );
});
