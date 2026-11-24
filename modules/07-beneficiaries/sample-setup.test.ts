/**
 * sample-setup.test.ts
 *
 * What it does: tests the invented sample setup (DECISIONS 168): what it builds from the items that exist, that everything is marked as sample, that loading twice adds nothing, that an existing sample partner is
 * reused, that enrolments follow the rules (one child enrolled twice, a principal and a warden in roles, a household for a pump), and that removing takes away exactly the sample and keeps what a real record holds.
 * Invented items and people only. These tests double as examples. Who calls it: vitest. Depends on: sample-setup.ts.
 */

import { describe, expect, it } from "vitest";
import { emptyRegister } from "./beneficiaries";
import { emptyEnrolments, type Enrolment } from "./enrolments";
import { hasSample, isSamplePartner, loadSampleSetup, removeSampleSetup, type SampleInput, type SampleState } from "./sample-setup";

const items = [{ id: "I10", name: "Orphan Sponsorship Monthly" }, { id: "I13", name: "Hifz Sponsorship Monthly" }, { id: "I11", name: "Water Pump" }, { id: "I14", name: "Animal Sacrifice" }];
const input = (over: Partial<SampleInput> = {}): SampleInput => ({ items, itemKinds: { I14: "distribution" }, kindFeatures: {}, partners: [], giftProjects: [], partnerTypes: [], register: emptyRegister(), enrolments: emptyEnrolments(), today: "2026-11-24", ...over });
const load = (over: Partial<SampleInput> = {}) => { const r = loadSampleSetup(input(over)); if ("error" in r) throw new Error(r.error); return r; };

describe("loading the sample setup", () => {
  it("builds partners, projects with clusters, beneficiaries and enrolments from the items that exist", () => {
    const { value, summary } = load();
    expect(summary).toMatchObject({ partners: 4, projects: 3, beneficiaries: 13, skipped: [] });
    expect(value.partners.map((p) => p.name)).toEqual(["Sample Orphan Care Trust", "Sample Care Partners", "Sample Builders Foundation", "Sample Relief Team"]);
    expect(value.giftProjects.map((g) => g.name)).toEqual(["Sample Orphan Homes", "Sample Village Projects", "Sample Relief Camps"]);
    const homes = value.giftProjects[0]!;
    expect(homes.itemIds).toEqual(["I10", "I13"]); // the person items
    expect(homes.partnerIds).toHaveLength(2); // the trust first, then the backup: the priority order
    expect(homes.clusters?.map((c) => [c.name, c.parentId === "" ? "master" : "sub", c.capacity])).toEqual([["Sample Home - North", "master", 12], ["Class 1", "sub", undefined], ["Class 2", "sub", undefined], ["Sample Home - South", "master", 8], ["Class 1", "sub", undefined]]);
    expect(summary.clusters).toBe(5 + 2 + 1);
  });
  it("makes children with every admission decision, a principal and a warden, and households, all marked as sample", () => {
    const { value } = load();
    const r = value.register.records;
    expect(r.filter((b) => b.kind === "person" && b.eligibility === "ready")).toHaveLength(5);
    expect(r.filter((b) => b.eligibility === "review")).toHaveLength(2);
    expect(r.filter((b) => b.eligibility === "declined")).toHaveLength(1);
    expect(r.filter((b) => b.kind === "household").map((b) => b.name)).toEqual(["Sample Family Noor", "Sample Family Rashid", "Sample Family Qasim"]);
    expect(r.every((b) => b.sample === true)).toBe(true);
    expect(r.every((b) => b.name.startsWith("Sample"))).toBe(true); // invented, and plainly so
    expect(value.partners.every(isSamplePartner)).toBe(true);
    expect(value.giftProjects.every((g) => g.sample === true)).toBe(true);
  });
  it("enrols them through the rules: five children, one of them twice, a principal and a warden in roles, and a household for the pump and for the camp", () => {
    const { value, summary } = load();
    const e = value.enrolments.records;
    expect(summary.enrolments).toBe(11); // five children, one of them a second time, the principal, the warden, two households for the pump, one for the camp
    expect(e.every((x) => x.sample === true && x.status === "active")).toBe(true);
    expect(e.filter((x) => x.beneficiaryId === "PRS-0001").map((x) => x.itemId).sort()).toEqual(["I10", "I13"]); // Amina: orphan care and Hifz
    expect(e.filter((x) => x.role !== "").map((x) => x.role).sort()).toEqual(["Principal", "Warden"]);
    expect(e.filter((x) => x.itemId === "I11")).toHaveLength(2); // two households for the pump
    expect(e.some((x) => x.beneficiaryId === "PRS-0006" || x.beneficiaryId === "PRS-0008")).toBe(false); // not approved: never enrolled
  });
  it("does nothing twice, and says so", () => {
    const first = load();
    const again = loadSampleSetup(input({ ...first.value, itemKinds: { I14: "distribution" }, kindFeatures: {} }));
    expect(again).toEqual({ error: "The sample setup is already loaded. Remove it first to load it again." });
    expect(hasSample({ giftProjects: first.value.giftProjects, register: first.value.register })).toBe(true);
  });
  it("skips a group with no items, and refuses when no item has a type", () => {
    const small = load({ items: [items[0]!, items[1]!] });
    expect(small.value.giftProjects.map((g) => g.name)).toEqual(["Sample Orphan Homes"]);
    expect(small.summary).toMatchObject({ partners: 2, projects: 1 });
    expect(loadSampleSetup(input({ items: [{ id: "X", name: "General Donation" }] }))).toHaveProperty("error");
    expect(loadSampleSetup(input({ items: [] }))).toHaveProperty("error");
  });
  it("reuses a partner that already exists by name, such as the one-click sample partner", () => {
    const first = load({ items: [items[0]!] });
    const trust = first.value.partners[0]!;
    const without: SampleState = { ...first.value, giftProjects: [], register: emptyRegister(), enrolments: emptyEnrolments() };
    const again = load({ ...without, items: [items[0]!] });
    expect(again.value.partners.filter((p) => p.name === trust.name)).toHaveLength(1);
    expect(again.summary.partners).toBe(0); // both were already there, so none was new
  });
});

