/**
 * PROTOTYPE, throwaway: the browser half of the Descope hand-off. It calls the portal's own route with `fetch`
 * (CSP `connect-src 'self'`) and then navigates by script: a form POST answered by a 302 to Descope would be
 * blocked by the portal's `form-action 'self'`.
 */
import { useMutation } from "@tanstack/react-query";

import { isSafeRedirect } from "../utils/handOff";

/** The route handler in `app/api/prototype/descope-external-auth/route.ts`. */
export const HAND_OFF_ROUTE = "/api/prototype/descope-external-auth";

/** Asks the portal's server to tell Descope who signed in; resolves to where the browser goes next. */
export async function completeExternalAuth({
  externalAuthReqId,
  atlasToken,
}: {
  externalAuthReqId: string;
  atlasToken: string;
}): Promise<string> {
  const response = await fetch(HAND_OFF_ROUTE, {
    method: "POST",
    headers: { authorization: `Bearer ${atlasToken}`, "content-type": "application/json" },
    body: JSON.stringify({ externalAuthReqId }),
  });
  const body = (await response.json().catch(() => undefined)) as
    { redirectUrl?: unknown; error?: { message?: string } } | undefined;
  if (!response.ok) throw new Error(body?.error?.message ?? "The sign-in could not be handed over.");
  if (!isSafeRedirect(body?.redirectUrl)) throw new Error("The sign-in service answered with an unsafe address.");
  return body.redirectUrl;
}

export function useCompleteExternalAuth() {
  return useMutation({
    mutationFn: completeExternalAuth,
    onSuccess: (redirectUrl) => window.location.assign(redirectUrl),
  });
}
