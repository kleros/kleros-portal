import {
  AppRouterContext,
  type AppRouterInstance,
  type NavigateOptions,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ProductNav } from "../ProductNav";

it("navigates to the selected product without requesting a scroll reset", async () => {
  const navigations: { href: string; options?: NavigateOptions }[] = [];
  // Keep Next's Link real; jsdom has no App Router server to consume its navigation request.
  const router = {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    push: (href: string, options?: NavigateOptions) => {
      navigations.push({ href, options });
    },
    replace: vi.fn(),
    prefetch: vi.fn(),
  } satisfies AppRouterInstance;
  render(
    <AppRouterContext.Provider value={router}>
      <ProductNav
        selected="CourtV2"
        settings={[
          { product: "CourtV2", topics: [{ topic: "JurorDraw", enabled: true }] },
          { product: "PohV2", topics: [{ topic: "Rewards", enabled: false }] },
        ]}
      />
    </AppRouterContext.Provider>,
  );
  expect(screen.getByRole("link", { name: "Court1 of 1 on" })).toHaveAttribute("aria-current", "page");
  await userEvent.click(screen.getByRole("link", { name: "Proof of HumanityNothing on" }));
  expect(navigations).toEqual([{ href: "/notifications?product=PohV2", options: { scroll: false } }]);
});
