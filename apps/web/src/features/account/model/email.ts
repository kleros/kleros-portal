// local@domain.tld, no spaces, a dot in the domain and a TLD of two or more letters
const EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export const isValidEmail = (value: string) => EMAIL.test(value.trim());

export const normaliseEmail = (value: string) => value.trim();

/**
 * When Atlas next accepts an email change, or null when it does now. Atlas sends `emailUpdateableAt`
 * as an ISO time; a missing or unparseable value means no cooldown.
 */
export function cooldownUntil(emailUpdateableAt: string | null | undefined, now = Date.now()): Date | null {
  if (!emailUpdateableAt) return null;
  const at = Date.parse(emailUpdateableAt);
  return Number.isFinite(at) && at > now ? new Date(at) : null;
}

/** "14:05" today, else "27 Oct, 14:05", in the viewer's locale and time zone. */
export function formatCooldown(until: Date, now = new Date()): string {
  const time = until.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return until.toDateString() === now.toDateString()
    ? time
    : `${until.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}
