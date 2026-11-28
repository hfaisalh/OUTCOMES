/**
 * allocation.test.ts
 *
 * What it does: tests Allocation (DECISIONS 175) on invented gifts, children and projects: a gift filling an open place, the lowest fill first, units that must fit, a gift for a project filling that project only,
 * a gift with no project going to a project the assigned partner delivers for, gift-first types and types with no beneficiary creating an outcome, gifts that wait with the reason, and a person placing or
 * taking back. These tests double as examples. Who calls it: vitest. Depends on: allocation.ts.
 */

import { describe, expect, it } from "vitest";
import { freeStock, setStockPriority } from "./stock";
import { DEFAULT_STEPS, reorder, setStepOn } from "./order";
import type { Assignment } from "../08-assignment/assignment";
import type { FrameworkTemplate } from "../02-project-rules/categories";
import type { GiftProject } from "../06-projects/projects";
import type { Beneficiary } from "../07-beneficiaries/beneficiaries";
import type { Enrolment, ItemRules } from "../07-beneficiaries/enrolments";
import { applyAllocationAction, emptyAllocations, fills, isActive, allocateManual, allocateContext, optionsFor, runAllocation, suggestAllocations, syncAllocations, unplace, type AllocationContext, type Allocations } from "./allocation";

const child = (id: string, name: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility: "ready", eligibilityNote: "", partnerId: "", partnerRef: "", memberIds: [], ...over });
const enr = (id: string, b: string, item = "I10", project = "aghosh", over: Partial<Enrolment> = {}): Enrolment => ({ id, beneficiaryId: b, giftProjectId: project, clusterId: "c1", itemId: item, role: "", status: "active", since: "2026-11-01", ...over });
const asg = (key: string, over: Partial<Assignment> = {}): Assignment => ({ key, partnerId: "trust", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto", at: `2026-11-0${key.slice(-1)}T00:00:00Z`, ...over });
const aghosh: GiftProject = { id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: ["trust"], itemIds: ["I10", "I11"] };
const other: GiftProject = { id: "other", name: "Other", crmNames: [], partnerIds: ["backup"], itemIds: ["I10"] };
const wf: FrameworkTemplate = { id: "wf-orphan", unitsPerBeneficiary: 3 } as FrameworkTemplate;
const rules: Record<string, ItemRules> = { I10: { first: "beneficiary", receiver: "person", kindLabel: "Person(s)" }, I11: { first: "gift", receiver: "household", kindLabel: "Build" }, I12: { first: "gift", receiver: "none", kindLabel: "Waqf" } };
// The gifts in scope are the assignments given, unless a test says otherwise.
const withLive = (c: AllocationContext, over: Partial<AllocationContext>): AllocationContext => ({ ...c, live: over.live ?? new Set(c.assignments.map((x) => x.key)) });
const ctx = (over: Partial<AllocationContext> = {}): AllocationContext => withLive({
  ...allocateContext({ assignments: [], assignables: [], workOrders: [{ itemId: "I10", frameworkId: "wf-orphan" }], enrolments: [enr("EN-1", "B1"), enr("EN-2", "B2")], beneficiaries: [child("B1", "Amina"), child("B2", "Bilal")], giftProjects: [aghosh, other], frameworks: [wf], rulesOf: (i) => rules[i], now: "2026-11-24T10:00:00Z" }),
  ...over,
}, over);

describe("filling an open place", () => {
  it("fills the place with the lowest fill first, so more children are sponsored, then the earliest enrolled", () => {
    const c = ctx({ assignments: ["G1", "G2", "G3", "G4"].map((k) => asg(k)) });
    const s = suggestAllocations(c, emptyAllocations());
    expect(s.map((x) => x.enrolmentId)).toEqual(["EN-1", "EN-2", "EN-1", "EN-2"]); // each child gets a part before either gets a second
    expect(s[0]?.why).toBe("Supports Amina (0 of 3 units taken)");
    expect(s[2]?.why).toBe("Supports Amina (1 of 3 units taken)");
  });
  it("takes the units from the child's whole, and a full child takes no more", () => {
    const c = ctx({ assignments: ["G1", "G2"].map((k) => asg(k, { parts: 3 })).concat([asg("G3", { parts: 1 })]) });
    const r = runAllocation(c, emptyAllocations());
    expect(r).toMatchObject({ allocated: 2, outcomes: 0, waiting: 1 }); // two whole children, nobody left for the third gift
    const s = suggestAllocations(c, r.value);
    expect(s[0]).toMatchObject({ key: "G3", blocked: "full", why: "Every beneficiary for this benefit is already fully funded." });
  });
  it("needs the gift's units to fit: a gift of two parts skips a child with one part left", () => {
    const c = ctx({ assignments: [asg("G1", { parts: 2 }), asg("G2", { parts: 2 })] });
    const s = suggestAllocations(c, emptyAllocations());
    expect(s.map((x) => x.enrolmentId)).toEqual(["EN-1", "EN-2"]); // each child has room for two, none has room for four
  });
  it("counts the units already placed, so a second run does not give the same room again", () => {
    const first = runAllocation(ctx({ assignments: [asg("G1", { parts: 3 })] }), emptyAllocations());
    const s = suggestAllocations(ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 }), asg("G3", { parts: 3 })] }), first.value);
    expect(s.map((x) => [x.key, x.enrolmentId])).toEqual([["G2", "EN-2"], ["G3", ""]]); // G1 holds Amina's place, G2 takes Bilal's
  });
});

