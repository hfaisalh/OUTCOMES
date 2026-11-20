/**
 * outcomes.test.ts
 *
 * What it does: tests outcomes, capacity and allocation on invented data. These tests double as examples.
 * Who calls it: vitest. Depends on: outcomes.ts.
 */

import { describe, expect, it } from "vitest";
import type { FrameworkTemplate } from "../02-project-rules/categories";
import type { Commitment } from "../04b-commitments/commitments";
import { addOutcomes, autoAllocate, capacityOf, fillOf, moveAllocation, releaseAllocation, removeOutcome, setActive, monthStatus, monthsAround, timelineOf, takesCapacity, type Allocation, type Outcome } from "./outcomes";

const FW: FrameworkTemplate[] = [
  { id: "shared", name: "Shared parts", unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3 },
  { id: "whole", name: "Whole", unit: "student", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 1 },
  { id: "once", name: "Delivered once", unit: "pump", cycle: "on_delivery", reportType: "", instalment: "share_of_whole", unitsPerBeneficiary: 1 },
];
const com = (sub: string, parts: number, over: Partial<Commitment> = {}): Commitment => ({
  planStatus: "", nextDue: "", planPaid: null, paidMonths: [],
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

describe("the month by month view (DECISIONS 62)", () => {
  const TODAY = "2026-11-20";
  const plan = (over: Partial<Commitment>): Commitment => com("1", 1, { planned: 12, planPaid: 3, paidMonths: ["2026-08", "2026-09", "2026-10"], nextDue: "2026-11-29", planStatus: "active", ...over });
  const row = (c: Commitment, months: string[]) => months.map((m) => monthStatus(c, m, TODAY)).join("");
  const MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];

  it("lists the months around today", () => {
    expect(monthsAround(TODAY, 2, 2)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(monthsAround("2026-01-05", 2, 0)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("marks paid months, then the months still expected (orange), starting at the next due date", () => {
    expect(row(plan({}), MONTHS)).toBe("fpppeee"); // July is before the plan, Aug to Oct paid, Nov (due 29th) and later expected
  });

  it("stops expecting after the instalments left: 12 planned and 3 paid leaves 9, from November to July", () => {
    expect(monthStatus(plan({}), "2027-07", TODAY)).toBe("e");
    expect(monthStatus(plan({}), "2027-08", TODAY)).toBe("f");
  });

  it("marks months missed (red) when the due date has passed and nothing was paid", () => {
    const overdue = plan({ nextDue: "2026-10-29", paidMonths: ["2026-08", "2026-09"], planPaid: 2 });
    expect(row(overdue, MONTHS)).toBe("fppmmee"); // October and the current November are missed, December is still expected
  });

  it("expects nothing ahead from a paused plan, and nothing from a cancelled or completed one", () => {
    expect(row(plan({ planStatus: "paused", nextDue: "2026-10-29", paidMonths: ["2026-08", "2026-09"], planPaid: 2 }), MONTHS)).toBe("fppmmff");
    expect(row(plan({ planStatus: "cancelled" }), MONTHS)).toBe("fpppfff");
    expect(row(plan({ planStatus: "completed" }), MONTHS)).toBe("fpppfff");
  });

  it("expects for ever when the plan has no limit", () => {
    expect(monthStatus(plan({ planned: null }), "2028-05", TODAY)).toBe("e");
  });

  it("draws a row per outcome: one slot per unit of capacity, filled by its allocations", () => {
    const [o] = orphans(1) as [Outcome];
    const c = plan({ subscriptionId: "7", partsPerInstalment: 1 });
    const t = timelineOf(o, FW, [{ commitmentKey: "7", outcomeId: o.id, parts: 1, how: "auto", at: AT }], [c], ["2026-10", "2026-12"], TODAY);
    expect(t.map((m) => m.slots.map((s) => s.status).join(""))).toEqual(["pff", "eff"]);
    expect(t[0]?.slots.map((s) => s.commitmentKey)).toEqual(["7", "", ""]);
    const whole = timelineOf(o, FW, [{ commitmentKey: "7", outcomeId: o.id, parts: 3, how: "auto", at: AT }], [{ ...c, partsPerInstalment: 3 }], ["2026-10"], TODAY);
    expect(whole[0]?.slots.map((s) => s.status).join("")).toBe("ppp");
  });

  it("no longer holds capacity for a plan the CRM has cancelled", () => {
    expect(takesCapacity(plan({ planStatus: "cancelled" }), FW)).toBe(false);
    expect(takesCapacity(plan({ planStatus: "paused" }), FW)).toBe(true);
  });
});

describe("one-off payments in outcomes (DECISIONS 64)", () => {
  // A year paid at once in November 2026: 3 parts, paid for every month from November to October.
  const year = (sub: string, over: Partial<Commitment> = {}) => com(sub, 3, { once: true, planned: 12, paid: 12, endMonth: "2027-10", firstPaid: "2026-11-05", paidMonths: ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10"], ...over });

  it("fills a whole orphan and shows every covered month as paid", () => {
    const [o] = orphans(1);
    const c = year("once-A1");
    const placed = autoAllocate([c], [o!], FW, [], AT);
    expect(placed.placed).toBe(1);
    const row = timelineOf(o!, FW, placed.allocations, [c], monthsAround("2027-04-15", 5, 6), "2027-04-15");
    expect(row.every((m) => m.slots.every((s) => s.status === "p"))).toBe(true);
    expect(row.map((m) => m.month)[0]).toBe("2026-11");
  });
  it("shows nothing expected after the last covered month, and frees the outcome", () => {
    const [o] = orphans(1);
    const done = year("once-A1", { state: "complete" });
    expect(takesCapacity(done, FW)).toBe(false);
    const allocation: Allocation = { commitmentKey: "once-A1", outcomeId: o!.id, parts: 3, how: "auto", at: AT };
    expect(fillOf(o!, FW, [allocation], [done]).free).toBe(3);
    expect(monthStatus(done, "2027-11", "2027-11-15")).toBe("f");
  });
});
