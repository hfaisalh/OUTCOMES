/**
 * projects.test.ts
 *
 * What it does: tests projects, levels, places, beneficiary types, beneficiaries and the roll-up on invented data.
 * These tests double as examples. Who calls it: vitest. Depends on: projects.ts.
 */

import { describe, expect, it } from "vitest";
import type { FrameworkTemplate } from "../02-project-rules/categories";
import type { Allocation } from "../05-outcomes/outcomes";
import type { Commitment } from "../04b-commitments/commitments";
import { assignCrmName, crmNamesOf, migrateGiftProjects, NO_PARTNER, partnersForGift, saveGiftProject, setGroup, setPlace, type GiftProject, assignRefs, setRef, adoptLegacy, clearLegacy, placeInPartner, applyProjectAction, levelTree, levelsBelow, moveLevel, isActivePartner, partnerAccepts, savePartner, capacityFor, eligiblePartners, samplePartnerProfile, SAMPLE_PARTNER_REFERENCE, type ProjectState, allocationSummary, allocOptions, placeInNode, placesUnder, suggestions, addBeneficiaries, addLevel, addNode, addProject, addType, matchProject, orderedLevels, pathOf, removeLevel, removeNode, removeType, removePartner, rollupOf, setNodeField, type Node, type Project } from "./projects";

const FW: FrameworkTemplate[] = [
  { id: "shared", name: "Shared parts", unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3 },
  { id: "whole", name: "Whole", unit: "person", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 1 },
];

// A small project built through the functions: Aghosh, with Branch > Block > Class, and child, teacher types.
function sample(): { projects: Project[]; nodes: Node[] } {
  let projects = addProject([], "Aghosh Orphan Homes", ["Aghosh"]).value;
  const id = projects[0]!.id;
  projects = addLevel(projects, id, "Branch", "").value;
  projects = addLevel(projects, id, "Block", "branch").value;
  projects = addLevel(projects, id, "Class", "block").value;
  projects = addType(projects, id, { name: "Child", levelId: "class", frameworkId: "shared" }, FW).value;
  projects = addType(projects, id, { name: "Teacher", levelId: "branch", frameworkId: "whole" }, FW).value;
  let nodes: Node[] = [];
  nodes = addNode(nodes, projects, id, "branch", "", "Branch 1", { Location: "Lahore" }).value;
  nodes = addNode(nodes, projects, id, "block", nodes[0]!.id, "Block A").value;
  nodes = addNode(nodes, projects, id, "class", nodes[1]!.id, "Class 5A").value;
  return { projects, nodes };
}

describe("projects and matching", () => {
  it("adds a project and refuses an empty or repeated name", () => {
    const one = addProject([], "Aghosh Orphan Homes", ["Aghosh"]);
    expect(one.value[0]).toMatchObject({ id: "aghosh-orphan-homes", aliases: ["Aghosh"] });
    expect(addProject([], " ").error).toContain("name");
    expect(addProject(one.value, "aghosh orphan homes").error).toContain("already");
  });
  it("matches a gift's project name to a project by name or alias, and not at all for general gifts", () => {
    const { projects } = sample();
    expect(matchProject(projects, "Aghosh")?.id).toBe("aghosh-orphan-homes");
    expect(matchProject(projects, "AGHOSH ORPHAN HOMES")?.id).toBe("aghosh-orphan-homes");
    expect(matchProject(projects, "Where Needed Most")).toBeUndefined();
    expect(matchProject(projects, "")).toBeUndefined();
  });
});

describe("levels", () => {
  it("builds one chain from the top down, in order", () => {
    const { projects } = sample();
    expect(orderedLevels(projects[0]!).map((l) => l.name)).toEqual(["Branch", "Block", "Class"]);
  });
  it("refuses a repeated name and an unknown parent, and lets several levels sit under the same one", () => {
    const { projects } = sample();
    const id = projects[0]!.id;
    expect(addLevel(projects, id, "branch", "").error).toContain("already");
    expect(addLevel(projects, id, "Wing", "nope").error).toContain("not found");
    expect(addLevel(projects, id, "Wing", "branch").error).toBeUndefined(); // a second level under Branch: not a chain
  });
  it("will not remove a level that is in use", () => {
    const { projects, nodes } = sample();
    const id = projects[0]!.id;
    expect(removeLevel(projects, nodes, id, "block").error).toContain("under it");
    expect(removeLevel(projects, nodes, id, "class").error).toContain("type of beneficiary");
    const noType = removeType(projects, [], id, "child").value;
    expect(removeLevel(noType, nodes, id, "class").error).toContain("places");
    expect(removeLevel(noType, [], id, "class").error).toBeUndefined();
  });
});

describe("places", () => {
  it("sits each place under a place of the level above, and names must be new there", () => {
    const { projects, nodes } = sample();
    const id = projects[0]!.id;
    expect(addNode(nodes, projects, id, "class", "", "Class 5B").error).toContain("sits under");
    expect(addNode(nodes, projects, id, "branch", nodes[0]!.id, "Branch 2").error).toContain("directly under the project");
    expect(addNode(nodes, projects, id, "block", nodes[0]!.id, "block a").error).toContain("already");
    expect(addNode(nodes, projects, id, "branch", "", "Branch 2").error).toBeUndefined();
  });
  it("keeps a profile field such as the location on the place, and reports the path", () => {
    const { projects, nodes } = sample();
    expect(nodes[0]?.fields).toEqual({ Location: "Lahore" });
    expect(setNodeField(nodes, nodes[0]!.id, "Address", "1 Sample Road")[0]?.fields["Address"]).toBe("1 Sample Road");
    expect(pathOf(nodes, projects, nodes[2]!.id)).toEqual(["Aghosh Orphan Homes", "Branch 1", "Block A", "Class 5A"]);
  });
  it("will not remove a place that has places under it or beneficiaries in it", () => {
    const { projects, nodes } = sample();
    expect(removeNode(nodes, [], nodes[1]!.id).error).toContain("under it");
    const kids = addBeneficiaries([], projects, nodes, { projectId: projects[0]!.id, nodeId: nodes[2]!.id, typeId: "child", name: "Orphan", count: 2 }).value;
    expect(removeNode(nodes, kids, nodes[2]!.id).error).toContain("beneficiaries");
    expect(removeNode(nodes, [], nodes[2]!.id).value).toHaveLength(2);
  });
});

