/**
 * PROTOTYPE, throwaway: the server half of the Descope External Authentication hand-off. The Descope side is in kleros-dispute-service,
 * branch `prototype/descope-oauth-mcp`, `prototype-descope-oauth/README.md`.
 *
 * SERVER ONLY. It is handed the Descope management key, which administers the whole Descope project. Only the
 * route handler under `app/api/prototype/` imports it; no client component may.
 *
 * The browser proves who it is with its Atlas JWT and nothing else. We never decode that token or read an address
 * the browser sends: we ask Atlas `user { address roles }` with it, and Atlas's answer is the identity Descope gets.
 */
import { ClientError } from "graphql-request";
import * as v from "valibot";

import { atlasClient } from "@/lib/atlas/client";

import { AtlasUserSchema, descopeCompletion, isSafeRedirect, type AtlasUser } from "../utils/handOff";

export interface DescopeConfig {
  projectId: string;
  managementKey: string;
  /** The project's API origin; region-specific, e.g. `https://api.euc1.descope.com`. */
  baseUrl: string;
}

export type HandOffErrorCode =
  "invalid_request" | "unauthenticated" | "misconfigured" | "atlas_unavailable" | "descope_rejected";

const STATUS: Record<HandOffErrorCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  misconfigured: 500,
  atlas_unavailable: 502,
  descope_rejected: 502,
};

/** A failure the route answers with `{ error: { code, message } }`. Messages are written for the browser. */
export class HandOffError extends Error {
  readonly status: number;
  constructor(
    readonly code: HandOffErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HandOffError";
    this.status = STATUS[code];
  }
}

/** The server-only settings, from env names that carry no NEXT_PUBLIC_ prefix and so are never inlined. */
export function descopeConfigFrom(environment: Record<string, string | undefined>): DescopeConfig {
  const projectId = environment.DESCOPE_PROJECT_ID;
  const managementKey = environment.DESCOPE_MANAGEMENT_KEY;
  if (!projectId || !managementKey) {
    throw new HandOffError("misconfigured", "This portal is not set up to complete agent sign-ins.");
  }
  return { projectId, managementKey, baseUrl: environment.DESCOPE_BASE_URL || "https://api.descope.com" };
}

const USER_QUERY = /* GraphQL */ `
  query PrototypeDescopeHandOffUser {
    user {
      address
      roles
    }
  }
`;

const isUnauthenticated = (error: { extensions?: Record<string, unknown> }) =>
  error.extensions?.equivalentHTTPStatusCode === 401;

/** Who the Atlas JWT belongs to, by Atlas's own answer. */
async function atlasUser(atlasToken: string): Promise<AtlasUser> {
  let data: unknown;
  try {
    data = await atlasClient(atlasToken).request<{ user: unknown }>(USER_QUERY);
  } catch (error) {
    // Atlas's auth guard marks a missing, invalid or expired token 401; anything else is Atlas failing.
    if (error instanceof ClientError && error.response.errors?.some(isUnauthenticated)) {
      throw new HandOffError("unauthenticated", "Atlas did not accept this sign-in. Sign in again.");
    }
    throw new HandOffError("atlas_unavailable", "Atlas could not be reached.");
  }
  const parsed = v.safeParse(v.object({ user: AtlasUserSchema }), data);
  if (!parsed.success) throw new HandOffError("atlas_unavailable", "Atlas answered with no user.");
  return parsed.output.user;
}

/** Tells Descope who signed in; returns where Descope wants the browser next. */
export async function handOffToDescope(
  { externalAuthReqId, atlasToken }: { externalAuthReqId: string; atlasToken: string },
  descope: DescopeConfig,
): Promise<{ redirectUrl: string }> {
  const user = await atlasUser(atlasToken);

  let response: Response;
  try {
    response = await fetch(`${descope.baseUrl}/v1/mgmt/flow/externalauth/complete`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${descope.projectId}:${descope.managementKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(descopeCompletion(externalAuthReqId, user)),
      cache: "no-store",
    });
  } catch {
    throw new HandOffError("descope_rejected", "Descope could not be reached.");
  }

  const body = (await response.json().catch(() => undefined)) as
    { redirectUrl?: unknown; errorCode?: unknown; errorDescription?: unknown } | undefined;
  if (!response.ok || !isSafeRedirect(body?.redirectUrl)) {
    // Descope's error fields only; the request carried the management key and is never logged.
    console.error(
      "[prototype] externalauth/complete refused",
      response.status,
      body?.errorCode,
      body?.errorDescription,
    );
    throw new HandOffError("descope_rejected", "Descope did not accept the sign-in. Start again from your agent.");
  }
  return { redirectUrl: body.redirectUrl };
}
