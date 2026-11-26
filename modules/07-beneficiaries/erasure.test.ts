/**
 * erasure.test.ts
 *
 * What it does: shows the rules of DECISIONS 240 with invented people: a copy of one beneficiary's data, and erasing one for good.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister, type Register } from "./beneficiaries";
import { eraseBeneficiary, exportBeneficiary, applyErasure } from "./erasure";
import type { Enrolments } from "./enrolments";
import type { Placements } from "../09-placement/placement";

const ok = (r: { value: Register } | { error: string }): Register => { if ("error" in r) throw new Error(r.error); return r.value; };
const reg = (): Register => {
  let r = ok(addBeneficiary(emptyRegister(), "person", { name: "Ayesha Khan", area: "Dadyal" }));
  r = ok(addBeneficiary(r, "person", { name: "Bilal Raza", area: "Mirpur" }));
  return ok(addBeneficiary(r, "household", { name: "Khan family", area: "Dadyal", memberIds: ["PRS-0001", "PRS-0002"] }));
};
const en = (id: string, who: string) => ({ id, beneficiaryId: who, giftProjectId: "p", clusterId: "c", itemId: "I1", role: "", status: "active" as const, since: "2026-09-01" });
const enr = (): Enrolments => ({ records: [en("EN-1", "PRS-0001"), en("EN-2", "PRS-0001"), en("EN-3", "PRS-0002")], counter: 3 });
const pl = (key: string, enrolmentId: string) => ({ key, kind: "place" as const, enrolmentId, outcomeRef: "", giftProjectId: "p", itemId: "I1", parts: 3, how: "auto" as const, at: "x" });
const plc = (): Placements => ({ records: [pl("L1", "EN-1"), pl("L2", "EN-3"), pl("L3", "EN-2")], counter: 3 });

describe("a copy of one beneficiary's data", () => {
  it("holds the record, the households, the enrolments and the places, and only theirs", () => {
    const x = exportBeneficiary(reg(), enr(), plc(), "PRS-0001")!;
    expect(x.beneficiary.name).toBe("Ayesha Khan");
    expect(x.households.map((h) => h.id)).toEqual(["HH-0001"]);
    expect(x.enrolments.map((e) => e.id)).toEqual(["EN-1", "EN-2"]);
    expect(x.placements.map((p) => p.key)).toEqual(["L1", "L3"]);
    expect(exportBeneficiary(reg(), enr(), plc(), "PRS-9999")).toBeNull();
  });
});

describe("erasing a beneficiary", () => {
  it("needs the ID typed back", () => {
    expect(eraseBeneficiary(reg(), enr(), plc(), "PRS-0001", "")).toMatchObject({ error: expect.stringContaining("type their ID (PRS-0001)") });
    expect(eraseBeneficiary(reg(), enr(), plc(), "PRS-0001", "PRS-0002")).toHaveProperty("error");
  });
  it("removes a person, takes them out of the household, and removes their enrolments and places, but no one else's", () => {
    const r = eraseBeneficiary(reg(), enr(), plc(), "PRS-0001", " PRS-0001 ");
    if ("error" in r) throw new Error(r.error);
    expect(r.register.records.map((x) => x.id)).toEqual(["PRS-0002", "HH-0001"]);
    expect(r.register.records.find((x) => x.id === "HH-0001")).toMatchObject({ memberIds: ["PRS-0002"] });
    expect(r.enrolments.records.map((e) => e.id)).toEqual(["EN-3"]);
    expect(r.placements.records.map((p) => p.key)).toEqual(["L2"]);
    expect(r.register.counters).toEqual(reg().counters); // the ID is never used again
    expect(r.message).toContain("2 enrolments and 2 places");
  });
  it("erasing a household leaves its persons", () => {
    const r = eraseBeneficiary(reg(), enr(), plc(), "HH-0001", "HH-0001");
    if ("error" in r) throw new Error(r.error);
    expect(r.register.records.map((x) => x.id)).toEqual(["PRS-0001", "PRS-0002"]);
    expect(r.enrolments.records).toHaveLength(3);
  });
  it("is only for the ben-erase request", () => {
    expect(applyErasure(reg(), enr(), plc(), { action: "ben-remove", id: "PRS-0001" })).toBeNull();
    expect(applyErasure(reg(), enr(), plc(), { action: "ben-erase", id: "PRS-0002", confirm: "PRS-0002" })).toHaveProperty("name", "Bilal Raza");
  });
});
