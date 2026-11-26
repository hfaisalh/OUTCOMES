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
import { assignCrmName, crmNamesOf, migrateGiftProjects, NO_PARTNER, partnersForGift, saveGiftProject, setGroup, setPlace, type GiftProject, assignRefs, setRef, adoptLegacy, clearLegacy, placeInPartner, applyProjectAction, levelTree, levelsBelow, moveLevel, isActivePartner, partnerAccepts, savePartner, autoCreateProjects, isGeneralProjectName, noProjectCount, crmMatchNames, projectOffers, projectVendors, itemsSeenWith, capacityFor, eligiblePartners, samplePartnerProfile, SAMPLE_PARTNER_REFERENCE, type ProjectState, allocationSummary, allocOptions, placeInNode, placesUnder, suggestions, addBeneficiaries, addLevel, addNode, addProject, addType, matchProject, orderedLevels, pathOf, removeLevel, removeNode, removeType, removePartner, rollupOf, setNodeField, type Node, type Project } from "./projects";

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

  it("saves a project with its partners, refuses an empty or repeated name, and ties it to a CRM name that no other project has (DECISIONS 159)", () => {
    const ps = partners();
    const first = saveGiftProject([], ps, { name: "Aghosh Homes", crmName: "Aghosh", partnerIds: ["aghosh-orphan-homes", "nope"] }, "");
    expect(first.value[0]).toEqual({ id: "aghosh-homes", name: "Aghosh Homes", crmName: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes"] }); // an unknown partner is dropped
    expect(saveGiftProject([], ps, { name: " " }, "").error).toContain("name");
    expect(saveGiftProject(first.value, ps, { name: "aghosh homes" }, "").error).toContain("already");
    expect(saveGiftProject(first.value, ps, { name: "Another", crmName: "AGHOSH" }, "").error).toBe('"AGHOSH" already belongs to another project.'); // one CRM name, one project
    expect(saveGiftProject(first.value, ps, { name: "X" }, "nope").error).toContain("not found");
    expect(saveGiftProject([], ps, { name: "Mine" }, "").value[0]?.crmName).toBe(""); // a project made only in OUTCOMES is not linked
  });
  it("keeps the CRM name fixed once set, lets the shown name change, and ties an older project to its own name at its first save", () => {
    const ps = partners();
    const first = saveGiftProject([], ps, { name: "Aghosh Homes", crmName: "Aghosh" }, "").value;
    const renamed = saveGiftProject(first, ps, { name: "Aghosh Orphan Homes", crmName: "Something else" }, "aghosh-homes").value[0]!;
    expect(renamed).toMatchObject({ name: "Aghosh Orphan Homes", crmName: "Aghosh" }); // the asked CRM name is ignored
    const older: GiftProject[] = [{ id: "hope", name: "Hope for Palestine", crmNames: ["Hope 2"], partnerIds: [] }];
    expect(saveGiftProject(older, ps, { name: "Hope" }, "hope").value[0]).toMatchObject({ name: "Hope", crmName: "Hope for Palestine", crmNames: ["Hope 2"] });
    const unlinked = saveGiftProject([], ps, { name: "Mine" }, "").value;
    expect(saveGiftProject(unlinked, ps, { name: "Mine", crmName: "Dadyal Orphan Complex" }, "mine").value[0]?.crmName).toBe("Dadyal Orphan Complex"); // it can be linked once
  });
  it("matches a gift by the CRM name, not by the name shown, and an unlinked project matches none (DECISIONS 159)", () => {
    const ps = partners();
    const gps: GiftProject[] = [{ id: "a", name: "Aghosh Homes", crmName: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes"] }, { id: "m", name: "Dadyal", crmName: "", crmNames: [], partnerIds: ["dadyal-orphan-complex"] }];
    expect(partnersForGift(gps, ps, "aghosh").map((p) => p.id)).toEqual(["aghosh-orphan-homes"]);
    expect(partnersForGift(gps, ps, "Aghosh Homes")).toEqual([]); // the name shown is not the CRM's
    expect(partnersForGift(gps, ps, "Dadyal")).toEqual([]); // not linked, so a gift never matches it
    expect(crmMatchNames(gps[0]!)).toEqual(["Aghosh"]);
    expect(crmMatchNames(gps[1]!)).toEqual([]);
    expect(crmMatchNames({ id: "o", name: "Old", crmNames: ["Older"], partnerIds: [] })).toEqual(["Old", "Older"]);
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
    expect(list.map((x) => [x.name, x.gifts])).toEqual([["Aghosh", 1], ["Aghosh Girls Home", 1], ["Hope for Palestine", 1]]); // Where Needed Most is not a project, so it is not listed
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

describe("clusters in a project (DECISIONS 158, 161)", () => {
  const st = (gps: GiftProject[]): ProjectState => ({ projects: [], nodes: [], outcomes: [], partnerTypes: [], partnerFields: [], giftProjects: gps });
  const proj = (): GiftProject => ({ id: "dadyal", name: "Dadyal Orphan Complex", crmNames: [], partnerIds: [] });
  const run = (s: ProjectState, body: Record<string, unknown>) => applyProjectAction(s, [], { giftProjectId: "dadyal", ...body }, "2026-11-23");
  it("adds clusters and sub clusters to a project, and keeps them off projects it does not name", () => {
    let s = st([proj(), { id: "other", name: "Other", crmNames: [], partnerIds: [] }]);
    s = run(s, { action: "cluster-add", name: "Block A", label: "Block", capacity: "60" })!.state;
    s = run(s, { action: "cluster-add", name: "5A", label: "Classroom", parentId: "block-a" })!.state;
    const gp = s.giftProjects[0]!;
    expect(gp.clusters?.map((c) => [c.name, c.label, c.parentId, c.capacity])).toEqual([["Block A", "Block", "", 60], ["5A", "Classroom", "block-a", undefined]]);
    expect(s.giftProjects[1]?.clusters).toBeUndefined(); // the other project is untouched
  });
  it("refuses with the reason, leaving the project as it was, and refuses an unknown project", () => {
    const s = st([proj()]);
    const bad = run(s, { action: "cluster-add", name: "" })!;
    expect(bad.error).toBe("Give the cluster a name.");
    expect(bad.state).toBe(s);
    expect(applyProjectAction(s, [], { action: "cluster-add", name: "Block", giftProjectId: "nope" }, "2026-11-23")!.error).toBe("That project was not found.");
  });
  it("takes the clusters off the project when the last one is removed", () => {
    let s = st([proj()]);
    s = run(s, { action: "cluster-add", name: "Block A" })!.state;
    s = run(s, { action: "cluster-remove", clusterId: "block-a" })!.state;
    expect(s.giftProjects[0]?.clusters).toBeUndefined();
  });
  it("turns the levels an older project saved into labels the first time its clusters change", () => {
    const old: GiftProject = { ...proj(), levels: [{ id: "block", name: "Block", parentId: "" }], clusters: [{ id: "block-a", name: "Block A", levelId: "block", parentId: "", place: "", status: "active" } as never] };
    const s = run(st([old]), { action: "cluster-set", clusterId: "block-a", place: "Lahore" })!.state;
    expect(s.giftProjects[0]?.levels).toBeUndefined();
    expect(s.giftProjects[0]?.clusters?.[0]).toMatchObject({ label: "Block", place: "Lahore" });
  });
  it("keeps the clusters when the project's details are saved", () => {
    let s = st([proj()]);
    s = run(s, { action: "cluster-add", name: "Block A" })!.state;
    const saved = saveGiftProject(s.giftProjects, [], { name: "Dadyal Orphan Complex", notes: "Edited" }, "dadyal");
    expect(saved.error).toBeUndefined();
    expect(saved.value[0]).toMatchObject({ notes: "Edited", clusters: [{ name: "Block A" }] });
  });
});

describe("a partner's batch size (DECISIONS 203)", () => {
  const empty = (): ProjectState => ({ projects: [], nodes: [], outcomes: [], partnerTypes: [], partnerFields: [], giftProjects: [] });
  const save = (s: ProjectState, profile: Record<string, unknown>, projectId = "") => applyProjectAction(s, [], { action: "save-partner", projectId, copyFrom: "", profile: { name: "Sample Care Partners", type: "Institute", ...profile } }, "2026-11-25");
  it("is kept when it is a whole number of at least 1, can be cleared, and is refused when it is not", () => {
    const made = save(empty(), { batchSize: "5" })!;
    expect(made.state.projects[0]?.batchSize).toBe(5);
    const cleared = save(made.state, { batchSize: "" }, made.state.projects[0]!.id)!;
    expect(cleared.state.projects[0]?.batchSize).toBeUndefined();
    expect(save(empty(), { batchSize: "0" })!.error).toContain("Batch size");
    expect(save(empty(), { batchSize: "2.5" })!.error).toContain("Batch size");
  });
});
