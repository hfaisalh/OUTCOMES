/**
 * waiting.test.ts
 *
 * What it does: tests the pool and the waiting list (DECISIONS 246): automatic admission by completeness, the waiting list in first in, first out order, and enrolling the next in line into the cluster
 * with the most room, including when room opens. Invented children and one orphan project with two homes. These tests double as examples. Who calls it: vitest. Depends on: waiting.ts.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, setBeneficiary, emptyRegister, type Register } from "./beneficiaries";
import { emptyEnrolments, endEnrolment, type Enrolments, type ItemRules } from "./enrolments";
import { autoAdmit, poolMessage, poolOf, positionOf, settlePool, standingOf } from "./waiting";
import type { GiftProject } from "../06-projects/projects";

const rules: Record<string, ItemRules> = { SPONSOR: { first: "beneficiary", receiver: "person", kindLabel: "Person(s)" } };
const project = (over: Partial<GiftProject> = {}): GiftProject => ({
  id: "aghosh", name: "Aghosh Homes", crmNames: [], partnerIds: [], itemIds: ["SPONSOR"], enrolAuto: true,
  clusters: [
    { id: "lahore", name: "Lahore", label: "Home", parentId: "", place: "", capacity: 2, status: "active" },
    { id: "karachi", name: "Karachi", label: "Home", parentId: "", place: "", capacity: 1, status: "active" },
  ], ...over,
});
const ctx = (g: GiftProject[]) => ({ giftProjects: g, rulesOf: (i: string) => rules[i], today: "2026-11-27" });
const full = { dob: "2016-04-02", guardian: "A mother" };

// Adds a person for the project, registered on `day`. `extra` can leave out details to make the record incomplete.
function person(reg: Register, name: string, day: string, extra: Record<string, unknown> = {}): Register {
  const r = addBeneficiary(reg, "person", { name, ...full, idNumber: `B-${name}`, targetProjectId: "aghosh", ...extra }, false, day);
  if ("error" in r) throw new Error(r.error);
  return r.value;
}
const names = (list: { name: string }[]): string[] => list.map((b) => b.name);
const enrolledNames = (reg: Register, enr: Enrolments): string[] => enr.records.filter((e) => e.status === "active").map((e) => reg.records.find((b) => b.id === e.beneficiaryId)?.name ?? "?");

describe("automatic admission", () => {
  it("marks a complete record Ready and an incomplete one Needs review, saying what is missing", () => {
    let reg = person(emptyRegister(), "Amina", "2026-11-01");
    reg = person(reg, "Bilal", "2026-11-02", { guardian: "", idNumber: "" });
    const out = autoAdmit(reg);
    expect(out.records[0]).toMatchObject({ eligibility: "ready", eligibilityNote: "Automatic: the record is complete" });
    expect(out.records[1]).toMatchObject({ eligibility: "review", eligibilityNote: "Automatic: missing guardian, ID number" });
  });

  it("works the decision out again when the record is completed, but never over a person's decision", () => {
    let reg = autoAdmit(person(emptyRegister(), "Bilal", "2026-11-02", { guardian: "" }));
    const id = reg.records[0]!.id;
    const done = setBeneficiary(reg, id, { name: "Bilal", ...full, idNumber: "B-Bilal", targetProjectId: "aghosh", eligibility: "review", eligibilityNote: "Automatic: missing guardian" });
    if ("error" in done) throw new Error(done.error);
    expect(autoAdmit(done.value).records[0]!.eligibility).toBe("ready"); // completed, so the automatic decision is Ready now
    const declined = setBeneficiary(done.value, id, { name: "Bilal", ...full, idNumber: "B-Bilal", targetProjectId: "aghosh", eligibility: "declined", eligibilityNote: "Not an orphan" });
    if ("error" in declined) throw new Error(declined.error);
    expect(autoAdmit(declined.value).records[0]!.eligibility).toBe("declined");
  });

  it("leaves a record with no target project alone, so the existing register is not touched", () => {
    const r = addBeneficiary(emptyRegister(), "person", { name: "Old record" });
    if ("error" in r) throw new Error(r.error);
    expect(autoAdmit(r.value)).toBe(r.value);
  });

  it("keeps a person's own decision when they change an automatic one without changing the note", () => {
    const reg = autoAdmit(person(emptyRegister(), "Bilal", "2026-11-02", { guardian: "" }));
    const r = setBeneficiary(reg, reg.records[0]!.id, { name: "Bilal", ...full, idNumber: "B-Bilal", targetProjectId: "aghosh", eligibility: "ready", eligibilityNote: reg.records[0]!.eligibilityNote });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.records[0]).toMatchObject({ eligibility: "ready", eligibilityNote: "Decided by a person" });
  });
});

describe("the waiting list", () => {
  it("lists the ready people in the order they registered, and the incomplete ones apart", () => {
    let reg = person(emptyRegister(), "Second", "2026-11-05");
    reg = person(reg, "First", "2026-11-01");
    reg = person(reg, "Incomplete", "2026-11-02", { dob: "" });
    reg = autoAdmit(reg);
    const pool = poolOf(reg, emptyEnrolments(), "aghosh");
    expect(names(pool.waiting)).toEqual(["First", "Second"]);
    expect(names(pool.review)).toEqual(["Incomplete"]);
    const second = reg.records.find((b) => b.name === "Second")!;
    expect(positionOf(reg, emptyEnrolments(), second)).toEqual({ projectId: "aghosh", position: 2, of: 2 });
  });
});

describe("priority", () => {
  it("puts people with priority first, first come first served between them, and gives the others the rest in order", () => {
    let reg = person(emptyRegister(), "Early", "2026-11-01");
    reg = person(reg, "LateUrgent", "2026-11-09", { priority: true, priorityNote: "Both parents deceased" });
    reg = person(reg, "MiddleUrgent", "2026-11-05", { priority: true });
    reg = person(reg, "Normal", "2026-11-03");
    reg = autoAdmit(reg);
    expect(names(poolOf(reg, emptyEnrolments(), "aghosh").waiting)).toEqual(["MiddleUrgent", "LateUrgent", "Early", "Normal"]);
    expect(standingOf(reg, emptyEnrolments(), [project()], reg.records.find((b) => b.name === "LateUrgent")!)).toContain("2 of 4 in line (priority, then first come first served)");
    const r = settlePool(ctx([project()]), reg, emptyEnrolments());
    expect(enrolledNames(r.register, r.enrolments)).toEqual(["MiddleUrgent", "LateUrgent", "Early"]); // 3 places: the two urgent ones, then the earliest of the rest
  });

  it("does not let priority skip the complete-record check", () => {
    const reg = autoAdmit(person(emptyRegister(), "Urgent but incomplete", "2026-11-01", { priority: true, guardian: "" }));
    expect(poolOf(reg, emptyEnrolments(), "aghosh").waiting).toHaveLength(0);
    expect(names(poolOf(reg, emptyEnrolments(), "aghosh").review)).toEqual(["Urgent but incomplete"]);
  });

  it("takes priority away when a save unticks it", () => {
    const reg = person(emptyRegister(), "Amina", "2026-11-01", { priority: true, priorityNote: "Orphaned" });
    expect(reg.records[0]).toMatchObject({ priority: true, priorityNote: "Orphaned" });
    const r = setBeneficiary(reg, reg.records[0]!.id, { name: "Amina", ...full, idNumber: "B-Amina", targetProjectId: "aghosh", priority: false });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.records[0]!.priority).toBeUndefined();
    expect(r.value.records[0]!.priorityNote).toBeUndefined();
  });
});

describe("enrolling from the waiting list", () => {
  it("enrols in order into the cluster with the most room, then keeps the rest waiting when the project is full", () => {
    let reg = emptyRegister();
    ["Ana", "Bea", "Cy", "Dee"].forEach((n, i) => { reg = person(reg, n, `2026-11-0${i + 1}`); });
    const r = settlePool(ctx([project()]), reg, emptyEnrolments());
    expect(enrolledNames(r.register, r.enrolments)).toEqual(["Ana", "Bea", "Cy"]); // 2 + 1 places
    expect(r.enrolments.records.map((e) => e.clusterId)).toEqual(["lahore", "lahore", "karachi"]); // A and B go to Lahore (room 2), then Karachi (room 1 against Lahore's remaining 0)
    expect(r.enrolments.records.every((e) => e.auto === true)).toBe(true);
    expect(poolMessage(r)).toBe("3 enrolled automatically from the waiting list.");
    expect(names(poolOf(r.register, r.enrolments, "aghosh").waiting)).toEqual(["Dee"]);
  });

  it("enrols the next in line as soon as an enrolment ends", () => {
    let reg = emptyRegister();
    ["Ana", "Bea", "Cy", "Dee"].forEach((n, i) => { reg = person(reg, n, `2026-11-0${i + 1}`); });
    const first = settlePool(ctx([project()]), reg, emptyEnrolments());
    const ended = endEnrolment(first.enrolments, first.enrolments.records[0]!.id, "2026-11-27");
    if ("error" in ended) throw new Error(ended.error);
    const next = settlePool(ctx([project()]), first.register, ended.value);
    expect(enrolledNames(next.register, next.enrolments)).toEqual(["Bea", "Cy", "Dee"]);
  });

  it("does nothing for a project that has not turned Enrol automatically on, or that has no benefit or cluster", () => {
    const reg = person(emptyRegister(), "Ana", "2026-11-01");
    const { enrolAuto: _off, ...manual } = project();
    expect(settlePool(ctx([manual as GiftProject]), reg, emptyEnrolments()).enrolled).toHaveLength(0);
    expect(settlePool(ctx([project({ itemIds: [] })]), reg, emptyEnrolments()).enrolled).toHaveLength(0);
    expect(settlePool(ctx([project({ clusters: [] })]), reg, emptyEnrolments()).enrolled).toHaveLength(0);
  });

  it("never enrols someone a person still has to review, nor an inactive record", () => {
    let reg = person(emptyRegister(), "Incomplete", "2026-11-01", { dob: "" });
    reg = person(reg, "Gone", "2026-11-02");
    reg = { ...reg, records: reg.records.map((b) => (b.name === "Gone" ? { ...b, status: "inactive" as const } : b)) };
    expect(settlePool(ctx([project()]), reg, emptyEnrolments()).enrolled).toHaveLength(0);
  });
});
