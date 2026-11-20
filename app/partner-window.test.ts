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
  projects = addType(projects, id, { name: "Child", levelId: "class", frameworkId: fws[0]!.id }, fws).value;
  let nodes = addNode([], projects, id, "branch", "", "Branch 1", { Location: "Lahore" }).value;
  nodes = addNode(nodes, projects, id, "class", nodes[0]!.id, "Class 5A").value;
  const outcomes = addBeneficiaries([], projects, nodes, { projectId: id, nodeId: nodes[1]!.id, typeId: "child", name: "Orphan", count: 3 }).value;
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
  it("shows the structure as tables: levels, who lives here, and the places with what each adds up to", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects, nodes, outcomes }), id, "structure", ctx, {});
    for (const w of ["<th>Order</th>", "Branch", "Class", "<th>Lives at</th>", "Child", "<th>Place</th>", "Branch 1", "Class 5A", "Location: Lahore", "0 of 9"]) expect(html).toContain(w);
    expect(html).toContain('data-action="add-level"');
    expect(html).toContain('data-action="add-type"');
    expect(html).toContain('data-action="add-node"');
    expect(html).toContain('data-action="remove-level" data-id="class"'); // only the bottom level can be removed
    expect(html).not.toContain('data-action="remove-level" data-id="branch"');
  });
  it("shows the beneficiaries as a table with how many units each has sponsored, and a form to add more", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects, nodes, outcomes }), id, "beneficiaries", ctx, {});
    expect(html).toContain("<th>Sponsored of units</th>");
    expect(html).toContain("Orphan 1");
    expect(html).toContain("Class 5A");
    expect(html).toContain("0 of 3");
    expect(html).toContain('data-action="add-beneficiaries"');
    expect(html).toContain("Remove 3 with no sponsor");
    expect(html).toContain('data-oc-remove="orphan-1"');
    expect(html).toContain('<option value="child" data-level="class">'); // the type says which level it lives at
    expect(html).toContain('<option value="aghosh-orphan-homes-branch-1" data-level="branch">'); // so only places of that level are offered
  });
  it("never trusts names as HTML", () => {
    const { projects, nodes, outcomes, id } = built();
    const html = partnerWindowHtml(base({ projects: [{ ...projects[0]!, name: "<img src=x onerror=alert(1)>" }], nodes, outcomes }), id, "structure", ctx, {});
    expect(html).not.toContain("<img");
  });
});