describe("beneficiary types", () => {
  it("warns when two types in a project share a framework, so a gift could land on either", () => {
    const { projects } = sample();
    const r = addType(projects, projects[0]!.id, { name: "Warden", levelId: "block", frameworkId: "whole" }, FW);
    expect(r.error).toBeUndefined();
    expect(r.warning).toContain("Teacher");
  });
  it("refuses an unknown level or framework", () => {
    const { projects } = sample();
    expect(addType(projects, projects[0]!.id, { name: "Cook", levelId: "nope", frameworkId: "whole" }, FW).error).toContain("level");
    expect(addType(projects, projects[0]!.id, { name: "Cook", levelId: "block", frameworkId: "nope" }, FW).error).toContain("sponsored");
  });
});

describe("beneficiaries and the roll-up", () => {
  it("adds numbered beneficiaries at the right level with the type's framework", () => {
    const { projects, nodes } = sample();
    const r = addBeneficiaries([], projects, nodes, { projectId: projects[0]!.id, nodeId: nodes[2]!.id, typeId: "child", name: "Orphan", count: 3 });
    expect(r.value.map((o) => o.name)).toEqual(["Orphan 1", "Orphan 2", "Orphan 3"]);
    expect(r.value[0]).toMatchObject({ frameworkId: "shared", type: "Child", cohort: "Class 5A", projectId: "aghosh-orphan-homes", nodeId: nodes[2]!.id, typeId: "child" });
  });
  it("refuses a place of the wrong level", () => {
    const { projects, nodes } = sample();
    expect(addBeneficiaries([], projects, nodes, { projectId: projects[0]!.id, nodeId: nodes[0]!.id, typeId: "child", name: "Orphan", count: 2 }).error).toContain("Class");
  });
  it("adds up capacity and use for each place and the project", () => {
    const { projects, nodes } = sample();
    const pid = projects[0]!.id;
    const kids = addBeneficiaries([], projects, nodes, { projectId: pid, nodeId: nodes[2]!.id, typeId: "child", name: "Orphan", count: 2 }).value;
    const teacher = addBeneficiaries(kids, projects, nodes, { projectId: pid, nodeId: nodes[0]!.id, typeId: "teacher", name: "Teacher", count: 2 }).value;
    const c = { subscriptionId: "S1", frameworkId: "shared", partsPerInstalment: 3, state: "in_progress", planStatus: "" } as unknown as Commitment;
    const alloc: Allocation[] = [{ commitmentKey: "S1", outcomeId: teacher[0]!.id, parts: 3, how: "auto", at: "x" }];
    const r = rollupOf(nodes, teacher, FW, alloc, [c]);
    expect(r.byNode.get(nodes[2]!.id)).toEqual({ places: 6, used: 3, beneficiaries: 2 });
    expect(r.byNode.get(nodes[1]!.id)).toEqual({ places: 6, used: 3, beneficiaries: 2 });
    expect(r.byNode.get(nodes[0]!.id)).toEqual({ places: 8, used: 3, beneficiaries: 4 });
    expect(r.byProject.get(pid)).toEqual({ places: 8, used: 3, beneficiaries: 4 });
  });
});

describe("the allocation summary, suggestions, and placing a gift by hand (DECISIONS 66)", () => {
  const gift = (sub: string, parts: number, projectName = "", over: Partial<Commitment> = {}) => ({ subscriptionId: sub, frameworkId: "shared", partsPerInstalment: parts, state: "in_progress", planStatus: "", projectName, firstPaid: `2026-01-0${sub}`, planned: 12, paid: 2, nextDue: "", planPaid: null, ...over }) as unknown as Commitment;
  function world() {
    const { projects: made, nodes } = sample();
    const projects = made.map((p) => ({ ...p, status: "active" as const, ddStatus: "approved" as const })); // only active partners take gifts
    const pid = projects[0]!.id;
    const kids = addBeneficiaries([], projects, nodes, { projectId: pid, nodeId: nodes[2]!.id, typeId: "child", name: "Orphan", count: 2 }).value;
    return { projects, nodes, kids, pid, opts: allocOptions(projects, 15, "2026-11-20") };
  }

  it("totals each project, with waiting gifts directed to it and general ones counted on their own", () => {
    const { projects, kids, opts } = world();
    const gifts = [gift("1", 3, "Aghosh"), gift("2", 3, "Aghosh"), gift("3", 3, "Aghosh"), gift("4", 1, "Where Needed Most")];
    const alloc: Allocation[] = [{ commitmentKey: "1", outcomeId: kids[0]!.id, parts: 3, how: "auto", at: "x" }];
    const sum = allocationSummary(projects, kids, FW, alloc, gifts, opts);
    expect(sum.rows[0]).toMatchObject({ name: "Aghosh Orphan Homes", beneficiaries: 2, capacity: 6, used: 3, free: 3, waitingParts: 6, inGrace: 0, releaseDue: 0 });
    expect(sum.generalWaiting).toEqual({ gifts: 1, parts: 1 });
    expect(sum.waitingGifts).toBe(3);
  });
  it("counts a sponsor who is behind but inside the grace days, and one waiting for a manager's release", () => {
    const { projects, kids, opts } = world();
    const late = gift("1", 3, "Aghosh", { planStatus: "active", nextDue: "2026-11-10", planned: 12, planPaid: 2 }); // 10 days
    const lapsed = gift("2", 3, "Aghosh", { planStatus: "active", nextDue: "2026-10-01", planned: 12, planPaid: 2 }); // 50 days
    const alloc: Allocation[] = [{ commitmentKey: "1", outcomeId: kids[0]!.id, parts: 3, how: "auto", at: "x" }, { commitmentKey: "2", outcomeId: kids[1]!.id, parts: 3, how: "auto", at: "x" }];
    expect(allocationSummary(projects, kids, FW, alloc, [late, lapsed], opts).rows[0]).toMatchObject({ inGrace: 1, releaseDue: 1, used: 6 });
  });
  it("suggests where each waiting gift would go, without changing anything", () => {
    const { kids, opts } = world();
    const s = suggestions([gift("1", 3, "Aghosh"), gift("2", 3, "Aghosh"), gift("3", 3, "Aghosh")], kids, FW, [], opts);
    expect([...s.values()]).toEqual([kids[0]!.id, kids[1]!.id]); // two children, so the third gift has no suggestion
    expect(s.has("3")).toBe(false);
  });
  it("places a gift in a place or under it, moves one already placed, and says when there is no room", () => {
    const { projects, nodes, kids, opts } = world();
    const gifts = [gift("1", 3, "Aghosh"), gift("2", 3, "Aghosh"), gift("3", 3, "Aghosh")];
    expect(placesUnder(nodes, nodes[0]!.id).size).toBe(3);
    const a = placeInNode([], gifts, kids, nodes, FW, "1", nodes[0]!.id, "t", opts.policy); // dropped on the branch, lands on a child in its class
    expect(a.value).toHaveLength(1);
    expect(a.value[0]).toMatchObject({ how: "manual", parts: 3 });
    const b = placeInNode(a.value, gifts, kids, nodes, FW, "2", nodes[2]!.id, "t", opts.policy);
    expect(b.value).toHaveLength(2);
    expect(placeInNode(b.value, gifts, kids, nodes, FW, "3", nodes[2]!.id, "t", opts.policy).error).toContain("no room");
    expect(placeInNode([], gifts, kids, nodes, FW, "9", nodes[2]!.id, "t").error).toContain("not found");
    void projects;
  });
});

