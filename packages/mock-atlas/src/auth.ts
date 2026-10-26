import { SignJWT, errors, jwtVerify } from "jose";
import { recoverMessageAddress, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

import { GraphqlError } from "./graphql";
import { now, type Store } from "./store";

const JWT_SECRET = new TextEncoder().encode("kleros-portal-mock-atlas");
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;

export const createJwt = async (store: Store, address: string) => {
  const timestamp = Math.floor(now(store) / 1000);
  return new SignJWT({ roles: store.users.get(address.toLowerCase())?.roles ?? [] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(address.toLowerCase())
    .setIssuer("mock-atlas")
    .setIssuedAt(timestamp)
    .setExpirationTime(timestamp + JWT_TTL_SECONDS)
    .sign(JWT_SECRET);
};

export const authenticate = async (store: Store, header?: string) => {
  const [type, token] = header?.split(" ") ?? [];
  if (type !== "Bearer" || !token)
    return { error: new GraphqlError("An Auth token must be provided", "NoTokenProvidedError", 401) };
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      currentDate: new Date(now(store)),
    });
    if (!payload.sub) throw new Error("Missing subject");
    return { address: payload.sub.toLowerCase() };
  } catch (error) {
    return {
      error:
        error instanceof errors.JWTExpired
          ? new GraphqlError("Expired Token", "ExpiredTokenError", 401)
          : new GraphqlError("Invalid Token", "InvalidTokenError", 401),
    };
  }
};

const hostWithPort = (value: string) => {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  return `${url.hostname}:${url.port || (url.protocol === "http:" ? "80" : "443")}`;
};

export const login = async (store: Store, message: string, signature: Hex) => {
  const fields = parseSiweMessage(message);
  for (const key of ["address", "chainId", "expirationTime", "domain", "uri", "nonce"] as const) {
    if (!fields[key])
      throw new GraphqlError(`SIWE message is malformed: ${key} is missing`, "SIWEFieldMissingError", 400);
  }
  if (hostWithPort(fields.domain!) !== hostWithPort(fields.uri!)) {
    throw new GraphqlError("Domain and URI fields do not match", "SIWEDomainURIMismatchError", 401);
  }
  const address = fields.address!.toLowerCase();
  const nonces = store.nonces.get(address);
  if (!nonces?.delete(fields.nonce!))
    throw new GraphqlError(
      "Invalid nonce in siwe signature, please provide a valid siwe signature",
      "InvalidNonceError",
      401,
    );
  let recovered: string | undefined;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    /* Invalid signatures fail below. */
  }
  if (recovered?.toLowerCase() !== address || !validateSiweMessage({ message: fields, time: new Date(now(store)) })) {
    throw new GraphqlError("SIWE signature is not valid", "SIWESignatureInvalidError", 401);
  }
  return { accessToken: await createJwt(store, address) };
};
