import { SignJWT, type JWTPayload } from "jose";

export const ADDRESS = "0xabcdef0000000000000000000000000000001234";
export const SESSION_NOW = new Date("2026-10-27T12:00:00Z");

export function signToken(payload: JWTPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode("test-only-hs256-key-at-least-32-bytes"));
}

export async function storeSession() {
  const token = await signToken({ sub: ADDRESS, exp: SESSION_NOW.getTime() / 1000 + 3600 });
  sessionStorage.setItem("authToken", JSON.stringify(token));
  return token;
}
