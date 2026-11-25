/**
 * placement.test.ts
 *
 * What it does: tests Placement (DECISIONS 175) on invented gifts, children and projects: a gift filling an open place, the lowest fill first, units that must fit, a gift for a project filling that project only,
 * a gift with no project going to a project the assigned partner delivers for, gift-first types and types with no beneficiary creating an outcome, gifts that wait with the reason, and a person placing or
 * taking back. These tests double as examples. Who calls it: vitest. Depends on: placement.ts.
 */

import { describe, expect, it } from "vitest";
import type { Assignment } from "../08-assignment/assignment";
import type { FrameworkTemplate } from "../02-project-rules/categories";
import type { GiftProject } from "../06-projects/projects";
import type { Beneficiary } from "../07-beneficiaries/beneficiaries";
import type { Enrolment, ItemRules } from "../07-beneficiaries/enrolments";
import { applyPlacementAction, emptyPlacements, fills, isActive, placeManual, placementContext, placesFor, runPlacement, suggestPlacements, syncPlacements, unplace, type PlaceContext, type Placements } from "./placement";

const child = (id: string, name: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility: "ready", eligibilityNote: "", partnerId: "", partnerRef: "", memberIds: [], ...over });
const enr = (id: string, b: string, item = "I10", project = "aghosh", over: Partial<Enrolment> = {}): Enrolment => ({ id, beneficiaryId: b, giftProjectId: project, clusterId: "c1", itemId: item, role: "", status: "active", since: "2026-11-01", ...over });
const asg = (key: string, over: Partial<Assignment> = {}): Assignment => ({ key, partnerId: "trust", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto", at: `2026-11-0${key.slice(-1)}T00:00:00Z`, ...over });
const aghosh: GiftProject = { id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: ["trust"], itemIds: ["I10", "I11"] };
const other: GiftProject = { id: "other", name: "Other", crmNames: [], partnerIds: ["backup"], itemIds: ["I10"] };
const wf: FrameworkTemplate = { id: "wf-orphan", unitsPerBeneficiary: 3 } as FrameworkTemplate;
const rules: Record<string, ItemRules> = { I10: { first: "beneficiary", receiver: "person", kindLabel: "Person(s)" }, I11: { first: "gift", receiver: "household", kindLabel: "Build" }, I12: { first: "gift", receiver: "none", kindLabel: "Waqf" } };
// The gifts in scope are the assignments given, unless a test says otherwise.
const withLive = (c: PlaceContext, over: Partial<PlaceContext>): PlaceContext => ({ ...c, live: over.live ?? new Set(c.assignments.map((x) => x.key)) });
const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => withLive({
  ...placementContext({ assignments: [], assignables: [], workOrders: [{ itemId: "I10", frameworkId: "wf-orphan" }], enrolments: [enr("EN-1", "B1"), enr("EN-2", "B2")], beneficiaries: [child("B1", "Amina"), child("B2", "Bilal")], giftProjects: [aghosh, other], frameworks: [wf], rulesOf: (i) => rules[i], now: "2026-11-24T10:00:00Z" }),
  ...over,
}, over);

describe("filling an open place", () => {
  it("fills the place with the lowest fill first, so more children are sponsored, then the earliest enrolled", () => {
    const c = ctx({ assignments: ["G1", "G2", "G3", "G4"].map((k) => asg(k)) });
    const s = suggestPlacements(c, emptyPlacements());
    expect(s.map((x) => x.enrolmentId)).toEqual(["EN-1", "EN-2", "EN-1", "EN-2"]); // each child gets a part before either gets a second
    expect(s[0]?.why).toBe("Fills a place for Amina (0 of 3 units taken)");
    expect(s[2]?.why).toBe("Fills a place for Amina (1 of 3 units taken)");
  });
  it("takes the units from the child's whole, and a full child takes no more", () => {
    const c = ctx({ assignments: ["G1", "G2"].map((k) => asg(k, { parts: 3 })).concat([asg("G3", { parts: 1 })]) });
    const r = runPlacement(c, emptyPlacements());
    expect(r).toMatchObject({ placed: 2, outcomes: 0, waiting: 1 }); // two whole children, nobody left for the third gift
    const s = suggestPlacements(c, r.value);
    expect(s[0]).toMatchObject({ key: "G3", blocked: "full", why: "Every place for this benefit is full." });
  });
  it("needs the gift's units to fit: a gift of two parts skips a child with one part left", () => {
    const c = ctx({ assignments: [asg("G1", { parts: 2 }), asg("G2", { parts: 2 })] });
    const s = suggestPlacements(c, emptyPlacements());
    expect(s.map((x) => x.enrolmentId)).toEqual(["EN-1", "EN-2"]); // each child has room for two, none has room for four
  });
  it("counts the units already placed, so a second run does not give the same room again", () => {
    const first = runPlacement(ctx({ assignments: [asg("G1", { parts: 3 })] }), emptyPlacements());
    const s = suggestPlacements(ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 }), asg("G3", { parts: 3 })] }), first.value);
    expect(s.map((x) => [x.key, x.enrolmentId])).toEqual([["G2", "EN-2"], ["G3", ""]]); // G1 holds Amina's place, G2 takes Bilal's
  });
});

