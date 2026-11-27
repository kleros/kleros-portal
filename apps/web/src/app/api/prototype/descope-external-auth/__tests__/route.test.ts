// @vitest-environment node
/**
 * PROTOTYPE, throwaway. The route end to end on loopback: a real mock Atlas (real SIWE, real JWTs) and a stub of
 * Descope's `externalauth/complete` that records what it was sent. No network beyond 127.0.0.1.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createMockAtlasServer } from "@kleros-portal/mock-atlas/server";
import { SignJWT } from "jose";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_EXTERNAL_AUTH_REQ_ID_LENGTH } from "@/features/descope-login-prototype/utils/handOff";

const PROJECT_ID = "P2prototypeproject";
const MANAGEMENT_KEY = "K2-test-management-key-never-echoed";
const REQ_ID = "ext-auth-req_0001";
const REDIRECT_URL = "https://descope.test/flow/resume?step=consent";

interface DescopeCall {
  path: string;
  authorization: string | undefined;
  body: unknown;
}

/** What the Descope stub answers next; each test sets its own. */
let descopeAnswer: { status: number; body: unknown };
const descopeCalls: DescopeCall[] = [];

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  );

const atlasServer = createMockAtlasServer();
const descopeServer = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    descopeCalls.push({ path: req.url ?? "", authorization: req.headers.authorization, body: JSON.parse(raw) });
    res.writeHead(descopeAnswer.status, { "content-type": "application/json" });
    res.end(JSON.stringify(descopeAnswer.body));
  });
});

let atlasUrl: string;
let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  atlasUrl = await listen(atlasServer);
  const descopeUrl = await listen(descopeServer);
  vi.stubEnv("NEXT_PUBLIC_ATLAS_URI", atlasUrl);
  vi.stubEnv("DESCOPE_PROJECT_ID", PROJECT_ID);
  vi.stubEnv("DESCOPE_MANAGEMENT_KEY", MANAGEMENT_KEY);
  vi.stubEnv("DESCOPE_BASE_URL", descopeUrl);
  // `@/config/env` reads NEXT_PUBLIC_ATLAS_URI once, at import, so the route is imported after the stub.
  vi.resetModules();
  ({ POST } = await import("../route"));
});

afterAll(async () => {
  await new Promise((resolve) => atlasServer.close(resolve));
  await new Promise((resolve) => descopeServer.close(resolve));
});

