/**
 * Words for what Atlas names by key. Atlas owns which products and topics exist; anything missing
 * here still renders, under a humanised key in the "Other" group.
 * Keys are the GraphQL enum names Atlas sends (`CourtV2`, `JurorDraw`), not its stored values (`courtV2`).
 */

export interface ProductCopy {
  name: string;
  description: string;
}

export interface TopicCopy {
  label: string;
  hint?: string;
  group: string;
}

export interface TopicGroup<T> {
  id: string;
  title: string;
  items: T[];
}

const OTHER_GROUP = { id: "other", title: "Other" };

/** Group ids per product family, in display order. */
const GROUPS: Record<string, { id: string; title: string }[]> = {
  court: [
    { id: "duty", title: "Jury duty" },
    { id: "appeals", title: "Appeals" },
    { id: "staking", title: "Staking" },
    { id: "outcomes", title: "Rulings" },
  ],
  poh: [
    { id: "registration", title: "My registration" },
    { id: "vouching", title: "Vouching" },
    { id: "revocation", title: "Revocations" },
    { id: "disputes", title: "Challenges" },
    { id: "rewards", title: "Rewards" },
  ],
  foresight: [{ id: "markets", title: "Markets" }],
};

// Semantics from atlas specs/notifications/<product>/*.md.
const COURT_TOPICS: Record<string, TopicCopy> = {
  JurorDraw: { label: "I'm drawn as a juror", hint: "Any court where you have PNK staked", group: "duty" },
  JurorCanCommit: {
    label: "It's time to commit my vote",
    hint: "Courts with hidden votes, with a reminder a day before the period ends",
    group: "duty",
  },
  JurorCanVote: { label: "It's time to vote", hint: "With a reminder a day before voting closes", group: "duty" },
  JurorCanReveal: {
    label: "It's time to reveal my vote",
    hint: "Courts with hidden votes, with a reminder before the period ends",
    group: "duty",
  },
  DisputeAppealable: {
    label: "A case I'm part of can be appealed",
    hint: "Also sent to past jurors and appeal funders of that case",
    group: "appeals",
  },
  DisputeAppealed: { label: "A case I'm part of is appealed", group: "appeals" },
  StakeNew: { label: "I stake in a court for the first time", group: "staking" },
  StakeChanged: { label: "My stake changes", hint: "Including when a court lowers it automatically", group: "staking" },
  StakeUnstaked: {
    label: "I'm unstaked from a court",
    hint: "Including forced unstaking for a low stake or inactivity",
    group: "staking",
  },
  CaseWon: { label: "I earn rewards on a case", hint: "My vote matched the final ruling", group: "outcomes" },
  CaseLost: { label: "I lose PNK on a case", hint: "My vote did not match the final ruling", group: "outcomes" },
};

const POH_TOPICS: Record<string, TopicCopy> = {
  VouchingPhase: { label: "My registration starts collecting vouches", group: "registration" },
  PendingRequest: {
    label: "My registration moves to pending",
    hint: "It can be challenged from here",
    group: "registration",
  },
  ResolvedRequest: { label: "My registration is accepted", group: "registration" },
  VouchAdded: { label: "Someone vouches for me", hint: "On-chain vouches only", group: "vouching" },
  VouchAddedVoucher: { label: "I vouch for someone", group: "vouching" },
  PendingRevoke: { label: "I request a revocation", group: "revocation" },
  ResolvedRevoke: { label: "A revocation of my profile goes through", group: "revocation" },
  DisputedSubmission: { label: "My registration is challenged", group: "disputes" },
  DisputedRevoke: { label: "A revocation I requested is challenged", group: "disputes" },
  ChallengeAccepted: { label: "A challenge I'm part of is accepted", group: "disputes" },
  ChallengeRejected: { label: "A challenge I'm part of is rejected", group: "disputes" },
  DisputeRuledTie: {
    label: "A challenge I'm part of ends without a ruling",
    hint: "A tie, or the court refused to arbitrate",
    group: "disputes",
  },
  Rewards: { label: "Rewards and referrals", hint: "Off until you turn it on", group: "rewards" },
};

const FORESIGHT_TOPICS: Record<string, TopicCopy> = {
  MarketResolved: { label: "A market I traded resolves", hint: "Positions can then be redeemed", group: "markets" },
};

const PRODUCTS: Record<string, ProductCopy & { family: string; topics: Record<string, TopicCopy> }> = {
  CourtV2: {
    name: "Court",
    description: "Jury duty, staking and rulings on Kleros Court.",
    family: "court",
    topics: COURT_TOPICS,
  },
  CourtV1: {
    name: "Court V1",
    description: "The same for cases on the original Kleros Court.",
    family: "court",
    topics: COURT_TOPICS,
  },
  PohV2: {
    name: "Proof of Humanity",
    description: "Your registration, vouches and any challenge to them.",
    family: "poh",
    topics: POH_TOPICS,
  },
  Foresight: {
    name: "Foresight",
    description: "Markets you trade on Foresight.",
    family: "foresight",
    topics: FORESIGHT_TOPICS,
  },
};

/** "JurorCanVote" → "Juror can vote"; "PohV2" → "Poh v2". */
export function humanise(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function productCopy(product: string): ProductCopy {
  const known = PRODUCTS[product];
  return known ? { name: known.name, description: known.description } : { name: humanise(product), description: "" };
}

export function topicCopy(product: string, topic: string): TopicCopy {
  return PRODUCTS[product]?.topics[topic] ?? { label: humanise(topic), group: OTHER_GROUP.id };
}

/** `items` with the keys `order` lists first, in its order, then the rest as given. */
function inOrder<T>(items: readonly T[], keyOf: (item: T) => string, order: readonly string[]): T[] {
  const rank = (item: T) => {
    const index = order.indexOf(keyOf(item));
    return index === -1 ? order.length : index;
  };
  return items
    .map((item, position) => ({ item, position }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.position - b.position)
    .map(({ item }) => item);
}

/** Products in display order: the ones worded here first, then any new ones in Atlas's order. */
export const sortProducts = <T extends { product: string }>(entries: readonly T[]): T[] =>
  inOrder(entries, (entry) => entry.product, Object.keys(PRODUCTS));

/**
 * `items` grouped as `product`'s copy defines, groups and items in display order; an item whose group
 * is unknown lands in a trailing "Other", in the order given. Empty groups are left out.
 */
export function groupTopics<T extends { topic: string }>(product: string, items: readonly T[]): TopicGroup<T>[] {
  const order = [...(GROUPS[PRODUCTS[product]?.family ?? ""] ?? []), OTHER_GROUP];
  const known = new Set(order.map((group) => group.id));
  const sorted = inOrder(items, (item) => item.topic, Object.keys(PRODUCTS[product]?.topics ?? {}));

  return order
    .map((group) => ({
      ...group,
      items: sorted.filter((item) => {
        const id = topicCopy(product, item.topic).group;
        return known.has(id) ? id === group.id : group.id === OTHER_GROUP.id;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
