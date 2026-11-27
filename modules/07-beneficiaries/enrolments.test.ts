/**
 * enrolments.test.ts
 *
 * What it does: tests enrolment (DECISIONS 167): placing a beneficiary in a cluster for a benefit, who a type allows, approval before enrolling, roles, capacity on the master cluster, duplicates, ending and
 * moving, and what blocks a removal. Invented people, one orphan home and a water project. These tests double as examples. Who calls it: vitest. Depends on: enrolments.ts.
 */

import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister, type Register } from "./beneficiaries";
import { activeIn, applyEnrolmentAction, emptyEnrolments, endEnrolment, enrol, heldByBeneficiary, heldInCluster, masterOf, moveEnrolment, type EnrolContext, type Enrolments, type ItemRules } from "./enrolments";
import type { GiftProject } from "../06-projects/projects";

type R = { value: Enrolments; id: string } | { error: string } | null;
const ok = (r: R): Enrolments => { if (r === null) throw new Error("not an enrolment request"); if ("error" in r) throw new Error(r.error); return r.value; };
const reg = (r: { value: Register } | { error: string }): Register => { if ("error" in r) throw new Error(r.error); return r.value; };

// Aghosh Home (total 3 places, one Principal role) with Class 1 and Class 2 inside, and a village water project.
const projects: GiftProject[] = [
  { id: "aghosh", name: "Aghosh Homes", crmNames: [], partnerIds: [], itemIds: ["SPONSOR", "WATER"], clusters: [
    { id: "lahore", name: "Aghosh Home - Lahore", label: "Home", parentId: "", place: "Lahore", capacity: 3, status: "active", roles: ["Principal"] },
    { id: "class-1", name: "Class 1", label: "Class", parentId: "lahore", place: "", status: "active" },
    { id: "class-2", name: "Class 2", label: "Class", parentId: "lahore", place: "", status: "active" },
    { id: "karachi", name: "Aghosh Home - Karachi", label: "Home", parentId: "", place: "", status: "closed" },
  ] },
  { id: "water", name: "Village water", crmNames: [], partnerIds: [], clusters: [{ id: "dadyal", name: "Dadyal", label: "Village", parentId: "", place: "", status: "active" }] },
];
const rules: Record<string, ItemRules> = {
  SPONSOR: { first: "beneficiary", receiver: "person", kindLabel: "Person(s)" },
  WATER: { first: "gift", receiver: "household", kindLabel: "Build" },
  MOSQUE: { first: "gift", receiver: "none", kindLabel: "Waqf" },
  CAMP: { first: "gift", receiver: "list", kindLabel: "Activity" },
};

let register = emptyRegister();
for (const [name, eligibility] of [["Ayesha Khan", "ready"], ["Bilal Raza", "ready"], ["Carla Dsouza", "ready"], ["Dania Shah", "ready"], ["Eman Ali", "review"], ["Fatima Noor", "declined"]] as const) register = reg(addBeneficiary(register, "person", { name, eligibility }));
register = reg(addBeneficiary(register, "household", { name: "Khan family", area: "Dadyal" }));
// PRS-0001 Ayesha, 0002 Bilal, 0003 Carla, 0004 Dania (ready); 0005 Eman (review); 0006 Fatima (declined); HH-0001 Khan family.
const ctx = (over: Partial<EnrolContext> = {}): EnrolContext => ({ beneficiaries: register, giftProjects: projects, rulesOf: (i) => rules[i], today: "2026-11-24", ...over });
const add = (enr: Enrolments, b: string, over: Record<string, unknown> = {}): NonNullable<R> => enrol(ctx(), enr, { beneficiaryId: b, giftProjectId: "aghosh", clusterId: "class-1", itemId: "SPONSOR", ...over });