describe("projects: what a donor chooses, and the partners that deliver it (DECISIONS 76)", () => {
  const orders = (names: string[]) => names.map((projectName) => ({ projectName, status: "ready" }));
  const partners = () => {
    const { projects } = sample();
    return addProject(projects, "Dadyal Orphan Complex").value; // aghosh-orphan-homes and dadyal-orphan-complex
  };
  const gp = (over: Partial<GiftProject> = {}): GiftProject => ({ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes"], ...over });

  it("saves a project with its CRM names and partners, refuses an empty or repeated name, and keeps a CRM name in one project only", () => {
    const ps = partners();
    const first = saveGiftProject([], ps, { name: "Aghosh", crmNames: ["Aghosh Lahore", "Aghosh"], partnerIds: ["aghosh-orphan-homes", "nope"] }, "");
    expect(first.value[0]).toEqual({ id: "aghosh", name: "Aghosh", crmNames: ["Aghosh Lahore"], partnerIds: ["aghosh-orphan-homes"] }); // its own name is not repeated, an unknown partner is dropped
    expect(saveGiftProject([], ps, { name: " " }, "").error).toContain("name");
    expect(saveGiftProject(first.value, ps, { name: "aghosh" }, "").error).toContain("already");
    const second = saveGiftProject(first.value, ps, { name: "Dadyal", crmNames: ["Aghosh Lahore"], partnerIds: [] }, "");
    expect(second.value.find((g) => g.id === "aghosh")?.crmNames).toEqual([]); // taken off the first
    expect(saveGiftProject(first.value, ps, { name: "X" }, "nope").error).toContain("not found");
  });
  it("sends a gift to every partner of the project it names, by the project's name or any of its CRM names", () => {
    const ps = partners();
    const gps = [gp({ crmNames: ["Aghosh Lahore"], partnerIds: ["aghosh-orphan-homes", "dadyal-orphan-complex"] })];
    expect(partnersForGift(gps, ps, "AGHOSH").map((p) => p.id)).toEqual(["aghosh-orphan-homes", "dadyal-orphan-complex"]);
    expect(partnersForGift(gps, ps, "aghosh lahore")).toHaveLength(2);
    expect(partnersForGift(gps, ps, "Where Needed Most")).toEqual([]);
    expect(partnersForGift(gps, ps, "")).toEqual([]);
  });
  it("makes a gift for a project with no partner wait, instead of treating it as general", () => {
    const ps = partners();
    const got = partnersForGift([gp({ partnerIds: [] })], ps, "Aghosh");
    expect(got.map((p) => p.id)).toEqual([NO_PARTNER]);
  });
  it("still lets a partner whose own name matches take a gift, until the name is set up as a project", () => {
    const ps = partners();
    expect(partnersForGift([], ps, "Aghosh Orphan Homes").map((p) => p.id)).toEqual(["aghosh-orphan-homes"]);
  });
  it("lists the names on real gifts with their counts, the project each is in, and a suggestion for one that is not", () => {
    const gps = [gp({ name: "Aghosh Orphan Homes", crmNames: ["Aghosh"] })];
    const list = crmNamesOf([...orders(["Where Needed Most", "Where Needed Most", "Aghosh", "", "Aghosh Girls Home", "Hope for Palestine"]), { projectName: "Aghosh", status: "excluded" }], gps);
    expect(list.map((x) => [x.name, x.gifts])).toEqual([["Where Needed Most", 2], ["Aghosh", 1], ["Aghosh Girls Home", 1], ["Hope for Palestine", 1]]);
    expect(list.find((x) => x.name === "Aghosh")).toMatchObject({ giftProjectId: "aghosh", suggestion: "" });
    expect(list.find((x) => x.name === "Aghosh Girls Home")).toMatchObject({ giftProjectId: "", suggestion: "aghosh" });
    expect(list.find((x) => x.name === "Hope for Palestine")).toMatchObject({ giftProjectId: "", suggestion: "" });
  });
  it("puts a CRM name in one project, moves it, and takes it out", () => {
    const gps = [gp(), gp({ id: "dadyal", name: "Dadyal", partnerIds: [] })];
    const a = assignCrmName(gps, "Orphan Care Complex", "dadyal").value;
    expect(a.find((g) => g.id === "dadyal")?.crmNames).toEqual(["Orphan Care Complex"]);
    const moved = assignCrmName(a, "orphan care complex", "aghosh").value;
    expect(moved.find((g) => g.id === "dadyal")?.crmNames).toEqual([]);
    expect(moved.find((g) => g.id === "aghosh")?.crmNames).toEqual(["orphan care complex"]);
    expect(assignCrmName(moved, "orphan care complex", "").value.every((g) => g.crmNames.length === 0)).toBe(true);
    expect(assignCrmName(moved, "x", "nope").error).toContain("not found");
  });
  it("turns the CRM names that were on partners into projects, once", () => {
    const ps = partners().map((p) => ({ ...p, aliases: p.id === "aghosh-orphan-homes" ? ["Aghosh", "Orphan Care Complex"] : ["Orphan Care Complex"] }));
    const m = migrateGiftProjects(ps, []);
    expect(m.giftProjects.map((g) => [g.name, g.partnerIds])).toEqual([["Aghosh", ["aghosh-orphan-homes"]], ["Orphan Care Complex", ["aghosh-orphan-homes", "dadyal-orphan-complex"]]]);
    expect(m.partners.every((p) => p.aliases.length === 0)).toBe(true);
    expect(migrateGiftProjects(m.partners, m.giftProjects)).toEqual(m); // nothing more the second time
  });
  it("shows a gift's partners to the allocation rules", () => {
    const ps = partners();
    const opts = allocOptions(ps, 15, "2026-11-20", false, [gp({ partnerIds: ["dadyal-orphan-complex"] })]);
    expect(opts.projectIdsFor?.("Aghosh")).toEqual(["dadyal-orphan-complex"]);
    expect(opts.projectIdsFor?.("Nothing")).toEqual([]);
  });
  it("places a beneficiary afterwards in a place and groups, and refuses a wrong one", () => {
    const { projects, nodes } = sample();
    const kids = addBeneficiaries([], projects, nodes, { projectId: projects[0]!.id, nodeId: nodes[2]!.id, typeId: "child", name: "Orphan", count: 2 }).value;
    const bare = kids.map(({ nodeId: _n, ...o }) => o);
    const placed = setPlace(bare, projects, nodes, bare[0]!.id, nodes[2]!.id);
    expect(placed.error).toBeUndefined();
    expect(placed.value[0]?.nodeId).toBe(nodes[2]!.id);
    expect(setPlace(bare, projects, nodes, bare[0]!.id, nodes[0]!.id).error).toContain("belong to a");
    expect(setPlace(placed.value, projects, nodes, bare[0]!.id, "").value[0]).not.toHaveProperty("nodeId");
    expect(setPlace(bare, projects, nodes, "nope", "x").error).toContain("not found");
    expect(setGroup(bare, projects, nodes, bare[0]!.id, "class", "x").error).toContain("place first");
  });
});

describe("the partner profile (DECISIONS 69)", () => {
  const empty = (): ProjectState => ({ projects: [], nodes: [], outcomes: [], partnerTypes: [], partnerFields: ["Parent charity number"], giftProjects: [] });
  const save = (st: ProjectState, raw: Record<string, unknown>, id = "", copy = "") => savePartner(st, raw, id, copy, "2026-11-20");

  it("needs only a name and a type, starts pending, and adds a new type to the list", () => {
    const r = save(empty(), { name: "Aghosh Orphan Homes", type: "Institute" });
    expect(r.error).toBeUndefined();
    expect(r.value.projects[0]).toMatchObject({ id: "aghosh-orphan-homes", name: "Aghosh Orphan Homes", type: "Institute", status: "pending", ddStatus: "none" });
    expect(r.value.partnerTypes).toEqual(["Institute"]);
    expect(save(empty(), { name: "", type: "x" }).error).toContain("name");
    expect(save(empty(), { name: "X", type: "" }).error).toContain("type");
    expect(save(r.value, { name: "aghosh orphan homes", type: "Institute" }).error).toContain("already");
  });
  it("keeps the whole profile: contacts, items it delivers, capacity, how it reports, due diligence, documents and its own extra fields", () => {
    const r = save(empty(), { name: "SDO", type: "Contractor", officialName: "Sample Development Org", reference: "P-001", established: "2010-05-01", countries: "Pakistan", itemIds: ["MWF-WAT-001", "MWF-WAT-001", ""], capacity: "40", capacityNote: "two crews", reportVia: "WhatsApp", media: "Two cameras", ddStatus: "approved", ddReview: "2027-03-31", status: "active", contacts: [{ name: "A Person", email: "a@example.org" }, {}], documents: [{ title: "Agreement", url: "https://example.org/a.pdf" }], custom: { "Parent charity number": "123", "Not defined": "dropped" } });
    expect(r.error).toBeUndefined();
    expect(r.value.projects[0]).toMatchObject({ officialName: "Sample Development Org", itemIds: ["MWF-WAT-001"], capacity: 40, capacityNote: "two crews", reportVia: "WhatsApp", status: "active", custom: { "Parent charity number": "123" } });
    expect(r.value.projects[0]?.contacts).toHaveLength(1); // the empty contact is dropped
    expect(r.value.projects[0]?.documents).toHaveLength(1);
  });
  it("keeps the legal, funding and safeguarding details from the VerifiAid fields, and ignores a funding method that is not known (DECISIONS 151)", () => {
    const r = save(empty(), { name: "SDO", type: "Contractor", registrationNumber: " 1234567 ", legalStatus: "NGO", sectors: "WASH, Health", fundingMethod: "intermediary", fundingNote: "Via a licensed agent", safeguardingLead: "A. Lead", safeguardingContact: "lead@example.org" });
    expect(r.error).toBeUndefined();
    expect(r.value.projects[0]).toMatchObject({ registrationNumber: "1234567", legalStatus: "NGO", sectors: "WASH, Health", fundingMethod: "intermediary", fundingNote: "Via a licensed agent", safeguardingLead: "A. Lead", safeguardingContact: "lead@example.org" });
    const none = save(empty(), { name: "Y", type: "Contractor", fundingMethod: "bitcoin" }).value.projects[0]!;
    expect(none.fundingMethod).toBeUndefined(); // not one of the three, so not kept
    expect("registrationNumber" in none).toBe(false); // nothing typed, nothing kept
    expect(save(r.value, { name: "SDO", type: "Contractor", fundingMethod: "" }, "sdo").value.projects[0]!.fundingMethod).toBeUndefined(); // can be cleared
  });
  it("keeps a capacity and an agreed cost per unit for each benefit it delivers, only for the ones it delivers (DECISIONS 149)", () => {
    const r = save(empty(), { name: "SDO", type: "Contractor", capacity: "40", itemIds: ["PUMP", "TENT"], terms: { PUMP: { capacity: "6", costPerUnit: "950.50" }, TENT: { capacity: "", costPerUnit: "" }, OTHER: { capacity: "9", costPerUnit: "1" } } });
    expect(r.error).toBeUndefined();
    const p = r.value.projects[0]!;
    expect(p.benefitTerms).toEqual({ PUMP: { capacity: 6, costPerUnit: 950.5 } }); // none for TENT (empty) and none for OTHER (not delivered)
    expect(capacityFor(p, "PUMP")).toBe(6);
    expect(capacityFor(p, "TENT")).toBe(40); // falls back to its overall capacity
    expect(capacityFor({ ...p, capacity: undefined }, "TENT")).toBeUndefined();
    expect(save(empty(), { name: "X", type: "T", itemIds: ["A"], terms: { A: { capacity: "2.5" } } }).error).toContain("whole number");
    expect(save(empty(), { name: "X", type: "T", itemIds: ["A"], terms: { A: { costPerUnit: "-1" } } }).error).toContain("cost per unit");
    expect(save(empty(), { name: "X", type: "T", itemIds: ["A"], terms: { A: { costPerUnit: "abc" } } }).error).toContain("cost per unit");
  });
  it("offers an item only to partners that are active and approved, deliver it, and have not set its capacity to 0 (DECISIONS 149)", () => {
    const ok = (id: string, over: Partial<Project> = {}): Project => ({ id, name: id, status: "active", ddStatus: "approved", aliases: [], levels: [], types: [], ...over });
    const partners = [
      ok("any"), // no items listed delivers any
      ok("pumps", { itemIds: ["PUMP"] }),
      ok("tents", { itemIds: ["TENT"] }),
      ok("paused", { itemIds: ["PUMP"], status: "on_hold" }),
      ok("unchecked", { itemIds: ["PUMP"], ddStatus: "pending" }),
      ok("lapsed", { itemIds: ["PUMP"], ddReview: "2026-01-01" }),
      ok("full", { itemIds: ["PUMP"], benefitTerms: { PUMP: { capacity: 0 } } }),
      ok("busy", { itemIds: ["PUMP"], capacity: 0, benefitTerms: { PUMP: { capacity: 3 } } }), // its own capacity for the item wins over a 0 overall
    ];
    expect(eligiblePartners(partners, "PUMP", "2026-11-20").map((p) => p.id)).toEqual(["any", "pumps", "busy"]);
    expect(eligiblePartners(partners, "TENT", "2026-11-20").map((p) => p.id)).toEqual(["any", "tents"]);
    expect(eligiblePartners(partners, "NOTHING", "2026-11-20").map((p) => p.id)).toEqual(["any"]);
  });
  it("makes an invented sample partner that saves as active and approved, is active for two items, and says nothing about it is real", () => {
    const items = [{ id: "I3", name: "Tent" }, { id: "I1", name: "Small Pump" }, { id: "I2", name: "Orphan Sponsorship" }];
    const r = save(empty(), samplePartnerProfile(items, "2026-11-23"));
    expect(r.error).toBeUndefined();
    const p = r.value.projects[0]!;
    expect(p).toMatchObject({ name: "Sample Orphan Care Trust", type: "Institute", status: "active", ddStatus: "approved", reference: SAMPLE_PARTNER_REFERENCE, capacity: 40 });
    expect(isActivePartner(p, "2026-11-23")).toBe(true);
    expect(p.itemIds).toEqual(["I2", "I1"]); // the first two by name
    expect(p.benefitTerms).toEqual({ I2: { capacity: 20, costPerUnit: 120 }, I1: { capacity: 10, costPerUnit: 950 } });
    expect(p).toMatchObject({ registrationNumber: "SAMPLE-REG-0001", sectors: "Education, Child care", fundingMethod: "banking", safeguardingLead: "Sample Safeguarding Lead" });
    expect(p.documents).toHaveLength(3);
    expect(p.contacts).toHaveLength(2);
    expect(JSON.stringify(p)).not.toMatch(/@(?!example\.org)/); // only example.org addresses
    expect(p.notes).toContain("invented");
    expect(eligiblePartners(r.value.projects, "I1", "2026-11-23")).toHaveLength(1);
    expect(eligiblePartners(r.value.projects, "I3", "2026-11-23")).toHaveLength(0); // it delivers only its two items
    expect(save(r.value, samplePartnerProfile(items, "2026-11-23")).error).toContain("already"); // not twice
    expect(save(empty(), samplePartnerProfile([], "2026-11-23")).error).toBeUndefined(); // with no items it delivers any
  });
  it("makes a partner active only while its due diligence is approved and in date", () => {
    expect(save(empty(), { name: "X", type: "T", status: "active" }).error).toContain("due diligence is approved");
    expect(save(empty(), { name: "X", type: "T", status: "active", ddStatus: "pending" }).error).toContain("due diligence is approved");
    expect(save(empty(), { name: "X", type: "T", status: "active", ddStatus: "approved", ddReview: "2026-01-01" }).error).toContain("review date");
    expect(save(empty(), { name: "X", type: "T", status: "active", ddStatus: "approved", ddReview: "2027-01-01" }).error).toBeUndefined();
    const p = { id: "x", name: "X", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", ddReview: "2026-11-01" } as never;
    expect(isActivePartner(p, "2026-11-20")).toBe(false);
    expect(isActivePartner({ ...(p as object), ddReview: "" } as never, "2026-11-20")).toBe(true);
  });
  it("refuses a bad date and a bad capacity, and edits a partner in place", () => {
    expect(save(empty(), { name: "X", type: "T", established: "20/11/2026" }).error).toContain("year, month, day");
    expect(save(empty(), { name: "X", type: "T", capacity: "-2" }).error).toContain("whole number");
    const made = save(empty(), { name: "X", type: "T" }).value;
    const edited = save(made, { name: "X Renamed", type: "T", capacity: "5" }, "x");
    expect(edited.value.projects).toHaveLength(1);
    expect(edited.value.projects[0]).toMatchObject({ id: "x", name: "X Renamed", capacity: 5 });
    expect(save(made, { name: "X", type: "T" }, "nope").error).toContain("not found");
  });
  it("lets a new partner copy the levels and types of another", () => {
    const { projects } = sample();
    const st: ProjectState = { ...empty(), projects };
    const r = save(st, { name: "Second Home", type: "Institute" }, "", projects[0]!.id);
    expect(r.value.projects[1]?.levels.map((l) => l.name)).toEqual(["Branch", "Block", "Class"]);
    expect(r.value.projects[1]?.types.map((t) => t.name)).toEqual(["Child", "Teacher"]);
  });
  it("offers a gift only to active partners that deliver its item, and always to outcomes with no partner", () => {
    const projects = [
      { id: "a", name: "A", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", itemIds: ["PUMP"] },
      { id: "b", name: "B", aliases: [], levels: [], types: [], status: "pending", ddStatus: "none" },
      { id: "c", name: "C", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved" },
    ] as never;
    expect(partnerAccepts(projects, "a", "PUMP", "2026-11-20")).toBe(true);
    expect(partnerAccepts(projects, "a", "ORPHAN", "2026-11-20")).toBe(false);
    expect(partnerAccepts(projects, "b", "PUMP", "2026-11-20")).toBe(false);
    expect(partnerAccepts(projects, "c", "ANYTHING", "2026-11-20")).toBe(true);
    expect(partnerAccepts(projects, undefined, "ANYTHING", "2026-11-20")).toBe(true);
  });
  it("adds partner types and extra fields to the lists, and takes a field away from every partner", () => {
    let st = applyProjectAction(empty(), [], { action: "add-partner-type", name: "Mosque" })!.state;
    expect(st.partnerTypes).toEqual(["Mosque"]);
    expect(applyProjectAction(st, [], { action: "add-partner-type", name: "mosque" })!.error).toContain("already");
    st = applyProjectAction(st, [], { action: "add-partner-field", name: "Registration no." })!.state;
    expect(st.partnerFields).toEqual(["Parent charity number", "Registration no."]);
    st = applyProjectAction(st, [], { action: "save-partner", profile: { name: "X", type: "Mosque", custom: { "Registration no.": "9" } } }, "2026-11-20")!.state;
    expect(st.projects[0]?.custom).toEqual({ "Registration no.": "9" });
    st = applyProjectAction(st, [], { action: "remove-partner-field", name: "Registration no." })!.state;
    expect(st.partnerFields).toEqual(["Parent charity number"]);
    expect(st.projects[0]?.custom).toEqual({});
  });
});

describe("groupings inside a place: Class, House and School are not a chain (DECISIONS 71)", () => {
  // Branch is the place. Class, House and School each sit under it. A child is in one class and one house. A teacher is in a school.
  function school() {
    let projects = addProject([], "Aghosh").value;
    const id = projects[0]!.id;
    projects = addLevel(projects, id, "Branch", "").value;
    for (const l of ["Class", "House", "School"]) projects = addLevel(projects, id, l, "branch").value;
    projects = addType(projects, id, { name: "Child", levelId: "branch", frameworkId: "shared", groupingIds: ["class", "house"] }, FW).value;
    projects = addType(projects, id, { name: "Teacher", levelId: "branch", frameworkId: "whole", groupingIds: ["school"] }, FW).value;
    let nodes: Node[] = addNode([], projects, id, "branch", "", "Lahore", { Location: "Township" }).value;
    nodes = addNode(nodes, projects, id, "branch", "", "Jhelum").value;
    nodes = addNode(nodes, projects, id, "class", "aghosh-lahore", "Class 5A").value;
    nodes = addNode(nodes, projects, id, "house", "aghosh-lahore", "Rose House").value;
    nodes = addNode(nodes, projects, id, "school", "aghosh-lahore", "Primary").value;
    nodes = addNode(nodes, projects, id, "class", "aghosh-jhelum", "Class 1").value;
    return { projects, nodes, id };
  }
  const ids = (nodes: Node[], name: string) => nodes.find((n) => n.name === name)!.id;

  it("shows the levels as a tree with the groupings under the place, and a partner may have many places", () => {
    const { projects, nodes } = school();
    expect(levelTree(projects[0]!).map((x) => [x.level.name, x.depth])).toEqual([["Branch", 0], ["Class", 1], ["House", 1], ["School", 1]]);
    expect(nodes.filter((n) => n.levelId === "branch")).toHaveLength(2);
  });
  it("puts a child in a place and in one class and one house, and counts them once at the place", () => {
    const { projects, nodes, id } = school();
    const r = addBeneficiaries([], projects, nodes, { projectId: id, nodeId: ids(nodes, "Lahore"), typeId: "child", name: "Orphan", count: 2, groupIds: [ids(nodes, "Class 5A"), ids(nodes, "Rose House")] });
    expect(r.error).toBeUndefined();
    expect(r.value[0]).toMatchObject({ nodeId: ids(nodes, "Lahore"), groupIds: [ids(nodes, "Class 5A"), ids(nodes, "Rose House")] });
    const roll = rollupOf(nodes, r.value, FW, [], []);
    expect(roll.byNode.get(ids(nodes, "Lahore"))).toEqual({ places: 6, used: 0, beneficiaries: 2 }); // not counted again for the class and the house
    expect(roll.byNode.get(ids(nodes, "Class 5A"))).toEqual({ places: 6, used: 0, beneficiaries: 2 });
    expect(roll.byNode.get(ids(nodes, "Rose House"))).toEqual({ places: 6, used: 0, beneficiaries: 2 });
    expect(roll.byNode.get(ids(nodes, "Primary"))).toBeUndefined();
  });
  it("refuses a group the type is not in, two of one kind, one in another place, and a place of the wrong level", () => {
    const { projects, nodes, id } = school();
    const add = (extra: Record<string, unknown>) => addBeneficiaries([], projects, nodes, { projectId: id, nodeId: ids(nodes, "Lahore"), typeId: "child", name: "Orphan", count: 1, ...extra });
    expect(add({ groupIds: [ids(nodes, "Primary")] }).error).toContain("not one of the groups");
    expect(add({ groupIds: [ids(nodes, "Class 5A"), ids(nodes, "Class 5A")] }).error).toBeUndefined(); // the same group twice is one group
    expect(add({ groupIds: [ids(nodes, "Class 1")] }).error).toContain("is not in Lahore");
    expect(add({ nodeId: ids(nodes, "Class 5A") }).error).toContain("belong to a Branch");
  });
  it("lets a type be grouped only by levels under the one it belongs to", () => {
    const { projects, id } = school();
    expect(addType(projects, id, { name: "Cook", levelId: "class", frameworkId: "whole", groupingIds: ["house"] }, FW).error).toContain("cannot group them");
    expect(levelsBelow(projects[0]!, "branch").size).toBe(3);
  });
  it("moves a level under another, and refuses a cycle or a level that has places", () => {
    const { projects, nodes, id } = school();
    let ps = addLevel(projects, id, "Wing", "").value;
    expect(moveLevel(ps, [], id, "wing", "branch").error).toBeUndefined();
    expect(moveLevel(ps, [], id, "branch", "class").error).toContain("cannot go under");
    expect(moveLevel(ps, nodes, id, "class", "wing").error).toContain("places at this level");
    ps = moveLevel(addLevel(ps, id, "Dorm", "").value, [], id, "dorm", "wing").value;
    expect(levelTree(ps[0]!).find((x) => x.level.id === "dorm")?.depth).toBe(1);
  });
  it("places a gift by a group dropped on, and will not remove a group that still has someone in it", () => {
    const { projects, nodes, id } = school();
    const kids = addBeneficiaries([], projects, nodes, { projectId: id, nodeId: ids(nodes, "Lahore"), typeId: "child", name: "Orphan", count: 2, groupIds: [ids(nodes, "Class 5A")] }).value;
    const more = addBeneficiaries(kids, projects, nodes, { projectId: id, nodeId: ids(nodes, "Lahore"), typeId: "child", name: "Other", count: 1 }).value;
    const gift = { subscriptionId: "1", frameworkId: "shared", partsPerInstalment: 3, state: "in_progress", planStatus: "", projectName: "", firstPaid: "2026-01-01", planned: 12, paid: 1, nextDue: "", planPaid: null } as unknown as Commitment;
    const r = placeInNode([], [gift], more, nodes, FW, "1", ids(nodes, "Class 5A"), "t");
    expect(r.error).toBeUndefined();
    expect(more.find((o) => o.id === r.value[0]!.outcomeId)?.groupIds).toEqual([ids(nodes, "Class 5A")]); // only someone in that class
    expect(removeNode(nodes, kids, ids(nodes, "Class 5A")).error).toContain("beneficiaries");
    expect(removeNode(nodes, kids, ids(nodes, "Rose House")).error).toBeUndefined();
  });
});

describe("adding beneficiaries with the fewest steps (DECISIONS 72)", () => {
  const empty = (): ProjectState => {
    const made = savePartner({ projects: [], nodes: [], outcomes: [], partnerTypes: [], partnerFields: [], giftProjects: [] }, { name: "Home Partner", type: "Family sponsorship" }, "", "", "2026-11-20");
    return made.value;
  };
  const add = (st: ProjectState, over: Record<string, unknown>) => applyProjectAction(st, FW, { action: "add-beneficiaries", projectId: "home-partner", typeId: "", name: "Orphan", count: 3, frameworkId: "shared", nodeId: "", ...over })!;

  it("needs only a name, a number and how they are sponsored: no levels, no type set up, no place", () => {
    const r = add(empty(), {});
    expect(r.error).toBeUndefined();
    expect(r.state.outcomes.map((o) => o.name)).toEqual(["Orphan 1", "Orphan 2", "Orphan 3"]);
    expect(r.state.outcomes[0]).toMatchObject({ projectId: "home-partner", frameworkId: "shared", type: "Orphan" });
    expect(r.state.outcomes[0]).not.toHaveProperty("nodeId");
    expect(r.state.projects[0]?.types).toMatchObject([{ name: "Orphan", levelId: "", frameworkId: "shared" }]);
  });
  it("uses the kind again when the name matches, and refuses the same name sponsored a different way", () => {
    const first = add(empty(), {}).state;
    const again = add(first, { count: 2 });
    expect(again.state.projects[0]?.types).toHaveLength(1);
    expect(again.state.outcomes.map((o) => o.name)).toEqual(["Orphan 1", "Orphan 2", "Orphan 3", "Orphan 4", "Orphan 5"]);
    expect(add(first, { frameworkId: "whole" }).error).toContain("different way of being sponsored");
  });
  it("counts beneficiaries with no place in the partner's total, and says what is missing", () => {
    const r = add(empty(), {});
    const roll = rollupOf(r.state.nodes, r.state.outcomes, FW, [], []);
    expect(roll.byProject.get("home-partner")).toEqual({ places: 9, used: 0, beneficiaries: 3 });
    expect(roll.byNode.size).toBe(0);
    expect(add(empty(), { name: "" }).error).toContain("name");
    expect(add(empty(), { frameworkId: "" }).error).toContain("sponsored");
  });
  it("lets them be placed in the same step when a place is chosen, and refuses groups without a place", () => {
    const { projects } = sample();
    const st: ProjectState = { projects, nodes: sample().nodes, outcomes: [], partnerTypes: [], partnerFields: [], giftProjects: [] };
    const placed = applyProjectAction(st, FW, { action: "add-beneficiaries", projectId: projects[0]!.id, typeId: "child", name: "Orphan", count: 2, nodeId: sample().nodes[2]!.id })!;
    expect(placed.error).toBeUndefined();
    expect(placed.state.outcomes[0]?.nodeId).toBe(sample().nodes[2]!.id);
    expect(applyProjectAction(st, FW, { action: "add-beneficiaries", projectId: projects[0]!.id, typeId: "child", name: "Orphan", count: 1, nodeId: "", groupIds: ["x"] })!.error).toContain("Choose the place first");
  });
  it("lets a type belong to no level", () => {
    const { projects } = sample();
    const r = addType(projects, projects[0]!.id, { name: "Cook", levelId: "", frameworkId: "whole" }, FW);
    expect(r.error).toBeUndefined();
    expect(addType(projects, projects[0]!.id, { name: "Cook", levelId: "", frameworkId: "whole", groupingIds: ["class"] }, FW).error).toContain("belong to first");
  });
});

describe("beneficiaries made before partners existed, and placing a gift on a partner (DECISIONS 73)", () => {
  const out = (id: string, projectId?: string) => ({ id, name: id, type: "child", cohort: "", frameworkId: "shared", active: true, ...(projectId ? { projectId } : {}) });
  const gift = (sub: string, parts = 3) => ({ subscriptionId: sub, frameworkId: "shared", partsPerInstalment: parts, state: "in_progress", planStatus: "", projectName: "", firstPaid: "2026-01-01", planned: 12, paid: 1, nextDue: "", planPaid: null }) as unknown as Commitment;

  it("moves every beneficiary that belongs to no partner into one, and keeps what is allocated to them", () => {
    const { projects } = sample();
    const r = adoptLegacy([out("a"), out("b"), out("c", projects[0]!.id)], projects, projects[0]!.id);
    expect(r.moved).toBe(2);
    expect(r.value.every((o) => o.projectId === projects[0]!.id)).toBe(true);
    expect(adoptLegacy([out("a")], projects, "nope").error).toContain("Choose a partner");
  });
  it("removes them and releases the gifts that were on them", () => {
    const allocations = [{ commitmentKey: "1", outcomeId: "a", parts: 3, how: "auto" as const, at: "t" }, { commitmentKey: "2", outcomeId: "c", parts: 3, how: "auto" as const, at: "t" }];
    const r = clearLegacy([out("a"), out("c", "p")], allocations);
    expect(r).toMatchObject({ removed: 1, released: 1 });
    expect(r.outcomes.map((o) => o.id)).toEqual(["c"]);
    expect(r.allocations.map((a) => a.commitmentKey)).toEqual(["2"]);
  });
  it("places a gift on a partner as a whole, only among its own beneficiaries", () => {
    const { projects } = sample();
    const outcomes = [out("x", "other"), out("a", projects[0]!.id)];
    const r = placeInPartner([], [gift("1")], outcomes, projects, FW, "1", projects[0]!.id, "t");
    expect(r.value[0]).toMatchObject({ outcomeId: "a", how: "manual" });
    expect(placeInPartner([], [gift("1")], [out("x", "other")], projects, FW, "1", projects[0]!.id, "t").error).toContain("no room");
    expect(placeInPartner([], [gift("1")], outcomes, projects, FW, "1", "nope", "t").error).toContain("not found");
  });
});

describe("the beneficiary's own ID (DECISIONS 75)", () => {
  const out = (id: string, projectId: string, ref?: string) => ({ id, name: id, type: "child", cohort: "", frameworkId: "shared", active: true, projectId, ...(ref ? { ref } : {}) });

  it("sets an ID, keeps it unique ignoring capitals, and clears it when empty", () => {
    const list = [out("a", "p"), out("b", "p", "A-0007")];
    expect(setRef(list, "a", " a-0001 ").value[0]?.ref).toBe("a-0001");
    expect(setRef(list, "a", "a-0007").error).toContain("already used");
    expect(setRef(list, "b", "").value[1]).not.toHaveProperty("ref");
    expect(setRef(list, "zzz", "x").error).toContain("not found");
  });
  it("gives the next numbers in name order to those without an ID, skips numbers in use, and leaves others alone", () => {
    const list = [out("Orphan 10", "p"), out("Orphan 2", "p"), out("Orphan 3", "p", "A-0003"), out("Other", "q")];
    const r = assignRefs(list, "p", "A-", 1);
    expect(r.error).toBeUndefined();
    expect(Object.fromEntries(r.value.map((o) => [o.id, o.ref]))).toEqual({ "Orphan 10": "A-0002", "Orphan 2": "A-0001", "Orphan 3": "A-0003", Other: undefined });
  });
  it("asks for a prefix, a sensible start, and has nothing to do when everyone has an ID", () => {
    expect(assignRefs([out("a", "p")], "p", "", 1).error).toContain("prefix");
    expect(assignRefs([out("a", "p")], "p", "A-", -1).error).toContain("whole number");
    expect(assignRefs([out("a", "p", "X1")], "p", "A-", 1).error).toContain("already has an ID");
  });
});

describe("removing a partner (DECISIONS 104)", () => {
  const base = (): ProjectState => ({
    projects: [{ id: "a", name: "Aghosh", aliases: [], levels: [], types: [] } as unknown as Project, { id: "b", name: "Other", aliases: [], levels: [], types: [] } as unknown as Project],
    nodes: [{ id: "n1", projectId: "a", name: "Branch", levelId: "l1", parentId: "" } as unknown as Node],
    outcomes: [{ id: "o1", name: "Child 1", type: "child", cohort: "", frameworkId: "f", active: true, projectId: "a" }, { id: "o2", name: "Child 2", type: "child", cohort: "", frameworkId: "f", active: true, projectId: "b" }],
    partnerTypes: [], partnerFields: [],
    giftProjects: [{ id: "g", name: "Orphans", crmNames: [], partnerIds: ["a", "b"] }],
  });
  it("refuses while beneficiaries belong to it, and says how many", () => {
    const r = removePartner(base(), "a", false, new Set());
    expect(r.error).toContain("1 beneficiary belongs");
    expect(r.state.projects).toHaveLength(2);
  });
  it("removes the partner with its beneficiaries and structure, and takes it off the projects donors choose, keeping the other partners", () => {
    const r = removePartner(base(), "a", true, new Set());
    expect(r.error).toBeUndefined();
    expect(r.removed).toBe(1);
    expect(r.state.projects.map((p) => p.id)).toEqual(["b"]);
    expect(r.state.nodes).toEqual([]);
    expect(r.state.outcomes.map((o) => o.id)).toEqual(["o2"]); // the other partner's beneficiary stays
    expect(r.state.giftProjects[0]?.partnerIds).toEqual(["b"]);
  });
  it("never removes a beneficiary that has a gift allocated", () => {
    const r = removePartner(base(), "a", true, new Set(["o1"]));
    expect(r.error).toContain("have gifts allocated");
    expect(r.state.projects).toHaveLength(2);
  });
  it("removes a partner with nothing under it, and refuses one that does not exist", () => {
    const empty = { ...base(), outcomes: [], nodes: [] };
    expect(removePartner(empty, "a", false, new Set()).state.projects.map((p) => p.id)).toEqual(["b"]);
    expect(removePartner(base(), "zzz", false, new Set()).error).toContain("not found");
  });
  it("is a project action the server and the demo both answer", () => {
    expect(applyProjectAction(base(), [], { action: "remove-partner", projectId: "a", withBeneficiaries: true })!.state.projects).toHaveLength(1);
    expect(applyProjectAction(base(), [], { action: "remove-partner", projectId: "a", withBeneficiaries: true }, "", new Set(["o1"]))!.error).toContain("have gifts allocated");
  });
});
