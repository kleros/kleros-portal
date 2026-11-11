import { expect, test as base } from "@playwright/test";

import { WalletFixture } from "./wallet";

/**
 * The tests' `test`: a fresh test wallet per test, and a failure for any Content-Security-Policy
 * violation the page reports, so a policy that blocks the app fails the flow that hit it.
 */
export const test = base.extend<{ wallet: WalletFixture; cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.exposeBinding("__reportCsp", (_source, line: string) => void violations.push(line));
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          (window as unknown as { __reportCsp: (line: string) => void }).__reportCsp(
            `${event.effectiveDirective} blocked ${event.blockedURI || "inline"}`,
          );
        });
      });
      await use(violations);
      expect(violations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
  wallet: async ({ page }, use) => {
    await use(new WalletFixture(page));
  },
});

export { expect };
