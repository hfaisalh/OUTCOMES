/**
 * sample-setup.test.ts
 *
 * What it does: tests the invented sample setup (DECISIONS 168, 169): that it covers every scenario the workflow has to place (a partner with little room, a lapsed one and one that does not deliver, a full home, a closed
 * home, a university three levels deep, every admission decision, a possible duplicate, an inactive child, a child waiting), that everything is marked as sample, that loading twice adds nothing, that it attaches
 * to a real project when one carries the items, and that removing takes away exactly the sample. Invented items and people only. These tests double as examples.
 * Who calls it: vitest. Depends on: sample-setup.ts.
 */

import { describe, expect, it } from "vitest";
import { emptyRegister } from "./beneficiaries";
import { activeIn, emptyEnrolments, type Enrolment } from "./enrolments";
import { hasSample, isSamplePartner, loadSampleSetup, realProjectsFor, removeSampleSetup, type SampleInput, type SampleState } from "./sample-setup";
import { projectVendors, type GiftProject } from "../06-projects/projects";

const items = [{ id: "I10", name: "Orphan Sponsorship Monthly" }, { id: "I13", name: "Hifz Sponsorship Monthly" }, { id: "I11", name: "Water Pump" }, { id: "I14", name: "Animal Sacrifice" }];
const input = (over: Partial<SampleInput> = {}): SampleInput => ({ items, itemKinds: { I14: "distribution" }, kindFeatures: {}, partners: [], giftProjects: [], partnerTypes: [], register: emptyRegister(), enrolments: emptyEnrolments(), realProjects: [], today: "2026-11-24", ...over });
const load = (over: Partial<SampleInput> = {}) => { const r = loadSampleSetup(input(over)); if ("error" in r) throw new Error(r.error); return r; };

