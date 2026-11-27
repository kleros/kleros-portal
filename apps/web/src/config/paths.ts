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
  /** PROTOTYPE, throwaway: where Descope's External Authentication action sends the browser. */
  descopeLoginPrototype: {
    getHref: () => "/prototype/descope-login",
  },
} as const;

/**
 * Where `/` sends a visitor. Atlas builds the confirmation link from the signup product's path, and
 * CourtV2's is Court's hash route `/#/settings/email-confirmation?…`, which only the browser can read.
 */
export function landingTarget(hash: string): string {
  const match = /^#\/settings\/email-confirmation\?(.*)$/.exec(hash);
  return match ? `${paths.emailConfirmation.getHref()}?${match[1]}` : paths.notifications.getHref();
}
