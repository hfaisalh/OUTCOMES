/**
 * commitments.test.ts
 *
 * What it does: tests the commitment grouping on invented work orders. These tests double as examples.
 * Who calls it: vitest. Depends on: commitments.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { allocatable, buildCommitments, needsLook, oneOffCommitments, type Commitment } from "./commitments";

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

  it("does not compare the date of a legacy upload, but still suggests the same supporter and item", () => {
    const r = buildCommitments([wo("8", { instalmentCount: "12", legacyUpload: true, paidDate: "2026-08-26 10:00:00" }), inst("1", 1, "2026-06-01")]);
    expect(r.unlinked[0]?.suggestions).toEqual([{ subscriptionId: "S1", daysApart: null }]);
  });

  it("lists a legacy opening record but does not count it, and a late start it explains is not odd", () => {
    const r = buildCommitments([inst("L", 0, "2026-08-26", { legacyUpload: true, instalmentNumber: "" }), inst("1", 3, "2026-09-26"), inst("2", 4, "2026-10-26")]);
    const c = r.commitments[0]!;
    expect([c.paid, c.legacyOpening, c.lines.length, c.firstPaid]).toEqual([2, true, 3, "2026-09-26"]);
    expect(c.startsLate).toBe(true);
    expect(needsLook(c)).toBe(false);
  });

  it("a commitment with only its legacy opening has nothing paid since the load", () => {
    const c = buildCommitments([inst("L", 0, "2026-08-26", { legacyUpload: true, instalmentNumber: "" })]).commitments[0]!;
    expect([c.paid, c.firstPaid, c.state]).toEqual([0, "", "in_progress"]);
  });

  it("puts commitments that need a look first", () => {
    const r = buildCommitments([inst("1", 1, "2026-09-01", { subscriptionId: "A" }), inst("2", 3, "2026-06-01", { subscriptionId: "B" })]);
    expect(r.commitments.map((c) => c.subscriptionId)).toEqual(["B", "A"]);
  });
});

describe("one-off payments (DECISIONS 64)", () => {
  const per = (id: string) => id === "fw-month";
  const once = (key: string, over: Partial<WorkOrder> = {}) => wo(key, { frameworkId: "fw-month", paidDate: "2026-11-05 10:00:00", periodCount: 12, bundleQty: 3, ...over });

  it("covers the months of the item's plan from the month it was paid, with its parts", () => {
    const [c] = oneOffCommitments([once("A1")], per, "2026-11-20");
    expect(c).toMatchObject({ subscriptionId: "once-A1", once: true, partsPerInstalment: 3, planned: 12, endMonth: "2027-10", state: "in_progress" });
    expect(c?.paidMonths[0]).toBe("2026-11");
    expect(c?.paidMonths).toHaveLength(12);
    expect(c?.paidMonths[11]).toBe("2027-10");
  });
  it("is complete once the last covered month has passed, so its parts are free again", () => {
    expect(oneOffCommitments([once("A1")], per, "2027-10-31")[0]?.state).toBe("in_progress");
    expect(oneOffCommitments([once("A1")], per, "2027-11-01")[0]?.state).toBe("complete");
  });
  it("counts one month when the length is not known", () => {
    expect(oneOffCommitments([once("A1", { periodCount: undefined })], per, "2026-11-20")[0]).toMatchObject({ planned: 1, endMonth: "2026-11" });
  });
  it("leaves out recurring lines, excluded work orders, legacy uploads, and frameworks that are not per period", () => {
    const list = [inst("1", 1, "2026-06-01", { frameworkId: "fw-month" }), once("E", { status: "excluded" }), once("L", { legacyUpload: true }), once("W", { frameworkId: "fw-whole" }), once("OK")];
    expect(oneOffCommitments(list, per, "2026-11-20").map((c) => c.subscriptionId)).toEqual(["once-OK"]);
  });
  it("is added to the subscriptions for allocation, but not to the Commitments list", () => {
    const list = [inst("1", 1, "2026-06-01", { frameworkId: "fw-month" }), once("A1")];
    expect(buildCommitments(list).commitments).toHaveLength(1);
    expect(allocatable(list, per, "2026-11-20").map((c) => c.subscriptionId)).toEqual(["S1", "once-A1"]);
  });
});

describe("a plan carried over from the old site (DECISIONS 286)", () => {
  const clean = { conflict: false, partsVary: false, gaps: [], startsLate: false, legacyOpening: false, carriedOver: true } as unknown as Commitment;
  it("is not flagged as needing a look on its own: it has its own icon", () => {
    expect(needsLook(clean)).toBe(false);
  });
  it("is still flagged when something else is wrong with it", () => {
    expect(needsLook({ ...clean, gaps: [3] } as Commitment)).toBe(true);
    expect(needsLook({ ...clean, partsVary: true } as Commitment)).toBe(true);
  });
});