describe("which project", () => {
  it("fills only the gift's own project when it carries one", () => {
    const c = ctx({ enrolments: [enr("EN-1", "B1", "I10", "other"), enr("EN-2", "B2", "I10", "aghosh")], assignments: [asg("G1")] });
    expect(suggestAllocations(c, emptyAllocations())[0]?.enrolmentId).toBe("EN-2");
  });
  it("sends a gift with no project to a project the assigned partner delivers for, and not to one it does not", () => {
    const c = ctx({ enrolments: [enr("EN-1", "B1", "I10", "other"), enr("EN-2", "B2", "I10", "aghosh")], assignments: [asg("G1", { giftProjectId: "", partnerId: "backup" })] });
    expect(suggestAllocations(c, emptyAllocations())[0]?.enrolmentId).toBe("EN-1"); // the backup delivers for Other, not for Aghosh
  });
  it("says why a gift has no place: nobody enrolled in its project, or nobody with its partner", () => {
    const none = suggestAllocations(ctx({ enrolments: [], assignments: [asg("G1")] }), emptyAllocations())[0];
    expect(none).toMatchObject({ blocked: "no-beneficiary", why: "No approved beneficiary is enrolled for this benefit in the gift's project." });
    const noProject = suggestAllocations(ctx({ enrolments: [], assignments: [asg("G1", { giftProjectId: "" })] }), emptyAllocations())[0];
    expect(noProject).toMatchObject({ blocked: "no-project-beneficiary", why: "No approved beneficiary is enrolled for this benefit with the assigned partner." });
  });
});

describe("an item with no type yet (DECISIONS 178)", () => {
  it("waits and says the type is missing, instead of looking for a child that cannot exist", () => {
    const c = ctx({ assignments: [asg("G1", { itemId: "I99" })] });
    const s = suggestAllocations(c, emptyAllocations());
    expect(s[0]).toMatchObject({ kind: "", blocked: "no-type", why: "The item has no type yet, so it is not known who receives it. Choose a type on the Benefits page." });
    expect(runAllocation(c, emptyAllocations())).toMatchObject({ allocated: 0, outcomes: 0, waiting: 1 });
  });
});

