import { decodeJwt } from "jose";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PORT, PRODUCT_TOPIC_DEFAULTS, SignupProduct } from "./index";
import { createMockAtlasServer } from "./server";
import type { Confirmation, dumpState } from "./store";

const NOW = Date.parse("2026-10-27T00:00:00.000Z");
const DATE = new Date(NOW).toISOString();
const TWO_DAYS = 2 * 24 * 60 * 60;
const queries = {
  nonce: `mutation GetNonce($address: Address!) { nonce(address: $address) }`,
  login: `mutation Login($message: String!, $signature: String!) { login(message: $message, signature: $signature) }`,
  user: `query GetUser { user { email isEmailVerified emailUpdateableAt } }`,
  add: `mutation AddUser($settings: AddUserSettingsDto!) { addUser(addUserSettings: $settings) }`,
  updateEmail: `mutation UpdateEmail($newEmail: String!, $product: SignupProduct!) { updateEmail(newEmail: $newEmail, product: $product) }`,
  confirm: `mutation ConfirmEmail($address: Address!, $token: String!) {
    confirmEmail(confirmEmailInput: { address: $address, token: $token }) {
      isConfirmed isTokenExpired isTokenInvalid
    }
  }`,
  delete: `mutation DeleteUser { deleteUser }`,
  subscribed: `query isSubscribed($address: Address!) { isSubscribed(address: $address) }`,
  roles: `query Roles($product: Products!) { roles(product: $product) { name restriction { maxSize allowedMimeTypes } } }`,
  topics: `query Topics($product: SignupProduct) { notificationTopics(product: $product) { product topic defaultEnabled } }`,
  preferences: `query { user { address notificationSubscriptions(product: PohV2) { product topic enabled } } }`,
  allPreferences: `query { user { address notificationSubscriptions { product topic enabled } } }`,
  update: `mutation Update($product: SignupProduct!, $subscriptions: [NotificationSubscriptionInput!]!) {
    updateNotificationSubscriptions(product: $product, subscriptions: $subscriptions)
  }`,
};
const courtTopics = [
  "DisputeAppealable",
  "DisputeAppealed",
  "JurorCanVote",
  "JurorCanCommit",
  "JurorCanReveal",
  "JurorDraw",
  "StakeNew",
  "StakeUnstaked",
  "StakeChanged",
  "CaseWon",
  "CaseLost",
];
const pohTopics = [
  "VouchingPhase",
  "PendingRequest",
  "ResolvedRequest",
  "VouchAdded",
  "VouchAddedVoucher",
  "PendingRevoke",
  "ResolvedRevoke",
  "DisputedSubmission",
  "DisputedRevoke",
  "ChallengeAccepted",
  "ChallengeRejected",
  "DisputeRuledTie",
  "Rewards",
];
const expectedRows = [
  ...courtTopics.map((topic) => ({ product: "CourtV1", topic, enabled: true })),
  ...courtTopics.map((topic) => ({ product: "CourtV2", topic, enabled: true })),
  ...pohTopics.map((topic) => ({ product: "PohV2", topic, enabled: topic !== "Rewards" })),
  { product: "Foresight", topic: "MarketResolved", enabled: true },
];
const pohRows = expectedRows.filter(({ product }) => product === "PohV2");
const expectedTopics = expectedRows.map(({ enabled, ...row }) => ({ ...row, defaultEnabled: enabled }));
const confirmed = { isConfirmed: true, isTokenExpired: false, isTokenInvalid: false };
const invalid = { isConfirmed: false, isTokenExpired: false, isTokenInvalid: true };
const expired = { isConfirmed: false, isTokenExpired: true, isTokenInvalid: false };

type Transport = { base: string; fetch: typeof globalThis.fetch; close: () => Promise<void> };
type GraphqlResponse = {
  data?: { nonce?: string; login?: { accessToken: string }; [field: string]: unknown } | null;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
};

