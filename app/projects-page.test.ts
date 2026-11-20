/**
 * projects-page.test.ts
 *
 * What it does: tests the Projects page on an invented project: the empty start, the steps once a project is built, and that names are never trusted as HTML.
 * Who calls it: vitest. Depends on: projects-page.ts and Module 6.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import { addBeneficiaries, addLevel, addNode, addProject, addType } from "../modules/06-projects/projects";
import { starterFrameworks } from "./demo-data";
import type { View } from "./pages";
import { projectsPage } from "./projects-page";

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

describe("projectsPage", () => {
  it("starts with a form to create the first project, and templates to start from", () => {
    const html = projectsPage(base());
    expect(html).toContain("No projects yet");
    expect(html).toContain('data-action="add-project"');
    expect(html).toContain("Orphan home or school");
  });
  it("shows the levels, the types, the places with their roll-up, and the add forms", () => {
    const { projects, nodes, outcomes } = built();
    const html = projectsPage(base({ projects, nodes, outcomes }));
    expect(html).toContain("<b>Branch</b> &gt; <b>Class</b>");
    expect(html).toContain("Child");
    expect(html).toContain("Branch 1");
    expect(html).toContain("Location: Lahore");
    expect(html).toContain("4 beneficiaries, 0 of 12 units sponsored");
    expect(html).toContain('data-action="add-beneficiaries"');
  });
  it("never trusts a name as HTML", () => {
    const projects = addProject([], "<img src=x onerror=alert(1)>").value;
    const html = projectsPage(base({ projects }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
  it("lists the names the CRM uses with their counts, a place to choose where each goes, and a suggestion", () => {
    const { projects, nodes, outcomes } = built();
    const wo = (n: string) => ({ key: n, projectName: n, status: "ready" }) as never;
    const html = projectsPage(base({ projects, nodes, outcomes, workOrders: [wo("Where Needed Most"), wo("Where Needed Most"), wo("Aghosh"), wo("Aghosh Girls Home")] }));
    expect(html).toContain("Names the CRM uses");
    expect(html).toContain('data-crm-name="Where Needed Most"');
    expect(html).toContain("Any project (general)");
    expect(html).toContain('data-action="assign-crm"');
    expect(html).toContain("Use 1 suggestion");
    expect(html).toContain("Gifts that name <b>Aghosh Orphan Homes</b>, <b>Aghosh</b> in the CRM go to Aghosh Orphan Homes");
  });
  it("says so when no gift carries a project name", () => {
    expect(projectsPage(base())).toContain("No gifts carry a project name yet");
  });
});
