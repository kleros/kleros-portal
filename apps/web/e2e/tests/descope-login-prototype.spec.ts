/**
 * PROTOTYPE, throwaway: the Descope External Authentication hand-off in a real browser. Mock Atlas signs the wallet
 * in; a local stub stands in for Descope's `externalauth/complete`; Descope's redirect is caught at the browser.
 * The `cspViolations` fixture fails the test if the portal's CSP blocks any step.
 */
import { createServer } from "node:http";

import { atlas } from "../fixtures/atlas";
import { DESCOPE_STUB_PORT } from "../fixtures/descope";
import { expect, test } from "../fixtures/test";

const REDIRECT_URL = "https://descope.test/flow/resume?step=consent";

const received: { authorization?: string; body: unknown }[] = [];
const descope = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    received.push({ authorization: req.headers.authorization, body: JSON.parse(raw) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ redirectUrl: REDIRECT_URL }));
  });
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => descope.listen(DESCOPE_STUB_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => descope.close(resolve));
});

test.beforeEach(async () => {
  received.length = 0;
  await atlas.reset();
});

test("a wallet signs in and is handed to Descope as the address Atlas signed in", async ({ page, wallet }) => {
  await page.route("https://descope.test/**", (route) => route.fulfill({ body: "descope consent stand-in" }));

  await page.goto("/prototype/descope-login?external_auth_req_id=req-e2e-1");
  await expect(page.getByRole("heading", { name: "Sign in for your agent" })).toBeVisible();
  await wallet.connect();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL(REDIRECT_URL);
  expect(received).toEqual([
    {
      authorization: "Bearer P2e2eprototype:e2e-management-key",
      body: {
        externalAuthReqId: "req-e2e-1",
        loginId: wallet.address.toLowerCase(),
        customClaims: { kleros_address: wallet.address.toLowerCase(), atlas_roles: [] },
      },
    },
  ]);
});

test("a visit without a request id is told where to start", async ({ page }) => {
  await page.goto("/prototype/descope-login");

  await expect(page.getByText("Open this page from your agent's sign-in link.")).toHaveRole("alert");
});