describe("history: nothing is deleted (DECISIONS 186)", () => {
  const parkedCtx = (reason: "paused" | "cancelled" | "completed", over: Partial<AllocationContext> = {}): AllocationContext => ctx({ assignments: [asg("G1", { parts: 3 })], live: new Set(), parkedBy: { G1: reason }, now: "2026-12-01T09:00:00Z", ...over });
  const held = (): Allocations => runAllocation(ctx({ assignments: [asg("G1", { parts: 3 })], now: "2026-11-24T10:00:00Z" }), emptyAllocations()).value;
  it("ends the placement of a plan that is now paused, cancelled or completed, with the day and the reason, and keeps it", () => {
    for (const reason of ["paused", "cancelled", "completed"] as const) {
      const r = syncAllocations(parkedCtx(reason), held());
      expect(r.ended).toBe(1);
      expect(r.value.records).toEqual([expect.objectContaining({ key: "G1", enrolmentId: "EN-1", at: "2026-11-24T10:00:00Z", to: "2026-12-01", endReason: reason })]);
      expect(r.value.records.filter(isActive)).toEqual([]);
    }
  });
  it("frees the child's place when its placement ends, so another gift can take it", () => {
    const synced = syncAllocations(parkedCtx("cancelled"), held()).value;
    const next = ctx({ assignments: [asg("G2", { parts: 3 })], now: "2026-12-01T09:00:00Z" });
    expect(suggestAllocations(next, synced)[0]?.enrolmentId).toBe("EN-1"); // Amina is free again
    expect(fills(next, synced)[0]).toEqual({ enrolmentId: "EN-1", used: 0, capacity: 3 });
  });
  it("ends the placement of a child who has left (the enrolment ended, or the child is inactive or no longer approved)", () => {
    const base = { assignments: [asg("G1", { parts: 3 })], now: "2026-12-02T09:00:00Z" };
    const ended = syncAllocations(ctx({ ...base, enrolments: [enr("EN-1", "B1", "I10", "aghosh", { status: "ended" }), enr("EN-2", "B2")] }), held());
    expect(ended.value.records[0]).toMatchObject({ to: "2026-12-02", endReason: "beneficiary-left" });
    const inactive = syncAllocations(ctx({ ...base, beneficiaries: [child("B1", "Amina", { status: "inactive" }), child("B2", "Bilal")] }), held());
    expect(inactive.value.records[0]?.endReason).toBe("beneficiary-left");
    const review = syncAllocations(ctx({ ...base, beneficiaries: [child("B1", "Amina", { eligibility: "review" }), child("B2", "Bilal")] }), held());
    expect(review.value.records[0]?.endReason).toBe("beneficiary-left");
    expect(syncAllocations(ctx(base), held()).ended).toBe(0); // nothing changed: nothing ends
  });
  it("ends a placement whose gift is no longer assigned to a partner, and removes an outcome made from it (DECISIONS 187)", () => {
    const allocated = runAllocation(ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { itemId: "I11" })], now: "2026-11-24T10:00:00Z" }), emptyAllocations()).value;
    expect(allocated.records.filter(isActive)).toHaveLength(2); // a child's place, and an outcome
    // The assignments were reset: both gifts are still in scope, but neither has a partner now.
    const withdrawn = ctx({ assignments: [], live: new Set(["G1", "G2"]), now: "2026-12-05T09:00:00Z" });
    const r = syncAllocations(withdrawn, allocated);
    expect(r.ended).toBe(2);
    expect(r.value.records).toEqual([expect.objectContaining({ key: "G1", kind: "beneficiary", to: "2026-12-05", endReason: "unassigned" })]); // the place is kept as history, the outcome is gone
    expect(r.value.records.filter(isActive)).toEqual([]);
  });
  it("gives a plan that runs again its previous child back when that child is still free", () => {
    const synced = syncAllocations(parkedCtx("paused"), held()).value; // paused: Amina ends
    const resumed = ctx({ assignments: [asg("G1", { parts: 3 })], now: "2026-12-10T09:00:00Z" });
    const s = suggestAllocations(resumed, synced)[0]!;
    expect(s).toMatchObject({ kind: "beneficiary", enrolmentId: "EN-1" });
    expect(s.why).toBe("Takes back its previous beneficiary, Amina (0 of 3 units taken)");
    const r = runAllocation(resumed, synced);
    expect(r.value.records.map((p) => [p.key, p.enrolmentId, p.to ?? "now"])).toEqual([["G1", "EN-1", "2026-12-01"], ["G1", "EN-1", "now"]]); // the first period and the second, both kept
  });
  it("gives a new place when the previous child has been taken by another gift, and keeps the old record", () => {
    const synced = syncAllocations(parkedCtx("paused"), held()).value;
    const other = runAllocation(ctx({ assignments: [asg("G2", { parts: 3 })], now: "2026-12-02T09:00:00Z" }), synced).value; // G2 takes Amina
    expect(other.records.filter(isActive).map((p) => [p.key, p.enrolmentId])).toEqual([["G2", "EN-1"]]);
    const resumed = ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 })], now: "2026-12-10T09:00:00Z" });
    const s = suggestAllocations(resumed, other).find((x) => x.key === "G1")!;
    expect(s.enrolmentId).toBe("EN-2"); // Bilal, a new place
    expect(s.why).toBe("Supports Bilal (0 of 3 units taken)");
  });
  it("does not offer the previous child back to a plan that ended for another reason", () => {
    const left = syncAllocations(ctx({ assignments: [asg("G1", { parts: 3 })], enrolments: [enr("EN-1", "B1", "I10", "aghosh", { status: "ended" }), enr("EN-2", "B2")], now: "2026-12-02T09:00:00Z" }), held()).value;
    const s = suggestAllocations(ctx({ assignments: [asg("G1", { parts: 3 })], now: "2026-12-03T09:00:00Z" }), left)[0]!;
    expect(s.why).not.toContain("previous child"); // the child left: it is a new gift for a new child
  });
  it("counts the ended placements in the message, and a reset clears history too", () => {
    const run = applyAllocationAction(parkedCtx("cancelled"), held(), { action: "alc-run" });
    if (!run || "error" in run) throw new Error("run");
    expect(run.message).toContain("1 allocation ended (a plan was parked or a beneficiary left) and is kept as history.");
    const reset = applyAllocationAction(parkedCtx("cancelled"), run.value, { action: "alc-reset" });
    expect(reset && "value" in reset && reset.value.records).toEqual([]);
    expect(reset && "message" in reset && reset.message).toBe("All allocations were cleared, history included.");
  });
  it("removes an outcome that is taken back, since it never held a child, and keeps the number from being used again", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" })] });
    const first = runAllocation(c, emptyAllocations()).value;
    const gone = unplace(first, "G1", "2026-11-25");
    expect("value" in gone && gone.value.records).toEqual([]);
    expect("value" in gone && gone.value.counter).toBe(1);
  });
});

