import type { Page, Route } from "@playwright/test";

import { atlas } from "../fixtures/atlas";
import { expect, test } from "../fixtures/test";
import type { WalletFixture } from "../fixtures/wallet";
import { expectAccessible } from "../utils/a11y";
import { flip } from "../utils/switches";

test.beforeEach(async () => {
  await atlas.reset();
});

/** GraphQL requests to Atlas whose body names `operation`. */
const atlasOperation = (page: Page, operation: string, handle: (route: Route) => Promise<void> | void) =>
  page.route("**/graphql", async (route) => {
    if ((route.request().postData() ?? "").includes(operation)) return handle(route);
    return route.fallback();
  });

/** The sign-in card's message; Next adds its own empty route announcer with the same role. */
const signInAlert = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });

async function signUp(page: Page, wallet: WalletFixture, email = "juror@example.com") {
  await page.goto("/notifications");
  await wallet.connect();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Save email" }).click();
  await expect(page.getByRole("navigation", { name: "Products" })).toBeVisible();
}

test("a declined signature says so and lets the user try again", async ({ page, wallet }) => {
  await page.goto("/notifications");
  await wallet.connect({ rejectSignatures: true });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(signInAlert(page)).toHaveText("You declined the signature in your wallet.");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await expectAccessible(page, "declined signature");

  await wallet.connect({ rejectSignatures: false });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
});

test("a wallet on a chain the portal does not list still signs in", async ({ page, wallet }) => {
  await page.goto("/notifications");
  // Optimism; wagmi reports the configured default chain for an unlisted one
  await wallet.connect({ chainId: 10 });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
  const [login] = await atlas.requestsTo("login");
  expect(String((login?.variables as { message?: string })?.message)).toContain("Chain ID: 42161");
});

test("Atlas unreachable at sign-in shows the failure and recovers", async ({ page, wallet }) => {
  await page.goto("/notifications");
  await wallet.connect();
  await atlasOperation(page, "GetNonce", (route) => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(signInAlert(page)).toHaveText("Sign-in did not go through. Check your connection and try again.");

  await page.unroute("**/graphql");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Where should we email you?" })).toBeVisible();
});

test("Atlas down while loading settings shows a retry that recovers", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await atlasOperation(page, "NotificationSubscriptions", (route) => route.abort("connectionrefused"));
  await wallet.revisit("/notifications");
  await expect(page.getByText("Your notifications did not load")).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page, "settings failed to load");

  await page.unroute("**/graphql");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("navigation", { name: "Products" })).toBeVisible();
});

test("a slow Atlas shows loading, then the settings", async ({ page, wallet }) => {
  await signUp(page, wallet);
  await atlasOperation(page, "NotificationSubscriptions", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    await route.fallback();
  });
  await wallet.revisit("/notifications");
  await expect(page.getByRole("status").filter({ hasText: "Loading your notifications" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Products" })).toBeVisible({ timeout: 15_000 });
});

test("a slow save shows Saving until Atlas answers, and the switch stays where the user put it", async ({
  page,
  wallet,
}) => {
  await signUp(page, wallet);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await atlasOperation(page, "UpdateNotificationSubscriptions", async (route) => {
    await held;
    await route.fallback();
  });

  const drawn = page.getByRole("switch", { name: "I'm drawn as a juror" });
  await flip(drawn);
  await expect(drawn).not.toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toBeVisible();
  release();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(drawn).not.toBeChecked();
});

test("a session that expires asks for a new signature and keeps the user's settings", async ({ page, wallet }) => {
  await page.clock.install();
  await signUp(page, wallet);
  const drawn = page.getByRole("switch", { name: "I'm drawn as a juror" });
  await flip(drawn);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // mock-atlas sessions last 7 days; move both clocks past that
  const eightDays = 8 * 24 * 60 * 60;
  await atlas.shiftClock(eightDays);
  await page.clock.fastForward(eightDays * 1000);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("switch", { name: "I'm drawn as a juror" })).not.toBeChecked();
});