beforeEach(async () => {
  descopeAnswer = { status: 200, body: { redirectUrl: REDIRECT_URL } };
  descopeCalls.length = 0;
  await fetch(`${atlasUrl}/__test/reset`, { method: "POST" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const atlasGraphql = async (query: string, variables: Record<string, unknown>, token?: string) => {
  const response = await fetch(`${atlasUrl}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as { data?: Record<string, unknown> };
};

/** A real SIWE sign-in to mock Atlas, the way kleros-app does it from the portal. */
async function signIn(account: PrivateKeyAccount) {
  const { data } = await atlasGraphql(`mutation ($address: Address!) { nonce(address: $address) }`, {
    address: account.address,
  });
  const now = Date.now();
  const message = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: "localhost:3000",
    uri: "http://localhost:3000",
    version: "1",
    nonce: String(data?.nonce),
    issuedAt: new Date(now),
    expirationTime: new Date(now + 600_000),
  });
  const signature = await account.signMessage({ message });
  const login = await atlasGraphql(
    `mutation ($message: String!, $signature: String!) { login(message: $message, signature: $signature) }`,
    {
      message,
      signature,
    },
  );
  return (login.data?.login as { accessToken: string }).accessToken;
}

const handOff = (body: unknown, authorization?: string) =>
  POST(
    new Request("http://localhost:3000/api/prototype/descope-external-auth", {
      method: "POST",
      headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("descope external-auth route", () => {
  it("tells Descope the wallet Atlas signed in, with Atlas's roles, and returns Descope's redirect", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const token = await signIn(account);
    // signing up is what gives a mock Atlas user the "user" role
    await atlasGraphql(
      `mutation ($settings: AddUserSettingsDto!) { addUser(addUserSettings: $settings) }`,
      { settings: { email: "alice@example.com", product: "CourtV2" } },
      token,
    );

    const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectUrl: REDIRECT_URL });
    expect(descopeCalls).toEqual([
      {
        path: "/v1/mgmt/flow/externalauth/complete",
        authorization: `Bearer ${PROJECT_ID}:${MANAGEMENT_KEY}`,
        body: {
          externalAuthReqId: REQ_ID,
          loginId: account.address.toLowerCase(),
          customClaims: { kleros_address: account.address.toLowerCase(), atlas_roles: ["user"] },
        },
      },
    ]);
  });

  it("refuses a request with no Atlas token", async () => {
    const response = await handOff({ externalAuthReqId: REQ_ID });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
    expect(descopeCalls).toEqual([]);
  });

  it("refuses an Authorization header that is not a bearer JWT", async () => {
    const response = await handOff({ externalAuthReqId: REQ_ID }, "Basic dXNlcjpwYXNz");

    expect(response.status).toBe(401);
    expect(descopeCalls).toEqual([]);
  });

  it("refuses a JWT Atlas did not issue, whatever address it names", async () => {
    const victim = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const forged = await new SignJWT({ sub: victim, roles: ["admin"] })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("not-mock-atlas-secret-at-least-32-bytes"));

    const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
    expect(descopeCalls).toEqual([]);
  });

  it("refuses a body that names an address of its own", async () => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));
    const someoneElse = privateKeyToAccount(generatePrivateKey()).address;

    const response = await handOff({ externalAuthReqId: REQ_ID, address: someoneElse }, `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(descopeCalls).toEqual([]);
  });

  it.each([
    ["no body at all", "not json"],
    ["no id", {}],
    ["an empty id", { externalAuthReqId: "" }],
    ["a numeric id", { externalAuthReqId: 42 }],
    ["an id with a space", { externalAuthReqId: "abc def" }],
    ["an id with a slash", { externalAuthReqId: "../../v1/mgmt/user" }],
    ["an overlong id", { externalAuthReqId: "a".repeat(MAX_EXTERNAL_AUTH_REQ_ID_LENGTH + 1) }],
  ])("refuses a malformed request: %s", async (_label, body) => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));

    const response = await handOff(body, `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(descopeCalls).toEqual([]);
  });

  it("accepts an id of the longest allowed length", async () => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));

    const response = await handOff(
      { externalAuthReqId: "a".repeat(MAX_EXTERNAL_AUTH_REQ_ID_LENGTH) },
      `Bearer ${token}`,
    );

    expect(response.status).toBe(200);
  });

  it("reports Descope's refusal without echoing or logging the management key", async () => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));
    descopeAnswer = { status: 400, body: { errorCode: "E011003", errorDescription: "Request is invalid" } };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${token}`);

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe("descope_rejected");
    expect(text).not.toContain(MANAGEMENT_KEY);
    expect(JSON.stringify(logged.mock.calls)).toContain("E011003");
    expect(JSON.stringify(logged.mock.calls)).not.toContain(MANAGEMENT_KEY);
  });

  it("refuses a Descope error status even when its body carries a redirect", async () => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));
    descopeAnswer = { status: 500, body: { redirectUrl: REDIRECT_URL } };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${token}`);

    expect(response.status).toBe(502);
  });

  it.each([["javascript:alert(document.domain)"], ["http://descope.test/resume"], ["/relative"], [undefined]])(
    "refuses to forward a redirect of %j",
    async (redirectUrl) => {
      const token = await signIn(privateKeyToAccount(generatePrivateKey()));
      descopeAnswer = { status: 200, body: { redirectUrl } };
      vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${token}`);

      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("descope_rejected");
    },
  );

  it("reports Atlas failing as Atlas, not as a bad sign-in", async () => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));
    await fetch(`${atlasUrl}/__test/faults`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ field: "user" }),
    });

    const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${token}`);

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("atlas_unavailable");
    expect(descopeCalls).toEqual([]);
  });

  it("refuses to run without a management key", async () => {
    const token = await signIn(privateKeyToAccount(generatePrivateKey()));
    vi.stubEnv("DESCOPE_MANAGEMENT_KEY", "");

    const response = await handOff({ externalAuthReqId: REQ_ID }, `Bearer ${token}`);
    vi.stubEnv("DESCOPE_MANAGEMENT_KEY", MANAGEMENT_KEY);

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("misconfigured");
    expect(descopeCalls).toEqual([]);
  });
});