describe("the item's own units per beneficiary (DECISIONS 188)", () => {
  it("takes the item's number before its workflow's: one whole child is 1 unit for a scholarship in a workflow of 3", () => {
    const c = ctx({ itemUnits: { I10: 1 }, assignments: [asg("G1", { parts: 1 }), asg("G2", { parts: 1 }), asg("G3", { parts: 1 })] });
    const s = suggestAllocations(c, emptyAllocations());
    expect(s.map((x) => [x.key, x.kind])).toEqual([["G1", "beneficiary"], ["G2", "beneficiary"], ["G3", ""]]); // two children of 1 unit each: the third gift waits
    expect(fills(c, runAllocation(c, emptyAllocations()).value)).toEqual([{ enrolmentId: "EN-1", used: 1, capacity: 1 }, { enrolmentId: "EN-2", used: 1, capacity: 1 }]);
  });
  it("uses the workflow's number when the item has none", () => {
    expect(fills(ctx({ assignments: [asg("G1")] }), emptyAllocations())[0]?.capacity).toBe(3);
  });
});

describe("a gift of a parked plan holds no place (DECISIONS 185)", () => {
  it("frees the child's place when the plan is cancelled, and does not place the gift again", () => {
    const first = runAllocation(ctx({ assignments: [asg("G1", { parts: 3 })] }), emptyAllocations()).value; // G1 fills Amina
    const parked = ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 })], live: new Set(["G2"]) }); // G1's plan is now cancelled
    expect(fills(parked, first)).toEqual([{ enrolmentId: "EN-1", used: 0, capacity: 3 }, { enrolmentId: "EN-2", used: 0, capacity: 3 }]);
    expect(suggestAllocations(parked, first).map((x) => x.key)).toEqual(["G2", "G1"].filter((k) => k === "G2")); // only the gift still in scope
    expect(suggestAllocations(parked, first)[0]?.enrolmentId).toBe("EN-1"); // Amina is free for it
  });
  it("keeps only the assignments still in scope when it builds the context from the gifts", () => {
    const keep = allocateContext({ assignments: [asg("G1"), asg("G2")], assignables: [{ key: "G2", w: {} as never, payments: 1, parts: 1 }], workOrders: [], enrolments: [], beneficiaries: [], giftProjects: [], frameworks: [], rulesOf: () => undefined, now: "x" });
    expect(keep.assignments.map((a) => a.key)).toEqual(["G2"]);
  });
});