describe("which project", () => {
  it("fills only the gift's own project when it carries one", () => {
    const c = ctx({ enrolments: [enr("EN-1", "B1", "I10", "other"), enr("EN-2", "B2", "I10", "aghosh")], assignments: [asg("G1")] });
    expect(suggestPlacements(c, emptyPlacements())[0]?.enrolmentId).toBe("EN-2");
  });
  it("sends a gift with no project to a project the assigned partner delivers for, and not to one it does not", () => {
    const c = ctx({ enrolments: [enr("EN-1", "B1", "I10", "other"), enr("EN-2", "B2", "I10", "aghosh")], assignments: [asg("G1", { giftProjectId: "", partnerId: "backup" })] });
    expect(suggestPlacements(c, emptyPlacements())[0]?.enrolmentId).toBe("EN-1"); // the backup delivers for Other, not for Aghosh
  });
  it("says why a gift has no place: nobody enrolled in its project, or nobody with its partner", () => {
    const none = suggestPlacements(ctx({ enrolments: [], assignments: [asg("G1")] }), emptyPlacements())[0];
    expect(none).toMatchObject({ blocked: "no-places", why: "No approved beneficiary is enrolled for this benefit in the gift's project." });
    const noProject = suggestPlacements(ctx({ enrolments: [], assignments: [asg("G1", { giftProjectId: "" })] }), emptyPlacements())[0];
    expect(noProject).toMatchObject({ blocked: "no-project-places", why: "No approved beneficiary is enrolled for this benefit with the assigned partner." });
  });
});

describe("an item with no type yet (DECISIONS 178)", () => {
  it("waits and says the type is missing, instead of looking for a child that cannot exist", () => {
    const c = ctx({ assignments: [asg("G1", { itemId: "I99" })] });
    const s = suggestPlacements(c, emptyPlacements());
    expect(s[0]).toMatchObject({ kind: "", blocked: "no-type", why: "The item has no type yet, so it is not known who receives it. Choose a type on the Benefits page." });
    expect(runPlacement(c, emptyPlacements())).toMatchObject({ placed: 0, outcomes: 0, waiting: 1 });
  });
});