describe("enrolling", () => {
  it("places an approved person in a sub cluster for a benefit, with a permanent ID", () => {
    let enr = ok(add(emptyEnrolments(), "PRS-0001"));
    enr = ok(add(enr, "PRS-0002", { clusterId: "class-2" }));
    expect(enr.records.map((e) => [e.id, e.beneficiaryId, e.clusterId, e.status, e.since])).toEqual([["EN-0001", "PRS-0001", "class-1", "active", "2026-11-24"], ["EN-0002", "PRS-0002", "class-2", "active", "2026-11-24"]]);
  });
  it("refuses a missing beneficiary, project, cluster, benefit, or an inactive beneficiary", () => {
    const e = emptyEnrolments();
    expect(add(e, "PRS-0099")).toHaveProperty("error");
    expect(add(e, "PRS-0001", { giftProjectId: "nope" })).toHaveProperty("error");
    expect(add(e, "PRS-0001", { clusterId: "dadyal" })).toHaveProperty("error"); // a cluster of another project
    expect(add(e, "PRS-0001", { clusterId: "karachi" })).toHaveProperty("error"); // closed
    expect(add(e, "PRS-0001", { itemId: "" })).toHaveProperty("error");
    expect(add(e, "PRS-0001", { itemId: "CAMP" })).toHaveProperty("error"); // the project does not offer it
  });
  it("lets a project that names no benefits take any", () => {
    expect(enrol(ctx(), emptyEnrolments(), { beneficiaryId: "HH-0001", giftProjectId: "water", clusterId: "dadyal", itemId: "WATER" })).toHaveProperty("value");
  });
  it("follows who the type allows: a person, a household, a list, or no one", () => {
    const e = emptyEnrolments();
    expect(add(e, "HH-0001")).toHaveProperty("error"); // sponsorship goes to a person
    expect(enrol(ctx(), e, { beneficiaryId: "PRS-0001", giftProjectId: "water", clusterId: "dadyal", itemId: "WATER" })).toHaveProperty("error"); // a pump goes to a household
    const camp = enrol(ctx({ rulesOf: (i) => rules[i === "X" ? "CAMP" : i] }), e, { beneficiaryId: "PRS-0001", giftProjectId: "water", clusterId: "dadyal", itemId: "X" });
    expect(camp).toHaveProperty("value"); // a list takes either
    const mosque = enrol(ctx({ rulesOf: () => rules["MOSQUE"] }), e, { beneficiaryId: "PRS-0001", giftProjectId: "water", clusterId: "dadyal", itemId: "MOSQUE" });
    expect("error" in mosque && mosque.error).toContain("serves a community");
  });
  it("needs a person to be approved first where the beneficiary comes first, and says why", () => {
    const e = emptyEnrolments();
    const review = add(e, "PRS-0005");
    expect("error" in review && review.error).toContain("needs an admission decision of Ready");
    const declined = add(e, "PRS-0006");
    expect("error" in declined && declined.error).toContain("cannot be enrolled");
    // Where the gift comes first, no approval is needed.
    expect(enrol(ctx({ rulesOf: () => ({ first: "gift", receiver: "person", kindLabel: "Build" }) }), e, { beneficiaryId: "PRS-0005", giftProjectId: "aghosh", clusterId: "class-1", itemId: "WATER" })).toHaveProperty("value");
  });
  it("refuses the same beneficiary twice for the same project and benefit, and allows it for another benefit", () => {
    const enr = ok(add(emptyEnrolments(), "PRS-0001"));
    const again = add(enr, "PRS-0001", { clusterId: "class-2" });
    expect("error" in again && again.error).toContain("already enrolled");
    expect(enrol(ctx({ rulesOf: () => rules["CAMP"] }), enr, { beneficiaryId: "PRS-0001", giftProjectId: "aghosh", clusterId: "class-1", itemId: "WATER" })).toHaveProperty("value");
  });
});

describe("roles", () => {
  it("lets a person hold a role the cluster lists, without an admission decision, and not count towards capacity", () => {
    let enr = ok(add(emptyEnrolments(), "PRS-0005", { clusterId: "lahore", role: "principal" }));
    expect(enr.records[0]?.role).toBe("principal");
    expect(add(enr, "PRS-0001", { clusterId: "class-1", role: "Warden" })).toHaveProperty("error"); // the cluster does not list Warden
    enr = ok(add(enr, "PRS-0001")); enr = ok(add(enr, "PRS-0002")); enr = ok(add(enr, "PRS-0003")); // three places taken, the principal not counted
    expect(activeIn(enr, { clusters: projects[0]!.clusters! }, "aghosh", "lahore", true)).toHaveLength(3);
  });
});

