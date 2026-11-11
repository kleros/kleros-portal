import { expect, test, type Page } from "@playwright/test";

import { WalletFixture } from "../fixtures/wallet";
import { expectAccessible } from "../utils/a11y";
import { flip } from "../utils/switches";

/** Atlas's docker compose `sendgrid` service, which keeps every email Atlas sends. */
const SENDGRID_MOCK = process.env.REAL_SENDGRID_MOCK ?? "http://localhost:7363";

/** Atlas's EMAIL_UPDATE_COOLDOWN_IN_SECONDS and JWT_EXPIRATION_IN_SECONDS for this run (README). */
const EMAIL_COOLDOWN_SECONDS = Number(process.env.REAL_ATLAS_EMAIL_COOLDOWN ?? 60);
const SESSION_SECONDS = Number(process.env.REAL_ATLAS_SESSION_SECONDS ?? 120);

/** Every confirmation link Atlas has emailed to `email`, oldest first, as the mock recorded them. */
async function confirmationLinks(email: string): Promise<string[]> {
  const mails: unknown = await fetch(`${SENDGRID_MOCK}/api/mails?to=${encodeURIComponent(email)}`).then((response) =>
    response.json(),
  );
  const links = JSON.stringify(mails).match(/https?:\/\/[^"\s\\]*email-confirmation[^"\s\\]*/g) ?? [];
  return [...new Set(links.map((link) => link.replace(/\\u0026/g, "&")))];
}

/** The first confirmation link to `email` not among `seen`; the mock's mail order is not relied on. */
async function newConfirmationLink(email: string, seen: readonly string[] = []): Promise<string> {
  let fresh: string[] = [];
  await expect
    .poll(async () => (fresh = (await confirmationLinks(email)).filter((link) => !seen.includes(link))).length, {
      message: `a new email to ${email}`,
    })
    .toBeGreaterThan(0);
  return fresh[0]!;
}

const products = (page: Page) => page.getByRole("navigation", { name: "Products" }).getByRole("link");
const saved = (page: Page) => page.getByRole("status").filter({ hasText: "Saved" });
const emailFor = (wallet: WalletFixture, tag: string) =>
  `portal-${tag}-${wallet.address.slice(2, 10).toLowerCase()}@example.com`;

