/** PROTOTYPE, throwaway. The browser side of the hand-off, against a stubbed portal route. */
import { afterEach, expect, it, vi } from "vitest";

import { completeExternalAuth, HAND_OFF_ROUTE } from "../complete-external-auth";

const ARGS = { externalAuthReqId: "req-1", atlasToken: "eyJh.eyJz.c2ln" };

const stubRoute = (response: Response) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it("posts the request id with the Atlas token as a bearer and resolves to Descope's redirect", async () => {
  const fetch = stubRoute(Response.json({ redirectUrl: "https://descope.test/resume" }));

  const redirectUrl = await completeExternalAuth(ARGS);

  expect(redirectUrl).toBe("https://descope.test/resume");
  expect(fetch).toHaveBeenCalledExactlyOnceWith(HAND_OFF_ROUTE, {
    method: "POST",
    headers: { authorization: "Bearer eyJh.eyJz.c2ln", "content-type": "application/json" },
    body: JSON.stringify({ externalAuthReqId: "req-1" }),
  });
});

it("surfaces the route's own message when it refuses", async () => {
  stubRoute(Response.json({ error: { code: "unauthenticated", message: "Sign in again." } }, { status: 401 }));

  await expect(completeExternalAuth(ARGS)).rejects.toThrow("Sign in again.");
});

it("falls back to a generic message when the route answers with no JSON", async () => {
  stubRoute(new Response("Bad gateway", { status: 502 }));

  await expect(completeExternalAuth(ARGS)).rejects.toThrow("The sign-in could not be handed over.");
});

it.each(["javascript:alert(1)", "http://descope.test/resume", undefined])(
  "refuses to navigate to a redirect of %j",
  async (redirectUrl) => {
    stubRoute(Response.json({ redirectUrl }));

    await expect(completeExternalAuth(ARGS)).rejects.toThrow("unsafe address");
  },
);
