/**
 * commitments.test.ts
 *
 * What it does: tests the commitment grouping on invented work orders. These tests double as examples.
 * Who calls it: vitest. Depends on: commitments.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { buildCommitments, needsLook } from "./commitments";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-06-10 10:00:00", supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId: "I1", itemName: "Small Pump",
  amount: 18, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "c1", status: "ready", ...over,
});
const inst = (key: string, n: number, date: string, over: Partial<WorkOrder> = {}) => wo(key, { subscriptionId: "S1", instalmentNumber: String(n), instalmentCount: "10", paidDate: `${date} 10:00:00`, ...over });

describe("buildCommitments", () => {
  it("groups instalments by subscription and counts paid out of planned", () => {
    const { commitments } = buildCommitments([inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01"), inst("3", 3, "2026-08-01"), wo("9")]);
    expect(commitments).toHaveLength(1);
    expect(commitments[0]).toMatchObject({ subscriptionId: "S1", paid: 3, planned: 10, state: "in_progress", firstPaid: "2026-06-01", lastPaid: "2026-08-01", gaps: [], startsLate: false });
    expect(needsLook(commitments[0]!)).toBe(false);
  });

  it("is complete when all planned instalments are held, and open ended when the plan runs until cancelled", () => {
    const done = Array.from({ length: 3 }, (_, i) => inst(String(i + 1), i + 1, `2026-0${i + 1}-01`, { instalmentCount: "3" }));
    expect(buildCommitments(done).commitments[0]?.state).toBe("complete");
    expect(buildCommitments([inst("1", 1, "2026-06-01", { instalmentCount: "Indefinitely" })]).commitments[0]).toMatchObject({ state: "open_ended", planned: null });
  });

  it("flags a gap, a plan that starts late, differing parts and a conflict", () => {
    const gap = buildCommitments([inst("1", 1, "2026-06-01"), inst("3", 3, "2026-08-01")]).commitments[0]!;
    expect(gap.gaps).toEqual([2]);
    expect(needsLook(gap)).toBe(true);
    expect(buildCommitments([inst("5", 5, "2026-06-01")]).commitments[0]?.startsLate).toBe(true);
    expect(buildCommitments([inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01", { bundleQty: 3 })]).commitments[0]).toMatchObject({ partsVary: true, partsPerInstalment: 1 });
    expect(buildCommitments([inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01", { supporterId: "D2" })]).commitments[0]?.conflict).toBe(true);
  });

  it("leaves excluded work orders out", () => {
    const r = buildCommitments([inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01", { status: "excluded" })]);
    expect(r.commitments[0]?.paid).toBe(1);
  });

  it("lists recurring lines with no subscription and suggests the same supporter and item, nearest first", () => {
    const orphan = wo("6593", { instalmentCount: "12", paidDate: "2026-05-31 20:02:00" });
    const other = wo("77", { instalmentCount: "12", supporterId: "D9" });
    const r = buildCommitments([orphan, other, inst("1", 1, "2026-06-01"), wo("50")]);
    expect(r.unlinked.map((u) => u.key)).toEqual(["6593", "77"]);
    expect(r.unlinked.find((u) => u.key === "6593")?.suggestions).toEqual([{ subscriptionId: "S1", daysApart: -1 }]);
    expect(r.unlinked.find((u) => u.key === "77")?.suggestions).toEqual([]);
  });

  it("puts commitments that need a look first", () => {
    const r = buildCommitments([inst("1", 1, "2026-09-01", { subscriptionId: "A" }), inst("2", 3, "2026-06-01", { subscriptionId: "B" })]);
    expect(r.commitments.map((c) => c.subscriptionId)).toEqual(["B", "A"]);
  });
});
