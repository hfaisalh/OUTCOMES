/**
 * entry.test.ts
 *
 * What it does: tests how a partner adds and completes its own beneficiaries (DECISIONS 260): it can only add people meant for a project it delivers, only for itself, only edit its own, never set MWF's decisions, sees a possible duplicate, and is told where the person stands.
 * Invented people. These tests double as examples. Who calls it: vitest. Depends on: entry.ts and the register and waiting rules.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister, type Register } from "../07-beneficiaries/beneficiaries";
import { emptyEnrolments } from "../07-beneficiaries/enrolments";
import type { GiftProject } from "../06-projects/projects";
import { entryMessage, partnerEntry, type EntryResult } from "./entry";

const projects: GiftProject[] = [{ id: "g1", name: "Orphan homes", crmNames: [], partnerIds: ["p1"] }];
const today = "2026-11-27";
const full = { name: "Amina Khan", dob: "2016-04-02", idNumber: "B-1", guardian: "A mother", targetProjectId: "g1" };
const add = (reg: Register, body: Record<string, unknown>, partner = "p1", ids = ["g1"]): EntryResult => partnerEntry(reg, partner, ids, { action: "ben-add", ...body }, today)!;
const ok = (r: EntryResult) => { if ("error" in r) throw new Error(r.error); return r; };

describe("a partner adds a beneficiary", () => {
  it("makes a person that is the partner's own, meant for the project, registered today, with an ID", () => {
    const r = ok(add(emptyRegister(), full));
    expect(r.register.records[0]).toMatchObject({ id: "PRS-0001", kind: "person", name: "Amina Khan", partnerId: "p1", targetProjectId: "g1", registeredOn: today, status: "active" });
    expect(r.added).toBe(true);
  });

  it("needs a project the partner delivers, so a person can never be left out of every waiting list or sent to another partner's project", () => {
    expect(add(emptyRegister(), { ...full, targetProjectId: "" })).toMatchObject({ error: expect.stringContaining("Choose the project") });
    expect(add(emptyRegister(), { ...full, targetProjectId: "someone-elses" })).toMatchObject({ error: expect.stringContaining("Choose the project") });
  });

  it("never takes MWF's decisions or another partner from the request", () => {
    const r = ok(add(emptyRegister(), { ...full, partnerId: "p2", eligibility: "ready", eligibilityNote: "Mine", priority: true, priorityNote: "Urgent", status: "inactive", notes: "x" }));
    expect(r.register.records[0]).toMatchObject({ partnerId: "p1", eligibility: "", status: "active", notes: "" });
    expect(r.register.records[0]!.priority).toBeUndefined();
  });

  it("refuses an exact duplicate, and shows a possible match so the partner can say it is a different person", () => {
    const first = ok(add(emptyRegister(), full)).register;
    expect(add(first, { ...full, name: "Someone Else" })).toMatchObject({ error: expect.stringContaining("is already in your register."), similar: false });
    const similar = add(first, { name: "Amina  Khan", dob: "2017-01-01", targetProjectId: "g1" });
    expect(similar).toMatchObject({ similar: true });
    const forced = add(first, { name: "Amina  Khan", dob: "2017-01-01", targetProjectId: "g1", allowSimilar: true });
    expect("register" in forced && forced.register.records).toHaveLength(2);
  });

  it("never describes another partner's record: an exact match is refused in general words, a similar one is allowed without a word (DECISIONS 271)", () => {
    const theirs = ok(add(emptyRegister(), { ...full, idNumber: "B-SECRET", name: "Private Person", dob: "2012-12-12" }, "p2", ["g1"])).register;
    const sameId = add(theirs, { name: "Other Name", idNumber: "B-SECRET", targetProjectId: "g1" });
    expect(sameId).toEqual({ error: "This person is already registered. Please contact MWF to sort it out.", similar: false });
    const sameNameAndBirth = add(theirs, { name: "Private  Person", dob: "2012-12-12", targetProjectId: "g1" });
    expect("error" in sameNameAndBirth && sameNameAndBirth.error).toBe("This person is already registered. Please contact MWF to sort it out.");
    for (const r of [sameId, sameNameAndBirth]) expect(JSON.stringify(r)).not.toMatch(/Private|B-SECRET|2012|PRS-/);
    const similar = add(theirs, { name: "Private Person", dob: "2013-01-01", targetProjectId: "g1" }); // same name, another birth date: a different person, and not described
    expect("register" in similar && similar.register.records).toHaveLength(2);
  });

  it("does not answer for other actions", () => {
    expect(partnerEntry(emptyRegister(), "p1", ["g1"], { action: "ben-remove", id: "PRS-0001" }, today)).toBeNull();
  });
});

describe("a partner completes its own beneficiary", () => {
  const withOne = (over: Record<string, unknown> = {}, owner = "p1"): Register => {
    const r = addBeneficiary(emptyRegister(), "person", { name: "Bilal Ahmed", guardian: "", idNumber: "", dob: "2015-01-01", partnerId: owner, targetProjectId: "g1", eligibility: "review", eligibilityNote: "Automatic: missing guardian, ID number", priority: true, priorityNote: "Both parents deceased", notes: "MWF note", ...over }, false, today);
    if ("error" in r) throw new Error(r.error);
    return r.value;
  };
  const edit = (reg: Register, body: Record<string, unknown>, partner = "p1") => partnerEntry(reg, partner, ["g1"], { action: "ben-set", id: "PRS-0001", targetProjectId: "g1", name: "Bilal Ahmed", ...body }, today)!;

  it("saves what the partner adds and keeps everything MWF decided", () => {
    const r = ok(edit(withOne(), { guardian: "An uncle", idNumber: "B-77" }));
    expect(r.added).toBe(false);
    expect(r.register.records[0]).toMatchObject({ guardian: "An uncle", idNumber: "B-77", priority: true, priorityNote: "Both parents deceased", notes: "MWF note", eligibility: "review" });
  });

  it("cannot edit another partner's record, and says only that it was not found", () => {
    expect(edit(withOne({}, "p2"), { guardian: "X" })).toEqual({ error: "That beneficiary was not found.", similar: false });
    expect(edit(withOne(), { id: "PRS-9999" })).toEqual({ error: "That beneficiary was not found.", similar: false });
  });
});

describe("where the person stands", () => {
  const reg = (over: Record<string, unknown>): Register => ok(add(emptyRegister(), { ...full, ...over })).register;
  it("says a complete record is on the waiting list, and what an incomplete one still needs, before the rule has run", () => {
    expect(entryMessage(reg({}), emptyEnrolments(), projects, "PRS-0001", true)).toContain("Added Amina Khan (PRS-0001).");
    const incomplete = reg({ guardian: "", idNumber: "" });
    expect(entryMessage(incomplete, emptyEnrolments(), projects, "PRS-0001", true)).toBe("Added Amina Khan (PRS-0001). Add guardian, ID number before they can join the waiting list for Orphan homes.");
  });
  it("says ready, enrolled and declined in plain words", () => {
    const ready = { ...reg({}), records: reg({}).records.map((b) => ({ ...b, eligibility: "ready" as const })) };
    expect(entryMessage(ready, emptyEnrolments(), projects, "PRS-0001", false)).toBe("Saved Amina Khan (PRS-0001). The record is complete, so they are on the waiting list for Orphan homes.");
    const enrolled = { ...emptyEnrolments(), records: [{ id: "EN-1", beneficiaryId: "PRS-0001", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active" as const, since: today }] };
    expect(entryMessage(ready, enrolled, projects, "PRS-0001", false)).toContain("Enrolled in Orphan homes.");
    const declined = { ...ready, records: ready.records.map((b) => ({ ...b, eligibility: "declined" as const })) };
    expect(entryMessage(declined, emptyEnrolments(), projects, "PRS-0001", false)).toContain("cannot be offered a vacancy");
  });
});

describe("a checked place on a beneficiary (DECISIONS 274)", () => {
  it("keeps a valid place id with the area, and drops one that is not a place id", () => {
    const r = partnerEntry(emptyRegister(), "p1", ["g1"], { action: "ben-add", name: "Amina Khan", area: "Kasur, Punjab, Pakistan", locationId: "osm:N281396083", targetProjectId: "g1" }, "2026-11-01");
    if (!r || "error" in r) throw new Error("not added");
    expect(r.register.records[0]).toMatchObject({ area: "Kasur, Punjab, Pakistan", locationId: "osm:N281396083" });
    const bad = partnerEntry(emptyRegister(), "p1", ["g1"], { action: "ben-add", name: "Bilal Ahmed", area: "Kasur", locationId: "<script>", targetProjectId: "g1" }, "2026-11-01");
    if (!bad || "error" in bad) throw new Error("not added");
    expect(bad.register.records[0]).not.toHaveProperty("locationId");
  });
});
