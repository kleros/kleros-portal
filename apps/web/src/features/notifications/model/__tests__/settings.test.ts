import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  allOn,
  applyChanges,
  buildSettings,
  countOn,
  productsWithAnyOn,
  setAll,
  type ProductSettings,
} from "../settings";

describe("buildSettings", () => {
  it("keeps first catalogue product/topic order, uses stored booleans over defaults, and drops unoffered pairs", () => {
    expect(
      buildSettings(
        [
          { product: "pohV2", topic: "rewards", defaultEnabled: false },
          { product: "courtV2", topic: "jurorDraw", defaultEnabled: true },
          { product: "pohV2", topic: "pendingRequest", defaultEnabled: true },
          { product: "courtV2", topic: "caseWon", defaultEnabled: true },
        ],
        [
          { product: "courtV2", topic: "jurorDraw", enabled: false },
          { product: "pohV2", topic: "rewards", enabled: true },
          { product: "courtV2", topic: "rewards", enabled: true },
          { product: "gone", topic: "caseWon", enabled: true },
        ],
      ),
    ).toEqual([
      {
        product: "pohV2",
        topics: [
          { topic: "rewards", enabled: true },
          { topic: "pendingRequest", enabled: true },
        ],
      },
      {
        product: "courtV2",
        topics: [
          { topic: "jurorDraw", enabled: false },
          { topic: "caseWon", enabled: true },
        ],
      },
    ]);
  });

  it("takes each catalogue pair once, using its first default", () => {
    expect(
      buildSettings(
        [
          { product: "a", topic: "shared", defaultEnabled: false },
          { product: "b", topic: "shared", defaultEnabled: true },
          { product: "a", topic: "shared", defaultEnabled: true },
        ],
        [],
      ),
    ).toEqual([
      { product: "a", topics: [{ topic: "shared", enabled: false }] },
      { product: "b", topics: [{ topic: "shared", enabled: true }] },
    ]);
  });

  it("returns no products without a catalogue, even with stored rows", () => {
    expect(buildSettings([], [])).toEqual([]);
    expect(buildSettings([], [{ product: "gone", topic: "old", enabled: true }])).toEqual([]);
  });
});

const settings: ProductSettings[] = [
  {
    product: "courtV2",
    topics: [
      { topic: "jurorDraw", enabled: true },
      { topic: "caseWon", enabled: false },
    ],
  },
  { product: "courtV1", topics: [{ topic: "jurorDraw", enabled: true }] },
];

describe("applyChanges", () => {
  it("changes only named topics on the named product without mutating the inputs", () => {
    const input = structuredClone(settings);
    const changes = [
      { topic: "jurorDraw", enabled: false },
      { topic: "unknown", enabled: true },
    ];
    const beforeChanges = structuredClone(changes);
    expect(applyChanges(input, "courtV2", changes)).toEqual([
      {
        product: "courtV2",
        topics: [
          { topic: "jurorDraw", enabled: false },
          { topic: "caseWon", enabled: false },
        ],
      },
      { product: "courtV1", topics: [{ topic: "jurorDraw", enabled: true }] },
    ]);
    expect(input).toEqual(settings);
    expect(changes).toEqual(beforeChanges);
  });

  it("leaves unknown products and empty changes alone", () => {
    expect(applyChanges(settings, "missing", [{ topic: "jurorDraw", enabled: false }])).toEqual(settings);
    expect(applyChanges(settings, "courtV2", [])).toEqual(settings);
    expect(applyChanges([], "courtV2", [{ topic: "jurorDraw", enabled: true }])).toEqual([]);
  });
});

describe("topic summaries", () => {
  it.each([
    [[], 0, false],
    [[{ topic: "a", enabled: false }], 0, false],
    [[{ topic: "a", enabled: true }], 1, true],
    [
      [
        { topic: "a", enabled: true },
        { topic: "b", enabled: false },
      ],
      1,
      false,
    ],
    [
      [
        { topic: "a", enabled: true },
        { topic: "b", enabled: true },
      ],
      2,
      true,
    ],
  ] as const)("counts enabled topics and requires a nonempty all-on list: %j", (topics, count, every) => {
    expect(countOn(topics)).toBe(count);
    expect(allOn(topics)).toBe(every);
  });

  it("setAll skips already-correct topics without reordering or mutating", () => {
    const topics = [
      { topic: "z", enabled: false },
      { topic: "a", enabled: true },
      { topic: "m", enabled: false },
    ];
    const before = structuredClone(topics);
    expect(setAll(topics, true)).toEqual([
      { topic: "z", enabled: true },
      { topic: "m", enabled: true },
    ]);
    expect(setAll(topics, false)).toEqual([{ topic: "a", enabled: false }]);
    expect(topics).toEqual(before);
    expect(setAll([], true)).toEqual([]);
  });

  it("lists exactly products with any enabled topic, in input order", () => {
    expect(
      productsWithAnyOn([
        { product: "empty", topics: [] },
        ...settings,
        { product: "off", topics: [{ topic: "a", enabled: false }] },
      ]),
    ).toEqual(settings);
    expect(productsWithAnyOn([])).toEqual([]);
  });
});

const pair = fc.record({
  product: fc.constantFrom("courtV1", "courtV2", "pohV2"),
  topic: fc.constantFrom("a", "b", "c"),
  defaultEnabled: fc.boolean(),
});
const topicStates = fc.uniqueArray(fc.record({ topic: fc.constantFrom("a", "b", "c", "d"), enabled: fc.boolean() }), {
  selector: (row) => row.topic,
});
const propertyOptions = { seed: 27102026, numRuns: 200 };

describe("settings properties", () => {
  it("covers exactly the distinct catalogue pairs regardless of stored rows", () => {
    fc.assert(
      fc.property(fc.array(pair), fc.array(pair), (catalogue, stored) => {
        const actual = buildSettings(
          catalogue,
          stored.map(({ product, topic, defaultEnabled }) => ({ product, topic, enabled: defaultEnabled })),
        );
        const pairs = actual.flatMap(({ product, topics }) =>
          topics.map(({ topic }) => JSON.stringify([product, topic])),
        );
        const expected = new Set(catalogue.map(({ product, topic }) => JSON.stringify([product, topic])));
        expect(new Set(pairs)).toEqual(expected);
        expect(pairs).toHaveLength(expected.size);
      }),
      propertyOptions,
    );
  });

  it("applying setAll reaches the requested value for every topic", () => {
    fc.assert(
      fc.property(topicStates, fc.boolean(), (topics, enabled) => {
        expect(applyChanges([{ product: "p", topics }], "p", setAll(topics, enabled))).toEqual([
          { product: "p", topics: topics.map(({ topic }) => ({ topic, enabled })) },
        ]);
      }),
      propertyOptions,
    );
  });

  it("applying the same changes twice is idempotent", () => {
    fc.assert(
      fc.property(topicStates, topicStates, (topics, changes) => {
        const once = applyChanges([{ product: "p", topics }], "p", changes);
        expect(applyChanges(once, "p", changes)).toEqual(once);
      }),
      propertyOptions,
    );
  });

  it("countOn is the number of true inputs and never exceeds length", () => {
    fc.assert(
      fc.property(topicStates, (topics) => {
        expect(countOn(topics)).toBe(topics.reduce((sum, row) => sum + Number(row.enabled), 0));
        expect(countOn(topics)).toBeLessThanOrEqual(topics.length);
      }),
      propertyOptions,
    );
  });
});