describe("loading the sample setup", () => {
  it("builds partners, projects with clusters, beneficiaries and enrolments from the items that exist", () => {
    const { value, summary } = load();
    expect(summary).toMatchObject({ partners: 5, projects: 3, attached: 0, clusters: 16, beneficiaries: 24, enrolments: 18, skipped: [] });
    expect(value.giftProjects.map((g) => g.name)).toEqual(["Sample Orphan Homes", "Sample Village Projects", "Sample Relief Camps"]);
    expect(value.giftProjects[0]?.itemIds).toEqual(["I10", "I13"]); // the person items
  });
  it("covers the partner scenarios: the vendors a gift can go to skip a lapsed partner and one that does not deliver the item, and the first has little room", () => {
    const { value } = load();
    const homes = value.giftProjects[0]!;
    const name = (id: string) => value.partners.find((p) => p.id === id)?.name;
    expect(homes.partnerIds.map(name)).toEqual(["Sample Lapsed Partner", "Sample Builders Foundation", "Sample Orphan Care Trust", "Sample Care Partners"]); // the priority order
    expect(projectVendors(homes, value.partners, "I10", "2026-11-24").map((p) => p.name)).toEqual(["Sample Orphan Care Trust", "Sample Care Partners"]); // lapsed and builders skipped
    expect(value.partners.find((p) => p.name === "Sample Orphan Care Trust")?.benefitTerms?.["I10"]?.capacity).toBe(3); // room for three, then the backup
    expect(value.partners.every(isSamplePartner)).toBe(true);
  });
  it("covers the cluster scenarios: a university three levels deep, a full home, a closed home, a mosque site", () => {
    const { value } = load();
    const homes = value.giftProjects[0]!;
    const c = homes.clusters ?? [];
    const depth = (id: string): number => { let d = 0; for (let x = c.find((y) => y.id === id); x && x.parentId !== ""; x = c.find((y) => y.id === x?.parentId)) d++; return d; };
    expect(depth(c.find((x) => x.name === "Physics Department")!.id)).toBe(2); // university, faculty, department
    expect(c.find((x) => x.name === "Sample Home - Closed")?.status).toBe("closed");
    const small = c.find((x) => x.name === "Sample Home - Small")!;
    expect(small.capacity).toBe(2);
    expect(activeIn(value.enrolments, { clusters: c }, homes.id, small.id, true)).toHaveLength(2); // full
    expect(value.giftProjects[2]?.clusters?.map((x) => x.name)).toEqual(["Sample Camp 1", "Sample Mosque Site"]);
  });
  it("fills the capacity of every master cluster that counts places, and of every partner, in total and for each benefit", () => {
    const { value } = load();
    const masters = value.giftProjects.flatMap((g) => g.clusters ?? []).filter((c) => c.parentId === "");
    expect(masters.filter((c) => c.capacity === undefined).map((c) => c.name)).toEqual(["Sample Mosque Site"]); // a community site has no places to count
    expect(value.giftProjects.flatMap((g) => g.clusters ?? []).filter((c) => c.parentId !== "").every((c) => c.capacity === undefined)).toBe(true); // sub clusters share the total
    for (const p of value.partners) {
      expect(p.capacity).toBeGreaterThan(0);
      expect(Object.values(p.benefitTerms ?? {}).every((t) => (t.capacity ?? 0) > 0 && (t.costPerUnit ?? 0) > 0)).toBe(true);
    }
  });
  it("covers the beneficiary scenarios: every admission decision, a possible duplicate, an inactive child, one waiting, students, a widow", () => {
    const { value } = load();
    const r = value.register.records;
    expect(r.filter((b) => b.eligibility === "review")).toHaveLength(2);
    expect(r.filter((b) => b.eligibility === "declined")).toHaveLength(1);
    expect(r.filter((b) => b.name === "Sample Amina")).toHaveLength(2); // the same name, another date of birth
    expect(r.find((b) => b.name === "Sample Inactive Idris")?.status).toBe("inactive");
    expect(r.filter((b) => b.name.startsWith("Sample Student"))).toHaveLength(3);
    expect(r.find((b) => b.name === "Sample Widow Rukhsana")?.eligibility).toBe("ready");
    expect(r.filter((b) => b.kind === "household")).toHaveLength(4);
    const enrolled = new Set(value.enrolments.records.map((e) => e.beneficiaryId));
    const waiting = r.find((b) => b.name === "Sample Waiting Zain")!;
    expect(waiting.eligibility).toBe("ready");
    expect(enrolled.has(waiting.id)).toBe(false); // approved, with nowhere to go
    for (const name of ["Sample Farhan", "Sample Gul", "Sample Hira", "Sample Inactive Idris"]) expect(enrolled.has(r.find((b) => b.name === name)!.id)).toBe(false); // not approved or inactive: never enrolled
    expect(r.every((b) => b.sample === true && b.name.startsWith("Sample"))).toBe(true); // invented, and plainly so
  });
  it("enrols through the rules: a child twice, three roles that use no place, students in the department, households for the pump and the camp", () => {
    const { value } = load();
    const e = value.enrolments.records;
    expect(e.every((x) => x.sample === true && x.status === "active")).toBe(true);
    expect(e.filter((x) => x.beneficiaryId === "PRS-0001").map((x) => x.itemId).sort()).toEqual(["I10", "I13"]); // Amina: orphan care and Hifz
    expect(e.filter((x) => x.role !== "").map((x) => x.role).sort()).toEqual(["Principal", "Principal", "Warden"]);
    expect(e.filter((x) => x.itemId === "I11")).toHaveLength(2); // two households for the pump
    expect(e.filter((x) => x.itemId === "I14")).toHaveLength(2); // two households for the camp
  });
  it("does nothing twice, and says so", () => {
    const first = load();
    const again = loadSampleSetup(input({ ...first.value }));
    expect(again).toEqual({ error: "The sample setup is already loaded. Remove it first to load it again." });
    expect(hasSample({ giftProjects: first.value.giftProjects, register: first.value.register })).toBe(true);
  });
  it("skips a group with no items, and refuses when no item has a type", () => {
    const small = load({ items: [items[0]!, items[1]!] });
    expect(small.value.giftProjects.map((g) => g.name)).toEqual(["Sample Orphan Homes"]);
    expect(loadSampleSetup(input({ items: [{ id: "X", name: "General Donation" }] }))).toHaveProperty("error");
    expect(loadSampleSetup(input({ items: [] }))).toHaveProperty("error");
  });
  it("reuses a partner that already exists by name, such as the one-click sample partner", () => {
    const first = load({ items: [items[0]!] });
    const again = load({ ...first.value, giftProjects: [], register: emptyRegister(), enrolments: emptyEnrolments(), items: [items[0]!] });
    expect(again.summary.partners).toBe(0);
  });
});

