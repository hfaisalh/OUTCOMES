/**
 * outcomes.test.ts
 *
 * What it does: tests outcomes, capacity and allocation on invented data. These tests double as examples.
 * Who calls it: vitest. Depends on: outcomes.ts.
 */

import { describe, expect, it } from "vitest";
import type { FrameworkTemplate } from "../02-project-rules/categories";
import type { Commitment } from "../04b-commitments/commitments";
import { addOutcomes, autoAllocate, capacityOf, fillOf, moveAllocation, releaseAllocation, removeOutcome, setActive, statusSplit, takesCapacity, type Allocation, type Outcome } from "./outcomes";

const FW: FrameworkTemplate[] = [
  { id: "shared", name: "Shared parts", unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3 },
  { id: "whole", name: "Whole", unit: "student", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 1 },
  { id: "once", name: "Delivered once", unit: "pump", cycle: "on_delivery", reportType: "", instalment: "share_of_whole", unitsPerBeneficiary: 1 },
];
const com = (sub: string, parts: number, over: Partial<Commitment> = {}): Commitment => ({
  subscriptionId: sub, supporterId: "D1", supporterName: "Sample", itemId: "I1", itemName: "Item", categoryId: "c", frameworkId: "shared", partsPerInstalment: parts, partsVary: false, planned: 12, paid: 2,
  state: "in_progress", firstPaid: `2026-0${Math.min(Number(sub) % 9 + 1, 9)}-01`, lastPaid: "2026-10-01", numbers: [], gaps: [], legacyOpening: false, startsLate: false, conflict: false, lines: [], ...over,
});
// Orphan 1 to Orphan n (one outcome on its own would be called just "Orphan", so at least two are made and the extra dropped).
const orphans = (n: number): Outcome[] => addOutcomes([], { name: "Orphan", count: Math.max(n, 2), type: "child", cohort: "Cohort A", frameworkId: "shared" }).value.slice(0, n);
const AT = "2026-11-20T10:00:00Z";

describe("adding outcomes", () => {
  it("adds a numbered set, carries the numbering on, and makes unique ids", () => {
    const first = orphans(3);
    expect(first.map((o) => o.name)).toEqual(["Orphan 1", "Orphan 2", "Orphan 3"]);
    const more = addOutcomes(first, { name: "Orphan", count: 2, type: "child", cohort: "Cohort A", frameworkId: "shared" }).value;
    expect(more.map((o) => o.name).slice(3)).toEqual(["Orphan 4", "Orphan 5"]);
    expect(new Set(more.map((o) => o.id)).size).toBe(5);
    expect(addOutcomes([], { name: "Village well", count: 1, type: "well", cohort: "", frameworkId: "once" }).value[0]?.name).toBe("Village well");
  });
  it("refuses an empty name, a bad count and a repeated name", () => {
    expect(addOutcomes([], { name: " ", count: 1, type: "", cohort: "", frameworkId: "" }).error).toContain("name");
    expect(addOutcomes([], { name: "X", count: 0, type: "", cohort: "", frameworkId: "" }).error).toContain("how many");
    expect(addOutcomes(orphans(1), { name: "Orphan 1", count: 1, type: "", cohort: "", frameworkId: "shared" }).error).toContain("already");
  });
});

describe("capacity and fill", () => {
  it("takes capacity from the framework's units per beneficiary", () => {
    const o = orphans(1)[0]!;
    expect(capacityOf(o, FW)).toBe(3);
    expect(capacityOf({ ...o, frameworkId: "" }, FW)).toBe(0);
  });
  it("is open, part funded or full, and inactive when switched off", () => {
    const [o] = orphans(1) as [Outcome];
    const a = (parts: number, key = "1"): Allocation => ({ commitmentKey: key, outcomeId: o.id, parts, how: "auto", at: AT });
    expect(fillOf(o, FW, [], [])).toMatchObject({ capacity: 3, used: 0, free: 3, state: "open" });
    expect(fillOf(o, FW, [a(1)], [com("1", 1)])).toMatchObject({ used: 1, free: 2, state: "part" });
    expect(fillOf(o, FW, [a(3)], [com("1", 3)]).state).toBe("full");
    expect(fillOf({ ...o, active: false }, FW, [a(1)], [com("1", 1)]).state).toBe("inactive");
  });
  it("stops counting a fully paid per-period commitment, but keeps a whole item", () => {
    expect(takesCapacity(com("1", 1, { state: "complete" }), FW)).toBe(false);
    expect(takesCapacity(com("1", 1, { frameworkId: "once", state: "complete" }), FW)).toBe(true);
    expect(takesCapacity(com("1", 1, { frameworkId: "" }), FW)).toBe(false);
  });
});

