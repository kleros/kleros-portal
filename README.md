# Kleros Portal

Where a wallet signs in once and chooses which emails each Kleros product sends it. API keys come next.

- `apps/web`: the portal. Next.js 14 (App Router), Tailwind 4, the
  [Kleros UI components library](https://github.com/kleros/ui-components-library), wagmi with Reown AppKit,
  and sign-in through Kleros Atlas via [`@kleros/kleros-app`](https://github.com/kleros/kleros-v2/tree/master/kleros-app).
- `packages/mock-atlas`: a local Atlas for development and end-to-end tests.
- `packages/{eslint,prettier,typescript}-config`: shared tooling config.

## Requirements

Node **22.23.4** (pinned in `.nvmrc`, `package.json` `engines` and `volta`, and `netlify.toml`): the first 22.x with
the October 2026 security fixes. Yarn 4.9.2 through Corepack.

## Start

```bash
corepack enable
yarn install
cp apps/web/.env.example apps/web/.env.local   # then set NEXT_PUBLIC_REOWN_PROJECT_ID
yarn dev                                       # the portal on :3000 and mock Atlas on :4747
```

## Checks

| Command              | What it runs                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `yarn format:check`  | Prettier, root and every workspace                                                         |
| `yarn lint`          | ESLint, zero warnings, including the feature-boundary rules                                |
| `yarn check-types`   | `tsc --noEmit` per workspace                                                               |
| `yarn test`          | Vitest: unit, component and property tests, plus mock Atlas's own tests                    |
| `yarn test:coverage` | the same with coverage floors (90% lines and branches on `src/features`, `src/lib/atlas`)  |
| `yarn test:mutation` | Stryker over the logic layers; fails below an 80% mutation score                           |
| `yarn test:e2e`      | Playwright against mock Atlas: every flow, axe on every page, layout and screenshot checks |

CI runs all of them; mutation testing runs incrementally on pull requests and in full nightly.

## How it talks to Atlas

- Sign-in, the email and its confirmation go through `AtlasProvider` from kleros-app.
- Notification preferences use Atlas's `notificationTopics`, `user.notificationSubscriptions` and
  `updateNotificationSubscriptions` directly; products and topics come from Atlas, the portal only words them
  (`apps/web/src/features/notifications/model/copy.ts`).
- Emails are added and changed with `signupProduct: CourtV2` (`apps/web/src/config/atlas.ts`), which only picks the
  confirmation email's template.
- The confirmation link Atlas emails must land on `/email-confirmation`, and the portal's origin must be on Atlas's
  allow-list.
