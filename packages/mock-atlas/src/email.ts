// Common unquoted addresses follow class-validator's default isEmail constraints.
const LOCAL_ATOM = /^[a-z\d!#$%&'*+\-/=?^_`{|}~\u00a1-\ud7ff\uf900-\ufdcf\ufdf0-\uffef]+$/i;
const DOMAIN_LABEL = /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i;

export function isValidEmail(value: string): boolean {
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