describe("automatic allocation", () => {
  it("fills the first outcome with room, oldest commitment first, and a bundle of 3 takes a whole orphan", () => {
    const outs = orphans(2);
    const cs = [com("1", 1), com("2", 1), com("3", 3), com("4", 1)];
    const r = autoAllocate(cs, outs, FW, [], AT);
    const where = Object.fromEntries(r.allocations.map((a) => [a.commitmentKey, a.outcomeId]));
    // oldest first: 1, 2, 3, 4 by first paid. 1 and 2 share Orphan 1, then 3 needs a whole orphan and takes Orphan 2, then 4 fits in Orphan 1.
    expect(where).toEqual({ "1": "orphan-1", "2": "orphan-1", "3": "orphan-2", "4": "orphan-1" });
    expect(r.placed).toBe(4);
    expect(fillOf(outs[0]!, FW, r.allocations, cs).state).toBe("full");
    expect(fillOf(outs[1]!, FW, r.allocations, cs).state).toBe("full");
  });

  it("never moves a commitment that is already allocated, and reports what found no room", () => {
    const outs = orphans(1);
    const cs = [com("1", 3), com("2", 1)];
    const first = autoAllocate(cs, outs, FW, [], AT);
    expect(first.unplaced).toEqual([{ commitmentKey: "2", why: "No outcome has room for it." }]);
    const again = autoAllocate(cs, [...outs, ...orphans(2).slice(1)], FW, first.allocations, AT); // adds Orphan 2
    expect(again.allocations.find((a) => a.commitmentKey === "1")?.outcomeId).toBe("orphan-1");
    expect(again.placed).toBe(1);
  });

  it("says when no outcome uses the commitment's framework", () => {
    const r = autoAllocate([com("1", 1, { frameworkId: "whole" })], orphans(1), FW, [], AT);
    expect(r.unplaced[0]?.why).toContain("No active outcome");
  });

  it("releases and places again what was allocated to an outcome that is made inactive", () => {
    const outs = orphans(2);
    const cs = [com("1", 3)];
    const first = autoAllocate(cs, outs, FW, [], AT);
    expect(first.allocations[0]?.outcomeId).toBe("orphan-1");
    const second = autoAllocate(cs, setActive(outs, "orphan-1", false), FW, first.allocations, AT);
    expect([second.released, second.placed, second.allocations[0]?.outcomeId]).toEqual([1, 1, "orphan-2"]);
  });

  it("releases a per-period commitment that has been fully paid", () => {
    const outs = orphans(1);
    const first = autoAllocate([com("1", 1)], outs, FW, [], AT);
    const done = autoAllocate([com("1", 1, { state: "complete" })], outs, FW, first.allocations, AT);
    expect([done.released, done.allocations.length]).toEqual([1, 0]);
  });

  it("allocates a whole item to an outcome of its own framework", () => {
    const outs = addOutcomes([], { name: "Village well", count: 1, type: "well", cohort: "", frameworkId: "once" }).value;
    const r = autoAllocate([com("9", 1, { frameworkId: "once" })], outs, FW, [], AT);
    expect(r.allocations[0]).toMatchObject({ outcomeId: "village-well", parts: 1 });
  });
});

describe("reallocation and removal", () => {
  it("moves a commitment to another outcome with room, and refuses a full, inactive or other-framework one", () => {
    const outs = orphans(3);
    const cs = [com("1", 1), com("2", 3)];
    const auto = autoAllocate(cs, outs, FW, [], AT); // 1 in Orphan 1, 2 needs a whole orphan: Orphan 2
    const moved = moveAllocation(auto.allocations, cs, outs, FW, "1", "orphan-3", AT);
    expect(moved.value.find((a) => a.commitmentKey === "1")).toMatchObject({ outcomeId: "orphan-3", how: "manual" });
    expect(moveAllocation(auto.allocations, cs, outs, FW, "1", "orphan-2", AT).error).toContain("no room");
    expect(moveAllocation(auto.allocations, cs, setActive(outs, "orphan-3", false), FW, "1", "orphan-3", AT).error).toContain("active");
    expect(moveAllocation(auto.allocations, cs, [...outs, { ...outs[0]!, id: "stu", name: "Student", frameworkId: "whole" }], FW, "1", "stu", AT).error).toContain("different framework");
    expect(moveAllocation(auto.allocations, cs, outs, FW, "nope", "orphan-3", AT).error).toContain("not found");
  });

  it("does not remove an outcome that has allocations, and a release lets automatic allocation place it again", () => {
    const outs = orphans(2);
    const cs = [com("1", 1)];
    const auto = autoAllocate(cs, outs, FW, [], AT);
    expect(removeOutcome(outs, auto.allocations, "orphan-1").error).toContain("1 commitment is allocated");
    expect(removeOutcome(outs, auto.allocations, "orphan-2").value.map((o) => o.id)).toEqual(["orphan-1"]);
    expect(releaseAllocation(auto.allocations, "1")).toEqual([]);
  });
});

describe("fulfilment by status (DECISIONS 61)", () => {
  it("splits units into paid, expected, missed and free, with every allocated unit paid for now", () => {
    const [o] = orphans(1) as [Outcome];
    const f = fillOf(o, FW, [{ commitmentKey: "1", outcomeId: o.id, parts: 2, how: "auto", at: AT }], [com("1", 2)]);
    expect(statusSplit(f)).toEqual({ paid: 2, expected: 0, missed: 0, free: 1 });
  });
});
