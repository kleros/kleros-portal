import { randomBytes } from "node:crypto";

import { NotificationTopic, PRODUCT_TOPIC_DEFAULTS, SignupProduct } from "./registry";

export type User = {
  address: string;
  email: string;
  isEmailVerified: boolean;
  emailUpdateableAt: string;
  lastEmailUpdatedAt: string;
  roles: string[];
};
export type Subscription = { userAddress: string; product: SignupProduct; topic: NotificationTopic; enabled: boolean };
export type Fault = { field: string; product?: string; times: number; error: string };
export type RequestEntry = { field: string; variables: Record<string, unknown>; authorized: boolean };
export type Confirmation = { token: string; expiresAt: string };

export const createStore = (emailCooldownSeconds = 0) => ({
  users: new Map<string, User>(),
  subscriptions: new Map<string, Subscription>(),
  confirmations: new Map<string, Confirmation>(),
  nonces: new Map<string, Set<string>>(),
  faults: [] as Fault[],
  requests: [] as RequestEntry[],
  offsetSeconds: 0,
  emailCooldownSeconds,
});
export type Store = ReturnType<typeof createStore>;
export const now = (store: Store) => Date.now() + store.offsetSeconds * 1000;

export const reset = (store: Store) => {
  store.users.clear();
  store.subscriptions.clear();
  store.confirmations.clear();
  store.nonces.clear();
  store.faults.length = 0;
  store.requests.length = 0;
  store.offsetSeconds = 0;
};

export const takeFault = (store: Store, field: string, product?: unknown) => {
  const fault = store.faults.find(
    (entry) =>
      entry.field === field &&
      (entry.product === undefined ||
        entry.product === product ||
        (typeof product === "string" &&
          Object.hasOwn(SignupProduct, product) &&
          entry.product === SignupProduct[product as keyof typeof SignupProduct])),
  );
  if (!fault) return undefined;
  fault.times -= 1;
  if (fault.times === 0) store.faults.splice(store.faults.indexOf(fault), 1);
  return fault.error;
};

export const issueConfirmation = (store: Store, address: string, email: string) => {
  const key = address.toLowerCase();
  const timestamp = now(store);
  const user = store.users.get(key)!;
  Object.assign(user, {
    email,
    isEmailVerified: false,
    lastEmailUpdatedAt: new Date(timestamp).toISOString(),
    emailUpdateableAt: new Date(timestamp + store.emailCooldownSeconds * 1000).toISOString(),
  });
  store.confirmations.set(key, {
    token: randomBytes(16).toString("hex"),
    expiresAt: new Date(timestamp + 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
};

export const confirmEmail = (store: Store, address: string, token: string) => {
  const key = address.toLowerCase();
  const pending = store.confirmations.get(key);
  const user = store.users.get(key);
  if (!user || !pending || pending.token !== token) {
    return { isConfirmed: false, isTokenExpired: false, isTokenInvalid: true };
  }
  if (now(store) > Date.parse(pending.expiresAt)) {
    return { isConfirmed: false, isTokenExpired: true, isTokenInvalid: false };
  }
  user.isEmailVerified = true;
  store.confirmations.delete(key);
  return { isConfirmed: true, isTokenExpired: false, isTokenInvalid: false };
};

export const deleteUser = (store: Store, address: string) => {
  const key = address.toLowerCase();
  store.users.delete(key);
  store.confirmations.delete(key);
  for (const [id, row] of store.subscriptions) {
    if (row.userAddress === key) store.subscriptions.delete(id);
  }
};

export const subscriptionKey = (address: string, product: SignupProduct, topic: NotificationTopic) =>
  `${address.toLowerCase()}:${product}:${topic}`;

export const offeredTopics = (product?: SignupProduct) =>
  (product ? [product] : Object.values(SignupProduct)).flatMap((offeringProduct) =>
    Object.entries(PRODUCT_TOPIC_DEFAULTS[offeringProduct]).map(([topic, defaultEnabled]) => ({
      product: offeringProduct,
      topic: topic as NotificationTopic,
      defaultEnabled,
    })),
  );

export const effectiveSubscriptions = (store: Store, address: string, product?: SignupProduct) =>
  offeredTopics(product).map(({ product: offeringProduct, topic, defaultEnabled }) => ({
    product: offeringProduct,
    topic,
    enabled: store.subscriptions.get(subscriptionKey(address, offeringProduct, topic))?.enabled ?? defaultEnabled,
  }));

export const dumpState = (store: Store) => ({
  users: [...store.users.values()],
  subscriptions: [...store.subscriptions.values()],
});