async function signIn(page: Page, wallet: WalletFixture) {
  await page.goto("/notifications");
  await wallet.connect();
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signUp(page: Page, wallet: WalletFixture, email: string) {
  await signIn(page, wallet);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Save email" }).click();
  await expect(products(page)).toHaveCount(4);
}

test("defaults, confirmation, a toggle on every product, turn off all, remove, and a fresh start", async ({ page }) => {
  const wallet = new WalletFixture(page);
  const email = emailFor(wallet, "main");
  await signUp(page, wallet, email);

  await expect(products(page)).toHaveText([
    /^Court\s*11 of 11 on$/,
    /^Court V1\s*11 of 11 on$/,
    /^Proof of Humanity\s*12 of 13 on$/,
    /^Foresight\s*1 of 1 on$/,
  ]);
  await expect(page.getByText("Confirm your email to start receiving notifications")).toBeVisible();
  await expectAccessible(page, "real Atlas settings");

  // a tampered token is refused; the real one confirms
  const link = await newConfirmationLink(email);
  expect(new URL(link).hash).toMatch(/^#\/settings\/email-confirmation\?address=0x[0-9a-fA-F]{40}&token=/);
  await page.goto(link.replace(/token=./, (match) => `token=${match.endsWith("0") ? "1" : "0"}`));
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();

  // one change on each product, each read back from Atlas after a reload
  const changes = [
    { product: "CourtV2", topic: "I'm drawn as a juror", expect: false, count: "10 of 11 on", index: 0 },
    { product: "CourtV1", topic: "It's time to vote", expect: false, count: "10 of 11 on", index: 1 },
    { product: "PohV2", topic: "Rewards and referrals", expect: true, count: "13 of 13 on", index: 2 },
    { product: "Foresight", topic: "A market I traded resolves", expect: false, count: "Nothing on", index: 3 },
  ] as const;
  for (const change of changes) {
    await wallet.revisit(`/notifications?product=${change.product}`);
    await flip(page.getByRole("switch", { name: change.topic }));
    await expect(saved(page)).toBeVisible();
  }
  await wallet.revisit("/notifications");
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  for (const change of changes) {
    await expect(products(page).nth(change.index)).toContainText(change.count);
  }
  await wallet.revisit("/notifications?product=PohV2");
  await expect(page.getByRole("switch", { name: "Rewards and referrals" })).toBeChecked();

  await page.getByRole("button", { name: "Turn off all" }).click();
  await page.getByRole("button", { name: "Turn everything off" }).click();
  await expect(page.getByText("All emails are off. Turn on what you want above.")).toBeVisible();
  await wallet.revisit("/notifications");
  await expect(products(page)).toHaveText([/Nothing on$/, /Nothing on$/, /Nothing on$/, /Nothing on$/]);

  await page.getByRole("button", { name: "Remove email" }).click();
  await page.getByRole("dialog", { name: "Remove your email" }).getByRole("button", { name: "Remove email" }).click();
  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();

  // a new signup starts from Atlas's defaults, not the old choices
  await page.getByLabel("Email address").fill(emailFor(wallet, "again"));
  await page.getByRole("button", { name: "Save email" }).click();
  await expect(products(page)).toHaveText([
    /^Court\s*11 of 11 on$/,
    /^Court V1\s*11 of 11 on$/,
    /^Proof of Humanity\s*12 of 13 on$/,
    /^Foresight\s*1 of 1 on$/,
  ]);
});

test("a change starts Atlas's cooldown; resend waits for it, then sends a new link", async ({ page }) => {
  test.setTimeout((EMAIL_COOLDOWN_SECONDS + 90) * 1000);
  const wallet = new WalletFixture(page);
  await signUp(page, wallet, emailFor(wallet, "first"));

  // signup does not start the cooldown, so the address can be changed straight away
  await expect(page.getByRole("button", { name: "Change email" })).toBeEnabled();
  const next = emailFor(wallet, "second");
  await page.getByRole("button", { name: "Change email" }).click();
  await page.getByLabel("Email address").fill(next);
  await page.getByRole("button", { name: "Send confirmation" }).click();
  await expect(page.getByText(next).first()).toBeVisible();
  const before = await confirmationLinks(next);
  expect(before).toHaveLength(1);

  await expect(page.getByRole("button", { name: "Change email" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resend link" })).toBeDisabled();
  await expect(page.getByText(/You can change or resend again at/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend link" })).toBeEnabled({
    timeout: (EMAIL_COOLDOWN_SECONDS + 15) * 1000,
  });
  await page.getByRole("button", { name: "Resend link" }).click();
  await expect(page.getByRole("button", { name: "Sent" })).toBeVisible();
  const link = await newConfirmationLink(next, before);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();
});

test("an expired session asks for a new signature and the settings survive", async ({ page }) => {
  test.setTimeout((SESSION_SECONDS + 120) * 1000);
  const wallet = new WalletFixture(page);
  await signUp(page, wallet, emailFor(wallet, "session"));
  await flip(page.getByRole("switch", { name: "I'm drawn as a juror" }));
  await expect(saved(page)).toBeVisible();

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible({
    timeout: (SESSION_SECONDS + 20) * 1000,
  });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("switch", { name: "I'm drawn as a juror" })).not.toBeChecked();
});

test("signing out drops the session; the same wallet must sign again", async ({ page }) => {
  const wallet = new WalletFixture(page);
  await signUp(page, wallet, emailFor(wallet, "signout"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Your Kleros emails, in one place" })).toBeVisible();

  await wallet.connect();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(products(page)).toHaveCount(4);
});
