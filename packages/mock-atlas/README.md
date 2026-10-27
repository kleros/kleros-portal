# @kleros-portal/mock-atlas

Local Atlas stand-in for the web dev server and Playwright. Requires Node 22.23.4 and the repository's installed Yarn dependencies.

```sh
yarn workspace @kleros-portal/mock-atlas start
```

Set `NEXT_PUBLIC_ATLAS_URI=http://127.0.0.1:4848` in the web app. The server binds to loopback. `MOCK_ATLAS_PORT` overrides port `4848`; `MOCK_ATLAS_EMAIL_COOLDOWN_SECONDS` sets a non-negative email cooldown in seconds (default `0`). All state is in memory.

`createMockAtlasServer()` from `src/server.ts` creates an isolated server without listening. Tests call `server.listen(0, "127.0.0.1")` for an ephemeral port. The package entry point exports `DEFAULT_PORT`, `MOCK_ROLES`, and the product/topic enums and `PRODUCT_TOPIC_DEFAULTS` from `registry.ts`.

## GraphQL operations

Send JSON `{ query, variables?, operationName? }` to `POST /graphql`. Dispatch uses the first root field in the query, not its operation name. Comments, aliases, variable defaults, nested input objects, and literal/variable arguments are supported. With no query, legacy operation names such as `GetUser` still work.

Protected operations require `Authorization: Bearer <accessToken>`. Addresses compare lowercase. GraphQL execution responses use HTTP 200, including resolver/auth errors. Parse and literal enum validation errors use HTTP 400; variable coercion errors use HTTP 200, matching Atlas's Apollo 4 default. Controlled errors include `message`, `locations`/`path` when available, and `extensions: { code, timestamp, equivalentHTTPStatusCode }`.

| Root field (legacy name)                                              | Auth | Arguments and result                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nonce` (`GetNonce`)                                                  | None | `address: Address!`; returns a SIWE nonce.                                                                                                                                                                                                                        |
| `login` (`Login`)                                                     | None | `message: String!`, `signature: String!`; returns JSON `{ accessToken }`, without a selection set. Checks the SIWE fields, nonce, expiration, domain/URI match and recovered EOA signature. Nonces are single-use; JWTs expire in seven days.                     |
| `roles` (`Roles`)                                                     | None | Accepts the client's `product: Products!`; returns the existing mock role restrictions (`name`, `restriction { maxSize allowedMimeTypes }`).                                                                                                                      |
| `user` (`GetUser`)                                                    | JWT  | Returns only selected fields: `address`, `email`, `isEmailVerified`, `emailUpdateableAt`, `lastEmailUpdatedAt`, `roles`, `notificationSubscriptions(product?)`. Before signup, email/dates/subscriptions are `null`, verification is `false`, and roles are `[]`. |
| `addUser` (`AddUser`)                                                 | JWT  | `addUserSettings: $settings`, with variables `{ settings: { email, product } }`; returns `true`, creates an unverified user and a confirmation token. Duplicate signup is rejected.                                                                               |
| `updateEmail` (`UpdateEmail`)                                         | JWT  | Variables `{ newEmail, product }`; returns `true`, replaces the email/token and clears verification. Preserves subscriptions. Rejects updates during cooldown.                                                                                                    |
| `confirmEmail` (`ConfirmEmail`)                                       | None | `confirmEmailInput: { address: $address, token: $token }`; returns `{ isConfirmed isTokenExpired isTokenInvalid }`. Successful tokens are consumed.                                                                                                               |
| `deleteUser` (`DeleteUser`)                                           | JWT  | No arguments; returns `true`. Deletes the authenticated user's account, pending confirmation and subscriptions. Missing users are rejected.                                                                                                                       |
| `isSubscribed` (`isSubscribed`)                                       | None | `address: Address!`; returns `Boolean(user.isEmailVerified)`, regardless of topic preferences.                                                                                                                                                                    |
| `notificationTopics` (`NotificationTopics`)                           | None | Optional `product: SignupProduct`; returns `{ product topic defaultEnabled }`. Omit/null for all products.                                                                                                                                                        |
| `updateNotificationSubscriptions` (`UpdateNotificationSubscriptions`) | JWT  | `product: SignupProduct!`, `subscriptions: [NotificationSubscriptionInput!]!`, each `{ topic, enabled }`; validates the whole batch before upserting. Returns `true`, including an empty batch for a registered user.                                             |

GraphQL enums use **member names**: `CourtV1`, `CourtV2`, `PohV2`, `Foresight`; topics include `JurorDraw`, `VouchingPhase`, `Rewards`, and `MarketResolved`. The exported registry and stored rows use the Atlas values (`courtV1`, `courtV2`, `pohV2`, `foresight`, `jurorDraw`, etc.).

Catalogue and effective subscription rows follow product enum order, then topic enum order. Court V1/V2 each offer 11 topics, PoH V2 offers 13, and Foresight offers one. All defaults are enabled except PoH V2 `Rewards`. Signup stores no subscription rows. Reads merge stored preferences over defaults; re-signup after deletion starts from defaults. Unverified users may read and change preferences.

```graphql
query Preferences($product: SignupProduct) {
  user {
    address
    email
    notificationSubscriptions(product: $product) {
      product
      topic
      enabled
    }
  }
}

