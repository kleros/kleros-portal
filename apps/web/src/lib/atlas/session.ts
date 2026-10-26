import { decodeJwt } from "jose";

/** Where `AtlasProvider` (@kleros/kleros-app 3.1) keeps the SIWE JWT, JSON-encoded; it exposes no getter. */
export const AUTH_TOKEN_KEY = "authToken";

/** The stored JWT when it belongs to `address` and has not expired, else undefined. */
export function readAuthToken(address: string | undefined, nowSeconds = Date.now() / 1000): string | undefined {
  if (!address || typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
    const token: unknown = raw ? JSON.parse(raw) : undefined;
    if (typeof token !== "string") return undefined;

    const { sub, exp } = decodeJwt(token);
    if (sub?.toLowerCase() !== address.toLowerCase()) return undefined;
    if (exp !== undefined && exp <= nowSeconds) return undefined;
    return token;
  } catch {
    return undefined;
  }
}

/** Forgets the session; `AtlasProvider` re-reads storage only on mount, so callers also disconnect the wallet. */
export function clearAuthToken() {
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // storage unavailable: nothing was stored
  }
}