describe("history: nothing is deleted (DECISIONS 186)", () => {
  const parkedCtx = (reason: "paused" | "cancelled" | "completed", over: Partial<PlaceContext> = {}): PlaceContext => ctx({ assignments: [asg("G1", { parts: 3 })], live: new Set(), parkedBy: { G1: reason }, now: "2026-12-01T09:00:00Z", ...over });
  const held = (): Placements => runPlacement(ctx({ assignments: [asg("G1", { parts: 3 })], now: "2026-11-24T10:00:00Z" }), emptyPlacements()).value;
  it("ends the placement of a plan that is now paused, cancelled or completed, with the day and the reason, and keeps it", () => {
    for (const reason of ["paused", "cancelled", "completed"] as const) {
      const r = syncPlacements(parkedCtx(reason), held());
      expect(r.ended).toBe(1);
      expect(r.value.records).toEqual([expect.objectContaining({ key: "G1", enrolmentId: "EN-1", at: "2026-11-24T10:00:00Z", to: "2026-12-01", endReason: reason })]);
      expect(r.value.records.filter(isActive)).toEqual([]);
    }
  });
  it("frees the child's place when its placement ends, so another gift can take it", () => {
    const synced = syncPlacements(parkedCtx("cancelled"), held()).value;
    const next = ctx({ assignments: [asg("G2", { parts: 3 })], now: "2026-12-01T09:00:00Z" });
    expect(suggestPlacements(next, synced)[0]?.enrolmentId).toBe("EN-1"); // Amina is free again
    expect(fills(next, synced)[0]).toEqual({ enrolmentId: "EN-1", used: 0, capacity: 3 });
  });
  it("ends the placement of a child who has left (the enrolment ended, or the child is inactive or no longer approved)", () => {
    const base = { assignments: [asg("G1", { parts: 3 })], now: "2026-12-02T09:00:00Z" };
    const ended = syncPlacements(ctx({ ...base, enrolments: [enr("EN-1", "B1", "I10", "aghosh", { status: "ended" }), enr("EN-2", "B2")] }), held());
    expect(ended.value.records[0]).toMatchObject({ to: "2026-12-02", endReason: "child-left" });
    const inactive = syncPlacements(ctx({ ...base, beneficiaries: [child("B1", "Amina", { status: "inactive" }), child("B2", "Bilal")] }), held());
    expect(inactive.value.records[0]?.endReason).toBe("child-left");
    const review = syncPlacements(ctx({ ...base, beneficiaries: [child("B1", "Amina", { eligibility: "review" }), child("B2", "Bilal")] }), held());
    expect(review.value.records[0]?.endReason).toBe("child-left");
    expect(syncPlacements(ctx(base), held()).ended).toBe(0); // nothing changed: nothing ends
  });
  it("ends a placement whose gift is no longer assigned to a partner, and removes an outcome made from it (DECISIONS 187)", () => {
    const placed = runPlacement(ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { itemId: "I11" })], now: "2026-11-24T10:00:00Z" }), emptyPlacements()).value;
    expect(placed.records.filter(isActive)).toHaveLength(2); // a child's place, and an outcome
    // The assignments were reset: both gifts are still in scope, but neither has a partner now.
    const withdrawn = ctx({ assignments: [], live: new Set(["G1", "G2"]), now: "2026-12-05T09:00:00Z" });
    const r = syncPlacements(withdrawn, placed);
    expect(r.ended).toBe(2);
    expect(r.value.records).toEqual([expect.objectContaining({ key: "G1", kind: "place", to: "2026-12-05", endReason: "unassigned" })]); // the place is kept as history, the outcome is gone
    expect(r.value.records.filter(isActive)).toEqual([]);
  });
  it("gives a plan that runs again its previous child back when that child is still free", () => {
    const synced = syncPlacements(parkedCtx("paused"), held()).value; // paused: Amina ends
    const resumed = ctx({ assignments: [asg("G1", { parts: 3 })], now: "2026-12-10T09:00:00Z" });
    const s = suggestPlacements(resumed, synced)[0]!;
    expect(s).toMatchObject({ kind: "place", enrolmentId: "EN-1" });
    expect(s.why).toBe("Takes back its previous child, Amina (0 of 3 units taken)");
    const r = runPlacement(resumed, synced);
    expect(r.value.records.map((p) => [p.key, p.enrolmentId, p.to ?? "now"])).toEqual([["G1", "EN-1", "2026-12-01"], ["G1", "EN-1", "now"]]); // the first period and the second, both kept
  });
  it("gives a new place when the previous child has been taken by another gift, and keeps the old record", () => {
    const synced = syncPlacements(parkedCtx("paused"), held()).value;
    const other = runPlacement(ctx({ assignments: [asg("G2", { parts: 3 })], now: "2026-12-02T09:00:00Z" }), synced).value; // G2 takes Amina
    expect(other.records.filter(isActive).map((p) => [p.key, p.enrolmentId])).toEqual([["G2", "EN-1"]]);
    const resumed = ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 })], now: "2026-12-10T09:00:00Z" });
    const s = suggestPlacements(resumed, other).find((x) => x.key === "G1")!;
    expect(s.enrolmentId).toBe("EN-2"); // Bilal, a new place
    expect(s.why).toBe("Fills a place for Bilal (0 of 3 units taken)");
  });
  it("does not offer the previous child back to a plan that ended for another reason", () => {
    const left = syncPlacements(ctx({ assignments: [asg("G1", { parts: 3 })], enrolments: [enr("EN-1", "B1", "I10", "aghosh", { status: "ended" }), enr("EN-2", "B2")], now: "2026-12-02T09:00:00Z" }), held()).value;
    const s = suggestPlacements(ctx({ assignments: [asg("G1", { parts: 3 })], now: "2026-12-03T09:00:00Z" }), left)[0]!;
    expect(s.why).not.toContain("previous child"); // the child left: it is a new gift for a new child
  });
  it("counts the ended placements in the message, and a reset clears history too", () => {
    const run = applyPlacementAction(parkedCtx("cancelled"), held(), { action: "plc-run" });
    if (!run || "error" in run) throw new Error("run");
    expect(run.message).toContain("1 placement ended (a plan was parked or a child left) and is kept as history.");
    const reset = applyPlacementAction(parkedCtx("cancelled"), run.value, { action: "plc-reset" });
    expect(reset && "value" in reset && reset.value.records).toEqual([]);
    expect(reset && "message" in reset && reset.message).toBe("All placements were cleared, history included.");
  });
  it("removes an outcome that is taken back, since it never held a child, and keeps the number from being used again", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" })] });
    const first = runPlacement(c, emptyPlacements()).value;
    const gone = unplace(first, "G1", "2026-11-25");
    expect("value" in gone && gone.value.records).toEqual([]);
    expect("value" in gone && gone.value.counter).toBe(1);
  });
});

