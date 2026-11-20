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
import { applyProjectAction, levelTree, levelsBelow, moveLevel, isActivePartner, partnerAccepts, savePartner, setCrmName, crmProjectNames, type ProjectState, allocationSummary, allocOptions, placeInNode, placesUnder, suggestions, addBeneficiaries, addLevel, addNode, addProject, addType, matchProject, orderedLevels, pathOf, removeLevel, removeNode, removeType, rollupOf, setNodeField, type Node, type Project } from "./projects";

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
    return { projects, nodes, kids, pid, opts: allocOptions(projects, 1, "2026-11-20") };
  }

  it("totals each project, with waiting gifts directed to it and general ones counted on their own", () => {
    const { projects, kids, opts } = world();
    const gifts = [gift("1", 3, "Aghosh"), gift("2", 3, "Aghosh"), gift("3", 3, "Aghosh"), gift("4", 1, "Where Needed Most")];
    const alloc: Allocation[] = [{ commitmentKey: "1", outcomeId: kids[0]!.id, parts: 3, how: "auto", at: "x" }];
    const sum = allocationSummary(projects, kids, FW, alloc, gifts, opts);
    expect(sum.rows[0]).toMatchObject({ name: "Aghosh Orphan Homes", beneficiaries: 2, capacity: 6, used: 3, free: 3, waitingParts: 6, inBuffer: 0 });
    expect(sum.generalWaiting).toEqual({ gifts: 1, parts: 1 });
    expect(sum.waitingGifts).toBe(3);
  });
  it("counts a sponsor who is behind but inside the buffer", () => {
    const { projects, kids, opts } = world();
    const late = gift("1", 3, "Aghosh", { planStatus: "active", nextDue: "2026-11-05", planned: 12, planPaid: 2 });
    const alloc: Allocation[] = [{ commitmentKey: "1", outcomeId: kids[0]!.id, parts: 3, how: "auto", at: "x" }];
    expect(allocationSummary(projects, kids, FW, alloc, [late], opts).rows[0]?.inBuffer).toBe(1);
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

describe("matching the CRM's project names (DECISIONS 67)", () => {
  const orders = (names: string[]) => names.map((projectName) => ({ projectName, status: "ready" }));
  it("lists the names on real gifts with their counts, most first, and leaves blanks and excluded gifts out", () => {
    const { projects } = sample();
    const list = crmProjectNames([...orders(["Where Needed Most", "Where Needed Most", "Aghosh", "", "Dadyal Orphan Complex"]), { projectName: "Aghosh", status: "excluded" }], projects);
    expect(list.map((x) => [x.name, x.gifts])).toEqual([["Where Needed Most", 2], ["Aghosh", 1], ["Dadyal Orphan Complex", 1]]);
  });
  it("shows where a name already goes, and suggests a partner that shares a word with one that is not matched", () => {
    const { projects } = sample(); // Aghosh Orphan Homes, alias Aghosh
    const list = crmProjectNames(orders(["Aghosh", "Aghosh Girls Home", "Hope for Palestine"]), projects);
    expect(list.find((x) => x.name === "Aghosh")).toMatchObject({ projectIds: ["aghosh-orphan-homes"], suggestion: "" });
    expect(list.find((x) => x.name === "Aghosh Girls Home")).toMatchObject({ projectIds: [], suggestion: "aghosh-orphan-homes" });
    expect(list.find((x) => x.name === "Hope for Palestine")).toMatchObject({ projectIds: [], suggestion: "" });
  });
  it("lets a name go to several partners, turns one off, and refuses an unknown partner", () => {
    const { projects } = sample();
    const two = addProject(projects, "Dadyal Orphan Complex").value;
    const a = setCrmName(two, "Orphan Care Complex", "dadyal-orphan-complex", true).value;
    const both = setCrmName(a, "Orphan Care Complex", "aghosh-orphan-homes", true).value;
    expect(crmProjectNames(orders(["Orphan Care Complex"]), both)[0]?.projectIds).toEqual(["aghosh-orphan-homes", "dadyal-orphan-complex"]);
    const off = setCrmName(both, "Orphan Care Complex", "aghosh-orphan-homes", false).value;
    expect(crmProjectNames(orders(["Orphan Care Complex"]), off)[0]?.projectIds).toEqual(["dadyal-orphan-complex"]);
    expect(setCrmName(off, "x", "nope", true).error).toContain("not found");
  });
});

describe("the partner profile (DECISIONS 69)", () => {
  const empty = (): ProjectState => ({ projects: [], nodes: [], outcomes: [], partnerTypes: [], partnerFields: ["Parent charity number"] });
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
    const made = savePartner({ projects: [], nodes: [], outcomes: [], partnerTypes: [], partnerFields: [] }, { name: "Home Partner", type: "Family sponsorship" }, "", "", "2026-11-20");
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
    const st: ProjectState = { projects, nodes: sample().nodes, outcomes: [], partnerTypes: [], partnerFields: [] };
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

