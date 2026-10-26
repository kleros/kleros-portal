import type { Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/** A fresh key per test, so each test is a new Atlas user. */
export class WalletFixture {
  readonly privateKey = generatePrivateKey();
  readonly address = privateKeyToAccount(this.privateKey).address;

  constructor(private readonly page: Page) {}

  /** Connects the app's test connector; call after `page.goto`. */
  async connect() {
    await this.page.waitForFunction(() => "__connectTestWallet" in window);
    await this.page.evaluate((key) => window.__connectTestWallet!(key), this.privateKey);
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
