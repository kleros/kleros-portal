/**
 * PROTOTYPE, throwaway: the shapes of the Descope External Authentication hand-off. Pure; used by the
 * browser and by the server route alike. The Descope side is in kleros-dispute-service,
 * branch `prototype/descope-oauth-mcp`, `prototype-descope-oauth/README.md`.
 */
import * as v from "valibot";

export const MAX_EXTERNAL_AUTH_REQ_ID_LENGTH = 512;

/** Descope does not document the id's shape; this admits URL-unreserved characters and nothing else. */
const EXTERNAL_AUTH_REQ_ID = new RegExp(`^[A-Za-z0-9._~-]{1,${MAX_EXTERNAL_AUTH_REQ_ID_LENGTH}}$`);

/** What the browser may send. Strict: an `address` or any other field is refused, never ignored. */
export const HandOffRequestSchema = v.strictObject({
  externalAuthReqId: v.pipe(v.string(), v.regex(EXTERNAL_AUTH_REQ_ID, "not an external_auth_req_id")),
});

export type HandOffRequest = v.InferOutput<typeof HandOffRequestSchema>;

/** The parsed request, or undefined for anything else. */
export const parseHandOffRequest = (body: unknown): HandOffRequest | undefined => {
  const parsed = v.safeParse(HandOffRequestSchema, body);
  return parsed.success ? parsed.output : undefined;
};

/** The JWT out of an `Authorization: Bearer <jwt>` header, or undefined. Shape only: Atlas verifies it. */
export const bearerToken = (header: string | null): string | undefined =>
  /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header ?? "")?.[1];

/** Who Atlas says the token belongs to. */
export const AtlasUserSchema = v.object({
  address: v.pipe(v.string(), v.regex(/^0x[0-9a-fA-F]{40}$/)),
  roles: v.array(v.string()),
});

export type AtlasUser = v.InferOutput<typeof AtlasUserSchema>;

/** The body of Descope's `POST /v1/mgmt/flow/externalauth/complete`. The Kleros identity is the lowercased wallet. */
export const descopeCompletion = (externalAuthReqId: string, user: AtlasUser) => {
  const address = user.address.toLowerCase();
  return {
    externalAuthReqId,
    loginId: address,
    customClaims: { kleros_address: address, atlas_roles: user.roles },
  };
};

/** Only an absolute https URL may be navigated to: a `javascript:` URL here would run in the portal's origin. */
export const isSafeRedirect = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