describe("the item's own units per beneficiary (DECISIONS 188)", () => {
  it("takes the item's number before its workflow's: one whole child is 1 unit for a scholarship in a workflow of 3", () => {
    const c = ctx({ itemUnits: { I10: 1 }, assignments: [asg("G1", { parts: 1 }), asg("G2", { parts: 1 }), asg("G3", { parts: 1 })] });
    const s = suggestPlacements(c, emptyPlacements());
    expect(s.map((x) => [x.key, x.kind])).toEqual([["G1", "place"], ["G2", "place"], ["G3", ""]]); // two children of 1 unit each: the third gift waits
    expect(fills(c, runPlacement(c, emptyPlacements()).value)).toEqual([{ enrolmentId: "EN-1", used: 1, capacity: 1 }, { enrolmentId: "EN-2", used: 1, capacity: 1 }]);
  });
  it("uses the workflow's number when the item has none", () => {
    expect(fills(ctx({ assignments: [asg("G1")] }), emptyPlacements())[0]?.capacity).toBe(3);
  });
});

describe("a gift of a parked plan holds no place (DECISIONS 185)", () => {
  it("frees the child's place when the plan is cancelled, and does not place the gift again", () => {
    const first = runPlacement(ctx({ assignments: [asg("G1", { parts: 3 })] }), emptyPlacements()).value; // G1 fills Amina
    const parked = ctx({ assignments: [asg("G1", { parts: 3 }), asg("G2", { parts: 3 })], live: new Set(["G2"]) }); // G1's plan is now cancelled
    expect(fills(parked, first)).toEqual([{ enrolmentId: "EN-1", used: 0, capacity: 3 }, { enrolmentId: "EN-2", used: 0, capacity: 3 }]);
    expect(suggestPlacements(parked, first).map((x) => x.key)).toEqual(["G2", "G1"].filter((k) => k === "G2")); // only the gift still in scope
    expect(suggestPlacements(parked, first)[0]?.enrolmentId).toBe("EN-1"); // Amina is free for it
  });
  it("keeps only the assignments still in scope when it builds the context from the gifts", () => {
    const keep = placementContext({ assignments: [asg("G1"), asg("G2")], assignables: [{ key: "G2", w: {} as never, payments: 1, parts: 1 }], workOrders: [], enrolments: [], beneficiaries: [], giftProjects: [], frameworks: [], rulesOf: () => undefined, now: "x" });
    expect(keep.assignments.map((a) => a.key)).toEqual(["G2"]);
  });
});

