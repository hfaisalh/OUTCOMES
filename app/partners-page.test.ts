/**
 * projects-page.test.ts
 *
 * What it does: tests the Partners page on invented partners: the empty start, the table of partners with one line each, the CRM names list, and escaping.
 * Who calls it: vitest. Depends on: projects-page.ts and Module 6.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import { addBeneficiaries, addLevel, addNode, addProject, addType } from "../modules/06-projects/projects";
import { starterFrameworks } from "./demo-data";
import type { View } from "./pages";
import { partnersPage } from "./partners-page";

const fws = starterFrameworks();
const base = (over: Partial<View> = {}): View => ({ workOrders: [], review: [], itemCategories: {} as Record<string, string>, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, categories: [], suggestions: {}, selectedItem: "", live: false, canPickup: false, run: null, frameworks: fws, ...over });

function built() {
  let projects = addProject([], "Aghosh Orphan Homes", ["Aghosh"]).value;
  const id = projects[0]!.id;
  projects = addLevel(projects, id, "Branch", "").value;
  projects = addLevel(projects, id, "Class", "branch").value;
  projects = addType(projects, id, { name: "Child", levelId: "class", frameworkId: fws[0]!.id }, fws).value;
  let nodes = addNode([], projects, id, "branch", "", "Branch 1", { Location: "Lahore" }).value;
  nodes = addNode(nodes, projects, id, "class", nodes[0]!.id, "Class 5A").value;
  const outcomes = addBeneficiaries([], projects, nodes, { projectId: id, nodeId: nodes[1]!.id, typeId: "child", name: "Orphan", count: 4 }).value;
  return { projects, nodes, outcomes };
}

describe("partnersPage", () => {
  it("starts with a New partner button, and no fixed list of partner types", () => {
    const html = partnersPage(base());
    expect(html).toContain("No partners yet");
    expect(html).toContain('data-pf="new"');
    expect(html).not.toContain("Another charity");
  });
  it("lists the partners as a table, one line each, that opens the partner's window", () => {
    const { projects, nodes, outcomes } = built();
    const html = partnersPage(base({ projects: [{ ...projects[0]!, type: "Institute", status: "pending", ddStatus: "pending", capacity: 40, itemIds: ["A", "B"], contacts: [{ name: "A Person", position: "", phone: "", mobile: "", email: "", handles: "" }] }], nodes, outcomes }));
    expect(html).toContain('class="ptable"');
    expect(html).toContain('data-pf="open" data-id="aghosh-orphan-homes"');
    for (const w of ["Aghosh Orphan Homes", "Institute", "Pending", "2 items", "40", "4", "0 of 12", "A Person"]) expect(html).toContain(w);
    expect(html).toContain("A partner takes gifts only when it is Active");
    expect(html).not.toContain("Levels"); // the structure is in the partner's window now
    expect(html).not.toContain("Add beneficiaries"); // and beneficiaries have their own page
    expect(html).not.toContain("Names the CRM uses"); // and so do projects
  });
  it("shows an active, approved partner as Active", () => {
    const { projects, nodes, outcomes } = built();
    const html = partnersPage(base({ projects: [{ ...projects[0]!, status: "active", ddStatus: "approved" }], nodes, outcomes, today: "2026-11-20" }));
    expect(html).toContain('<span class="pill ok">Active</span>');
    expect(html).toContain('<span class="pill ok">Approved</span>');
  });
  it("never trusts a name as HTML", () => {
    const projects = addProject([], "<img src=x onerror=alert(1)>").value;
    const html = partnersPage(base({ projects }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("shows the projects each partner delivers", () => {
    const { projects, nodes, outcomes } = built();
    const html = partnersPage(base({ projects, nodes, outcomes, giftProjects: [{ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes"] }] }));
    expect(html).toContain("<th>Projects</th>");
    expect(html).toContain("Aghosh</td>");
    expect(partnersPage(base({ projects, nodes, outcomes }))).toContain('<span class="muted">None</span>');
  });
  it("offers to add an invented sample partner until there is one", () => {
    expect(partnersPage(base())).toContain('data-pf="sample"');
    expect(partnersPage(base())).toContain("Add a sample partner");
    const withSample = partnersPage(base({ projects: [{ id: "s", name: "Sample Orphan Care Trust", reference: "SAMPLE-001", aliases: [], levels: [], types: [] }] as never }));
    expect(withSample).not.toContain('data-pf="sample"');
  });
});