describe("capacity on the master cluster", () => {
  it("stops enrolling when the master cluster's total is reached, counting its sub clusters together", () => {
    let enr = ok(add(emptyEnrolments(), "PRS-0001"));
    enr = ok(add(enr, "PRS-0002", { clusterId: "class-2" }));
    enr = ok(add(enr, "PRS-0003"));
    const full = add(enr, "PRS-0004", { clusterId: "class-2" });
    expect("error" in full && full.error).toBe("Aghosh Home - Lahore is full: 3 of 3 enrolled.");
    enr = ok(endEnrolment(enr, "EN-0001", "2026-11-25")); // a place is freed
    expect(add(enr, "PRS-0004", { clusterId: "class-2" })).toHaveProperty("value");
  });
  it("finds the master cluster of any cluster", () => {
    expect(masterOf({ clusters: projects[0]!.clusters! }, "class-2")?.id).toBe("lahore");
    expect(masterOf({ clusters: projects[0]!.clusters! }, "nope")).toBeUndefined();
  });
});

describe("ending and moving", () => {
  it("ends an enrolment, keeping the record, and refuses to end it twice", () => {
    let enr = ok(add(emptyEnrolments(), "PRS-0001"));
    enr = ok(endEnrolment(enr, "EN-0001", "2026-11-25"));
    expect(enr.records[0]).toMatchObject({ status: "ended", endedOn: "2026-11-25" });
    expect(endEnrolment(enr, "EN-0001", "2026-11-26")).toHaveProperty("error");
    expect(endEnrolment(enr, "nope", "2026-11-26")).toHaveProperty("error");
    expect(ok(add(enr, "PRS-0001")).records).toHaveLength(2); // enrolled again once ended
  });
  it("moves an enrolment to another cluster of the project, checking capacity and the role again", () => {
    let enr = ok(add(emptyEnrolments(), "PRS-0001"));
    enr = ok(moveEnrolment(ctx(), enr, "EN-0001", "class-2"));
    expect(enr.records[0]?.clusterId).toBe("class-2");
    expect(moveEnrolment(ctx(), enr, "EN-0001", "dadyal")).toHaveProperty("error"); // another project's cluster
    expect(moveEnrolment(ctx(), enr, "EN-0001", "karachi")).toHaveProperty("error"); // closed
    const role = ok(add(emptyEnrolments(), "PRS-0005", { clusterId: "lahore", role: "Principal" }));
    expect(moveEnrolment(ctx(), role, "EN-0001", "class-1")).toHaveProperty("error"); // Class 1 does not list Principal
  });
});

describe("what blocks a removal, and the page's requests", () => {
  it("counts the active enrolments of a beneficiary and of a cluster", () => {
    let enr = ok(add(emptyEnrolments(), "PRS-0001"));
    enr = ok(add(enr, "PRS-0002"));
    expect(heldByBeneficiary(enr, "PRS-0001")).toBe(1);
    expect(heldInCluster(enr, "aghosh", "class-1")).toBe(2);
    expect(heldInCluster(enr, "aghosh", "lahore")).toBe(0); // its own, not what is inside
    enr = ok(endEnrolment(enr, "EN-0001", "2026-11-25"));
    expect(heldByBeneficiary(enr, "PRS-0001")).toBe(0);
  });
  it("applies the page's requests, and is not an enrolment request for anything else", () => {
    let enr = ok(applyEnrolmentAction(ctx(), emptyEnrolments(), { action: "enr-add", beneficiaryId: "PRS-0001", giftProjectId: "aghosh", clusterId: "class-1", itemId: "SPONSOR" }));
    enr = ok(applyEnrolmentAction(ctx(), enr, { action: "enr-move", id: "EN-0001", clusterId: "class-2" }));
    enr = ok(applyEnrolmentAction(ctx(), enr, { action: "enr-end", id: "EN-0001" }));
    expect(enr.records[0]).toMatchObject({ clusterId: "class-2", status: "ended", endedOn: "2026-11-24" });
    expect(applyEnrolmentAction(ctx(), enr, { action: "ben-add" })).toBeNull();
  });
});
