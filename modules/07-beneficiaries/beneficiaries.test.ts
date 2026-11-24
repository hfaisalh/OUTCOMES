/**
 * beneficiaries.test.ts
 *
 * What it does: tests the Beneficiary register (DECISIONS 163): permanent IDs with a kind prefix, the duplicate check (exact and possible match), households and their members, what cannot be removed,
 * filtering and the page requests. Invented people only. These tests double as examples. Who calls it: vitest. Depends on: beneficiaries.ts.
 */

import { describe, expect, it } from "vitest";
import { addBeneficiary, ageOf, applyBeneficiaryAction, emptyRegister, filterBeneficiaries, findDuplicates, householdCount, normName, removeBeneficiary, setBeneficiary, NO_FILTER, type Register } from "./beneficiaries";

type R = { value: Register; id: string } | { error: string } | null;
const ok = (r: R): Register => { if (r === null) throw new Error("not a register request"); if ("error" in r) throw new Error(r.error); return r.value; };

const ayesha = { name: "Ayesha Khan", dob: "2014-03-09", gender: "female", guardian: "Samina Khan", area: "Dadyal" };
const withAyesha = (): Register => ok(addBeneficiary(emptyRegister(), "person", ayesha));

describe("adding", () => {
  it("gives each record one permanent ID with its kind's prefix, counting up", () => {
    let reg = withAyesha();
    reg = ok(addBeneficiary(reg, "person", { name: "Bilal Raza" }));
    reg = ok(addBeneficiary(reg, "household", { name: "Raza family", area: "Dadyal" }));
    expect(reg.records.map((r) => r.id)).toEqual(["PRS-0001", "PRS-0002", "HH-0001"]);
    expect(reg.records[0]).toMatchObject({ kind: "person", status: "active", dob: "2014-03-09", gender: "female", guardian: "Samina Khan" });
  });
  it("never uses a number twice, even after a record is removed", () => {
    let reg = ok(addBeneficiary(withAyesha(), "person", { name: "Bilal Raza" }));
    reg = ok(removeBeneficiary(reg, "PRS-0002"));
    expect(ok(addBeneficiary(reg, "person", { name: "Carla Dsouza" })).records.map((r) => r.id)).toEqual(["PRS-0001", "PRS-0003"]);
  });
  it("needs only a name, and refuses a bad date, gender, kind or size", () => {
    expect(addBeneficiary(emptyRegister(), "person", { name: "" })).toHaveProperty("error");
    expect(addBeneficiary(emptyRegister(), "person", { name: "Zed" })).toHaveProperty("value");
    expect(addBeneficiary(emptyRegister(), "person", { name: "Zed", dob: "2014-02-30" })).toHaveProperty("error");
    expect(addBeneficiary(emptyRegister(), "person", { name: "Zed", dob: "09/03/2014" })).toHaveProperty("error");
    expect(addBeneficiary(emptyRegister(), "person", { name: "Zed", gender: "x" })).toHaveProperty("error");
    expect(addBeneficiary(emptyRegister(), "pump" as never, { name: "Pump" })).toHaveProperty("error");
    expect(addBeneficiary(emptyRegister(), "household", { name: "Zed family", size: "0" })).toHaveProperty("error");
  });
});

describe("the duplicate check", () => {
  it("refuses the same name and date of birth, ignoring case, punctuation and spaces, and says which record it matches", () => {
    const r = addBeneficiary(withAyesha(), "person", { name: "  ayesha   KHAN. ", dob: "2014-03-09" });
    expect(r).toEqual({ error: "Ayesha Khan (PRS-0001, born 2014-03-09) is already in the register." });
  });
  it("calls the same name with another or missing date of birth a possible match, until a person says it is different", () => {
    const reg = withAyesha();
    const warn = addBeneficiary(reg, "person", { name: "Ayesha Khan", dob: "2016-01-01" });
    expect("error" in warn && warn.error).toContain("Possible match: Ayesha Khan (PRS-0001");
    expect(addBeneficiary(reg, "person", { name: "Ayesha Khan" })).toHaveProperty("error"); // no date of birth: cannot tell, so ask
    const twin = ok(addBeneficiary(reg, "person", { name: "Ayesha Khan", dob: "2016-01-01" }, true));
    expect(twin.records.map((r) => r.id)).toEqual(["PRS-0001", "PRS-0002"]);
  });
  it("does not mix kinds, and checks households on name and area", () => {
    let reg = withAyesha();
    expect(addBeneficiary(reg, "household", { name: "Ayesha Khan" })).toHaveProperty("value");
    reg = ok(addBeneficiary(reg, "household", { name: "Raza family", area: "Dadyal" }));
    expect(addBeneficiary(reg, "household", { name: "raza family", area: "dadyal" })).toHaveProperty("error"); // exact
    expect(addBeneficiary(reg, "household", { name: "Raza family", area: "Mirpur" })).toHaveProperty("error"); // possible match
    expect(addBeneficiary(reg, "household", { name: "Raza family", area: "Mirpur" }, true)).toHaveProperty("value");
  });
  it("finds duplicates without changing anything, and leaves out the record being changed", () => {
    const reg = withAyesha();
    const f = findDuplicates(reg, { kind: "person", name: "Ayesha Khan", dob: "2014-03-09" });
    expect(f.exact.map((r) => r.id)).toEqual(["PRS-0001"]);
    expect(findDuplicates(reg, { kind: "person", name: "Ayesha Khan", dob: "2014-03-09" }, "PRS-0001")).toEqual({ exact: [], similar: [] });
    expect(normName("  Ayesha   Khan. ")).toBe("ayesha khan");
  });
});