describe("the assigned partner's own children first (DECISIONS 183)", () => {
  it("fills a child the assigned partner gave before another partner's, even when the other has less filled", () => {
    const c = ctx({ beneficiaries: [child("B1", "Amina", { partnerId: "backup" }), child("B2", "Bilal", { partnerId: "trust" })], assignments: [asg("G1", { partnerId: "trust" }), asg("G2", { partnerId: "backup" })] });
    const s = suggestAllocations(c, emptyAllocations());
    expect(s.map((x) => [x.key, x.enrolmentId])).toEqual([["G1", "EN-2"], ["G2", "EN-1"]]); // each partner's gift fills its own child
  });
  it("falls back to another partner's child when it has none of its own open", () => {
    const c = ctx({ beneficiaries: [child("B1", "Amina", { partnerId: "backup" }), child("B2", "Bilal", { partnerId: "backup" })], assignments: [asg("G1", { partnerId: "trust" })] });
    expect(suggestAllocations(c, emptyAllocations())[0]?.kind).toBe("beneficiary");
  });
});

describe("who can hold a place", () => {
  it("leaves out a child who is not approved or is inactive, a role holder and an ended enrolment", () => {
    const c = ctx({
      enrolments: [enr("EN-1", "B1"), enr("EN-2", "B2"), enr("EN-3", "B3"), enr("EN-4", "B4", "I10", "aghosh", { role: "Warden" }), enr("EN-5", "B5", "I10", "aghosh", { status: "ended" })],
      beneficiaries: [child("B1", "A", { eligibility: "review" }), child("B2", "B"), child("B3", "C", { status: "inactive" }), child("B4", "D"), child("B5", "E")], assignments: [asg("G1")],
    });
    expect(optionsFor(c, asg("G1"), []).map((o) => o.enrolmentId)).toEqual(["EN-2"]);
  });
});

describe("a gift spread over several places (DECISIONS 181)", () => {
  const scholar: FrameworkTemplate = { id: "wf-scholar", unitsPerBeneficiary: 1 } as FrameworkTemplate;
  it("sponsors two children with a gift of two units when a child needs one", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 2 })] });
    const s = suggestAllocations(c, emptyAllocations())[0]!;
    expect(s).toMatchObject({ kind: "beneficiary", shares: [{ enrolmentId: "EN-1", parts: 1 }, { enrolmentId: "EN-2", parts: 1 }] });
    expect(s.why).toBe("Spread over 2 beneficiaries, Amina (1), Bilal (1), since no single beneficiary can take 2 units");
    const r = runAllocation(c, emptyAllocations());
    expect(r).toMatchObject({ allocated: 1, waiting: 0 }); // one gift allocated, over two children
    expect(r.value.records.map((p) => [p.key, p.enrolmentId, p.parts])).toEqual([["G1", "EN-1", 1], ["G1", "EN-2", 1]]);
  });
  it("splits 6 parts for a child who needs 3 into two children, and fills the next child before opening a third", () => {
    const c = ctx({ assignments: [asg("G1", { parts: 4 })] });
    const s = suggestAllocations(c, emptyAllocations())[0]!;
    expect(s.shares).toEqual([{ enrolmentId: "EN-1", parts: 3 }, { enrolmentId: "EN-2", parts: 1 }]); // a whole child, then the rest
  });
  it("waits only when the places together cannot take it, and takes nothing partly", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 3 })] }); // two places of one unit each
    const s = suggestAllocations(c, emptyAllocations())[0]!;
    expect(s).toMatchObject({ kind: "", blocked: "full", shares: [] });
    expect(runAllocation(c, emptyAllocations()).value.records).toEqual([]); // nothing was half allocated
  });
  it("counts what every share took, so the next gift sees the room that is left", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 2 }), asg("G2", { parts: 1 })] });
    const s = suggestAllocations(c, emptyAllocations());
    expect(s[0]?.kind).toBe("beneficiary");
    expect(s[1]).toMatchObject({ kind: "", blocked: "full" }); // both children are taken by G1
    const first = runAllocation(c, emptyAllocations()).value;
    expect(fills(c, first)).toEqual([{ enrolmentId: "EN-1", used: 1, capacity: 1 }, { enrolmentId: "EN-2", used: 1, capacity: 1 }]);
  });
  it("takes every share back at once", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 2 })] });
    const allocated = runAllocation(c, emptyAllocations()).value;
    const gone = unplace(allocated, "G1", "2026-11-25");
    expect("value" in gone && gone.value.records.every((p) => p.to === "2026-11-25" && p.endReason === "taken-back")).toBe(true); // ended, kept as history (DECISIONS 186)
    expect("value" in gone && gone.value.records).toHaveLength(2);
    expect("value" in gone && gone.value.records.filter(isActive)).toEqual([]);
  });
});

