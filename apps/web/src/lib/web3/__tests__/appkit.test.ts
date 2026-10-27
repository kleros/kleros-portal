import { createAppKit } from "@reown/appkit/react";
import { expect, it, vi } from "vitest";

import { getAppKit } from "../appkit";

vi.mock("@reown/appkit/react", () => ({ createAppKit: vi.fn() }));

it("does not offer aliased Coinbase or Base Account connectors", () => {
  getAppKit();
  expect(createAppKit).toHaveBeenCalledWith(
    expect.objectContaining({
      enableCoinbase: false,
      enableBaseAccount: false,
    }),
  );
});
