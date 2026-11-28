/**
 * priority-gifts.test.ts
 *
 * What it does: tests marking and unmarking a gift as Priority (DECISIONS 284). Invented keys.
 * Who calls it: vitest. Depends on: priority-gifts.ts.
 */
import { describe, expect, it } from "vitest";
import { prioritySet, setGiftPriority } from "./priority-gifts";

describe("gifts marked Priority", () => {
  it("marks and unmarks one gift, once", () => {
    const a = setGiftPriority(undefined, "sub:SUB-1", true);
    expect(a).toEqual(["sub:SUB-1"]);
    expect(setGiftPriority(a, "sub:SUB-1", true)).toEqual(["sub:SUB-1"]); // already marked
    expect(setGiftPriority(a, "G2", true)).toEqual(["sub:SUB-1", "G2"]);
    expect(setGiftPriority(a, "sub:SUB-1", false)).toEqual([]);
    expect(setGiftPriority(a, "nope", false)).toEqual(["sub:SUB-1"]);
  });
  it("ignores an empty key and gives a set to look in", () => {
    expect(setGiftPriority(["G1"], "", true)).toEqual(["G1"]);
    expect(prioritySet(["G1"]).has("G1")).toBe(true);
    expect(prioritySet(undefined).size).toBe(0);
  });
});

describe("several gifts at once (DECISIONS 288)", () => {
  it("marks and unmarks a list, ignoring empty keys and repeats", async () => {
    const { setManyPriority } = await import("./priority-gifts");
    expect(setManyPriority(["A"], ["B", "A", "", "C", "B"], true)).toEqual(["A", "B", "C"]);
    expect(setManyPriority(["A", "B", "C"], ["B", "Z"], false)).toEqual(["A", "C"]);
    expect(setManyPriority(undefined, [], true)).toEqual([]);
  });
});