describe("gift first, and no beneficiary", () => {
  it("creates an outcome for a gift-first type, and for a type with no beneficiary, without needing a place", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" }), asg("G2", { itemId: "I12" }), asg("G3", { itemId: "I11" })] });
    const r = runAllocation(c, emptyAllocations());
    expect(r).toMatchObject({ allocated: 0, outcomes: 3, waiting: 0 });
    expect(r.value.records.map((p) => [p.key, p.kind, p.outcomeRef])).toEqual([["G1", "outcome", "OUT-0001"], ["G2", "outcome", "OUT-0002"], ["G3", "outcome", "OUT-0003"]]);
    expect(suggestAllocations(c, emptyAllocations())[1]?.why).toBe("Creates an outcome for a community: it has no beneficiary.");
  });
  it("never reuses an outcome number", () => {
    const first = runAllocation(ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" })] }), emptyAllocations());
    const gone = unplace(first.value, "G1");
    if ("error" in gone) throw new Error(gone.error);
    expect(runAllocation(ctx({ enrolments: [], assignments: [asg("G2", { itemId: "I11" })] }), gone.value).value.records[0]?.outcomeRef).toBe("OUT-0002");
  });
});

describe("a person placing", () => {
  const c = (): AllocationContext => ctx({ assignments: [asg("G1", { parts: 2 }), asg("G2", { parts: 2 })] });
  const allocated = (): Allocations => runAllocation(c(), emptyAllocations()).value;
  it("places a gift in a chosen open place that fits, and moves one that is already placed", () => {
    const r = allocateManual(c(), emptyAllocations(), "G1", "EN-2");
    expect("value" in r && r.value.records[0]).toMatchObject({ key: "G1", kind: "beneficiary", enrolmentId: "EN-2", how: "manual" });
    const one = ctx({ assignments: [asg("G1", { parts: 2 })] });
    const moved = allocateManual(one, runAllocation(one, emptyAllocations()).value, "G1", "EN-2"); // allocated in Amina's, moved to Bilal's
    expect("value" in moved && moved.value.records.find((p) => p.key === "G1" && isActive(p))?.enrolmentId).toBe("EN-2");
    expect("value" in moved && moved.value.records.filter(isActive)).toHaveLength(1); // moved, not copied
    expect("value" in moved && moved.value.records.find((p) => p.key === "G1" && !isActive(p))).toMatchObject({ enrolmentId: "EN-1", to: "2026-11-24", endReason: "moved" }); // the earlier one is kept as history
  });
  it("removes an outcome record the gift made earlier when it is placed in a child, and when sync finds the item is now a child type", () => {
    const stale: Allocations = { counter: 1, records: [{ key: "G1", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "", itemId: "I10", parts: 2, how: "auto", at: "2026-11-01" }] };
    const r = allocateManual(ctx({ assignments: [asg("G1", { parts: 2 })] }), stale, "G1", "EN-1");
    expect("value" in r && r.value.records.filter(isActive).map((p) => p.kind)).toEqual(["beneficiary"]);
    const synced = syncAllocations(ctx({ assignments: [asg("G1", { parts: 2 })] }), stale);
    expect(synced.value.records.filter(isActive)).toHaveLength(0); // I10 is a child type, so the outcome is dropped
  });
  it("refuses a missing gift, a place that is not open, a full place, and an outcome-creating gift", () => {
    expect(allocateManual(c(), emptyAllocations(), "nope", "EN-1")).toHaveProperty("error");
    expect(allocateManual(c(), emptyAllocations(), "G1", "EN-99")).toHaveProperty("error");
    const full = allocateManual(c(), allocated(), "G2", "EN-1"); // EN-1 holds G1's two parts, G2 needs two of the one left
    expect("error" in full && full.error).toBe("Amina is already funded: 2 of 3 units taken, and this gift needs 2.");
    const pump = ctx({ assignments: [asg("G1", { itemId: "I11" })] });
    expect(allocateManual(pump, emptyAllocations(), "G1", "EN-1")).toEqual({ error: "This gift creates an outcome. It does not fund a beneficiary." });
  });
  it("takes a placement back, and refuses one that is not there", () => {
    expect(unplace(allocated(), "G1")).toHaveProperty("value");
    expect(unplace(emptyAllocations(), "G1")).toHaveProperty("error");
  });
});