mutation Save($product: SignupProduct!, $subscriptions: [NotificationSubscriptionInput!]!) {
  updateNotificationSubscriptions(product: $product, subscriptions: $subscriptions)
}
```

Confirmation tokens are 32 hex characters and expire after two days. Wrong tokens and unknown addresses set `isTokenInvalid`; matching expired tokens set `isTokenExpired`. At the exact expiry instant a token is still valid, matching Atlas. AddUser/UpdateEmail set `emailUpdateableAt` to the mock time plus the configured cooldown.

## Test controls

These unauthenticated endpoints are for local tests only. All responses include CORS headers; `OPTIONS` allows GET, HEAD, POST, DELETE and OPTIONS. Do not expose this server publicly.

| Request                                | Body or query                         | Response/effect                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /__test/reset`                   | None                                  | `{ ok: true }`; clears users, subscriptions, confirmations, nonces, faults, requests and clock offset. Existing stateless JWTs remain valid.                                                                                                                                                                 |
| `POST /__test/faults`                  | `{ field, product?, times?, error? }` | `{ ok: true }`; queues a fault for the next `times` matching root-field requests (default `1`). Message defaults to `mock-atlas: injected fault`. Match products by GraphQL name or registry value. Faults run before validation/auth and never mutate account state.                                        |
| `DELETE /__test/faults`                | None                                  | `{ ok: true }`; clears all pending faults.                                                                                                                                                                                                                                                                   |
| `GET /__test/confirmation?address=0x…` | Case-insensitive address              | `{ token, expiresAt }` for the pending confirmation, or `null`. `expiresAt` is an ISO timestamp; expired tokens remain visible until replaced/deleted.                                                                                                                                                       |
| `POST /__test/clock`                   | `{ offsetSeconds }`                   | `{ ok: true }`; sets, rather than adds to, the real-time offset. Affects email expiry/cooldown, JWTs and SIWE validity. Accepts negative offsets; reset returns to zero.                                                                                                                                     |
| `GET /__test/state`                    | None                                  | `{ users: [...], subscriptions: [...] }`. Users include lowercase `address`, email, verification, ISO cooldown/update dates and roles. Stored rows are `{ userAddress, product, topic, enabled }` in insertion order, using registry values.                                                                 |
| `GET /__test/requests`                 | None                                  | Requests since reset, in arrival order: `{ field, variables, authorized }`. Variables are the original request values, without default expansion. `authorized` means a valid JWT, not merely an Authorization header. Includes rejected/faulted requests with a parseable root; excludes test-control calls. |

