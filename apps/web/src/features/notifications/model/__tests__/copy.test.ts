import { describe, expect, it } from "vitest";

import { groupTopics, humanise, productCopy, topicCopy } from "../copy";

// GraphQL enum member names from Atlas origin/master: packages/utils/src/notifications/notification-subscription.ts.
// Expected labels/groups are the portal's user-facing contract, not derived through its copy helpers.
const court = [
  ["DisputeAppealable", "A case I'm part of can be appealed", "appeals"],
  ["DisputeAppealed", "A case I'm part of is appealed", "appeals"],
  ["JurorCanVote", "It's time to vote", "duty"],
  ["JurorCanCommit", "It's time to commit my vote", "duty"],
  ["JurorCanReveal", "It's time to reveal my vote", "duty"],
  ["JurorDraw", "I'm drawn as a juror", "duty"],
  ["StakeNew", "I stake in a court for the first time", "staking"],
  ["StakeUnstaked", "I'm unstaked from a court", "staking"],
  ["StakeChanged", "My stake changes", "staking"],
  ["CaseWon", "I earn rewards on a case", "outcomes"],
  ["CaseLost", "I lose PNK on a case", "outcomes"],
] as const;
const poh = [
  ["VouchingPhase", "My registration starts collecting vouches", "registration"],
  ["PendingRequest", "My registration moves to pending", "registration"],
  ["ResolvedRequest", "My registration is accepted", "registration"],
  ["VouchAdded", "Someone vouches for me", "vouching"],
  ["VouchAddedVoucher", "I vouch for someone", "vouching"],
  ["PendingRevoke", "I request a revocation", "revocation"],
  ["ResolvedRevoke", "A revocation of my profile goes through", "revocation"],
  ["DisputedSubmission", "My registration is challenged", "disputes"],
  ["DisputedRevoke", "A revocation I requested is challenged", "disputes"],
  ["ChallengeAccepted", "A challenge I'm part of is accepted", "disputes"],
  ["ChallengeRejected", "A challenge I'm part of is rejected", "disputes"],
  ["DisputeRuledTie", "A challenge I'm part of ends without a ruling", "disputes"],
  ["Rewards", "Rewards and referrals", "rewards"],
] as const;

describe("humanise", () => {
  it.each([
    ["jurorCanVote", "Juror can vote"],
    ["snake_case", "Snake case"],
    ["kebab--case", "Kebab case"],
    ["PohV2", "Poh v2"],
    ["version2Ready", "Version2 ready"],
    [" already Spaced ", "Already spaced"],
    ["x", "X"],
    ["X", "X"],
    ["", ""],
  ])("humanises %j to %j", (input, output) => expect(humanise(input)).toBe(output));
});

describe("productCopy", () => {
  it.each([
    ["CourtV2", "Court", "Jury duty, staking and rulings on Kleros Court."],
    ["CourtV1", "Court V1", "The same for cases on the original Kleros Court."],
    ["PohV2", "Proof of Humanity", "Your registration, vouches and any challenge to them."],
    ["Foresight", "Foresight", "Markets you trade on Foresight."],
    ["new_product2", "New product2", ""],
  ])("provides exact copy for %s", (product, name, description) => {
    expect(productCopy(product)).toEqual({ name, description });
  });
});

