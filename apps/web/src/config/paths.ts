/**
 * Every route the app links to. Components call `getHref()` instead of writing URL strings.
 */
export const paths = {
  home: {
    getHref: () => "/",
  },
  notifications: {
    getHref: (product?: string) =>
      product ? `/notifications?product=${encodeURIComponent(product)}` : "/notifications",
  },
  apiKeys: {
    getHref: () => "/api-keys",
  },
  /** Landing page for the confirmation link Atlas puts in its emails. */
  emailConfirmation: {
    getHref: () => "/email-confirmation",
  },
} as const;
