/**
 * assignment.test.ts
 *
 * What it does: tests Assignment (DECISIONS 170) on invented gifts, partners and projects: the order partners are tried in, room and overflow to the next partner, a lapsed partner and one that does not deliver the
 * item being skipped, gifts with no project, urgent first, automatic or suggested by workflow, a person assigning and moving, and what is left out. These tests double as examples.
 * Who calls it: vitest. Depends on: assignment.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import type { GiftProject, Project } from "../06-projects/projects";
import { applyAssignmentAction, assignables, demandByItem, assignManual, emptyAssignments, hasRoom, loads, projectOfOrder, runAssignment, suggestAssignments, toAssign, unassign, type AssignContext, type Assignments } from "./assignment";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T-${key}`, paidDate: `2026-10-${key.slice(-2).padStart(2, "0")}`, supporterId: "S1", supporterName: "Invented Donor", group: "", itemId: "I10", itemName: "Orphan Sponsorship Monthly", amount: 30, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf-sponsor", categoryId: "sponsorship", status: "ready", projectName: "Aghosh Home", ...over,
});
const partner = (id: string, name: string, over: Partial<Project> = {}): Project => ({ id, name, aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", ddReview: "2027-12-31", itemIds: ["I10"], benefitTerms: { I10: { capacity: 10 } }, ...over });
const trust = partner("trust", "Trust", { benefitTerms: { I10: { capacity: 3 } } });
const backup = partner("backup", "Backup");
const lapsed = partner("lapsed", "Lapsed", { status: "pending" });
const builders = partner("builders", "Builders", { itemIds: ["I11"], benefitTerms: { I11: { capacity: 5 } } });
const aghosh: GiftProject = { id: "aghosh", name: "Aghosh Home", crmNames: [], partnerIds: ["lapsed", "builders", "trust", "backup"] };
const ctx = (over: Partial<AssignContext> = {}): AssignContext => ({
  workOrders: [], partners: [lapsed, builders, trust, backup], giftProjects: [aghosh], modeOf: () => "auto", reassignOf: () => true, urgent: new Set(), today: "2026-11-24", now: "2026-11-24T10:00:00Z", ...over,
});
const five = ["G01", "G02", "G03", "G04", "G05"].map((k) => wo(k));

describe("which partner a gift goes to", () => {
  it("tries the project's partners in order, skips a lapsed one and one that does not deliver the item, and moves to the next when one is full", () => {
    const s = suggestAssignments(ctx({ workOrders: five }), emptyAssignments());
    expect(s.map((x) => x.partnerId)).toEqual(["trust", "trust", "trust", "backup", "backup"]); // the trust has room for three
    expect(s[0]?.candidates.map((c) => c.name)).toEqual(["Trust", "Backup"]); // the lapsed partner and the builders are not even considered
    expect(s[3]?.candidates.map((c) => [c.name, c.ok])).toEqual([["Trust", false], ["Backup", true]]);
    expect(s[3]?.why).toBe("Goes to Backup (10 of 10 units free)");
    expect(s[4]?.why).toBe("Goes to Backup (9 of 10 units free)"); // the room shrinks as the run goes
  });
  it("counts what is already assigned, so a second run does not give the same room again", () => {
    const first = runAssignment(ctx({ workOrders: five.slice(0, 3) }), emptyAssignments());
    const s = suggestAssignments(ctx({ workOrders: five }), first.value);
    expect(s.map((x) => [x.key, x.partnerId])).toEqual([["G04", "backup"], ["G05", "backup"]]); // the first three are done, the trust is full
  });
  it("needs a gift's units to fit: one that is too big for the first partner goes to the next", () => {
    const big = wo("G01", { quantity: 4 });
    expect(suggestAssignments(ctx({ workOrders: [big] }), emptyAssignments())[0]?.partnerId).toBe("backup"); // 4 units do not fit the trust's 3
  });
  it("sends a gift with no project to any eligible partner that delivers its item, and says nothing is wrong with that", () => {
    const g = wo("G01", { projectName: "" });
    const s = suggestAssignments(ctx({ workOrders: [g, wo("G02", { projectName: "Where Needed Most" })] }), emptyAssignments());
    expect(s.map((x) => x.partnerId)).toEqual(["trust", "trust"]); // lapsed and builders are not eligible, the trust is the first that is
    expect(s[0]?.projectId).toBe("");
  });
  it("waits with the reason when there is no one: a project that does not offer the benefit, one not set up, no partner yet, or every partner full", () => {
    const limited: GiftProject = { ...aghosh, id: "limited", name: "Limited", crmNames: [], itemIds: ["I99"] };
    const empty: GiftProject = { id: "empty", name: "Empty", crmNames: [], partnerIds: [] };
    const s = suggestAssignments(ctx({ giftProjects: [aghosh, limited, empty], workOrders: [wo("G01", { projectName: "Limited" }), wo("G02", { projectName: "Unknown Project" }), wo("G03", { projectName: "Empty" })] }), emptyAssignments());
    expect(s.map((x) => x.partnerId)).toEqual(["", "", ""]);
    expect(s[0]?.why).toBe("Limited does not offer this benefit.");
    expect(s[1]?.why).toBe("The project Unknown Project is not set up yet.");
    expect(s[2]?.why).toBe("Empty has no partner yet.");
    const tiny = [partner("one", "One", { benefitTerms: { I10: { capacity: 1 } } })];
    const g = suggestAssignments(ctx({ partners: tiny, giftProjects: [{ ...aghosh, partnerIds: ["one"] }], workOrders: [wo("G01"), wo("G02")] }), emptyAssignments());
    expect(g.map((x) => x.partnerId)).toEqual(["one", ""]);
    expect(g[1]?.why).toContain("Every eligible partner is full");
  });
  it("places an urgent gift first, then the oldest payment first", () => {
    const s = suggestAssignments(ctx({ workOrders: five, urgent: new Set(["G05"]) }), emptyAssignments());
    expect(s.map((x) => x.key)).toEqual(["G05", "G01", "G02", "G03", "G04"]);
    expect(s[0]?.urgent).toBe(true);
    expect(s[0]?.partnerId).toBe("trust"); // the urgent one gets the trust's room first
  });
});

describe("a recurring gift is one assignment (DECISIONS 172)", () => {
  const monthly = (n: number, sub: string) => Array.from({ length: n }, (_, i) => wo(`${sub}-${String(i + 1).padStart(2, "0")}`, { subscriptionId: sub, instalmentNumber: String(i + 1), instalmentCount: "12", paidDate: `2026-${String(i + 1).padStart(2, "0")}-05` }));
  it("groups the payments of a subscription into one assignment that takes its units once", () => {
    const orders = [...monthly(12, "SUB-1"), wo("G90")];
    const list = assignables(ctx({ workOrders: orders }));
    expect(list.map((x) => [x.key, x.payments, x.parts])).toEqual([["sub:SUB-1", 12, 1], ["G90", 1, 1]]); // twelve payments, one assignment
    const s = suggestAssignments(ctx({ workOrders: orders }), emptyAssignments());
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ key: "sub:SUB-1", payments: 12, partnerId: "trust" });
    expect(s[1]?.partnerId).toBe("trust"); // the trust has room for three, and has used one
    expect(hasRoom(trust, "I10", 1, runAssignment(ctx({ workOrders: orders }), emptyAssignments()).value.records)).toEqual({ ok: true, why: "1 of 3 units free" });
  });
  it("lets many subscriptions fill a partner, one place each, and sends the next to the backup", () => {
    const orders = [...monthly(12, "SUB-1"), ...monthly(12, "SUB-2"), ...monthly(12, "SUB-3"), ...monthly(12, "SUB-4")];
    expect(suggestAssignments(ctx({ workOrders: orders }), emptyAssignments()).map((x) => x.partnerId)).toEqual(["trust", "trust", "trust", "backup"]); // 48 payments, but four places
  });
  it("never mistakes a subscription for a one-off payment whose line id has the same value", () => {
    const orders = [wo("12345", { itemId: "I11", itemName: "Small Pump", projectName: "" }), ...["a", "b"].map((x) => wo(`line-${x}`, { subscriptionId: "12345", instalmentNumber: x, instalmentCount: "12" }))];
    const list = assignables(ctx({ workOrders: orders, partners: [trust, backup, builders] }));
    expect(list.map((x) => [x.key, x.w.itemId, x.payments]).sort()).toEqual([["12345", "I11", 1], ["sub:12345", "I10", 2]]); // two assignments, never one
    const s = suggestAssignments(ctx({ workOrders: orders, partners: [trust, backup, builders] }), emptyAssignments());
    expect(new Set(s.map((x) => x.key)).size).toBe(2);
    expect(s.find((x) => x.key === "12345")?.partnerId).toBe("builders"); // the pump goes to the builders
    expect(s.find((x) => x.key === "sub:12345")?.partnerId).toBe("trust"); // the sponsorship goes to the trust
  });
  it("counts the units each item needs a partner for, a recurring gift once", () => {
    const orders = [...monthly(12, "SUB-1"), ...monthly(12, "SUB-2"), wo("G90", { itemId: "I11", itemName: "Small Pump", quantity: 3 })];
    expect(demandByItem(ctx({ workOrders: orders }))).toEqual({ I10: 2, I11: 3 }); // two subscriptions of one unit each, and a pump gift of three
  });
  it("takes the parts of one instalment, not of every payment, and counts a catch-up payment as the instalments it covers", () => {
    const covers = wo("C-01", { subscriptionId: "SUB-C", quantity: 3, covers: 3 }); // 3 units paid for 3 instalments: 1 unit each
    expect(assignables(ctx({ workOrders: [covers] }))[0]?.parts).toBe(1);
    expect(assignables(ctx({ workOrders: [wo("C-02", { subscriptionId: "SUB-D", quantity: 2 })] }))[0]?.parts).toBe(2);
  });
  it("assigns and moves a recurring gift by its subscription, and the key is the subscription", () => {
    const c = ctx({ workOrders: monthly(3, "SUB-1") });
    const r = assignManual(c, emptyAssignments(), "sub:SUB-1", "backup");
    expect("value" in r && r.value.records).toMatchObject([{ key: "sub:SUB-1", partnerId: "backup", parts: 1 }]);
    expect(assignManual(c, emptyAssignments(), "SUB-9", "backup")).toHaveProperty("error");
    expect(assignManual(c, emptyAssignments(), "SUB-1", "backup")).toHaveProperty("error"); // the bare subscription id is not a key
  });
});

describe("which gifts are in scope", () => {
  it("leaves out gifts that are not ready, have no workflow, are excluded, a custom amount or a legacy upload, and ones already assigned", () => {
    const orders = [wo("G01"), wo("G02", { status: "unrouted", frameworkId: undefined }), wo("G03", { status: "excluded" }), wo("G04", { customAmount: true }), wo("G05", { legacyUpload: true }), wo("G06", { frameworkId: undefined }), wo("G07")];
    const done: Assignments = { records: [{ key: "G07", partnerId: "trust", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto", at: "x" }] };
    expect(toAssign(ctx({ workOrders: orders }), done).map((u) => u.key)).toEqual(["G01"]);
  });
  it("finds a gift's project by the CRM name, ignoring case, and none for a blank or Where Needed Most", () => {
    expect(projectOfOrder(wo("G01", { projectName: "aghosh home" }), [aghosh])?.id).toBe("aghosh");
    expect(projectOfOrder(wo("G01", { projectName: "" }), [aghosh])).toBeUndefined();
    expect(projectOfOrder(wo("G01", { projectName: "Where Needed Most" }), [aghosh])).toBeUndefined();
  });
});

describe("automatic or suggested", () => {
  it("assigns at once the gifts of a workflow set to automatic, and only suggests the rest", () => {
    const orders = [wo("G01"), wo("G02", { frameworkId: "wf-manual" })];
    const mixed = ctx({ workOrders: orders, modeOf: (f) => (f === "wf-manual" ? "suggest" : "auto") });
    const r = runAssignment(mixed, emptyAssignments());
    expect(r).toMatchObject({ assigned: 1, suggested: 1, waiting: 0 });
    expect(r.value.records.map((a) => [a.key, a.partnerId, a.how])).toEqual([["G01", "trust", "auto"]]);
  });
  it("counts the gifts that wait with no partner", () => {
    const r = runAssignment(ctx({ workOrders: [wo("G01", { projectName: "Nowhere" })] }), emptyAssignments());
    expect(r).toMatchObject({ assigned: 0, suggested: 0, waiting: 1 });
  });
});

describe("a person assigning", () => {
  const base = (over: Partial<AssignContext> = {}): { c: AssignContext; a: Assignments } => { const c = ctx({ workOrders: five, ...over }); return { c, a: runAssignment(c, emptyAssignments()).value }; };
  it("moves a gift to another eligible partner with room, even one outside the project's order", () => {
    const { c, a } = base();
    const moved = assignManual(c, a, "G01", "backup");
    expect("value" in moved && moved.value.records.find((x) => x.key === "G01")).toMatchObject({ partnerId: "backup", how: "manual" });
  });
  it("refuses an ineligible partner, a full one, the same one, a missing gift, and a move when reassigning is switched off", () => {
    const { c, a } = base();
    expect(assignManual(c, a, "G01", "lapsed")).toHaveProperty("error"); // not active
    expect(assignManual(c, a, "G01", "builders")).toHaveProperty("error"); // does not deliver the item
    const unassigned = unassign(a, "G01");
    if ("error" in unassigned) throw new Error(unassigned.error);
    expect(assignManual(c, unassigned.value, "G01", "trust")).toHaveProperty("value"); // the trust has a place again (G02 and G03 are on it)
    expect(assignManual(c, a, "G01", "trust")).toEqual({ error: "It is already assigned to that partner." });
    expect(assignManual(c, a, "nope", "trust")).toHaveProperty("error");
    expect(assignManual(ctx({ workOrders: five, reassignOf: () => false }), a, "G01", "backup")).toEqual({ error: "Reassigning is switched off for this workflow." });
    const tight = ctx({ workOrders: five, partners: [partner("trust", "Trust", { benefitTerms: { I10: { capacity: 3 } } }), partner("backup", "Backup", { benefitTerms: { I10: { capacity: 2 } } })] });
    const full = runAssignment(tight, emptyAssignments()).value;
    expect(assignManual(tight, full, "G01", "backup")).toEqual({ error: "Backup is full: 2 of 2 units taken, needs 1." });
  });
  it("assigns a gift that was only suggested", () => {
    const c = ctx({ workOrders: [wo("G01")], modeOf: () => "suggest" });
    const r = assignManual(c, emptyAssignments(), "G01", "trust");
    expect("value" in r && r.value.records).toHaveLength(1);
  });
  it("unassigns, and a gift that is not assigned cannot be unassigned", () => {
    const { a } = base();
    expect(unassign(a, "G01")).toHaveProperty("value");
    expect(unassign(emptyAssignments(), "G01")).toHaveProperty("error");
  });
});

describe("room and the page's requests", () => {
  it("says how much room a partner has left for an item", () => {
    const a: Assignments = { records: [{ key: "x", partnerId: "trust", giftProjectId: "", itemId: "I10", parts: 2, how: "auto", at: "x" }] };
    expect(hasRoom(trust, "I10", 1, a.records)).toEqual({ ok: true, why: "1 of 3 units free" });
    expect(hasRoom(trust, "I10", 2, a.records).ok).toBe(false);
    expect(hasRoom(partner("free", "Free", { benefitTerms: {}, capacity: undefined }), "I10", 99, []).ok).toBe(true); // no capacity set: no limit
    expect(loads([trust, backup], a).filter((l) => l.partnerId === "trust")).toEqual([{ partnerId: "trust", itemId: "I10", capacity: 3, taken: 2 }]);
  });
  it("applies the page's requests, and is not an Assignment request for anything else", () => {
    const c = ctx({ workOrders: five });
    const run = applyAssignmentAction(c, emptyAssignments(), { action: "asg-run" });
    if (!run || "error" in run) throw new Error("run");
    expect(run.value.records).toHaveLength(5);
    expect(run.message).toBe("Assigned 5 automatically. 0 more are suggested for a person to confirm, and 0 wait with no partner with room.");
    const suggest = ctx({ workOrders: five, modeOf: () => "suggest" });
    const confirmed = applyAssignmentAction(suggest, emptyAssignments(), { action: "asg-confirm" });
    expect(confirmed && "value" in confirmed && confirmed.value.records.every((r) => r.how === "manual")).toBe(true);
    const reset = applyAssignmentAction(c, run.value, { action: "asg-reset" });
    expect(reset && "value" in reset && reset.value.records).toEqual([]);
    expect(applyAssignmentAction(c, run.value, { action: "asg-set", key: "G01", partnerId: "backup" })).toHaveProperty("value");
    expect(applyAssignmentAction(c, run.value, { action: "asg-unassign", key: "G01" })).toHaveProperty("value");
    expect(applyAssignmentAction(c, run.value, { action: "enr-add" })).toBeNull();
  });
});