describe("Atlas registry topic copy", () => {
  describe.each(["CourtV1", "CourtV2"])("%s", (product) => {
    it.each(court.filter(([topic]) => topic !== "CaseWon"))(
      "has copy and a known group for %s",
      (topic, label, group) => {
        expect(topicCopy(product, topic).label).toBe(label);
        expect(topicCopy(product, topic).group).toBe(group);
        expect(groupTopics(product, [{ topic }]).map(({ id }) => id)).toEqual([group]);
      },
    );
  });
  it.each(poh.filter(([topic]) => topic !== "Rewards"))(
    "has PoH copy and a known group for %s",
    (topic, label, group) => {
      expect(topicCopy("PohV2", topic).label).toBe(label);
      expect(topicCopy("PohV2", topic).group).toBe(group);
      expect(groupTopics("PohV2", [{ topic }]).map(({ id }) => id)).toEqual([group]);
    },
  );
  // Bug: CaseWon's sentence was accidentally capitalized during the enum-key conversion.
  it.each(["CourtV1", "CourtV2"])("keeps sentence-case CaseWon copy for %s", (product) => {
    expect(topicCopy(product, "CaseWon")).toEqual({
      label: "I earn rewards on a case",
      hint: "My vote matched the final ruling",
      group: "outcomes",
    });
  });
  // Bug: GROUPS uses "Rewards", while the Rewards topic points at "rewards", sending it to Other.
  it("keeps the Atlas Rewards topic in the known Rewards group", () => {
    expect(topicCopy("PohV2", "Rewards")).toEqual({
      label: "Rewards and referrals",
      hint: "Off until you turn it on",
      group: "rewards",
    });
    expect(groupTopics("PohV2", [{ topic: "Rewards" }])).toEqual([
      { id: "rewards", title: "Rewards", items: [{ topic: "Rewards" }] },
    ]);
  });
  it("has Foresight copy and a known group for marketResolved", () => {
    expect(topicCopy("Foresight", "MarketResolved")).toEqual({
      label: "A market I traded resolves",
      hint: "Positions can then be redeemed",
      group: "markets",
    });
    expect(groupTopics("Foresight", [{ topic: "MarketResolved" }])).toEqual([
      { id: "markets", title: "Markets", items: [{ topic: "MarketResolved" }] },
    ]);
  });
  it.each([
    ["CourtV2", "new_topic"],
    ["newProduct", "new_topic"],
    ["newProduct", "JurorDraw"],
  ])("falls back for %s/%s", (product, topic) => {
    expect(topicCopy(product, topic)).toEqual({
      label: topic === "JurorDraw" ? "Juror draw" : "New topic",
      group: "other",
    });
  });
});

describe("groupTopics", () => {
  it("orders Court groups and their items as the copy lists them, and trails unknown topics in input order", () => {
    const items = [
      { topic: "future", enabled: true },
      { topic: "CaseLost", enabled: false },
      { topic: "StakeNew", enabled: true },
      { topic: "JurorCanReveal", enabled: false },
      { topic: "DisputeAppealed", enabled: true },
      { topic: "JurorDraw", enabled: true },
      { topic: "another", enabled: false },
    ];
    expect(groupTopics("CourtV2", items)).toEqual([
      {
        id: "duty",
        title: "Jury duty",
        items: [
          { topic: "JurorDraw", enabled: true },
          { topic: "JurorCanReveal", enabled: false },
        ],
      },
      { id: "appeals", title: "Appeals", items: [{ topic: "DisputeAppealed", enabled: true }] },
      { id: "staking", title: "Staking", items: [{ topic: "StakeNew", enabled: true }] },
      { id: "outcomes", title: "Rulings", items: [{ topic: "CaseLost", enabled: false }] },
      {
        id: "other",
        title: "Other",
        items: [
          { topic: "future", enabled: true },
          { topic: "another", enabled: false },
        ],
      },
    ]);
  });
  // Bug: the Rewards group id mismatch prevents the complete PoH group order.
  it("orders PoH groups rather than alphabetising or using input order", () => {
    expect(
      groupTopics(
        "PohV2",
        ["Rewards", "DisputedRevoke", "PendingRevoke", "VouchAdded", "ResolvedRequest"].map((topic) => ({ topic })),
      ),
    ).toEqual([
      { id: "registration", title: "My registration", items: [{ topic: "ResolvedRequest" }] },
      { id: "vouching", title: "Vouching", items: [{ topic: "VouchAdded" }] },
      { id: "revocation", title: "Revocations", items: [{ topic: "PendingRevoke" }] },
      { id: "disputes", title: "Challenges", items: [{ topic: "DisputedRevoke" }] },
      { id: "rewards", title: "Rewards", items: [{ topic: "Rewards" }] },
    ]);
  });
  it("omits every empty group", () => {
    expect(groupTopics("CourtV2", [])).toEqual([]);
    expect(groupTopics("CourtV2", [{ topic: "StakeChanged" }])).toEqual([
      { id: "staking", title: "Staking", items: [{ topic: "StakeChanged" }] },
    ]);
  });
  it("puts all topics of an unknown product in Other without losing order", () => {
    expect(groupTopics("futureProduct", [{ topic: "JurorDraw" }, { topic: "Rewards" }])).toEqual([
      { id: "other", title: "Other", items: [{ topic: "JurorDraw" }, { topic: "Rewards" }] },
    ]);
  });
});