describe("changing and removing", () => {
  it("changes details and status, keeps the ID and kind, and runs the duplicate check again", () => {
    let reg = ok(addBeneficiary(withAyesha(), "person", { name: "Bilal Raza", dob: "2012-05-05" }));
    reg = ok(setBeneficiary(reg, "PRS-0002", { name: "Bilal Raza", dob: "2012-05-05", area: "Mirpur", status: "inactive" }));
    expect(reg.records[1]).toMatchObject({ id: "PRS-0002", kind: "person", area: "Mirpur", status: "inactive" });
    expect(setBeneficiary(reg, "PRS-0002", { name: "Ayesha Khan", dob: "2014-03-09" })).toHaveProperty("error"); // would become a duplicate
    expect(setBeneficiary(reg, "PRS-0002", { name: "Bilal Raza", status: "gone" })).toHaveProperty("error");
    expect(setBeneficiary(reg, "nope", { name: "Fine" })).toHaveProperty("error");
    expect(setBeneficiary(reg, "PRS-0001", { name: "Ayesha Khan", dob: "2014-03-09", area: "Dadyal" })).toHaveProperty("value"); // itself is not a duplicate
  });
  it("refuses to remove a record that is enrolled, or a person who is in a household", () => {
    let reg = ok(addBeneficiary(withAyesha(), "household", { name: "Khan family", memberIds: ["PRS-0001"] }));
    expect("error" in removeBeneficiary(reg, "PRS-0001") && (removeBeneficiary(reg, "PRS-0001") as { error: string }).error).toContain("Khan family");
    expect(removeBeneficiary(reg, "HH-0001", 2)).toHaveProperty("error"); // enrolled twice
    reg = ok(removeBeneficiary(reg, "HH-0001"));
    expect(ok(removeBeneficiary(reg, "PRS-0001")).records).toEqual([]);
    expect(removeBeneficiary(reg, "nope")).toHaveProperty("error");
  });
});

describe("households", () => {
  it("lists the persons in it, or just a size, and refuses a member that is not a person in the register", () => {
    let reg = withAyesha();
    reg = ok(addBeneficiary(reg, "household", { name: "Khan family", memberIds: "PRS-0001" }));
    expect(householdCount(reg.records[1]!)).toBe(1);
    reg = ok(addBeneficiary(reg, "household", { name: "Raza family", size: "6" }));
    expect(householdCount(reg.records[2]!)).toBe(6);
    expect(addBeneficiary(reg, "household", { name: "Other family", memberIds: ["PRS-0099"] })).toHaveProperty("error");
    expect(addBeneficiary(reg, "household", { name: "Other family", memberIds: ["HH-0001"] })).toHaveProperty("error"); // a household is not a person
    expect(setBeneficiary(reg, "HH-0001", { name: "Khan family", memberIds: ["HH-0001"] })).toHaveProperty("error"); // not itself
  });
});

describe("finding and the page's requests", () => {
  const reg = (): Register => {
    let r = withAyesha();
    r = ok(addBeneficiary(r, "person", { name: "Bilal Raza", area: "Mirpur", guardian: "Imran" }));
    r = ok(addBeneficiary(r, "household", { name: "Raza family", area: "Mirpur" }));
    return ok(setBeneficiary(r, "PRS-0002", { name: "Bilal Raza", area: "Mirpur", guardian: "Imran", status: "inactive" }));
  };
  it("filters by kind, status and a text found in the name, ID, area or guardian, sorted by name", () => {
    expect(filterBeneficiaries(reg().records, NO_FILTER).map((r) => r.id)).toEqual(["PRS-0001", "PRS-0002", "HH-0001"]);
    expect(filterBeneficiaries(reg().records, { ...NO_FILTER, kind: "household" }).map((r) => r.id)).toEqual(["HH-0001"]);
    expect(filterBeneficiaries(reg().records, { ...NO_FILTER, status: "inactive" }).map((r) => r.id)).toEqual(["PRS-0002"]);
    expect(filterBeneficiaries(reg().records, { ...NO_FILTER, text: "imran" }).map((r) => r.id)).toEqual(["PRS-0002"]);
    expect(filterBeneficiaries(reg().records, { ...NO_FILTER, text: "prs-0001" }).map((r) => r.id)).toEqual(["PRS-0001"]);
  });
  it("works out an age on a day", () => {
    expect(ageOf("2014-03-09", "2026-03-08")).toBe(11);
    expect(ageOf("2014-03-09", "2026-03-09")).toBe(12);
    expect(ageOf("", "2026-03-09")).toBeNull();
    expect(ageOf("2030-01-01", "2026-03-09")).toBeNull();
  });
  it("applies the page's requests, and is not a register request for anything else", () => {
    let r = ok(applyBeneficiaryAction(emptyRegister(), { action: "ben-add", kind: "person", ...ayesha }));
    r = ok(applyBeneficiaryAction(r, { action: "ben-set", id: "PRS-0001", ...ayesha, area: "Mirpur", status: "inactive" }));
    expect(r.records[0]).toMatchObject({ area: "Mirpur", status: "inactive" });
    expect(applyBeneficiaryAction(r, { action: "ben-add", kind: "person", ...ayesha })).toHaveProperty("error");
    expect(applyBeneficiaryAction(r, { action: "ben-remove", id: "PRS-0001" }, () => 1)).toHaveProperty("error");
    expect(ok(applyBeneficiaryAction(r, { action: "ben-remove", id: "PRS-0001" })).records).toEqual([]);
    expect(applyBeneficiaryAction(r, { action: "cluster-add" })).toBeNull();
  });
});