describe("the assigned partner's own children first (DECISIONS 183)", () => {
  it("fills a child the assigned partner gave before another partner's, even when the other has less filled", () => {
    const c = ctx({ beneficiaries: [child("B1", "Amina", { partnerId: "backup" }), child("B2", "Bilal", { partnerId: "trust" })], assignments: [asg("G1", { partnerId: "trust" }), asg("G2", { partnerId: "backup" })] });
    const s = suggestPlacements(c, emptyPlacements());
    expect(s.map((x) => [x.key, x.enrolmentId])).toEqual([["G1", "EN-2"], ["G2", "EN-1"]]); // each partner's gift fills its own child
  });
  it("falls back to another partner's child when it has none of its own open", () => {
    const c = ctx({ beneficiaries: [child("B1", "Amina", { partnerId: "backup" }), child("B2", "Bilal", { partnerId: "backup" })], assignments: [asg("G1", { partnerId: "trust" })] });
    expect(suggestPlacements(c, emptyPlacements())[0]?.kind).toBe("place");
  });
});

describe("who can hold a place", () => {
  it("leaves out a child who is not approved or is inactive, a role holder and an ended enrolment", () => {
    const c = ctx({
      enrolments: [enr("EN-1", "B1"), enr("EN-2", "B2"), enr("EN-3", "B3"), enr("EN-4", "B4", "I10", "aghosh", { role: "Warden" }), enr("EN-5", "B5", "I10", "aghosh", { status: "ended" })],
      beneficiaries: [child("B1", "A", { eligibility: "review" }), child("B2", "B"), child("B3", "C", { status: "inactive" }), child("B4", "D"), child("B5", "E")], assignments: [asg("G1")],
    });
    expect(placesFor(c, asg("G1"), []).map((o) => o.enrolmentId)).toEqual(["EN-2"]);
  });
});

