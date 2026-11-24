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
import { applyPlacementAction, emptyPlacements, fills, placeManual, placementContext, placesFor, runPlacement, suggestPlacements, unplace, type PlaceContext, type Placements } from "./placement";

const child = (id: string, name: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility: "ready", eligibilityNote: "", partnerId: "", partnerRef: "", memberIds: [], ...over });
const enr = (id: string, b: string, item = "I10", project = "aghosh", over: Partial<Enrolment> = {}): Enrolment => ({ id, beneficiaryId: b, giftProjectId: project, clusterId: "c1", itemId: item, role: "", status: "active", since: "2026-11-01", ...over });
const asg = (key: string, over: Partial<Assignment> = {}): Assignment => ({ key, partnerId: "trust", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto", at: `2026-11-0${key.slice(-1)}T00:00:00Z`, ...over });
const aghosh: GiftProject = { id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: ["trust"], itemIds: ["I10", "I11"] };
const other: GiftProject = { id: "other", name: "Other", crmNames: [], partnerIds: ["backup"], itemIds: ["I10"] };
const wf: FrameworkTemplate = { id: "wf-orphan", unitsPerBeneficiary: 3 } as FrameworkTemplate;
const rules: Record<string, ItemRules> = { I10: { first: "beneficiary", receiver: "person", kindLabel: "Person(s)" }, I11: { first: "gift", receiver: "household", kindLabel: "Build" }, I12: { first: "gift", receiver: "none", kindLabel: "Waqf" } };
const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => placementContext({
  assignments: [], assignables: [], workOrders: [{ itemId: "I10", frameworkId: "wf-orphan" }], enrolments: [enr("EN-1", "B1"), enr("EN-2", "B2")], beneficiaries: [child("B1", "Amina"), child("B2", "Bilal")], giftProjects: [aghosh, other], frameworks: [wf], rulesOf: (i) => rules[i], now: "2026-11-24T10:00:00Z", ...over,
});

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

describe("who can hold a place", () => {
  it("leaves out a child who is not approved or is inactive, a role holder and an ended enrolment", () => {
    const c = ctx({
      enrolments: [enr("EN-1", "B1"), enr("EN-2", "B2"), enr("EN-3", "B3"), enr("EN-4", "B4", "I10", "aghosh", { role: "Warden" }), enr("EN-5", "B5", "I10", "aghosh", { status: "ended" })],
      beneficiaries: [child("B1", "A", { eligibility: "review" }), child("B2", "B"), child("B3", "C", { status: "inactive" }), child("B4", "D"), child("B5", "E")], assignments: [asg("G1")],
    });
    expect(placesFor(c, asg("G1"), []).map((o) => o.enrolmentId)).toEqual(["EN-2"]);
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
    expect("value" in moved && moved.value.records.find((p) => p.key === "G1")?.enrolmentId).toBe("EN-2");
    expect("value" in moved && moved.value.records).toHaveLength(1); // moved, not copied
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
