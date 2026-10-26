/** A (product, topic) pair Atlas offers, from `notificationTopics`. */
export interface TopicPair {
  product: string;
  topic: string;
  defaultEnabled: boolean;
}

/** A preference from `user.notificationSubscriptions`: stored rows merged over defaults by Atlas. */
export interface Subscription {
  product: string;
  topic: string;
  enabled: boolean;
}

export interface TopicState {
  topic: string;
  enabled: boolean;
}

export interface ProductSettings {
  product: string;
  topics: TopicState[];
}

export interface TopicChange {
  topic: string;
  enabled: boolean;
}

/**
 * One entry per catalogue product, in catalogue order. A topic is on when its subscription says so,
 * else by its default; subscriptions for pairs the catalogue does not list are dropped.
 */
export function buildSettings(
  catalogue: readonly TopicPair[],
  subscriptions: readonly Subscription[],
): ProductSettings[] {
  const stored = new Map(subscriptions.map((row) => [`${row.product}\u0000${row.topic}`, row.enabled]));
  const products = new Map<string, TopicState[]>();

  for (const pair of catalogue) {
    const topics = products.get(pair.product) ?? [];
    if (topics.some((existing) => existing.topic === pair.topic)) continue;
    topics.push({
      topic: pair.topic,
      enabled: stored.get(`${pair.product}\u0000${pair.topic}`) ?? pair.defaultEnabled,
    });
    products.set(pair.product, topics);
  }

  return [...products].map(([product, topics]) => ({ product, topics }));
}

/** `settings` with `changes` applied to `product`; other products and unknown topics are left alone. */
export function applyChanges(
  settings: readonly ProductSettings[],
  product: string,
  changes: readonly TopicChange[],
): ProductSettings[] {
  const next = new Map(changes.map((change) => [change.topic, change.enabled]));
  return settings.map((entry) =>
    entry.product !== product
      ? entry
      : {
          ...entry,
          topics: entry.topics.map((state) => ({ ...state, enabled: next.get(state.topic) ?? state.enabled })),
        },
  );
}

export const countOn = (topics: readonly TopicState[]) => topics.filter((state) => state.enabled).length;

export const allOn = (topics: readonly TopicState[]) => topics.length > 0 && topics.every((state) => state.enabled);

/** The changes that set every topic of `topics` to `enabled`, skipping those already there. */
export const setAll = (topics: readonly TopicState[], enabled: boolean): TopicChange[] =>
  topics.filter((state) => state.enabled !== enabled).map((state) => ({ topic: state.topic, enabled }));

/** Products with at least one topic on: what "Turn off all emails" has to write. */
export const productsWithAnyOn = (settings: readonly ProductSettings[]) =>
  settings.filter((entry) => countOn(entry.topics) > 0);
