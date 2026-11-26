/**
 * batches.test.ts
 *
 * What it does: tests the batch rules (DECISIONS 203) on invented assignments: a new batch after every N, a partner's own size, labels that never change, a freed place, and the covered count. Doubles as examples.
 * Who calls it: vitest. Depends on: batches.ts.
 */

import { describe, expect, it } from "vitest";
import { batchRollup, batchSizeOf, labelBatches, type Batched } from "./batches";

const rec = (n: number, partnerId = "trust", batch?: number): Batched => ({ key: `G${String(n).padStart(2, "0")}`, partnerId, at: `2026-11-${String(n).padStart(2, "0")}T00:00:00Z`, ...(batch !== undefined ? { batch } : {}) });
const batches = (rs: Batched[]): (number | undefined)[] => rs.map((r) => r.batch);

describe("labelling", () => {
  it("starts a new batch after every ten, in order of time", () => {
    const out = labelBatches(Array.from({ length: 12 }, (_, i) => rec(i + 1)), () => 10);
    expect(batches(out)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
  });
  it("uses the partner's own batch size, and counts each partner on its own", () => {
    const out = labelBatches([rec(1), rec(2), rec(3), rec(4, "other"), rec(5)], (p) => (p === "trust" ? 2 : 10));
    expect(out.filter((r) => r.partnerId === "trust").map((r) => r.batch)).toEqual([1, 1, 2, 2]);
    expect(out.find((r) => r.partnerId === "other")?.batch).toBe(1);
  });
  it("never changes a label it has given, and running again changes nothing", () => {
    const once = labelBatches([rec(1), rec(2), rec(3)], () => 2);
    expect(labelBatches(once, () => 2)).toEqual(once);
    expect(batches(labelBatches([...once, rec(4)], () => 2))).toEqual([1, 1, 2, 2]);
  });
  it("lets a freed place in the current batch be taken, and joins a moved gift to the partner's current batch", () => {
    const kept = [rec(1, "trust", 1), rec(2, "trust", 1)]; // a third was taken back, so batch 1 holds two of three
    expect(batches(labelBatches([...kept, rec(5)], () => 3))).toEqual([1, 1, 1]);
    expect(batches(labelBatches([...kept, rec(5)], () => 2))).toEqual([1, 1, 2]);
  });
});

describe("the batch size", () => {
  it("is 10 unless the partner sets a whole number of at least 1", () => {
    expect(batchSizeOf(undefined)).toBe(10);
    expect(batchSizeOf({ batchSize: 5 })).toBe(5);
    expect(batchSizeOf({ batchSize: 0 })).toBe(10);
    expect(batchSizeOf({ batchSize: 2.5 })).toBe(10);
  });
});

describe("the roll up", () => {
  it("says how many work orders each batch holds, how many are covered, and whether it is open or full", () => {
    const rows = batchRollup(Array.from({ length: 4 }, (_, i) => rec(i + 1)), new Set(["G01", "G03", "G04"]), () => 3);
    expect(rows).toEqual([
      { partnerId: "trust", batch: 1, size: 3, total: 3, covered: 2, completed: 0, state: "full" },
      { partnerId: "trust", batch: 2, size: 3, total: 1, covered: 1, completed: 0, state: "open" },
    ]);
  });
});

describe("a batch that is complete (DECISIONS 232)", () => {
  it("is ready to close once every gift in it is complete, and closed once a person has closed it", () => {
    const records = Array.from({ length: 2 }, (_, i) => rec(i + 1));
    const keys = records.map((r) => r.key);
    expect(batchRollup(records, new Set(), () => 5, { complete: new Set([keys[0]!]) })[0]).toMatchObject({ completed: 1, state: "open" });
    expect(batchRollup(records, new Set(), () => 5, { complete: new Set(keys) })[0]).toMatchObject({ completed: 2, state: "ready" });
    expect(batchRollup(records, new Set(), () => 5, { complete: new Set(keys), closed: () => true })[0]).toMatchObject({ state: "closed" });
  });
});