describe("fill and the page's requests", () => {
  it("says how full each place is, with the units that make one whole child", () => {
    const f = fills(c2(), runAllocation(c2(), emptyAllocations()).value);
    expect(f).toEqual([{ enrolmentId: "EN-1", used: 2, capacity: 3 }, { enrolmentId: "EN-2", used: 0, capacity: 3 }]);
  });
  function c2(): AllocationContext { return ctx({ assignments: [asg("G1", { parts: 2 })] }); }
  it("applies the page's requests, and is not a Placement request for anything else", () => {
    const c = ctx({ assignments: ["G1", "G2"].map((k) => asg(k)) });
    const run = applyAllocationAction(c, emptyAllocations(), { action: "alc-run" });
    if (!run || "error" in run) throw new Error("run");
    expect(run.value.records).toHaveLength(2);
    expect(run.message).toBe("Allocated 2 with beneficiaries to fund and created 0 outcomes. 0 wait with no beneficiary to fund.");
    expect(applyAllocationAction(c, run.value, { action: "alc-set", key: "G1", enrolmentId: "EN-2" })).toHaveProperty("value");
    expect(applyAllocationAction(c, run.value, { action: "alc-undo", key: "G1" })).toHaveProperty("value");
    const reset = applyAllocationAction(c, run.value, { action: "alc-reset" });
    expect(reset && "value" in reset && reset.value).toEqual({ records: [], counter: 0 });
    expect(applyAllocationAction(c, run.value, { action: "asg-run" })).toBeNull();
  });
});

describe("parked outcomes, the partner's own stock (DECISIONS 209)", () => {
  const parked = (): Allocations => {
    let p: Allocations = emptyAllocations();
    for (const name of ["Chak 5 pump", "Dhok 2 pump"]) {
      const r = applyAllocationAction(ctx(), p, { action: "alc-stock-add", partnerId: "trust", giftProjectId: "aghosh", clusterId: "c1", itemId: "I11", name });
      if (!r || "error" in r) throw new Error("stock add failed");
      p = r.value;
    }
    return p;
  };
  it("loads parked outcomes with their own numbers, and refuses a nameless one", () => {
    expect(parked().stock?.map((s) => [s.id, s.name])).toEqual([["STK-0001", "Chak 5 pump"], ["STK-0002", "Dhok 2 pump"]]);
    expect(applyAllocationAction(ctx(), emptyAllocations(), { action: "alc-stock-add", partnerId: "trust", itemId: "I11", name: " " })).toHaveProperty("error");
  });
  it("lets a gift take the oldest free parked outcome of its partner, and a second gift the next, then makes new ones", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" }), asg("G2", { itemId: "I11" }), asg("G3", { itemId: "I11" })] });
    const r = runAllocation(c, parked());
    expect(r.value.records.map((p) => [p.key, p.stockId])).toEqual([["G1", "STK-0001"], ["G2", "STK-0002"], ["G3", undefined]]); // the third has none free, so its outcome is made from the gift
    expect(suggestAllocations(c, parked())[0]?.why).toBe("Takes the parked outcome Chak 5 pump.");
    expect(r.value.stock).toHaveLength(2); // the stock list is kept
  });
  it("frees a parked outcome again when its placement is taken back, and will not remove one that is used", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" })] });
    const allocated = runAllocation(c, parked()).value;
    expect(applyAllocationAction(c, allocated, { action: "alc-stock-remove", id: "STK-0001" })).toEqual({ error: "A gift has taken that outcome, so it cannot be removed." });
    const back = unplace(allocated, "G1", "2026-11-25");
    if ("error" in back) throw new Error(back.error);
    const removed = applyAllocationAction(c, back.value, { action: "alc-stock-remove", id: "STK-0001" });
    expect(removed && "value" in removed && removed.value.stock?.map((s) => s.id)).toEqual(["STK-0002"]);
  });
  it("does not give a gift another partner's parked outcome, or one for another benefit", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11", partnerId: "other" }), asg("G2", { itemId: "I12" })] });
    expect(runAllocation(c, parked()).value.records.map((p) => p.stockId)).toEqual([undefined, undefined]);
  });
  it("keeps the parked outcomes when everything else is reset", () => {
    const r = applyAllocationAction(ctx(), parked(), { action: "alc-reset" });
    expect(r && "value" in r && r.value.stock).toHaveLength(2);
  });
});


