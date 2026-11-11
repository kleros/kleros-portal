import type { Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { TestWalletOptions } from "@/lib/web3/test-wallet";

/** A fresh key per test, so each test is a new Atlas user. */
export class WalletFixture {
  readonly privateKey = generatePrivateKey();
  readonly address = privateKeyToAccount(this.privateKey).address;
  private options: TestWalletOptions = {};

  constructor(private readonly page: Page) {}

  /** Connects the app's test connector; call after `page.goto`. Options persist across `revisit`. */
  async connect(options?: TestWalletOptions) {
    if (options) this.options = options;
    await this.page.waitForFunction(() => "__connectTestWallet" in window);
    await this.page.evaluate(([key, opts]) => window.__connectTestWallet!(key, opts), [
      this.privateKey,
      this.options,
    ] as const);
  }

  /**
   * Loads `url` and reconnects: the test connector lives in page memory, where an injected wallet would
   * reconnect from storage. The Atlas session in sessionStorage survives, so no new signature is asked for.
   */
  async revisit(url: string) {
    await this.page.goto(url);
    await this.connect();
  }
}