describe("a gift spread over several places (DECISIONS 181)", () => {
  const scholar: FrameworkTemplate = { id: "wf-scholar", unitsPerBeneficiary: 1 } as FrameworkTemplate;
  it("sponsors two children with a gift of two units when a child needs one", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 2 })] });
    const s = suggestPlacements(c, emptyPlacements())[0]!;
    expect(s).toMatchObject({ kind: "place", shares: [{ enrolmentId: "EN-1", parts: 1 }, { enrolmentId: "EN-2", parts: 1 }] });
    expect(s.why).toBe("Spread over 2 places, Amina (1), Bilal (1), since no single place can take 2 units");
    const r = runPlacement(c, emptyPlacements());
    expect(r).toMatchObject({ placed: 1, waiting: 0 }); // one gift placed, over two children
    expect(r.value.records.map((p) => [p.key, p.enrolmentId, p.parts])).toEqual([["G1", "EN-1", 1], ["G1", "EN-2", 1]]);
  });
  it("splits 6 parts for a child who needs 3 into two children, and fills the next child before opening a third", () => {
    const c = ctx({ assignments: [asg("G1", { parts: 4 })] });
    const s = suggestPlacements(c, emptyPlacements())[0]!;
    expect(s.shares).toEqual([{ enrolmentId: "EN-1", parts: 3 }, { enrolmentId: "EN-2", parts: 1 }]); // a whole child, then the rest
  });
  it("waits only when the places together cannot take it, and takes nothing partly", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 3 })] }); // two places of one unit each
    const s = suggestPlacements(c, emptyPlacements())[0]!;
    expect(s).toMatchObject({ kind: "", blocked: "full", shares: [] });
    expect(runPlacement(c, emptyPlacements()).value.records).toEqual([]); // nothing was half placed
  });
  it("counts what every share took, so the next gift sees the room that is left", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 2 }), asg("G2", { parts: 1 })] });
    const s = suggestPlacements(c, emptyPlacements());
    expect(s[0]?.kind).toBe("place");
    expect(s[1]).toMatchObject({ kind: "", blocked: "full" }); // both children are taken by G1
    const first = runPlacement(c, emptyPlacements()).value;
    expect(fills(c, first)).toEqual([{ enrolmentId: "EN-1", used: 1, capacity: 1 }, { enrolmentId: "EN-2", used: 1, capacity: 1 }]);
  });
  it("takes every share back at once", () => {
    const c = ctx({ frameworks: [scholar], itemFramework: { I10: "wf-scholar" }, assignments: [asg("G1", { parts: 2 })] });
    const placed = runPlacement(c, emptyPlacements()).value;
    const gone = unplace(placed, "G1", "2026-11-25");
    expect("value" in gone && gone.value.records.every((p) => p.to === "2026-11-25" && p.endReason === "taken-back")).toBe(true); // ended, kept as history (DECISIONS 186)
    expect("value" in gone && gone.value.records).toHaveLength(2);
    expect("value" in gone && gone.value.records.filter(isActive)).toEqual([]);
  });
});

describe("gift first, and no beneficiary", () => {
  it("creates an outcome for a gift-first type, and for a type with no beneficiary, without needing a place", () => {
    const c = ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" }), asg("G2", { itemId: "I12" }), asg("G3", { itemId: "I11" })] });
    const r = runPlacement(c, emptyPlacements());
    expect(r).toMatchObject({ placed: 0, outcomes: 3, waiting: 0 });
    expect(r.value.records.map((p) => [p.key, p.kind, p.outcomeRef])).toEqual([["G1", "outcome", "OUT-0001"], ["G2", "outcome", "OUT-0002"], ["G3", "outcome", "OUT-0003"]]);
    expect(suggestPlacements(c, emptyPlacements())[1]?.why).toBe("Creates an outcome for a community: it has no beneficiary.");
  });
  it("never reuses an outcome number", () => {
    const first = runPlacement(ctx({ enrolments: [], assignments: [asg("G1", { itemId: "I11" })] }), emptyPlacements());
    const gone = unplace(first.value, "G1");
    if ("error" in gone) throw new Error(gone.error);
    expect(runPlacement(ctx({ enrolments: [], assignments: [asg("G2", { itemId: "I11" })] }), gone.value).value.records[0]?.outcomeRef).toBe("OUT-0002");
  });
});

