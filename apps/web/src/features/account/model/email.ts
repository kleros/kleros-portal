// Common unquoted addresses follow class-validator's default isEmail constraints.
const LOCAL_ATOM = /^[a-z\d!#$%&'*+\-/=?^_`{|}~\u00a1-\ud7ff\uf900-\ufdcf\ufdf0-\uffef]+$/i;
const DOMAIN_LABEL = /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i;

export function isValidEmail(input: string): boolean {
  const value = input.trim();
  if (value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local = "", domain = ""] = parts;
  if (new TextEncoder().encode(local).length > 64 || !local.split(".").every((atom) => LOCAL_ATOM.test(atom)))
    return false;
  const labels = domain.split(".");
  return (
    labels.length > 1 &&
    /^[a-z]{2,}$/i.test(labels.at(-1) ?? "") &&
    labels.every((label) => label.length <= 63 && DOMAIN_LABEL.test(label))
  );
}

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
