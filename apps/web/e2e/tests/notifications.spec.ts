import { expect, test as base, type Page } from "@playwright/test";

import { atlas } from "../fixtures/atlas";
import { WalletFixture } from "../fixtures/wallet";
import { expectAccessible } from "../utils/a11y";

const test = base.extend<{ wallet: WalletFixture }>({
  wallet: async ({ page }, use) => {
    await use(new WalletFixture(page));
  },
});

test.beforeEach(async () => {
  await atlas.reset();
});

/** Connects, signs in, and stops at whatever the signed-in page shows first. */
async function signIn(page: Page, wallet: WalletFixture) {
  await page.goto("/notifications");
  await wallet.connect();
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and registers `email`, landing on the settings. */
async function signUp(page: Page, wallet: WalletFixture, email = "juror@example.com") {
  await signIn(page, wallet);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Save email" }).click();
  await expect(page.getByRole("navigation", { name: "Products" })).toBeVisible();
}

test("flow 1: a visitor connects and signs in", async ({ page, wallet }) => {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Your Kleros emails, in one place" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet" }).first()).toBeVisible();
  await expectAccessible(page, "signed out");

  await wallet.connect();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
  expect((await atlas.requestsTo("login")).length).toBe(1);
});

test("flow 2: a new address adds its email and sees Atlas's defaults", async ({ page, wallet }) => {
  await signIn(page, wallet);
  await expectAccessible(page, "add email");

  await page.getByRole("button", { name: "Save email" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();

  await page.getByLabel("Email address").fill("juror@example.com");
  await page.getByRole("button", { name: "Save email" }).click();

  const addUser = await atlas.requestsTo("addUser");
  expect(addUser.map((request) => request.variables)).toEqual([
    { settings: { email: "juror@example.com", product: "CourtV2" } },
  ]);

  // the catalogue, in Atlas's order
  const nav = page.getByRole("navigation", { name: "Products" });
  await expect(nav.getByRole("link")).toHaveText([
    /^Court\s*11 of 11 on$/,
    /^Court V1\s*11 of 11 on$/,
    /^Proof of Humanity\s*12 of 13 on$/,
    /^Foresight\s*1 of 1 on$/,
  ]);
});

test("flow 3: an unverified email gets a banner that resends the link", async ({ page, wallet }) => {
  await signUp(page, wallet);
  const banner = page.getByRole("status").filter({ hasText: "Confirm your email" });
  await expect(banner).toContainText("We sent a link to juror@example.com");
  await expectAccessible(page, "unverified");

  await banner.getByRole("button", { name: "Resend link" }).click();
  await expect(banner.getByRole("button", { name: "Sent" })).toBeVisible();
  const updates = await atlas.requestsTo("updateEmail");
  expect(updates.map((request) => request.variables)).toEqual([{ newEmail: "juror@example.com", product: "CourtV2" }]);
});

test("flow 4: the emailed link confirms; an old or wrong link says so", async ({ page, wallet }) => {
  await signUp(page, wallet);
  const { token } = await atlas.confirmation(wallet.address);

  await page.goto(`/email-confirmation?address=${wallet.address}&token=0${token.slice(1)}`);
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();

  await page.goto(`/email-confirmation?address=${wallet.address}&token=${token}`);
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();
  await expectAccessible(page, "confirmed");

  await page.goto(`/email-confirmation?address=not-an-address&token=${token}`);
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();
});

test("flow 4b: a link older than two days has expired", async ({ page, wallet }) => {
  await signUp(page, wallet);
  const { token } = await atlas.confirmation(wallet.address);
  await atlas.shiftClock(2 * 24 * 60 * 60 + 60);

  await page.goto(`/email-confirmation?address=${wallet.address}&token=${token}`);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});

test("flow 5: changing the email sends a confirmation to the new address", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await page.getByRole("button", { name: "Change email" }).click();
  await page.getByLabel("Email address").fill("new@example");
  await page.getByRole("button", { name: "Send confirmation" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();

  await page.getByLabel("Email address").fill("new@example.com");
  await page.getByRole("button", { name: "Send confirmation" }).click();
  await expect(page.getByText("new@example.com").first()).toBeVisible();
  const updates = await atlas.requestsTo("updateEmail");
  expect(updates.map((request) => request.variables)).toEqual([{ newEmail: "new@example.com", product: "CourtV2" }]);
});

test("flow 6: a toggle saves at once, survives a reload, and a failed save rolls back", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await page.getByRole("navigation", { name: "Products" }).getByRole("link").nth(1).click();
  await expect(page).toHaveURL(/product=CourtV1/);
  await page.getByRole("navigation", { name: "Products" }).getByRole("link").nth(0).click();
  await expect(page).toHaveURL(/product=CourtV2/);
  await expect(page.getByRole("heading", { level: 2, name: "Court" })).toBeVisible();

  const drawn = page.getByRole("switch", { name: "I'm drawn as a juror" });
  await expect(drawn).toBeChecked();
  await drawn.click({ force: true });
  await expect(drawn).not.toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  const updates = await atlas.requestsTo("updateNotificationSubscriptions");
  expect(updates.map((request) => request.variables)).toEqual([
    { product: "CourtV2", subscriptions: [{ topic: "JurorDraw", enabled: false }] },
  ]);

  await wallet.revisit(page.url());
  await expect(page.getByRole("switch", { name: "I'm drawn as a juror" })).not.toBeChecked();
  await expect(page.getByRole("navigation", { name: "Products" }).getByRole("link").nth(0)).toContainText(
    "10 of 11 on",
  );

  await atlas.fault({ field: "updateNotificationSubscriptions", product: "CourtV2" });
  const vote = page.getByRole("switch", { name: "It's time to vote" });
  await vote.click({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Not saved. Try again" })).toBeVisible();
  await expect(vote).toBeChecked();
  await expectAccessible(page, "save failed");
});

test("flow 6b: a group switch writes only the topics that change", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await wallet.revisit("/notifications?product=PohV2");

  const disputes = page.getByRole("switch", { name: "All challenges emails" });
  await disputes.click({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  const [update] = await atlas.requestsTo("updateNotificationSubscriptions");
  expect(update?.variables).toEqual({
    product: "PohV2",
    subscriptions: [
      { topic: "DisputedSubmission", enabled: false },
      { topic: "DisputedRevoke", enabled: false },
      { topic: "ChallengeAccepted", enabled: false },
      { topic: "ChallengeRejected", enabled: false },
      { topic: "DisputeRuledTie", enabled: false },
    ],
  });
});

test("flow 7: turning everything off retries only the product that failed", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await atlas.fault({ field: "updateNotificationSubscriptions", product: "PohV2", error: "Atlas is busy" });

  await page.getByRole("button", { name: "Turn off all" }).click();
  await page.getByRole("button", { name: "Turn everything off" }).click();
  await expect(page.getByText("Proof of Humanity is still on: Atlas is busy")).toBeVisible();

  const first = await atlas.requestsTo("updateNotificationSubscriptions");
  expect(first.map((request) => (request.variables as { product: string }).product)).toEqual([
    "CourtV2",
    "CourtV1",
    "PohV2",
    "Foresight",
  ]);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("All emails are off. Turn on what you want above.")).toBeVisible();
  const all = await atlas.requestsTo("updateNotificationSubscriptions");
  expect(all.slice(first.length).map((request) => (request.variables as { product: string }).product)).toEqual([
    "PohV2",
  ]);

  await wallet.revisit(page.url());
  const nav = page.getByRole("navigation", { name: "Products" });
  await expect(nav.getByRole("link")).toHaveText([/Nothing on$/, /Nothing on$/, /Nothing on$/, /Nothing on$/]);
});

test("flow 7b: removing the email deletes the user and starts over", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await page.getByRole("button", { name: "Remove email" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove your email" });
  await expectAccessible(page, "remove dialog");
  await dialog.getByRole("button", { name: "Keep my email" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Remove email" }).click();
  await dialog.getByRole("button", { name: "Remove email" }).click();
  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
  expect((await atlas.requestsTo("deleteUser")).length).toBe(1);
});

test("flow 8: the theme follows the toggle and stays accessible in dark", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectAccessible(page, "dark settings");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("flow 9: signing out returns to the sign-in prompt", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Your Kleros emails, in one place" })).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem("authToken"))).toBeNull();
});

test("API keys is reserved and says it is coming", async ({ page }) => {
  await page.goto("/api-keys");
  await expect(page.getByRole("heading", { name: "API keys are coming" })).toBeVisible();
  await expectAccessible(page, "api keys");
});
