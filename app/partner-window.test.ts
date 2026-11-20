/**
 * partner-window.test.ts
 *
 * What it does: tests the partner window on an invented partner: the tabs, the profile form, the structure tables (levels, who lives here,
 * places) and the beneficiaries table, that a new partner has only its profile until saved, and escaping.
 * Who calls it: vitest. Depends on: partner-window.ts and Module 6.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import { addBeneficiaries, addLevel, addNode, addProject, addType } from "../modules/06-projects/projects";
import { starterFrameworks } from "./demo-data";
import type { View } from "./pages";
import { partnerWindowHtml } from "./partner-window";

const fws = starterFrameworks();
const ctx = { types: ["Institute"], fields: [], items: [{ id: "I1", name: "Orphan Sponsorship" }], others: [] };
const base = (over: Partial<View> = {}): View => ({ workOrders: [], review: [], itemCategories: {} as Record<string, string>, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, categories: [], suggestions: {}, selectedItem: "", live: false, canPickup: false, run: null, frameworks: fws, today: "2026-11-20", ...over });

function built() {
  let projects = addProject([], "Aghosh Orphan Homes").value;
  const id = projects[0]!.id;
  projects = addLevel(projects, id, "Branch", "").value;
  projects = addLevel(projects, id, "Class", "branch").value;
  projects = addLevel(projects, id, "House", "branch").value;
  projects = addType(projects, id, { name: "Child", levelId: "branch", frameworkId: fws[0]!.id, groupingIds: ["class", "house"] }, fws).value;
  let nodes = addNode([], projects, id, "branch", "", "Branch 1", { Location: "Lahore" }).value;
  nodes = addNode(nodes, projects, id, "class", nodes[0]!.id, "Class 5A").value;
  nodes = addNode(nodes, projects, id, "house", nodes[0]!.id, "Rose House").value;
  const outcomes = addBeneficiaries([], projects, nodes, { projectId: id, nodeId: nodes[0]!.id, typeId: "child", name: "Orphan", count: 3, groupIds: [nodes[1]!.id, nodes[2]!.id] }).value;
  return { projects, nodes, outcomes, id };
}

describe("partnerWindowHtml", () => {
  it("opens a new partner on its profile, with the other tabs waiting until it is saved", () => {
    const html = partnerWindowHtml(base(), "", "profile", ctx, {});
    expect(html).toContain("New partner");
    expect(html).toContain("Save the profile first");
    expect(html).toMatch(/data-pf-tab="structure"[^>]*disabled/);
    expect(html).toMatch(/data-pf-tab="beneficiaries"[^>]*disabled/);
    expect(html).toContain("Who they are");
  });
  it("shows the partner's name, type, status and due diligence in the header, and all three tabs", () => {
    const { projects, nodes, outcomes, id } = built();
    const p = { ...projects[0]!, type: "Institute", status: "active" as const, ddStatus: "approved" as const };
    const html = partnerWindowHtml(base({ projects: [p], nodes, outcomes }), id, "profile", ctx, p);
    for (const w of ["Aghosh Orphan Homes", "Institute", "Active", "Due diligence: Approved", "Profile", "Structure", "Beneficiaries"]) expect(html).toContain(w);
    expect(html).not.toMatch(/data-pf-tab="structure"[^>]*disabled/);
  });
  it("shows the levels with where each sits, the types with what groups them, and the places and groups with what each adds up to", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects, nodes, outcomes }), id, "structure", ctx, {});
    for (const w of ["<th>Level</th>", "<th>Sits</th>", "Under Branch", "Top, a place", "<th>Belongs to</th>", "<th>Grouped by</th>", "Class, House", "Places and groups", "Branch 1", "Class 5A", "Rose House", "Location: Lahore", "0 of 9"]) expect(html).toContain(w);
    expect(html).toContain("A child can be in a class and a house at the same time");
    for (const a of ["add-level", "add-type", "add-node"]) expect(html).toContain(`data-action="${a}"`);
    expect(html).toContain('data-level-parent="class"'); // a level can be moved under another
    expect(html).toContain('class="pj-type-group" value="class"'); // a type is grouped by the levels ticked
    expect(html).toContain('<option value="class" data-parent-level="branch">'); // a new group's level says which level it sits in
  });
  it("lets only a level with nothing under it be removed", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects, nodes, outcomes }), id, "structure", ctx, {});
    expect(html).toContain('data-action="remove-level" data-id="class"');
    expect(html).toContain('data-action="remove-level" data-id="house"');
    expect(html).not.toContain('data-action="remove-level" data-id="branch"'); // Class and House are under it
  });
  it("shows the beneficiaries as a table with their place, their groups and how many units each has sponsored, and a form that asks for groups", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects, nodes, outcomes }), id, "beneficiaries", ctx, {});
    for (const w of ["<th>Groups</th>", "<th>Sponsored of units</th>", "Orphan 1", "Branch 1", "Class 5A, Rose House", "0 of 3"]) expect(html).toContain(w);
    expect(html).toContain('data-action="add-beneficiaries"');
    expect(html).toContain("Remove 3 with no sponsor");
    expect(html).toContain('data-oc-remove="orphan-1"');
    expect(html).toContain('data-level="branch" data-groups="class house"'); // the type says its place and its groupings
    expect(html).toContain('id="pj-ben-fw"'); // the simple form: a name, a number and how they are sponsored
    expect(html).toContain("A new kind, named above");
    expect(html).toContain("<details>");
    expect(html).toContain("That is all that is needed");
    expect(html).toContain('class="pj-ben-group" data-group-level="class"'); // one list for each grouping
    expect(html).toContain('data-group-level="house"');
    expect(html).toMatch(/data-in="aghosh-orphan-homes-branch-1"/); // a group lists the place it is in, so only its own place's groups are offered
  });
  it("opens on the profile and offers the beneficiaries before the optional structure, and the add button needs no type or place set up", () => {
    const { projects } = built();
    const bare = [{ ...projects[0]!, types: [], levels: [] }];
    const html = partnerWindowHtml(base({ projects: bare }), bare[0]!.id, "beneficiaries", ctx, {});
    expect(html.indexOf('data-pf-tab="beneficiaries"')).toBeLessThan(html.indexOf('data-pf-tab="structure"'));
    expect(html).toContain("Structure (optional)");
    expect(html).not.toMatch(/data-action="add-beneficiaries"[^>]*disabled/);
  });
  it("never trusts names as HTML", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects: [{ ...projects[0]!, name: "<img src=x onerror=alert(1)>" }], nodes, outcomes }), id, "structure", ctx, {});
    expect(html).not.toContain("<img");
  });
});