export const atlasContract = (connect: (server: ReturnType<typeof createMockAtlasServer>) => Promise<Transport>) => {
  let transport: Transport | undefined;
  let base: string;
  const fetch: typeof globalThis.fetch = (...args) => transport!.fetch(...args);

  const start = async (cooldown = 0) => {
    vi.stubEnv("MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS", String(cooldown));
    const server = createMockAtlasServer();
    expect(server.listening).toBe(false);
    transport = await connect(server);
    base = transport.base;
  };
  const stop = async () => {
    await transport?.close();
    transport = undefined;
  };
  const control = async <T = unknown>(path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${base}/__test/${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    return (await response.json()) as T;
  };
  const state = () => control<ReturnType<typeof dumpState>>("state");
  const request = async (body: unknown, token?: string) => {
    const response = await fetch(`${base}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as GraphqlResponse;
    const code = result.errors?.[0]?.extensions?.code;
    expect(response.status).toBe(code === "GRAPHQL_VALIDATION_FAILED" || code === "GRAPHQL_PARSE_FAILED" ? 400 : 200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    return result;
  };
  const gql = (query: string, variables: Record<string, unknown> = {}, token?: string) =>
    request({ query, variables }, token);
  const login = async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = (await gql(queries.nonce, { address: account.address })).data?.nonce;
    if (!nonce) throw new Error("Nonce was not returned");
    expect(nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    const message = createSiweMessage({
      address: account.address,
      chainId: 1,
      domain: "localhost:3000",
      uri: "http://localhost:3000",
      version: "1",
      nonce,
      issuedAt: new Date(NOW),
      expirationTime: new Date(NOW + 600_000),
    });
    const signature = await account.signMessage({ message });
    const response = await gql(queries.login, { message, signature });
    expect(response.errors).toBeUndefined();
    const token = response.data?.login?.accessToken;
    if (!token) throw new Error("Login did not return a token");
    expect(decodeJwt(token)).toEqual({
      sub: account.address.toLowerCase(),
      roles: [],
      iss: "mock-atlas",
      iat: NOW / 1000,
      exp: NOW / 1000 + 7 * 24 * 60 * 60,
    });
    return { account, address: account.address.toLowerCase(), token, message, signature };
  };
  const signup = async () => {
    const user = await login();
    expect(await gql(queries.add, { settings: { email: "alice@example.com", product: "PohV2" } }, user.token)).toEqual({
      data: { addUser: true },
    });
    return user;
  };
  const update = (token: string, product: string, subscriptions: { topic: string; enabled: boolean }[]) =>
    gql(queries.update, { product, subscriptions }, token);
  const confirm = (address: string, token: string) => gql(queries.confirm, { address, token });
  const inbox = (address: string) => control<Confirmation>(`confirmation?address=${address}`);
  const clock = (offsetSeconds: number) => control("clock", "POST", { offsetSeconds });
  const location = (query: string, text: string) => {
    const index = query.indexOf(text);
    const prefix = query.slice(0, index);
    return { line: prefix.split("\n").length, column: prefix.length - prefix.lastIndexOf("\n") };
  };
  const controlledError = (
    query: string,
    field: string,
    message: string,
    code: string,
    status: number,
    offset = 0,
  ) => ({
    data: null,
    errors: [
      {
        message,
        locations: [location(query, field)],
        path: [field],
        extensions: { code, timestamp: new Date(NOW + offset * 1000).toISOString(), equivalentHTTPStatusCode: status },
      },
    ],
  });

  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    await start();
  });
  afterEach(async () => {
    await stop();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects a lowercase-address nonce with a checksummed SIWE address", async () => {
    const account = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000001");
    expect(account.address).not.toBe(account.address.toLowerCase());
    const nonce = (await gql(queries.nonce, { address: account.address.toLowerCase() })).data?.nonce;
    if (!nonce) throw new Error("Nonce was not returned");
    const message = createSiweMessage({
      address: account.address,
      chainId: 1,
      domain: "localhost:3000",
      uri: "http://localhost:3000",
      version: "1",
      nonce,
      issuedAt: new Date(NOW),
      expirationTime: new Date(NOW + 600_000),
    });
    const signature = await account.signMessage({ message });
    expect(await gql(queries.login, { message, signature })).toEqual(
      controlledError(
        queries.login,
        "login",
        "Invalid nonce in siwe signature, please provide a valid siwe signature",
        "InvalidNonceError",
        401,
      ),
    );
  });

  it.each([
    ["alice@example.com", true],
    ["first.last+court@sub.example.org", true],
    ["a_b@example-domain.COM", true],
    ["é@example.com", true],
    [".alice@example.com", false],
    ["alice.@example.com", false],
    ["ali..ce@example.com", false],
    ["alice@-example.com", false],
    ["alice@example-.com", false],
    ["alice@ex_ample.com", false],
    ["alice@example..com", false],
    ["alice@example.12", false],
    ["alice@example.c", false],
    ["alice@.example.com", false],
    ["alice@example.com.", false],
    ["alice@exam!ple.com", false],
    ["al(ice@example.com", false],
    ["alice@example.c0m", false],
    ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com", false],
    ["alice@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com", false],
  ])("validates signup email %s as %s with Atlas's error shape", async (email, accepted) => {
    const { token } = await login();
    const response = await gql(queries.add, { settings: { email, product: "CourtV2" } }, token);
    expect(response).toEqual(
      accepted
        ? { data: { addUser: true } }
        : controlledError(queries.add, "addUser", "Bad Request Exception", "HttpClientError", 400),
    );
  });

  describe("catalogue and dispatch", () => {
    it("exports the exact registry values/defaults and returns all 36 rows in Atlas order", async () => {
      expect(DEFAULT_PORT).toBe(4848);
      expect(SignupProduct).toEqual({ CourtV1: "courtV1", CourtV2: "courtV2", PohV2: "pohV2", Foresight: "foresight" });
      const lowerFirst = (text: string) => text[0]!.toLowerCase() + text.slice(1);
      expect(PRODUCT_TOPIC_DEFAULTS).toEqual(
        Object.fromEntries(
          ["CourtV1", "CourtV2", "PohV2", "Foresight"].map((product) => [
            lowerFirst(product),
            Object.fromEntries(
              expectedRows
                .filter((row) => row.product === product)
                .map(({ topic, enabled }) => [lowerFirst(topic), enabled]),
            ),
          ]),
        ),
      );
      expect(await gql(queries.topics)).toEqual({ data: { notificationTopics: expectedTopics } });
      expect(await gql(queries.topics, { product: null })).toEqual({ data: { notificationTopics: expectedTopics } });
      for (const product of ["CourtV1", "CourtV2", "PohV2", "Foresight"]) {
        expect(await gql(queries.topics, { product }, "garbled")).toEqual({
          data: { notificationTopics: expectedTopics.filter((row) => row.product === product) },
        });
      }
      expect(await state()).toEqual({ users: [], subscriptions: [] });
    });

    it("dispatches the first root field, ignores operation names/comments and projects aliases", async () => {
      const query = `# { deleteUser }\nquery Arbitrary($product: SignupProduct = Foresight) {\n  catalogue: notificationTopics(product: $product) { topic } # user\n}`;
      expect(await request({ operationName: "GetUser", query })).toEqual({
        data: { catalogue: [{ topic: "MarketResolved" }] },
      });
      expect(
        await gql(`{ notificationTopics(product: Foresight) { product topic defaultEnabled } user { email } }`),
      ).toEqual({ data: { notificationTopics: expectedTopics.slice(-1) } });
      expect(
        await gql(
          `query Different($unused: String = "# { user }") { notificationTopics(product: Foresight) { topic } }`,
        ),
      ).toEqual({ data: { notificationTopics: [{ topic: "MarketResolved" }] } });
      expect(
        await gql(
          `query Different($unused: AddUserSettingsDto = {email: "a#b{c}@example.com", product: PohV2}) { notificationTopics(product: Foresight) { topic } }`,
        ),
      ).toEqual({ data: { notificationTopics: [{ topic: "MarketResolved" }] } });
    });

    it("retains operationName-only calls including legacy settings and confirmation arguments", async () => {
      const { token, address } = await login();
      expect(await request({ operationName: "GetUser" }, token)).toEqual({
        data: { user: { email: null, isEmailVerified: false, emailUpdateableAt: null } },
      });
      expect(
        await request(
          { operationName: "AddUser", variables: { settings: { email: "legacy@example.com", product: "CourtV2" } } },
          token,
        ),
      ).toEqual({ data: { addUser: true } });
      const pending = await inbox(address);
      expect(await request({ operationName: "ConfirmEmail", variables: { address, token: pending.token } })).toEqual({
        data: { confirmEmail: confirmed },
      });
      expect(
        await request(
          { operationName: "UpdateEmail", variables: { newEmail: "changed@example.com", product: "CourtV2" } },
          token,
        ),
      ).toEqual({ data: { updateEmail: true } });
      expect(await request({ operationName: "DeleteUser" }, token)).toEqual({ data: { deleteUser: true } });
    });

    it("serves the existing role restrictions with the client query", async () => {
      expect(await gql(queries.roles, { product: "CourtV2" })).toEqual({
        data: {
          roles: [
            {
              name: "Evidence",
              restriction: {
                maxSize: 20971520,
                allowedMimeTypes: [
                  "video/mp4",
                  "image/jpeg",
                  "image/png",
                  "image/jpg",
                  "image/bmp",
                  "image/gif",
                  "image/tiff",
                  "image/webp",
                  "application/pdf",
                  "text/csv",
                  "text/html",
                  "text/plain",
                ],
              },
            },
            {
              name: "Policy",
              restriction: { maxSize: 10485760, allowedMimeTypes: ["application/pdf", "text/markdown"] },
            },
            {
              name: "Generic",
              restriction: {
                maxSize: 409600,
                allowedMimeTypes: ["video/x-msvideo", "application/pdf", "image/png", "application/json"],
              },
            },
            {
              name: "Test",
              restriction: {
                maxSize: 20971520,
                allowedMimeTypes: ["image/png", "image/jpeg", "image/svg+xml", "application/json"],
              },
            },
            {
              name: "CurateItemImage",
              restriction: { maxSize: 20971520, allowedMimeTypes: ["image/png", "image/jpeg", "image/svg+xml"] },
            },
            { name: "CurateItemFile", restriction: { maxSize: 20971520, allowedMimeTypes: ["application/json"] } },
          ],
        },
      });
    });
  });

  describe("subscription reads and writes", () => {
    it("returns the unsigned-up stub and only the requested user fields", async () => {
      const { token, address } = await login();
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: null, isEmailVerified: false, emailUpdateableAt: null } },
      });
      expect(await gql(queries.preferences, {}, token)).toEqual({
        data: { user: { address, notificationSubscriptions: null } },
      });
      expect(await gql(`{ user { address } }`, {}, token)).toEqual({ data: { user: { address } } });
    });

    it("merges overrides in registry order without creating default rows", async () => {
      const { token, address } = await signup();
      expect(await gql(queries.allPreferences, {}, token)).toEqual({
        data: { user: { address, notificationSubscriptions: expectedRows } },
      });
      expect(await gql(queries.preferences, {}, token)).toEqual({
        data: { user: { address, notificationSubscriptions: pohRows } },
      });
      expect((await state()).subscriptions).toEqual([]);
      expect(
        await update(token, "PohV2", [
          { topic: "Rewards", enabled: true },
          { topic: "VouchingPhase", enabled: false },
        ]),
      ).toEqual({ data: { updateNotificationSubscriptions: true } });
      expect(await update(token, "CourtV2", [{ topic: "JurorDraw", enabled: false }])).toEqual({
        data: { updateNotificationSubscriptions: true },
      });
      const rows = expectedRows.map((row) => ({
        ...row,
        enabled:
          row.product === "PohV2" && row.topic === "Rewards"
            ? true
            : (row.product === "PohV2" && row.topic === "VouchingPhase") ||
                (row.product === "CourtV2" && row.topic === "JurorDraw")
              ? false
              : row.enabled,
      }));
      expect(await gql(queries.allPreferences, {}, token)).toEqual({
        data: { user: { address, notificationSubscriptions: rows } },
      });
      expect(
        await gql(
          `query Named($filter: SignupProduct) { user { email notificationSubscriptions(product: $filter) { product topic enabled } } }`,
          { filter: "CourtV2" },
          token,
        ),
      ).toEqual({
        data: {
          user: {
            email: "alice@example.com",
            notificationSubscriptions: rows.filter(({ product }) => product === "CourtV2"),
          },
        },
      });
      expect(
        await gql(
          `{ user { a: notificationSubscriptions(product: CourtV1) { topic enabled } b: notificationSubscriptions(product: Foresight) { enabled } } }`,
          {},
          token,
        ),
      ).toEqual({
        data: { user: { a: courtTopics.map((topic) => ({ topic, enabled: true })), b: [{ enabled: true }] } },
      });
      expect((await state()).subscriptions).toEqual([
        { userAddress: address, product: "pohV2", topic: "rewards", enabled: true },
        { userAddress: address, product: "pohV2", topic: "vouchingPhase", enabled: false },
        { userAddress: address, product: "courtV2", topic: "jurorDraw", enabled: false },
      ]);
      expect(await gql(queries.topics)).toEqual({ data: { notificationTopics: expectedTopics } });
    });

    it("upserts one row, supports literal batches, and treats an empty list as a no-op", async () => {
      const { token, address } = await signup();
      expect(await update(token, "PohV2", [])).toEqual({ data: { updateNotificationSubscriptions: true } });
      expect((await state()).subscriptions).toEqual([]);
      expect(
        await gql(
          `mutation Whatever { updateNotificationSubscriptions(product: PohV2, subscriptions: [{topic: Rewards, enabled: true}]) }`,
          {},
          token,
        ),
      ).toEqual({ data: { updateNotificationSubscriptions: true } });
      expect(await update(token, "PohV2", [{ topic: "Rewards", enabled: false }])).toEqual({
        data: { updateNotificationSubscriptions: true },
      });
      expect(await update(token, "PohV2", [{ topic: "Rewards", enabled: false }])).toEqual({
        data: { updateNotificationSubscriptions: true },
      });
      expect(await update(token, "PohV2", [])).toEqual({ data: { updateNotificationSubscriptions: true } });
      expect((await state()).subscriptions).toEqual([
        { userAddress: address, product: "pohV2", topic: "rewards", enabled: false },
      ]);
      expect(await gql(queries.preferences, {}, token)).toEqual({
        data: { user: { address, notificationSubscriptions: pohRows } },
      });
    });

    it("isolates accounts and products sharing the Court enum", async () => {
      const alice = await signup();
      const bob = await signup();
      await update(alice.token, "CourtV1", [{ topic: "JurorDraw", enabled: false }]);
      await update(alice.token, "PohV2", [{ topic: "Rewards", enabled: true }]);
      expect(await gql(queries.allPreferences, {}, bob.token)).toEqual({
        data: { user: { address: bob.address, notificationSubscriptions: expectedRows } },
      });
      expect(await gql(queries.allPreferences, {}, alice.token)).toEqual({
        data: {
          user: {
            address: alice.address,
            notificationSubscriptions: expectedRows.map((row) => ({
              ...row,
              enabled:
                row.product === "CourtV1" && row.topic === "JurorDraw"
                  ? false
                  : row.product === "PohV2" && row.topic === "Rewards"
                    ? true
                    : row.enabled,
            })),
          },
        },
      });
    });
  });

  describe("Atlas error table", () => {
    it.each([queries.preferences, queries.update])("rejects absent and invalid JWTs: %s", async (query) => {
      const field = query === queries.preferences ? "user" : "updateNotificationSubscriptions";
      const variables = { product: "PohV2", subscriptions: [{ topic: "Rewards", enabled: true }] };
      expect(await gql(query, variables)).toEqual(
        controlledError(query, field, "An Auth token must be provided", "NoTokenProvidedError", 401),
      );
      expect(await gql(query, variables, "malformed")).toEqual(
        controlledError(query, field, "Invalid Token", "InvalidTokenError", 401),
      );
      const { token } = await login();
      const [header, payload, signature] = token.split(".");
      const forged = `${header}.${payload}.${signature![0] === "a" ? "b" : "a"}${signature!.slice(1)}`;
      expect(await gql(query, variables, forged)).toEqual(
        controlledError(query, field, "Invalid Token", "InvalidTokenError", 401),
      );
    });

    it("rejects writes without signup, including empty writes, and stores nothing", async () => {
      const { token } = await login();
      for (const subscriptions of [[], [{ topic: "Rewards", enabled: true }]]) {
        expect(await update(token, "PohV2", subscriptions)).toEqual(
          controlledError(
            queries.update,
            "updateNotificationSubscriptions",
            "User not found",
            "UserNotFoundError",
            404,
          ),
        );
      }
      expect(await state()).toEqual({ users: [], subscriptions: [] });
    });

    it("rejects duplicate and unoffered topics atomically, preserving previous rows", async () => {
      const { token, address } = await signup();
      await update(token, "PohV2", [{ topic: "PendingRevoke", enabled: false }]);
      const before = await state();
      expect(
        await update(token, "PohV2", [
          { topic: "Rewards", enabled: true },
          { topic: "VouchingPhase", enabled: false },
          { topic: "Rewards", enabled: false },
        ]),
      ).toEqual(
        controlledError(
          queries.update,
          "updateNotificationSubscriptions",
          "The same topic appears more than once in the update",
          "DuplicateTopicUpdateError",
          400,
        ),
      );
      expect(await state()).toEqual(before);
      expect(
        await update(token, "CourtV2", [
          { topic: "JurorDraw", enabled: false },
          { topic: "Rewards", enabled: true },
        ]),
      ).toEqual(
        controlledError(
          queries.update,
          "updateNotificationSubscriptions",
          "Topic is not offered by this product",
          "TopicNotOfferedError",
          400,
        ),
      );
      expect(await state()).toEqual(before);
      expect(await gql(queries.preferences, {}, token)).toEqual({
        data: {
          user: {
            address,
            notificationSubscriptions: pohRows.map((row) =>
              row.topic === "PendingRevoke" ? { ...row, enabled: false } : row,
            ),
          },
        },
      });
    });

    it.each([
      ["query { notificationTopics(product: NotAProduct) { topic } }", "SignupProduct", "NotAProduct"],
      ["query { user { notificationSubscriptions(product: NotAProduct) { topic } } }", "SignupProduct", "NotAProduct"],
      [
        "mutation { updateNotificationSubscriptions(product: NotAProduct, subscriptions: []) }",
        "SignupProduct",
        "NotAProduct",
      ],
      [
        "mutation { updateNotificationSubscriptions(product: PohV2, subscriptions: [{ topic: NotATopic, enabled: true }]) }",
        "NotificationTopic",
        "NotATopic",
      ],
    ])("rejects unknown literal enum values before auth: %s", async (query, type, value) => {
      const response = await gql(query);
      expect(response.data).toBeUndefined();
      expect(response.errors?.[0]?.message).toBe(`Value "${value}" does not exist in "${type}" enum.`);
      expect(response.errors?.[0]?.extensions).toEqual({ code: "GRAPHQL_VALIDATION_FAILED" });
      expect(await state()).toEqual({ users: [], subscriptions: [] });
    });

    it("rejects unknown variable enums, including nested topics, before making any changes", async () => {
      const { token } = await signup();
      const before = await state();
      const badProduct = await update(token, "NotAProduct", []);
      expect(badProduct.errors?.[0]?.message).toBe(
        'Variable "$product" got invalid value "NotAProduct"; Value "NotAProduct" does not exist in "SignupProduct" enum.',
      );
      expect(badProduct.errors?.[0]?.extensions).toEqual({ code: "BAD_USER_INPUT" });
      const badTopic = await update(token, "PohV2", [
        { topic: "Rewards", enabled: true },
        { topic: "NotATopic", enabled: false },
      ]);
      expect(badTopic.errors?.[0]?.message).toBe(
        'Variable "$subscriptions" got invalid value "NotATopic" at "subscriptions[1].topic"; Value "NotATopic" does not exist in "NotificationTopic" enum.',
      );
      expect(badTopic.errors?.[0]?.extensions).toEqual({ code: "BAD_USER_INPUT" });
      expect(await state()).toEqual(before);
    });
  });

  describe("email lifecycle", () => {
    it("uses client queries, lowercase addresses, single-use tokens, and verified-email delivery gating", async () => {
      const { token, address, account } = await signup();
      const pending = await inbox(account.address);
      expect(pending).toEqual({
        token: expect.stringMatching(/^[a-f0-9]{32}$/),
        expiresAt: new Date(NOW + TWO_DAYS * 1000).toISOString(),
      });
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: "alice@example.com", isEmailVerified: false, emailUpdateableAt: DATE } },
      });
      expect(await gql(queries.subscribed, { address: account.address })).toEqual({ data: { isSubscribed: false } });
      expect(await confirm(account.address, "wrong-token")).toEqual({ data: { confirmEmail: invalid } });
      expect(await confirm(privateKeyToAccount(generatePrivateKey()).address, pending.token)).toEqual({
        data: { confirmEmail: invalid },
      });
      expect(await confirm(account.address, pending.token)).toEqual({ data: { confirmEmail: confirmed } });
      expect(await inbox(address)).toBeNull();
      expect(await confirm(account.address, pending.token)).toEqual({ data: { confirmEmail: invalid } });
      expect(await gql(queries.subscribed, { address: account.address }, "invalid JWT ignored")).toEqual({
        data: { isSubscribed: true },
      });
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: "alice@example.com", isEmailVerified: true, emailUpdateableAt: DATE } },
      });
      await update(
        token,
        "PohV2",
        pohTopics.map((topic) => ({ topic, enabled: false })),
      );
      expect(await gql(queries.subscribed, { address })).toEqual({ data: { isSubscribed: true } });
      const rows = (await state()).subscriptions;
      expect(await gql(queries.updateEmail, { newEmail: "new@example.com", product: "CourtV2" }, token)).toEqual({
        data: { updateEmail: true },
      });
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: "new@example.com", isEmailVerified: false, emailUpdateableAt: DATE } },
      });
      expect(await gql(queries.subscribed, { address })).toEqual({ data: { isSubscribed: false } });
      const next = await inbox(address);
      expect(next.token).not.toBe(pending.token);
      expect(await confirm(address, next.token)).toEqual({ data: { confirmEmail: confirmed } });
      expect((await state()).subscriptions).toEqual(rows);
    });

    it("overwrites pending tokens and expires only after two days", async () => {
      const { address, token } = await signup();
      const old = await inbox(address);
      await gql(queries.updateEmail, { newEmail: "next@example.com", product: "PohV2" }, token);
      const pending = await inbox(address);
      expect(pending.token).not.toBe(old.token);
      expect(await confirm(address, old.token)).toEqual({ data: { confirmEmail: invalid } });
      await clock(TWO_DAYS + 1);
      expect(await confirm(address, "wrong")).toEqual({ data: { confirmEmail: invalid } });
      expect(await confirm(address, pending.token)).toEqual({ data: { confirmEmail: expired } });
      expect(await inbox(address)).toEqual(pending);
      await clock(TWO_DAYS);
      expect(await confirm(address, pending.token)).toEqual({ data: { confirmEmail: confirmed } });
    });

    it("enforces the configured cooldown without changing email, preferences or inbox on failure", async () => {
      await stop();
      await start(60);
      const { address, token } = await signup();
      await update(token, "PohV2", [{ topic: "Rewards", enabled: true }]);
      const pending = await inbox(address);
      const before = await state();
      expect(await gql(queries.user, {}, token)).toEqual({
        data: {
          user: {
            email: "alice@example.com",
            isEmailVerified: false,
            emailUpdateableAt: new Date(NOW + 60_000).toISOString(),
          },
        },
      });
      await clock(59);
      expect(await gql(queries.updateEmail, { newEmail: "new@example.com", product: "PohV2" }, token)).toEqual(
        controlledError(
          queries.updateEmail,
          "updateEmail",
          "Email can only be updated once every 60 seconds",
          "TooFrequentEmailUpdateError",
          429,
          59,
        ),
      );
      expect(await state()).toEqual(before);
      expect(await inbox(address)).toEqual(pending);
      await clock(60);
      expect(await gql(queries.updateEmail, { newEmail: "new@example.com", product: "PohV2" }, token)).toEqual({
        data: { updateEmail: true },
      });
      expect(await gql(queries.user, {}, token)).toEqual({
        data: {
          user: {
            email: "new@example.com",
            isEmailVerified: false,
            emailUpdateableAt: new Date(NOW + 120_000).toISOString(),
          },
        },
      });
      expect((await inbox(address)).expiresAt).toBe(new Date(NOW + (60 + TWO_DAYS) * 1000).toISOString());
      expect((await state()).subscriptions).toEqual(before.subscriptions);
    });

    it("deletes only the authenticated user's rows and inbox; re-signup restores defaults", async () => {
      const alice = await signup();
      const bob = await signup();
      await update(alice.token, "PohV2", [{ topic: "Rewards", enabled: true }]);
      await update(bob.token, "PohV2", [{ topic: "VouchingPhase", enabled: false }]);
      expect(await gql(queries.delete, {}, alice.token)).toEqual({ data: { deleteUser: true } });
      expect(await inbox(alice.address)).toBeNull();
      expect(await gql(queries.subscribed, { address: alice.account.address })).toEqual({
        data: { isSubscribed: false },
      });
      expect((await state()).subscriptions).toEqual([
        { userAddress: bob.address, product: "pohV2", topic: "vouchingPhase", enabled: false },
      ]);
      expect(await gql(queries.preferences, {}, alice.token)).toEqual({
        data: { user: { address: alice.address, notificationSubscriptions: null } },
      });
      expect(
        await gql(queries.add, { settings: { email: "again@example.com", product: "PohV2" } }, alice.token),
      ).toEqual({ data: { addUser: true } });
      expect(await gql(queries.allPreferences, {}, alice.token)).toEqual({
        data: { user: { address: alice.address, notificationSubscriptions: expectedRows } },
      });
    });

    it("rejects duplicate signup and missing-user email/delete operations", async () => {
      const { token } = await login();
      expect(await gql(queries.updateEmail, { newEmail: "a@example.com", product: "PohV2" }, token)).toEqual(
        controlledError(queries.updateEmail, "updateEmail", "User not found", "UserNotFoundError", 404),
      );
      expect(await gql(queries.delete, {}, token)).toEqual(
        controlledError(queries.delete, "deleteUser", "User not found", "UserNotFoundError", 404),
      );
      await gql(queries.add, { settings: { email: "first@example.com", product: "PohV2" } }, token);
      const before = await state();
      expect(await gql(queries.add, { settings: { email: "second@example.com", product: "PohV2" } }, token)).toEqual(
        controlledError(queries.add, "addUser", "The user is already registered", "UserAlreadyRegisteredError", 409),
      );
      expect(await state()).toEqual(before);
    });
  });

  describe("test controls and HTTP", () => {
    it("injects only the requested count/product, before mutations, and supports clearing", async () => {
      const { token } = await signup();
      await control("faults", "POST", {
        field: "updateNotificationSubscriptions",
        product: "PohV2",
        times: 2,
        error: "try again",
      });
      const fail = {
        data: null,
        errors: [
          {
            message: "try again",
            locations: [location(queries.update, "updateNotificationSubscriptions")],
            path: ["updateNotificationSubscriptions"],
          },
        ],
      };
      expect(await update(token, "CourtV2", [])).toEqual({ data: { updateNotificationSubscriptions: true } });
      expect(await update(token, "PohV2", [{ topic: "Rewards", enabled: true }])).toEqual(fail);
      expect((await state()).subscriptions).toEqual([]);
      expect(await update(token, "PohV2", [])).toEqual(fail);
      expect(await update(token, "PohV2", [])).toEqual({ data: { updateNotificationSubscriptions: true } });
      await control("faults", "POST", { field: "notificationTopics" });
      const failed = await gql(queries.topics);
      expect(failed.errors?.[0]?.message).toBe("mock-atlas: injected fault");
      expect(await gql(queries.topics)).toEqual({ data: { notificationTopics: expectedTopics } });
      await control("faults", "POST", { field: "user", product: "PohV2" });
      expect(await gql(`{ user { email } }`, {}, token)).toEqual({ data: { user: { email: "alice@example.com" } } });
      expect((await gql(queries.preferences, {}, token)).errors?.[0]?.message).toBe("mock-atlas: injected fault");
      await control("faults", "POST", { field: "user", times: 3 });
      await control("faults", "DELETE");
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: "alice@example.com", isEmailVerified: false, emailUpdateableAt: DATE } },
      });
    });

    it("records original variables, root fields and verified authorization, including rejected requests", async () => {
      const { token } = await login();
      await control("reset", "POST");
      await gql(queries.topics, { product: "Foresight" });
      await request({ operationName: "Misleading", query: queries.user }, token);
      const settings = { email: "record@example.com", product: "PohV2" };
      await gql(queries.add, { settings }, token);
      await gql(queries.updateEmail, { newEmail: "new@example.com", product: "CourtV2" }, token);
      await gql(queries.preferences, {}, "malformed");
      await control("faults", "POST", { field: "updateNotificationSubscriptions" });
      const changes = { product: "PohV2", subscriptions: [{ topic: "Rewards", enabled: true }] };
      await gql(queries.update, changes, token);
      expect(await control("requests")).toEqual([
        { field: "notificationTopics", variables: { product: "Foresight" }, authorized: false },
        { field: "user", variables: {}, authorized: true },
        { field: "addUser", variables: { settings }, authorized: true },
        { field: "updateEmail", variables: { newEmail: "new@example.com", product: "CourtV2" }, authorized: true },
        { field: "user", variables: {}, authorized: false },
        { field: "updateNotificationSubscriptions", variables: changes, authorized: true },
      ]);
    });

    it("resets users, rows, inboxes, nonces, faults, request history and clock", async () => {
      const { token, address, account } = await signup();
      await update(token, "PohV2", [{ topic: "Rewards", enabled: true }]);
      const nonce = (await gql(queries.nonce, { address: account.address })).data?.nonce;
      if (!nonce) throw new Error("Nonce was not returned");
      await clock(100);
      await control("faults", "POST", { field: "user", times: 5 });
      expect(await control("reset", "POST")).toEqual({ ok: true });
      expect(await control("requests")).toEqual([]);
      expect(await state()).toEqual({ users: [], subscriptions: [] });
      expect(await inbox(address)).toBeNull();
      expect(await gql(queries.preferences, {}, token)).toEqual({
        data: { user: { address, notificationSubscriptions: null } },
      });
      const message = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: "localhost:3000",
        uri: "http://localhost:3000",
        version: "1",
        nonce,
        issuedAt: new Date(NOW),
        expirationTime: new Date(NOW + 600_000),
      });
      expect(await gql(queries.login, { message, signature: await account.signMessage({ message }) })).toEqual(
        controlledError(
          queries.login,
          "login",
          "Invalid nonce in siwe signature, please provide a valid siwe signature",
          "InvalidNonceError",
          401,
        ),
      );
      await gql(queries.add, { settings: { email: "reset@example.com", product: "CourtV2" } }, token);
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: "reset@example.com", isEmailVerified: false, emailUpdateableAt: DATE } },
      });
    });

    it("serves health, CORS including DELETE, and rejects removed/unknown routes", async () => {
      const health = await fetch(`${base}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.text()).toBe("ok");
      const cors = await fetch(`${base}/__test/faults`, { method: "OPTIONS" });
      expect(cors.status).toBe(204);
      expect(cors.headers.get("access-control-allow-methods")).toBe("GET, HEAD, POST, DELETE, OPTIONS");
      expect(cors.headers.get("access-control-allow-headers")).toBe("content-type, authorization");
      for (const path of ["/ipfs/file", "/ipfs/anything", "/unknown", "/__test/missing"]) {
        expect((await fetch(`${base}${path}`, { method: path.endsWith("file") ? "POST" : "GET" })).status).toBe(404);
      }
      const malformed = await fetch(`${base}/graphql`, { method: "POST", body: "{" });
      expect(malformed.status).toBe(200);
      expect(await malformed.json()).toEqual({
        errors: [{ message: "Invalid JSON request", extensions: { code: "BAD_USER_INPUT" } }],
      });
    });
  });

  describe("additional contract boundaries", () => {
    it("protects every account mutation and validates missing users before storing anything", async () => {
      for (const [query, field, variables] of [
        [queries.add, "addUser", { settings: { email: "a@example.com", product: "CourtV2" } }],
        [queries.updateEmail, "updateEmail", { newEmail: "a@example.com", product: "CourtV2" }],
        [queries.delete, "deleteUser", {}],
      ] as const) {
        expect(await gql(query, variables)).toEqual(
          controlledError(query, field, "An Auth token must be provided", "NoTokenProvidedError", 401),
        );
      }
      const { token } = await login();
      expect(
        await gql(queries.add, { settings: { email: "a@example.com", product: "PohV2", roles: ["Admin"] } }, token),
      ).toEqual(
        controlledError(
          queries.add,
          "addUser",
          "Unauthorized: only admins can assign roles",
          "UnauthorizedRoleAssignmentError",
          403,
        ),
      );
      expect(await state()).toEqual({ users: [], subscriptions: [] });
    });

    it("reports exact enum validation locations for literal and variable inputs", async () => {
      const query = `mutation { updateNotificationSubscriptions(product: PohV2, subscriptions: [{topic: NotATopic, enabled: true}]) }`;
      expect(await gql(query)).toEqual({
        errors: [
          {
            message: 'Value "NotATopic" does not exist in "NotificationTopic" enum.',
            locations: [location(query, "NotATopic")],
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
          },
        ],
      });
      expect(await gql(queries.topics, { product: "NotAProduct" })).toEqual({
        errors: [
          {
            message:
              'Variable "$product" got invalid value "NotAProduct"; Value "NotAProduct" does not exist in "SignupProduct" enum.',
            locations: [location(queries.topics, "$product")],
            extensions: { code: "BAD_USER_INPUT" },
          },
        ],
      });
      const nested = `query Read($selected: SignupProduct) { user { notificationSubscriptions(product: $selected) { topic } } }`;
      expect(await gql(nested, { selected: "NotAProduct" })).toEqual({
        errors: [
          {
            message:
              'Variable "$selected" got invalid value "NotAProduct"; Value "NotAProduct" does not exist in "SignupProduct" enum.',
            locations: [location(nested, "$selected")],
            extensions: { code: "BAD_USER_INPUT" },
          },
        ],
      });
    });

    it("supports variables inside literal subscription inputs and publishes exact stored state", async () => {
      const { token, address } = await signup();
      const query = `mutation Arbitrary($topic: NotificationTopic!, $enabled: Boolean!) { updateNotificationSubscriptions(product: PohV2, subscriptions: [{topic: $topic, enabled: $enabled}]) }`;
      expect(await gql(query, { topic: "Rewards", enabled: true }, token)).toEqual({
        data: { updateNotificationSubscriptions: true },
      });
      expect(await state()).toEqual({
        users: [
          {
            address,
            email: "alice@example.com",
            isEmailVerified: false,
            emailUpdateableAt: DATE,
            lastEmailUpdatedAt: DATE,
            roles: ["user"],
          },
        ],
        subscriptions: [{ userAddress: address, product: "pohV2", topic: "rewards", enabled: true }],
      });
    });

    it("matches fault products in settings and literals and leaves unmatched requests alone", async () => {
      const { token } = await login();
      await control("faults", "POST", { field: "addUser", product: "pohV2", error: "signup failure" });
      expect(
        (await gql(queries.add, { settings: { email: "a@example.com", product: "PohV2" } }, token)).errors?.[0]
          ?.message,
      ).toBe("signup failure");
      expect(await state()).toEqual({ users: [], subscriptions: [] });
      await control("faults", "POST", { field: "notificationTopics", product: "Foresight" });
      expect(await gql(queries.topics, { product: "CourtV1" })).toEqual({
        data: { notificationTopics: expectedTopics.filter(({ product }) => product === "CourtV1") },
      });
      expect((await gql(`{ notificationTopics(product: Foresight) { topic } }`)).errors?.[0]?.message).toBe(
        "mock-atlas: injected fault",
      );
      await control("faults", "POST", { field: "updateNotificationSubscriptions" });
      expect((await update(token, "NotAProduct", [])).errors?.[0]?.message).toBe("mock-atlas: injected fault");
    });

    it("rejects malformed test controls without changing the clock or pending faults", async () => {
      for (const [path, body] of [
        ["faults", { field: "user", times: 0 }],
        ["faults", { field: "user", times: 1.5 }],
        ["faults", { field: 2 }],
        ["clock", { offsetSeconds: "100" }],
      ] as const) {
        const response = await fetch(`${base}/__test/${path}`, { method: "POST", body: JSON.stringify(body) });
        expect(response.status).toBe(400);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
      }
      const { token } = await signup();
      expect(await gql(queries.user, {}, token)).toEqual({
        data: { user: { email: "alice@example.com", isEmailVerified: false, emailUpdateableAt: DATE } },
      });
    });

    it("records nonce and login requests without treating public access as authorization", async () => {
      const { account, message, signature } = await login();
      expect(await control("requests")).toEqual([
        { field: "nonce", variables: { address: account.address }, authorized: false },
        { field: "login", variables: { message, signature }, authorized: false },
      ]);
    });

    it("rejects malformed queries without hanging or mutating state", async () => {
      for (const query of [
        "query {",
        "query Test($product:",
        "mutation { updateNotificationSubscriptions(product: PohV2, subscriptions: [",
      ]) {
        expect((await gql(query)).errors?.[0]?.extensions).toEqual({ code: "GRAPHQL_PARSE_FAILED" });
      }
      expect(await state()).toEqual({ users: [], subscriptions: [] });
    });
  });

  describe("signature and JWT verification", () => {
    it("rejects replay and signatures from the wrong account", async () => {
      const { message, signature, account } = await login();
      expect(await gql(queries.login, { message, signature })).toEqual(
        controlledError(
          queries.login,
          "login",
          "Invalid nonce in siwe signature, please provide a valid siwe signature",
          "InvalidNonceError",
          401,
        ),
      );
      const nonce = (await gql(queries.nonce, { address: account.address })).data?.nonce;
      if (!nonce) throw new Error("Nonce was not returned");
      const next = createSiweMessage({
        address: account.address,
        chainId: 1,
        domain: "localhost:3000",
        uri: "http://localhost:3000",
        version: "1",
        nonce,
        issuedAt: new Date(NOW),
        expirationTime: new Date(NOW + 600_000),
      });
      const wrongAccount = privateKeyToAccount(generatePrivateKey());
      expect(
        await gql(queries.login, { message: next, signature: await wrongAccount.signMessage({ message: next }) }),
      ).toEqual(
        controlledError(queries.login, "login", "SIWE signature is not valid", "SIWESignatureInvalidError", 401),
      );
    });

    it("rejects missing SIWE fields, mismatched domain/URI ports, and expired messages", async () => {
      const { account, message } = await login();
      const withoutExpiry = message
        .split("\n")
        .filter((line) => !line.startsWith("Expiration Time:"))
        .join("\n");
      expect(
        await gql(queries.login, {
          message: withoutExpiry,
          signature: await account.signMessage({ message: withoutExpiry }),
        }),
      ).toEqual(
        controlledError(
          queries.login,
          "login",
          "SIWE message is malformed: expirationTime is missing",
          "SIWEFieldMissingError",
          400,
        ),
      );
      const wrongPort = message.replace("URI: http://localhost:3000", "URI: http://localhost:3001");
      expect(
        await gql(queries.login, { message: wrongPort, signature: await account.signMessage({ message: wrongPort }) }),
      ).toEqual(
        controlledError(
          queries.login,
          "login",
          "Domain and URI fields do not match",
          "SIWEDomainURIMismatchError",
          401,
        ),
      );
      const nonce = (await gql(queries.nonce, { address: account.address })).data?.nonce;
      if (!nonce) throw new Error("Nonce was not returned");
      const expiredMessage = createSiweMessage({
        address: account.address,
        domain: "localhost:3000",
        uri: "http://localhost:3000",
        version: "1",
        chainId: 1,
        nonce,
        issuedAt: new Date(NOW - 60_000),
        expirationTime: new Date(NOW - 1),
      });
      expect(
        await gql(queries.login, {
          message: expiredMessage,
          signature: await account.signMessage({ message: expiredMessage }),
        }),
      ).toEqual(
        controlledError(queries.login, "login", "SIWE signature is not valid", "SIWESignatureInvalidError", 401),
      );
    });

    it("rejects expired JWTs using the controlled clock", async () => {
      const { token } = await login();
      const offset = 7 * 24 * 60 * 60;
      await clock(offset);
      expect(await gql(queries.user, {}, token)).toEqual(
        controlledError(queries.user, "user", "Expired Token", "ExpiredTokenError", 401, offset),
      );
      expect(await control("requests")).toEqual(
        expect.arrayContaining([{ field: "user", variables: {}, authorized: false }]),
      );
    });
  });
};