For `user` faults, a product filter matches the first selected `notificationSubscriptions` argument. For `addUser`, it matches `settings.product`. Unmatched requests do not consume faults. Invalid fault/clock bodies receive HTTP 400.

`GET /healthz` returns `ok`. Removed upload/gateway routes and unknown routes return HTTP 404.

## Atlas errors and source references

Sources below are in the real Atlas repository at `origin/master`.

| `extensions.code`                 | Exact message                                                            | Equivalent HTTP status | Source                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------- |
| `TopicNotOfferedError`            | `Topic is not offered by this product`                                   | 400                    | `packages/api/src/user/subscriptions/notification-subscription.errors.ts` |
| `DuplicateTopicUpdateError`       | `The same topic appears more than once in the update`                    | 400                    | Same file                                                                 |
| `UserNotFoundError`               | `User not found`                                                         | 404                    | `packages/api/src/user/core/user.errors.ts`                               |
| `NoTokenProvidedError`            | `An Auth token must be provided`                                         | 401                    | `packages/auth/src/auth/auth.guard.errors.ts`                             |
| `InvalidTokenError`               | `Invalid Token`                                                          | 401                    | Same file                                                                 |
| `ExpiredTokenError`               | `Expired Token`                                                          | 401                    | Same file                                                                 |
| `UserAlreadyRegisteredError`      | `The user is already registered`                                         | 409                    | `packages/api/src/user/core/user.errors.ts`                               |
| `UnauthorizedRoleAssignmentError` | `Unauthorized: only admins can assign roles`                             | 403                    | Same file                                                                 |
| `TooFrequentEmailUpdateError`     | `Email can only be updated once every ${cooldown} seconds`               | 429                    | `packages/api/src/user/signup/signup.errors.ts`                           |
| `SIWEFieldMissingError`           | `SIWE message is malformed: ${field} is missing`                         | 400                    | `packages/api/src/user/login/login.errors.ts`                             |
| `InvalidNonceError`               | `Invalid nonce in siwe signature, please provide a valid siwe signature` | 401                    | Same file                                                                 |
| `SIWESignatureInvalidError`       | `SIWE signature is not valid`                                            | 401                    | Same file                                                                 |
| `SIWEDomainURIMismatchError`      | `Domain and URI fields do not match`                                     | 401                    | Same file                                                                 |

`packages/errors/src/graphql-error.ts` defines the extensions shape. Unknown literal enum values return `GRAPHQL_VALIDATION_FAILED`; unknown enum values in variables return `BAD_USER_INPUT`. These schema errors have no `data` or equivalent HTTP status extension. Injected faults have the configured message and no extensions.

## Scope differences

- Per the mock requirements, an empty subscription update without signup returns `UserNotFoundError`. Atlas's current service short-circuits an empty list to `true` before checking the user foreign key.
- Per the mock requirements, signup starts the configured email cooldown. Atlas starts that cooldown only after an email update.
- The parser handles the operations above, not the full GraphQL schema: only the first operation/root field executes; fragments and directives are unsupported. Full schema validation, enum spelling suggestions, throttling, API-key authentication and origin allowlists are not reproduced.
- SIWE verification recovers EOA signatures locally; smart-contract-wallet verification and chain RPC calls are not implemented. JWTs use a local test secret. Email delivery is the test inbox, not SendGrid. There is no database, encryption-at-rest or persistence.

## Checks

From the repository root:

```sh
yarn workspace @kleros-portal/mock-atlas check-types
yarn workspace @kleros-portal/mock-atlas lint
yarn workspace @kleros-portal/mock-atlas test
yarn workspace @kleros-portal/mock-atlas format:check
```

`atlas.test.ts` runs the contract over HTTP on an ephemeral port. `atlas.inProcess.test.ts` runs the same assertions against the server's request listener without a TCP socket. The latter can run alone in a sandbox that forbids listening, but does not replace HTTP verification:

```sh
yarn workspace @kleros-portal/mock-atlas test src/atlas.inProcess.test.ts
```
