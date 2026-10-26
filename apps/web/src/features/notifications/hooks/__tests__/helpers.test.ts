import { describe, expect, it } from "vitest";

import { saveStatusOf } from "../useSaveStatus";
import { patchRows } from "../useUpdateTopics";

describe("saveStatusOf", () => {
  it("starts idle without writes", () => expect(saveStatusOf([])).toBe("idle"));
  it.each([
    ["idle", "idle"],
    ["pending", "saving"],
    ["success", "saved"],
    ["error", "error"],
  ] as const)("maps a lone %s write to %s", (status, expected) => {
    expect(saveStatusOf([{ status, submittedAt: 1 }])).toBe(expected);
  });
  it("keeps saving if an older write is pending, despite a later error", () => {
    expect(
      saveStatusOf([
        { status: "pending", submittedAt: 1 },
        { status: "error", submittedAt: 2 },
      ]),
    ).toBe("saving");
  });
  it.each(["success", "error"] as const)("uses the latest timestamp rather than array order for %s", (status) => {
    expect(
      saveStatusOf([
        { status, submittedAt: 3 },
        { status: "idle", submittedAt: 1 },
      ]),
    ).toBe(status === "success" ? "saved" : "error");
  });
  it("lets the later record win a timestamp tie", () => {
    expect(
      saveStatusOf([
        { status: "success", submittedAt: 1 },
        { status: "error", submittedAt: 1 },
      ]),
    ).toBe("error");
  });
});

describe("patchRows", () => {
  it("patches only existing pairs on the named product, retaining false and input order", () => {
    const rows = [
      { product: "courtV2", topic: "jurorDraw", enabled: true },
      { product: "courtV1", topic: "jurorDraw", enabled: true },
      { product: "courtV2", topic: "caseWon", enabled: false },
    ];
    const before = structuredClone(rows);
    const changes = [
      { topic: "jurorDraw", enabled: false },
      { topic: "caseWon", enabled: true },
      { topic: "new", enabled: true },
    ];
    expect(patchRows(rows, "courtV2", changes)).toEqual([
      { product: "courtV2", topic: "jurorDraw", enabled: false },
      { product: "courtV1", topic: "jurorDraw", enabled: true },
      { product: "courtV2", topic: "caseWon", enabled: true },
    ]);
    expect(rows).toEqual(before);
    expect(changes).toEqual([
      { topic: "jurorDraw", enabled: false },
      { topic: "caseWon", enabled: true },
      { topic: "new", enabled: true },
    ]);
    expect(patchRows(rows, "courtV2", [])).toEqual(before);
    expect(patchRows(rows, "unknown", changes)).toEqual(before);
    expect(patchRows([], "courtV2", changes)).toEqual([]);
  });
});