describe("removing the sample setup", () => {
  it("takes away exactly what the sample made and leaves everything else", () => {
    const real: Enrolment = { id: "EN-9999", beneficiaryId: "REAL-1", giftProjectId: "real", clusterId: "c", itemId: "I10", role: "", status: "active", since: "2026-01-01" };
    const base = input({ enrolments: { records: [real], counter: 9999 } });
    const loaded = loadSampleSetup(base);
    if ("error" in loaded) throw new Error(loaded.error);
    const gone = removeSampleSetup(loaded.value);
    expect(gone.removed).toEqual({ partners: 4, projects: 3, beneficiaries: 13, enrolments: 11 });
    expect(gone.value.enrolments.records).toEqual([real]);
    expect(gone.value.register.records).toEqual([]);
    expect(gone.value.giftProjects).toEqual([]);
    expect(gone.value.partners).toEqual([]);
    expect(gone.kept).toEqual([]);
  });
  it("keeps a sample beneficiary a real enrolment holds, and a sample partner a real project uses, and says so", () => {
    const loaded = loadSampleSetup(input());
    if ("error" in loaded) throw new Error(loaded.error);
    const s = loaded.value;
    const trustId = s.partners[0]!.id;
    const withReal: SampleState = {
      ...s,
      giftProjects: [...s.giftProjects, { id: "real", name: "Real Project", crmNames: [], partnerIds: [trustId] }],
      enrolments: { ...s.enrolments, records: [...s.enrolments.records, { id: "EN-9000", beneficiaryId: "PRS-0004", giftProjectId: "real", clusterId: "c", itemId: "I10", role: "", status: "active", since: "2026-01-01" }] },
    };
    const gone = removeSampleSetup(withReal);
    expect(gone.value.register.records.map((b) => b.id)).toEqual(["PRS-0004"]);
    expect(gone.value.partners.map((p) => p.id)).toEqual([trustId]);
    expect(gone.kept.some((k) => k.includes("Sample Daniyal"))).toBe(true);
    expect(gone.kept.some((k) => k.includes("Sample Orphan Care Trust"))).toBe(true);
    expect(gone.value.giftProjects.map((g) => g.id)).toEqual(["real"]);
  });
});