describe("a person placing", () => {
  const c = (): PlaceContext => ctx({ assignments: [asg("G1", { parts: 2 }), asg("G2", { parts: 2 })] });
  const placed = (): Placements => runPlacement(c(), emptyPlacements()).value;
  it("places a gift in a chosen open place that fits, and moves one that is already placed", () => {
    const r = placeManual(c(), emptyPlacements(), "G1", "EN-2");
    expect("value" in r && r.value.records[0]).toMatchObject({ key: "G1", kind: "place", enrolmentId: "EN-2", how: "manual" });
    const one = ctx({ assignments: [asg("G1", { parts: 2 })] });
    const moved = placeManual(one, runPlacement(one, emptyPlacements()).value, "G1", "EN-2"); // placed in Amina's, moved to Bilal's
    expect("value" in moved && moved.value.records.find((p) => p.key === "G1" && isActive(p))?.enrolmentId).toBe("EN-2");
    expect("value" in moved && moved.value.records.filter(isActive)).toHaveLength(1); // moved, not copied
    expect("value" in moved && moved.value.records.find((p) => p.key === "G1" && !isActive(p))).toMatchObject({ enrolmentId: "EN-1", to: "2026-11-24", endReason: "moved" }); // the earlier one is kept as history
  });
  it("removes an outcome record the gift made earlier when it is placed in a child, and when sync finds the item is now a child type", () => {
    const stale: Placements = { counter: 1, records: [{ key: "G1", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "", itemId: "I10", parts: 2, how: "auto", at: "2026-11-01" }] };
    const r = placeManual(ctx({ assignments: [asg("G1", { parts: 2 })] }), stale, "G1", "EN-1");
    expect("value" in r && r.value.records.filter(isActive).map((p) => p.kind)).toEqual(["place"]);
    const synced = syncPlacements(ctx({ assignments: [asg("G1", { parts: 2 })] }), stale);
    expect(synced.value.records.filter(isActive)).toHaveLength(0); // I10 is a child type, so the outcome is dropped
  });
  it("refuses a missing gift, a place that is not open, a full place, and an outcome-creating gift", () => {
    expect(placeManual(c(), emptyPlacements(), "nope", "EN-1")).toHaveProperty("error");
    expect(placeManual(c(), emptyPlacements(), "G1", "EN-99")).toHaveProperty("error");
    const full = placeManual(c(), placed(), "G2", "EN-1"); // EN-1 holds G1's two parts, G2 needs two of the one left
    expect("error" in full && full.error).toBe("Amina's place is full: 2 of 3 units taken, and this gift needs 2.");
    const pump = ctx({ assignments: [asg("G1", { itemId: "I11" })] });
    expect(placeManual(pump, emptyPlacements(), "G1", "EN-1")).toEqual({ error: "This gift creates an outcome. It does not fill a place." });
  });
  it("takes a placement back, and refuses one that is not there", () => {
    expect(unplace(placed(), "G1")).toHaveProperty("value");
    expect(unplace(emptyPlacements(), "G1")).toHaveProperty("error");
  });
});

describe("fill and the page's requests", () => {
  it("says how full each place is, with the units that make one whole child", () => {
    const f = fills(c2(), runPlacement(c2(), emptyPlacements()).value);
    expect(f).toEqual([{ enrolmentId: "EN-1", used: 2, capacity: 3 }, { enrolmentId: "EN-2", used: 0, capacity: 3 }]);
  });
  function c2(): PlaceContext { return ctx({ assignments: [asg("G1", { parts: 2 })] }); }
  it("applies the page's requests, and is not a Placement request for anything else", () => {
    const c = ctx({ assignments: ["G1", "G2"].map((k) => asg(k)) });
    const run = applyPlacementAction(c, emptyPlacements(), { action: "plc-run" });
    if (!run || "error" in run) throw new Error("run");
    expect(run.value.records).toHaveLength(2);
    expect(run.message).toBe("Placed 2 in open places and created 0 outcomes. 0 wait with no open place.");
    expect(applyPlacementAction(c, run.value, { action: "plc-set", key: "G1", enrolmentId: "EN-2" })).toHaveProperty("value");
    expect(applyPlacementAction(c, run.value, { action: "plc-unplace", key: "G1" })).toHaveProperty("value");
    const reset = applyPlacementAction(c, run.value, { action: "plc-reset" });
    expect(reset && "value" in reset && reset.value).toEqual({ records: [], counter: 0 });
    expect(applyPlacementAction(c, run.value, { action: "asg-run" })).toBeNull();
  });
});
