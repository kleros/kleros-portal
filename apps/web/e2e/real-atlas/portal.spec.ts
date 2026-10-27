import { expect, test, type Page } from "@playwright/test";

import { WalletFixture } from "../fixtures/wallet";
import { expectAccessible } from "../utils/a11y";

/** Atlas's docker compose `sendgrid` service, which keeps every email Atlas sends. */
const SENDGRID_MOCK = process.env.REAL_SENDGRID_MOCK ?? "http://localhost:7363";

/** The confirmation link Atlas emailed to `email`, as the mock recorded it. */
async function confirmationLink(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const mails = await fetch(`${SENDGRID_MOCK}/api/mails?to=${encodeURIComponent(email)}`).then((response) =>
          response.json(),
        );
        link = /https?:\/\/[^"\s\\]*email-confirmation[^"\s\\]*/.exec(JSON.stringify(mails))?.[0];
        return link;
      },
      { message: `a confirmation email to ${email}` },
    )
    .toBeTruthy();
  return link!.replace(/\\u0026/g, "&");
}

const products = (page: Page) => page.getByRole("navigation", { name: "Products" }).getByRole("link");

test("against real Atlas: sign up, confirm, choose topics, turn everything off, remove", async ({ page }) => {
  const wallet = new WalletFixture(page);
  const email = `portal-${wallet.address.slice(2, 10).toLowerCase()}@example.com`;

  await page.goto("/notifications");
  await wallet.connect();
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Save email" }).click();
  await expect(products(page)).toHaveText([
    /^Court\s*11 of 11 on$/,
    /^Court V1\s*11 of 11 on$/,
    /^Proof of Humanity\s*12 of 13 on$/,
    /^Foresight\s*1 of 1 on$/,
  ]);
  await expect(page.getByText("Confirm your email to start receiving notifications")).toBeVisible();
  await expectAccessible(page, "real Atlas settings");

  // CourtV2's link is Court's hash route on this origin; the portal forwards it
  const link = await confirmationLink(email);
  expect(new URL(link).hash).toMatch(/^#\/settings\/email-confirmation\?address=0x[0-9a-fA-F]{40}&token=/);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();

  await wallet.revisit("/notifications?product=CourtV2");
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

  const drawn = page.getByRole("switch", { name: "I'm drawn as a juror" });
  await drawn.click({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await wallet.revisit("/notifications?product=CourtV2");
  await expect(page.getByRole("switch", { name: "I'm drawn as a juror" })).not.toBeChecked();
  await expect(products(page).nth(0)).toContainText("10 of 11 on");

  await page.getByRole("button", { name: "Turn off all" }).click();
  await page.getByRole("button", { name: "Turn everything off" }).click();
  await expect(page.getByText("All emails are off. Turn on what you want above.")).toBeVisible();
  await wallet.revisit("/notifications");
  await expect(products(page)).toHaveText([/Nothing on$/, /Nothing on$/, /Nothing on$/, /Nothing on$/]);

  await page.getByRole("button", { name: "Remove email" }).click();
  await page.getByRole("dialog", { name: "Remove your email" }).getByRole("button", { name: "Remove email" }).click();
  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
});
