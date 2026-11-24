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
import { hasSample, isSamplePartner, loadSampleSetup, realProjectsFor, removeSampleSetup, wholeByItem, type SampleInput, type SampleState } from "./sample-setup";
import { projectVendors, type GiftProject } from "../06-projects/projects";

const items = [{ id: "I10", name: "Orphan Sponsorship Monthly" }, { id: "I13", name: "Hifz Sponsorship Monthly" }, { id: "I11", name: "Water Pump" }, { id: "I14", name: "Animal Sacrifice" }];
const input = (over: Partial<SampleInput> = {}): SampleInput => ({ items, itemKinds: { I14: "distribution" }, kindFeatures: {}, partners: [], giftProjects: [], partnerTypes: [], register: emptyRegister(), enrolments: emptyEnrolments(), realProjects: [], today: "2026-11-24", ...over });
const load = (over: Partial<SampleInput> = {}) => { const r = loadSampleSetup(input(over)); if ("error" in r) throw new Error(r.error); return r; };

describe("loading the sample setup", () => {
  it("builds partners, projects with clusters, beneficiaries and enrolments from the items that exist", () => {
    const { value, summary } = load();
    expect(summary).toMatchObject({ partners: 6, projects: 3, attached: 0, clusters: 16, beneficiaries: 24, enrolments: 18, skipped: [] });
    expect(value.giftProjects.map((g) => g.name)).toEqual(["Sample Orphan Homes", "Sample Village Projects", "Sample Relief Camps"]);
    expect(value.giftProjects[0]?.itemIds).toEqual(["I10", "I13"]); // the person items
  });
  it("covers the partner scenarios: the vendors a gift can go to skip a lapsed partner and one that does not deliver the item, and the first has little room", () => {
    const { value } = load();
    const homes = value.giftProjects[0]!;
    const name = (id: string) => value.partners.find((p) => p.id === id)?.name;
    expect(homes.partnerIds.map(name)).toEqual(["Sample Lapsed Partner", "Sample Builders Foundation", "Sample Orphan Care Trust", "Sample Care Partners", "Sample General Partner"]); // the priority order, the general partner last
    expect(projectVendors(homes, value.partners, "I10", "2026-11-24").map((p) => p.name)).toEqual(["Sample Orphan Care Trust", "Sample Care Partners", "Sample General Partner"]); // lapsed and builders skipped, the general partner the last resort
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
    expect(gp.partnerIds.length).toBe(6);
    expect(gp.sampleAttached).toEqual({ partnerIds: gp.sampleAttached!.partnerIds, clusters: true });
    expect(gp.sampleAttached?.partnerIds.length).toBe(5);
    expect(value.enrolments.records.some((e) => e.giftProjectId === "aghosh-orphan-home")).toBe(true);
    expect(value.giftProjects.map((g) => g.name)).toEqual(["Aghosh Orphan Home", "Sample Village Projects", "Sample Relief Camps"]);
  });
  it("attaches to the project whose gifts carry the most of the items, not the one with the most kinds of item", () => {
    const quiet = real({ id: "quiet", name: "Quiet" });
    const busy = real({ id: "busy", name: "Busy" });
    const { value } = load({ giftProjects: [quiet, busy], realProjects: [{ id: "quiet", itemIds: ["I10", "I13"], itemCounts: { I10: 1, I13: 1 } }, { id: "busy", itemIds: ["I10"], itemCounts: { I10: 22 } }] });
    expect(value.giftProjects.find((g) => g.id === "busy")?.clusters?.length).toBe(12); // the full set of scenarios goes to the busiest
    expect(value.giftProjects.find((g) => g.id === "quiet")?.clusters?.length).toBe(6); // the other carries the items too, so it gets a home of its own (a main home and five classes), not the full set
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

describe("covering every item (DECISIONS 171)", () => {
  const more = [...items, { id: "I20", name: "Zakat General" }, { id: "I21", name: "Ramadan Food Packs" }, { id: "I22", name: "Mystery Item" }];
  it("makes one general partner that delivers every item with generous room, so any gift has somewhere to go", () => {
    const { value } = load();
    const general = value.partners.find((p) => p.name === "Sample General Partner")!;
    expect(general.itemIds).toEqual(["I10", "I11", "I13", "I14"]);
    expect(Object.values(general.benefitTerms ?? {}).every((t) => (t.capacity ?? 0) >= 5)).toBe(true);
    expect(general.benefitTerms?.["I10"]?.capacity).toBe(50); // never under 50
  });
  it("sizes the general partner's room for each item from the real gifts, twice what they need, so it is never the bottleneck", () => {
    const { value } = load({ demand: { I10: 300, I11: 4 } });
    const general = value.partners.find((p) => p.name === "Sample General Partner")!;
    expect(general.benefitTerms?.["I10"]?.capacity).toBe(605); // 2 x 300 + 5
    expect(general.benefitTerms?.["I11"]?.capacity).toBe(50); // little demand: the floor
    expect(general.benefitTerms?.["I13"]?.capacity).toBe(50); // no demand: the floor
    expect(general.capacity).toBe(605 + 50 + 50 + 50); // the total is the sum
  });
  it("leaves one item without a partner on purpose when there are more than five, and says which", () => {
    const { value, summary } = load({ items: more });
    const general = value.partners.find((p) => p.name === "Sample General Partner")!;
    expect(summary.uncovered).toEqual(["Mystery Item"]);
    expect(general.itemIds).not.toContain("I22");
    expect(general.itemIds).toContain("I21");
  });
  it("gives items with no type a general project of their own, with the general partner", () => {
    const { value } = load({ items: more });
    const gp = value.giftProjects.find((g) => g.name === "Sample General Programmes")!;
    expect(gp.itemIds?.sort()).toEqual(["I20", "I22"]); // no type (Ramadan Food Packs is read as a distribution from its name), so no clusters of a kind, but a site to belong to
    expect(gp.partnerIds).toHaveLength(1);
  });
  it("gives the general partner to a real project that has none, and takes it off again, leaving the project's own clusters, items and gifts alone", () => {
    const noPartner = { id: "flood", name: "Flood Relief", crmNames: [], partnerIds: [], clusters: [{ id: "x", name: "Mine", label: "Camp", parentId: "", place: "", status: "active" as const }] } satisfies GiftProject;
    const own = { id: "own", name: "Own Project", crmNames: [], partnerIds: ["real-partner"] } satisfies GiftProject;
    const { value, summary } = load({ giftProjects: [noPartner, own], realProjects: [] });
    expect(summary.coveredProjects).toBe(1);
    const given = value.giftProjects.find((g) => g.id === "flood")!;
    expect(given.partnerIds).toHaveLength(1);
    expect(given.clusters?.map((c) => c.name)).toEqual(["Mine"]);
    expect(value.giftProjects.find((g) => g.id === "own")?.partnerIds).toEqual(["real-partner"]); // already had a partner: untouched
    const gone = removeSampleSetup(value);
    expect(gone.value.giftProjects.filter((g) => g.sample !== true)).toEqual([noPartner, own]);
  });
});

describe("scaled to the real gifts (DECISIONS 176)", () => {
  const demand = { I10: 30, I13: 6 };
  const whole = { I10: 3, I13: 3 };
  it("enrols enough invented children for the real gifts: the units needed divided by the units of one child, plus two, in a large home", () => {
    const { value, summary } = load({ demand, whole });
    expect(summary.beneficiaries).toBe(24 + 12 + 4); // 30 units over 3 is 10, plus 2; 6 over 3 is 2, plus 2
    expect(summary.enrolments).toBe(18 + 16);
    const main = value.giftProjects[0]!.clusters!.find((c) => c.name === "Sample Home - Main")!;
    expect(main.capacity).toBe(16); // large enough to hold them, so capacity never blocks
    expect(value.giftProjects[0]!.clusters!.filter((c) => c.parentId === main.id).map((c) => c.name)).toEqual(["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]);
    const kids = value.register.records.filter((b) => b.name.startsWith("Sample Child "));
    expect(kids).toHaveLength(16);
    expect(kids.every((b) => b.eligibility === "ready" && b.sample === true)).toBe(true);
    expect(value.enrolments.records.filter((e) => e.itemId === "I13" && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Child "))).toHaveLength(4); // one child per place, for each item
  });
  it("makes none when the real gifts need no sponsorship, and caps the number", () => {
    expect(load().summary.beneficiaries).toBe(24);
    expect(load({ demand: { I10: 100000 }, whole: { I10: 1 } }).summary.beneficiaries).toBe(24 + 120); // no more than 120 for an item
    expect(load({ demand: { I10: 100000, I13: 100000 }, whole: { I10: 1, I13: 1 } }).summary.beneficiaries).toBe(24 + 240);
  });
  it("lets the real gifts fill them: every unit a real gift needs has a child to go to", () => {
    const { value } = load({ demand, whole });
    const per = (item: string): number => value.enrolments.records.filter((e) => e.itemId === item && e.role === "" && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Child ")).length;
    expect(per("I10") * 3).toBeGreaterThanOrEqual(30);
    expect(per("I13") * 3).toBeGreaterThanOrEqual(6);
  });
  it("works out the units of one whole beneficiary for each item from its workflow", () => {
    expect(wholeByItem([{ itemId: "I10", frameworkId: "orphan" }, { itemId: "I11", frameworkId: "pump" }, { itemId: "I12" }], [{ id: "orphan", unitsPerBeneficiary: 3 }, { id: "pump", unitsPerBeneficiary: 1 }])).toEqual({ I10: 3, I11: 1 });
  });
});

describe("every real project that carries sponsorship gifts gets its own home (DECISIONS 177)", () => {
  const p = (id: string, name: string): GiftProject => ({ id, name, crmNames: [], partnerIds: [] });
  const projects = [p("dadyal", "Dadyal Orphan Complex"), p("aghosh", "Aghosh"), p("flood", "Flood Relief")];
  const real: SampleInput["realProjects"] = [
    { id: "dadyal", itemIds: ["I10"], itemCounts: { I10: 30 } },
    { id: "aghosh", itemIds: ["I10", "I13"], itemCounts: { I10: 22, I13: 3 } },
    { id: "flood", itemIds: ["I11"], itemCounts: { I11: 4 } }, // a build item: not a sponsorship project
  ];
  it("gives the others a large home and children sized to their own gifts, since a gift for a project fills only that project's places", () => {
    const { value, summary } = load({ giftProjects: projects, realProjects: real, demand: { I10: 52, I13: 3 }, whole: { I10: 3, I13: 3 } });
    const aghosh = value.giftProjects.find((g) => g.id === "aghosh")!;
    expect(aghosh.clusters?.map((c) => c.name)).toEqual(["Sample Home - Main", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]);
    expect(aghosh.clusters?.[0]?.capacity).toBe(13); // I10: 22 over 3 is 8, plus 2. I13: 3 over 3 is 1, plus 2
    expect(aghosh.sampleAttached?.clusters).toBe(true);
    const inProject = (id: string, item: string) => value.enrolments.records.filter((e) => e.giftProjectId === id && e.itemId === item && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Child ")).length;
    expect(inProject("aghosh", "I10")).toBe(10);
    expect(inProject("aghosh", "I13")).toBe(3);
    expect(inProject("dadyal", "I10")).toBeGreaterThan(0); // the best match also keeps its home
    expect(value.giftProjects.find((g) => g.id === "flood")?.clusters?.map((c) => c.name)).toEqual(["Sample Village A", "Sample Village B"]); // it carries a pump, so it gets villages, not a home
    expect(summary.skipped).toEqual([]);
  });
  it("takes the homes and the children off every one of them again when the sample is removed", () => {
    const loaded = load({ giftProjects: projects, realProjects: real, demand: { I10: 52, I13: 3 }, whole: { I10: 3, I13: 3 } });
    const gone = removeSampleSetup(loaded.value);
    expect(gone.value.giftProjects.filter((g) => g.sample !== true)).toEqual(projects);
    expect(gone.value.register.records).toEqual([]);
    expect(gone.value.enrolments.records).toEqual([]);
  });
});

describe("choosing the real project by what its name means (DECISIONS 176)", () => {
  const p = (id: string, name: string): GiftProject => ({ id, name, crmNames: [], partnerIds: [] });
  it("gives the sponsorship clusters to the orphan project, not to the flood one with a few gifts of the same item", () => {
    const projects = [p("flood", "Flood Relief"), p("dadyal", "Dadyal Orphan Complex"), p("aghosh", "Aghosh")];
    const real = [{ id: "flood", itemIds: ["I10"], itemCounts: { I10: 40 } }, { id: "dadyal", itemIds: ["I10"], itemCounts: { I10: 5 } }, { id: "aghosh", itemIds: ["I10"], itemCounts: { I10: 22 } }];
    const { value } = load({ giftProjects: projects, realProjects: real });
    expect(value.giftProjects.find((g) => g.id === "dadyal")?.clusters?.length).toBeGreaterThan(6); // "orphan" is in its name, so it gets the full set
    expect(value.giftProjects.find((g) => g.id === "flood")?.clusters?.map((c) => c.name)).toEqual(["Sample Home - Main", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]); // it carries the item too, so it gets a home of its own, not the full set
  });
  it("falls back to the busiest project when no name means anything", () => {
    const projects = [p("a", "Alpha"), p("b", "Beta")];
    const { value } = load({ giftProjects: projects, realProjects: [{ id: "a", itemIds: ["I10"], itemCounts: { I10: 2 } }, { id: "b", itemIds: ["I10"], itemCounts: { I10: 9 } }] });
    expect(value.giftProjects.find((g) => g.id === "b")?.clusters?.length).toBeGreaterThan(0);
  });
});

describe("removing the sample setup", () => {
  it("takes away exactly what the sample made and leaves everything else", () => {
    const realEnrolment: Enrolment = { id: "EN-9999", beneficiaryId: "REAL-1", giftProjectId: "real", clusterId: "c", itemId: "I10", role: "", status: "active", since: "2026-01-01" };
    const loaded = load({ enrolments: { records: [realEnrolment], counter: 9999 } });
    const gone = removeSampleSetup(loaded.value);
    expect(gone.removed).toEqual({ partners: 6, projects: 3, beneficiaries: 24, enrolments: 18 });
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
