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
import { setCrmName, setPartner, crmProjectNames, allocationSummary, allocOptions, placeInNode, placesUnder, suggestions, addBeneficiaries, addLevel, addNode, addProject, addType, matchProject, orderedLevels, pathOf, removeLevel, removeNode, removeType, rollupOf, setNodeField, type Node, type Project } from "./projects";

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
  it("refuses a repeated name, an unknown parent, and a second level under the same one", () => {
    const { projects } = sample();
    const id = projects[0]!.id;
    expect(addLevel(projects, id, "branch", "").error).toContain("already");
    expect(addLevel(projects, id, "Wing", "nope").error).toContain("not found");
    expect(addLevel(projects, id, "Wing", "branch").error).toContain("already has a level under it");
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
    const { projects, nodes } = sample();
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
  it("keeps a partner's type and the capacity set by hand in its profile", () => {
    const { projects } = sample();
    const r = setPartner(projects, "aghosh-orphan-homes", { kind: "contractor", capacity: "40", note: "two crews" });
    expect(r.value[0]).toMatchObject({ kind: "contractor", capacity: 40, capacityNote: "two crews" });
    expect(setPartner(r.value, "aghosh-orphan-homes", { kind: "institute", capacity: "", note: "" }).value[0]).not.toHaveProperty("capacity");
    expect(setPartner(projects, "aghosh-orphan-homes", { kind: "bank", capacity: "", note: "" }).error).toContain("Choose");
    expect(setPartner(projects, "aghosh-orphan-homes", { kind: "charity", capacity: "-3", note: "" }).error).toContain("whole number");
  });
});
