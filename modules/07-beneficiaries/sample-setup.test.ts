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
    expect(summary).toMatchObject({ partners: 6, projects: 3, attached: 0, clusters: 16, beneficiaries: 26, enrolments: 20, skipped: [] });
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
  it("fills the capacity of every master cluster that counts places, and gives each partner the room that fits its benefit (DECISIONS 183)", () => {
    const { value } = load();
    const masters = value.giftProjects.flatMap((g) => g.clusters ?? []).filter((c) => c.parentId === "");
    expect(masters.filter((c) => c.capacity === undefined).map((c) => c.name)).toEqual(["Sample Mosque Site"]); // a community site has no places to count
    expect(value.giftProjects.flatMap((g) => g.clusters ?? []).filter((c) => c.parentId !== "").every((c) => c.capacity === undefined)).toBe(true); // sub clusters share the total
    const by = (name: string) => value.partners.find((p) => p.name === name)!;
    // A sponsorship partner's room is its own children, so it has no typed capacity. The trust has a ceiling of 3 for its first item only.
    expect(by("Sample Orphan Care Trust").benefitTerms?.["I10"]?.capacity).toBe(3);
    expect(by("Sample Orphan Care Trust").benefitTerms?.["I13"]?.capacity).toBeUndefined();
    expect(by("Sample Orphan Care Trust").capacity).toBeUndefined();
    for (const name of ["Sample Care Partners", "Sample Lapsed Partner"]) { expect(by(name).capacity).toBeUndefined(); expect(Object.values(by(name).benefitTerms ?? {}).every((t) => t.capacity === undefined)).toBe(true); }
    // Builders and relief are not sponsorship: their capacity is typed, and each item has one.
    for (const name of ["Sample Builders Foundation", "Sample Relief Team"]) { expect(by(name).capacity).toBeGreaterThan(0); expect(Object.values(by(name).benefitTerms ?? {}).every((t) => (t.capacity ?? 0) > 0 && (t.costPerUnit ?? 0) > 0)).toBe(true); }
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
  it("gives a real project that carries sponsorship gifts a home of its own and the sample partners, and keeps the scenario clusters in the sample's own project", () => {
    const { value, summary } = load({ giftProjects: [real()], realProjects: [{ id: "aghosh-orphan-home", itemIds: ["I10", "I13"], itemCounts: { I10: 9, I13: 3 } }], demand: { I10: 12, I13: 3 }, whole: { I10: 3, I13: 3 } });
    expect(summary).toMatchObject({ attached: 1, projects: 3, skipped: [] }); // the sample's own three projects, plus the real one given a home
    const gp = value.giftProjects.find((g) => g.id === "aghosh-orphan-home")!;
    expect(gp.clusters?.map((c) => c.name)).toEqual(["Sample Home - Main", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]); // a home sized to its own gifts, not the scenarios
    expect(gp.partnerIds[0]).toBe("real-partner"); // its own partner stays first, the sample ones follow
    expect(gp.partnerIds.length).toBe(6);
    expect(gp.sampleAttached).toEqual({ partnerIds: gp.sampleAttached!.partnerIds, clusters: true });
    expect(gp.sampleAttached?.partnerIds.length).toBe(5);
    expect(value.giftProjects.map((g) => g.name)).toEqual(["Aghosh Orphan Home", "Sample Orphan Homes", "Sample Village Projects", "Sample Relief Camps"]);
    const own = value.giftProjects.find((g) => g.name === "Sample Orphan Homes")!;
    expect(own.clusters?.some((c) => c.name === "Sample University")).toBe(true); // the scenarios: only here
    expect(gp.clusters?.some((c) => c.name === "Sample University")).toBe(false);
  });
  it("gives each real project a home sized to its own gifts, the busiest one more", () => {
    const quiet = real({ id: "quiet", name: "Quiet" });
    const busy = real({ id: "busy", name: "Busy" });
    const { value } = load({ giftProjects: [quiet, busy], realProjects: [{ id: "quiet", itemIds: ["I10", "I13"], itemCounts: { I10: 1, I13: 1 } }, { id: "busy", itemIds: ["I10"], itemCounts: { I10: 22 } }], demand: { I10: 23, I13: 1 }, whole: { I10: 3, I13: 3 } });
    const kids = (id: string): number => value.enrolments.records.filter((e) => e.giftProjectId === id && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Beneficiary ")).length;
    expect(kids("busy")).toBe(10); // 22 over 3 is 8, plus 2
    expect(kids("quiet")).toBe(6); // 1 over 3 is 1, plus 2, for each of two items
    expect(value.giftProjects.find((g) => g.id === "busy")?.clusters?.[0]?.capacity).toBe(10);
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
  it("makes one general partner that delivers every item: no ceiling for a sponsorship benefit (its room is its children), generous room for the rest", () => {
    const { value } = load();
    const general = value.partners.find((p) => p.name === "Sample General Partner")!;
    expect(general.itemIds).toEqual(["I10", "I11", "I13", "I14"]);
    expect(general.benefitTerms?.["I10"]?.capacity).toBeUndefined(); // sponsorship: no ceiling
    expect(general.benefitTerms?.["I13"]?.capacity).toBeUndefined();
    expect(general.benefitTerms?.["I11"]?.capacity).toBe(50); // a pump: typed room, never under 50
    expect(general.benefitTerms?.["I14"]?.capacity).toBe(50);
    expect(general.capacity).toBeUndefined(); // no total ceiling either
  });
  it("sizes the general partner's room for a benefit that is not sponsorship from the real gifts, twice what they need", () => {
    const { value } = load({ demand: { I10: 300, I11: 300, I14: 4 } });
    const general = value.partners.find((p) => p.name === "Sample General Partner")!;
    expect(general.benefitTerms?.["I11"]?.capacity).toBe(605); // 2 x 300 + 5
    expect(general.benefitTerms?.["I14"]?.capacity).toBe(50); // little demand: the floor
    expect(general.benefitTerms?.["I10"]?.capacity).toBeUndefined(); // sponsorship: its children are its room
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
    expect(summary.beneficiaries).toBe(26 + 12 + 4); // 30 units over 3 is 10, plus 2; 6 over 3 is 2, plus 2
    expect(summary.enrolments).toBe(20 + 16);
    const main = value.giftProjects[0]!.clusters!.find((c) => c.name === "Sample Home - Main")!;
    expect(main.capacity).toBe(16); // large enough to hold them, so capacity never blocks
    expect(value.giftProjects[0]!.clusters!.filter((c) => c.parentId === main.id).map((c) => c.name)).toEqual(["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]);
    const kids = value.register.records.filter((b) => b.name.startsWith("Sample Beneficiary "));
    expect(kids).toHaveLength(16);
    expect(kids.every((b) => b.eligibility === "ready" && b.sample === true)).toBe(true);
    expect(value.enrolments.records.filter((e) => e.itemId === "I13" && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Beneficiary "))).toHaveLength(4); // one child per place, for each item
  });
  it("makes none when the real gifts need no sponsorship, and caps the number", () => {
    expect(load().summary.beneficiaries).toBe(26);
    expect(load({ demand: { I10: 100000 }, whole: { I10: 1 } }).summary.beneficiaries).toBe(26 + 120); // no more than 120 for an item
    expect(load({ demand: { I10: 100000, I13: 100000 }, whole: { I10: 1, I13: 1 } }).summary.beneficiaries).toBe(26 + 240);
  });
  it("lets the real gifts fill them: every unit a real gift needs has a child to go to", () => {
    const { value } = load({ demand, whole });
    const per = (item: string): number => value.enrolments.records.filter((e) => e.itemId === item && e.role === "" && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Beneficiary ")).length;
    expect(per("I10") * 3).toBeGreaterThanOrEqual(30);
    expect(per("I13") * 3).toBeGreaterThanOrEqual(6);
  });
  it("works out the units of one whole beneficiary for each item from its workflow", () => {
    expect(wholeByItem([{ itemId: "I10", frameworkId: "orphan" }, { itemId: "I11", frameworkId: "pump" }, { itemId: "I12" }], [{ id: "orphan", unitsPerBeneficiary: 3 }, { id: "pump", unitsPerBeneficiary: 1 }])).toEqual({ I10: 3, I11: 1 });
    expect(wholeByItem([{ itemId: "I10", frameworkId: "orphan" }], [{ id: "orphan", unitsPerBeneficiary: 3 }], { I10: 1 })).toEqual({ I10: 1 }); // the item's own number wins (DECISIONS 188)
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
    const inProject = (id: string, item: string) => value.enrolments.records.filter((e) => e.giftProjectId === id && e.itemId === item && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Beneficiary ")).length;
    expect(inProject("aghosh", "I10")).toBe(10);
    expect(inProject("aghosh", "I13")).toBe(3);
    expect(inProject("dadyal", "I10")).toBeGreaterThan(0); // the best match also keeps its home
    expect(value.giftProjects.find((g) => g.id === "flood")?.clusters).toBeUndefined(); // it carries a pump: no children needed, and the villages are the sample's own
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

describe("a real project with clusters of its own keeps them and is filled (DECISIONS 180)", () => {
  const own = (capacity?: number): GiftProject => ({ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: [], clusters: [
    { id: "lahore-township", name: "LAHORE - TOWNSHIP", label: "Aghosh Orphan Care Home", parentId: "", place: "Lahore", ...(capacity !== undefined ? { capacity } : {}), status: "active" },
    { id: "class-1", name: "CLASS 1", label: "Class", parentId: "lahore-township", place: "", status: "active" },
  ] });
  const real: SampleInput["realProjects"] = [{ id: "aghosh", itemIds: ["I10"], itemCounts: { I10: 17 } }, { id: "dadyal", itemIds: ["I10"], itemCounts: { I10: 3 } }];
  const others = (): GiftProject[] => [own(250), { id: "dadyal", name: "Dadyal Orphan Complex", crmNames: [], partnerIds: [] }];
  it("enrols the invented children in the project's own cluster, without adding clusters of its own", () => {
    const { value, summary } = load({ giftProjects: others(), realProjects: real, demand: { I10: 20 }, whole: { I10: 3 } });
    const aghosh = value.giftProjects.find((g) => g.id === "aghosh")!;
    expect(aghosh.clusters).toEqual(own(250).clusters); // the project's own clusters, unchanged
    expect(aghosh.sampleAttached?.clusters).toBe(false); // only the general partner was given, as it had none: no clusters
    const kids = value.enrolments.records.filter((e) => e.giftProjectId === "aghosh" && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Beneficiary "));
    expect(kids).toHaveLength(8); // 17 over 3 is 6, plus 2
    expect(kids.every((e) => e.clusterId === "class-1")).toBe(true); // in its first class
    expect(summary.ownClusters).toBe(1);
    expect(summary.skipped).toEqual([]);
    // Every invented child belongs to a partner that delivers for the project, or its room could never be used (DECISIONS 185).
    const owners = new Set(kids.map((e) => value.register.records.find((b) => b.id === e.beneficiaryId)?.partnerId));
    expect(owners.size).toBeGreaterThan(1); // more than one partner has children there
    expect([...owners].every((id) => aghosh.partnerIds.includes(id as string))).toBe(true);
    expect(aghosh.sampleAttached?.partnerIds.length).toBeGreaterThan(0);
  });
  it("never passes the cluster's own total, and says nothing is lost when it is small", () => {
    const { value } = load({ giftProjects: [own(5), { id: "dadyal", name: "Dadyal Orphan Complex", crmNames: [], partnerIds: [] }], realProjects: real, demand: { I10: 20 }, whole: { I10: 3 } });
    expect(value.enrolments.records.filter((e) => e.giftProjectId === "aghosh" && value.register.records.find((b) => b.id === e.beneficiaryId)?.name.startsWith("Sample Beneficiary ")).length).toBe(5);
  });
  it("leaves the project exactly as it was when the sample is removed", () => {
    const projects = others();
    const gone = removeSampleSetup(load({ giftProjects: projects, realProjects: real, demand: { I10: 20 }, whole: { I10: 3 } }).value);
    expect(gone.value.giftProjects.find((g) => g.id === "aghosh")).toEqual(own(250));
    expect(gone.value.enrolments.records).toEqual([]);
    expect(gone.value.register.records).toEqual([]);
  });
});

describe("the scenario clusters stay in the sample's own project (DECISIONS 182)", () => {
  const p = (id: string, name: string): GiftProject => ({ id, name, crmNames: [], partnerIds: [] });
  it("never puts the full home, the closed home or the university on a real project, whatever its name or gifts", () => {
    const projects = [p("flood", "Flood Relief"), p("dadyal", "Dadyal Orphan Complex"), p("college", "Girls College Khanewal")];
    const real: SampleInput["realProjects"] = [{ id: "flood", itemIds: ["I10"], itemCounts: { I10: 40 } }, { id: "dadyal", itemIds: ["I10"], itemCounts: { I10: 5 } }, { id: "college", itemIds: ["I13"], itemCounts: { I13: 1 } }];
    const { value } = load({ giftProjects: projects, realProjects: real, demand: { I10: 50, I13: 1 }, whole: { I10: 3, I13: 3 } });
    for (const id of ["flood", "dadyal", "college"]) {
      const names = value.giftProjects.find((g) => g.id === id)?.clusters?.map((c) => c.name) ?? [];
      expect(names).toEqual(["Sample Home - Main", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"]); // each carries sponsorship gifts: a home of its own, sized to them
      expect(names).not.toContain("Sample University");
      expect(names).not.toContain("Sample Home - Closed");
    }
    const own = value.giftProjects.find((g) => g.name === "Sample Orphan Homes")!;
    expect(own.clusters?.map((c) => c.name)).toEqual(expect.arrayContaining(["Sample University", "Sample Home - Closed", "Sample Home - Small"])); // all the scenarios, here only
  });
  it("gives nothing to a real project that carries no sponsorship gifts", () => {
    const { value } = load({ giftProjects: [p("water", "Water for All")], realProjects: [{ id: "water", itemIds: ["I11"], itemCounts: { I11: 12 } }], demand: { I11: 12 } });
    expect(value.giftProjects.find((g) => g.id === "water")?.clusters).toBeUndefined();
  });
});

describe("removing clears what points at it (DECISIONS 184)", () => {
  const asg = (key: string, partnerId: string, giftProjectId = "") => ({ key, partnerId, giftProjectId, itemId: "I10", parts: 1, how: "auto" as const, at: "x" });
  it("clears an assignment to a partner that is removed, and a placement in a place that is removed, and keeps the rest", () => {
    const loaded = load();
    const sampleChild = loaded.value.enrolments.records[0]!;
    const realPartner = "real-partner";
    const base: SampleState = {
      ...loaded.value,
      partners: [...loaded.value.partners, { id: realPartner, name: "Real", aliases: [], levels: [], types: [] }],
      assignments: { records: [asg("sub:1", loaded.value.partners[0]!.id), asg("sub:2", realPartner), asg("G3", loaded.value.partners[0]!.id)] },
      allocations: { counter: 1, records: [
        { key: "sub:1", kind: "beneficiary", enrolmentId: sampleChild.id, outcomeRef: "", giftProjectId: "", itemId: "I10", parts: 1, how: "auto", at: "x" },
        { key: "sub:2", kind: "beneficiary", enrolmentId: "EN-REAL", outcomeRef: "", giftProjectId: "", itemId: "I10", parts: 1, how: "auto", at: "x" },
        { key: "G3", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "", itemId: "I11", parts: 1, how: "auto", at: "x" },
      ] },
    };
    const gone = removeSampleSetup({ ...base, enrolments: { ...base.enrolments, records: [...base.enrolments.records, { id: "EN-REAL", beneficiaryId: "REAL", giftProjectId: "real", clusterId: "c", itemId: "I10", role: "", status: "active", since: "x" }] } });
    expect(gone.value.assignments?.records.map((a) => a.key)).toEqual(["sub:2"]); // the two to the removed sample partner are cleared, the real one stays
    expect(gone.value.allocations?.records.map((p) => p.key)).toEqual(["sub:2"]); // its allocation in a real place stays, the outcome goes with its assignment
    expect(gone.removed).toMatchObject({ assignments: 2, allocations: 2 });
  });
  it("says what it cleared, and leaves them alone when it was not given any", () => {
    const loaded = load();
    const none = removeSampleSetup(loaded.value);
    expect(none.value.assignments).toBeUndefined();
    expect(none.removed).toMatchObject({ assignments: 0, allocations: 0 });
  });
});

describe("removing the sample setup", () => {
  it("takes away exactly what the sample made and leaves everything else", () => {
    const realEnrolment: Enrolment = { id: "EN-9999", beneficiaryId: "REAL-1", giftProjectId: "real", clusterId: "c", itemId: "I10", role: "", status: "active", since: "2026-01-01" };
    const loaded = load({ enrolments: { records: [realEnrolment], counter: 9999 } });
    const gone = removeSampleSetup(loaded.value);
    expect(gone.removed).toEqual({ partners: 6, projects: 3, beneficiaries: 26, enrolments: 20, assignments: 0, allocations: 0 });
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