describe("attaching to a real project", () => {
  const real = (over: Partial<GiftProject> = {}): GiftProject => ({ id: "aghosh-orphan-home", name: "Aghosh Orphan Home", crmNames: [], partnerIds: ["real-partner"], ...over });
  it("finds the real projects and the items their gifts carry", () => {
    const wo = [{ projectName: "Aghosh Orphan Home", itemId: "I10", status: "ready" }, { projectName: "Aghosh Orphan Home", itemId: "I13", status: "ready" }, { projectName: "Other", itemId: "I11", status: "ready" }];
    expect(realProjectsFor([real(), { ...real({ id: "s", name: "S" }), sample: true }], wo)).toEqual([{ id: "aghosh-orphan-home", itemIds: ["I10", "I13"], itemCounts: { I10: 1, I13: 1 } }]);
  });
  it("gives the clusters and the sample partners to the real project whose gifts carry the sponsorship items, and makes new projects for the rest", () => {
    const { value, summary } = load({ giftProjects: [real()], realProjects: [{ id: "aghosh-orphan-home", itemIds: ["I10", "I13"] }] });
    expect(summary).toMatchObject({ attached: 1, projects: 2, enrolments: 18, skipped: [] });
    const gp = value.giftProjects.find((g) => g.id === "aghosh-orphan-home")!;
    expect(gp.clusters?.length).toBe(12);
    expect(gp.partnerIds[0]).toBe("real-partner"); // its own partner stays first, the sample ones follow
    expect(gp.partnerIds.length).toBe(5);
    expect(gp.sampleAttached?.partnerIds.length).toBe(4);
    expect(value.enrolments.records.some((e) => e.giftProjectId === "aghosh-orphan-home")).toBe(true);
    expect(value.giftProjects.map((g) => g.name)).toEqual(["Aghosh Orphan Home", "Sample Village Projects", "Sample Relief Camps"]);
  });
  it("attaches to the project whose gifts carry the most of the items, not the one with the most kinds of item", () => {
    const quiet = real({ id: "quiet", name: "Quiet" });
    const busy = real({ id: "busy", name: "Busy" });
    const { value } = load({ giftProjects: [quiet, busy], realProjects: [{ id: "quiet", itemIds: ["I10", "I13"], itemCounts: { I10: 1, I13: 1 } }, { id: "busy", itemIds: ["I10"], itemCounts: { I10: 22 } }] });
    expect(value.giftProjects.find((g) => g.id === "busy")?.clusters?.length).toBe(12);
    expect(value.giftProjects.find((g) => g.id === "quiet")?.clusters).toBeUndefined();
  });
  it("leaves a real project that already has clusters alone, and makes its own project instead", () => {
    const own = real({ clusters: [{ id: "x", name: "Mine", label: "Home", parentId: "", place: "", status: "active" }] });
    const { value, summary } = load({ giftProjects: [own], realProjects: [{ id: "aghosh-orphan-home", itemIds: ["I10"] }] });
    expect(summary.attached).toBe(0);
    expect(value.giftProjects.find((g) => g.id === "aghosh-orphan-home")?.clusters?.map((c) => c.name)).toEqual(["Mine"]);
    expect(value.giftProjects.some((g) => g.name === "Sample Orphan Homes")).toBe(true);
  });
  it("takes the clusters and the sample partners off the real project again when the sample is removed, and nothing else", () => {
    const loaded = load({ giftProjects: [real()], realProjects: [{ id: "aghosh-orphan-home", itemIds: ["I10"] }] });
    const gone = removeSampleSetup(loaded.value);
    expect(gone.value.giftProjects).toEqual([real()]); // exactly as it was
    expect(gone.value.partners).toEqual([]);
  });
});

describe("removing the sample setup", () => {
  it("takes away exactly what the sample made and leaves everything else", () => {
    const realEnrolment: Enrolment = { id: "EN-9999", beneficiaryId: "REAL-1", giftProjectId: "real", clusterId: "c", itemId: "I10", role: "", status: "active", since: "2026-01-01" };
    const loaded = load({ enrolments: { records: [realEnrolment], counter: 9999 } });
    const gone = removeSampleSetup(loaded.value);
    expect(gone.removed).toEqual({ partners: 5, projects: 3, beneficiaries: 24, enrolments: 18 });
    expect(gone.value.enrolments.records).toEqual([realEnrolment]);
    expect(gone.value.register.records).toEqual([]);
    expect(gone.value.giftProjects).toEqual([]);
    expect(gone.value.partners).toEqual([]);
    expect(gone.kept).toEqual([]);
  });
  it("keeps a sample beneficiary a real enrolment holds, and a sample partner a real project uses, and says so", () => {
    const s: SampleState = load().value;
    const trustId = s.partners.find((p) => p.name === "Sample Orphan Care Trust")!.id;
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