describe("a gift marked Priority is allocated first (DECISIONS 284)", () => {
  it("takes the one open place before an older gift, and the older gift waits", () => {
    const one = ctx({ enrolments: [enr("EN-1", "B1")], beneficiaries: [child("B1", "Amina", { partnerId: "trust" })], assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 })], urgent: new Set(["G2"]) });
    const s = suggestAllocations(one, emptyAllocations());
    expect(s.find((x) => x.key === "G2")?.kind).toBe("beneficiary");
    expect(s.find((x) => x.key === "G1")?.kind).toBe("");
    const plain = suggestAllocations({ ...one, urgent: new Set() }, emptyAllocations());
    expect(plain.find((x) => x.key === "G1")?.kind).toBe("beneficiary"); // without it, the older gift is first
  });
});

describe("priority (DECISIONS 282)", () => {
  it("fills a beneficiary marked Priority first among the partner's own children", () => {
    const c = ctx({ beneficiaries: [child("B1", "Amina", { partnerId: "trust" }), child("B2", "Bilal", { partnerId: "trust", priority: true })], assignments: [asg("G1")] });
    expect(optionsFor(c, asg("G1"), []).map((o) => o.name)).toEqual(["Bilal", "Amina"]);
    expect(suggestAllocations(c, emptyAllocations())[0]?.enrolmentId).toBe("EN-2");
  });
  it("does not let priority beat the partner's own children: a partner's room is its own children", () => {
    const c = ctx({ beneficiaries: [child("B1", "Amina", { partnerId: "backup", priority: true }), child("B2", "Bilal", { partnerId: "trust" })], assignments: [asg("G1")] });
    expect(optionsFor(c, asg("G1"), []).map((o) => o.name)).toEqual(["Bilal", "Amina"]);
  });
  it("a gift takes a parked outcome marked Priority before an older one, and priority can be given or taken away until a gift takes it", () => {
    const stock = [{ id: "STK-0001", partnerId: "trust", giftProjectId: "aghosh", clusterId: "", itemId: "I20", name: "Old site", at: "2026-01-01T00:00:00Z" }, { id: "STK-0002", partnerId: "trust", giftProjectId: "aghosh", clusterId: "", itemId: "I20", name: "Urgent site", at: "2026-02-01T00:00:00Z" }];
    expect(freeStock(stock, new Set(), "trust", "I20", "aghosh")?.id).toBe("STK-0001");
    const on = setStockPriority({ stock }, "STK-0002", true, new Set());
    if ("error" in on) throw new Error(on.error);
    expect(freeStock(on.value.stock ?? [], new Set(), "trust", "I20", "aghosh")?.id).toBe("STK-0002");
    const off = setStockPriority(on.value, "STK-0002", false, new Set());
    if ("error" in off) throw new Error(off.error);
    expect(off.value.stock?.[1]).not.toHaveProperty("priority");
    expect(setStockPriority(on.value, "STK-0002", false, new Set(["STK-0002"]))).toEqual({ error: "A gift has taken that outcome, so its priority cannot change." });
    expect(setStockPriority(on.value, "nope", true, new Set())).toEqual({ error: "That parked outcome was not found." });
  });
});

describe("the order a gift looks for a place in is the organisation's (DECISIONS 293)", () => {
  const beneficiaries = [child("B1", "Amina", { partnerId: "trust" }), child("B2", "Bilal", { partnerId: "backup", priority: true })];
  it("tries the partner's own first by default, and Priority first when the organisation says so", () => {
    const usual = ctx({ beneficiaries, assignments: [asg("G1")] });
    expect(optionsFor(usual, asg("G1"), []).map((o) => o.name)).toEqual(["Amina", "Bilal"]);
    const prioFirst = ctx({ beneficiaries, assignments: [asg("G1")], steps: reorder(DEFAULT_STEPS, "priority", 0) });
    expect(optionsFor(prioFirst, asg("G1"), []).map((o) => o.name)).toEqual(["Bilal", "Amina"]);
    expect(suggestAllocations(prioFirst, emptyAllocations())[0]?.enrolmentId).toBe("EN-2");
  });
  it("skips a step that is switched off", () => {
    const noOwn = ctx({ beneficiaries, assignments: [asg("G1")], steps: setStepOn(DEFAULT_STEPS, "own", false) });
    expect(optionsFor(noOwn, asg("G1"), []).map((o) => o.name)).toEqual(["Bilal", "Amina"]); // Priority now decides
  });
});
