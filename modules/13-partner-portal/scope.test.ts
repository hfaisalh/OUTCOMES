/**
 * scope.test.ts
 *
 * What it does: tests that a partner sees only its own data (DECISIONS 249): its own profile fields, projects, beneficiaries, enrolments, gifts and answers, and never another partner's or MWF's private fields.
 * Invented partners and children. These tests double as examples. Who calls it: vitest. Depends on: scope.ts.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister, type Register } from "../07-beneficiaries/beneficiaries";
import { emptyAllocations } from "../09-allocation/allocation";
import { partnerSlice, type PartnerState } from "./scope";
import type { GiftProject, Project } from "../06-projects/projects";

const partner = (id: string, name: string): Project => ({ id, name, reference: `R-${id}`, fundingNote: "Pays on the 5th", ddReference: "DD-9", benefitTerms: { SPONSOR: { capacity: 5, costPerUnit: 20 } } } as unknown as Project);
const project = (id: string, partnerIds: string[]): GiftProject => ({ id, name: `Project ${id}`, crmNames: [], partnerIds, notes: "MWF private note", itemIds: ["SPONSOR"], clusters: [] });

function child(reg: Register, name: string, partnerId: string): Register {
  const r = addBeneficiary(reg, "person", { name, partnerId, idNumber: `B-${name}`, dob: "2016-01-01", guardian: "A mother" }, false, "2026-11-01");
  if ("error" in r) throw new Error(r.error);
  return r.value;
}

function state(): PartnerState {
  let register = child(child(emptyRegister(), "Amina Khan", "p1"), "Bilal Ahmed", "p2");
  const ids = register.records.map((b) => b.id);
  const e = (id: string, b: string, project: string) => ({ id, beneficiaryId: b, giftProjectId: project, clusterId: "c", itemId: "SPONSOR", role: "", status: "active" as const, since: "2026-11-01" });
  return {
    itemNames: { SPONSOR: "Orphan Sponsorship", OTHER: "Another benefit" },
    partners: [partner("p1", "Alpha Trust"), partner("p2", "Beta Trust")],
    giftProjects: [project("g1", ["p1"]), project("g2", ["p2"]), project("g3", ["p1", "p2"])],
    register,
    enrolments: { counter: 3, records: [e("EN-1", ids[0]!, "g1"), e("EN-2", ids[1]!, "g2"), e("EN-3", ids[1]!, "g3")] },
    assignments: { records: [{ key: "sub:1", partnerId: "p1", giftProjectId: "g1", itemId: "SPONSOR", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z", batch: 1 }, { key: "sub:2", partnerId: "p2", giftProjectId: "g2", itemId: "SPONSOR", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z", batch: 1 }] },
    confirmations: { records: [{ key: "sub:1", partnerId: "p1", answer: "confirmed", at: "2026-11-03T00:00:00Z", by: "A", reason: "" }, { key: "sub:2", partnerId: "p2", answer: "rejected", at: "2026-11-03T00:00:00Z", by: "B", reason: "Full" }] },
    progress: { records: [{ key: "sub:1", kind: "phase", id: "visit", at: "2026-11-04T00:00:00Z", by: "A" }, { key: "sub:2", kind: "phase", id: "visit", at: "2026-11-04T00:00:00Z", by: "B" }, { key: "p1|1", kind: "batch", id: "closed", at: "2026-11-05T00:00:00Z", by: "A" }, { key: "p2|1", kind: "batch", id: "closed", at: "2026-11-05T00:00:00Z", by: "B" }] },
    allocations: { ...emptyAllocations(), records: [{ key: "sub:1", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-1", giftProjectId: "g1", itemId: "SPONSOR", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z" }, { key: "sub:2", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-2", giftProjectId: "g2", itemId: "SPONSOR", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z" }] },
  };
}

describe("what a partner sees", () => {
  it("gives a partner only its own projects, children, enrolments, gifts and answers", () => {
    const s = partnerSlice(state(), "p1")!;
    expect(s.giftProjects.map((g) => g.id)).toEqual(["g1", "g3"]);
    expect(s.beneficiaries.map((b) => b.name)).toEqual(["Amina Khan"]);
    expect(s.enrolments.map((e) => e.id)).toEqual(["EN-1"]); // the other partner's child in the shared project g3 is not shown
    expect(s.assignments.map((a) => a.key)).toEqual(["sub:1"]);
    expect(s.confirmations.map((c) => c.key)).toEqual(["sub:1"]);
    expect(s.progress.map((r) => r.key)).toEqual(["sub:1", "p1|1"]);
    expect(s.allocations.map((r) => r.outcomeRef)).toEqual(["OUT-1"]);
  });

  it("names only the benefits of the partner's own projects and gifts", () => {
    expect(partnerSlice(state(), "p1")!.itemNames).toEqual({ SPONSOR: "Orphan Sponsorship" });
  });

  it("shows the other partner exactly the mirror, so nothing leaks either way", () => {
    const s = partnerSlice(state(), "p2")!;
    expect(s.beneficiaries.map((b) => b.name)).toEqual(["Bilal Ahmed"]);
    expect(s.enrolments.map((e) => e.id)).toEqual(["EN-2", "EN-3"]);
    expect(JSON.stringify(s)).not.toContain("Amina");
  });

  it("sends only the short profile, never funding, due diligence, terms or MWF's notes", () => {
    const s = partnerSlice(state(), "p1")!;
    expect(Object.keys(s.partner).sort()).toEqual(["id", "name", "reference"]);
    const all = JSON.stringify(s);
    for (const secret of ["Pays on the 5th", "DD-9", "costPerUnit", "MWF private note"]) expect(all).not.toContain(secret);
  });

  it("shows a household only the members the partner gave", () => {
    const st = state();
    const [a, b] = st.register.records;
    const hh = addBeneficiary(st.register, "household", { name: "Khan house", partnerId: "p1", memberIds: [a!.id, b!.id] }, false, "2026-11-01");
    if ("error" in hh) throw new Error(hh.error);
    const s = partnerSlice({ ...st, register: hh.value }, "p1")!;
    expect(s.beneficiaries.find((x) => x.kind === "household")?.memberIds).toEqual([a!.id]);
  });

  it("gives nothing for a partner that does not exist, rather than everything", () => {
    expect(partnerSlice(state(), "nope")).toBeUndefined();
    expect(partnerSlice(state(), "")).toBeUndefined();
  });
});
