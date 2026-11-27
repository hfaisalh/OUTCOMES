/**
 * beneficiaries-page.test.ts
 *
 * What it does: tests the Beneficiaries page on invented beneficiaries: the add form, the filters, the table with partner, place, groups and ID, and escaping.
 * Who calls it: vitest. Depends on: beneficiaries-page.ts and Module 6.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import { addBeneficiaries, addLevel, addNode, addProject, addType } from "../modules/06-projects/projects";
import { beneficiariesPage } from "./beneficiaries-page";
import { starterFrameworks } from "./demo-data";
import type { View } from "./pages";

const fws = starterFrameworks();
const base = (over: Partial<View> = {}): View => ({ workOrders: [], review: [], itemCategories: {} as Record<string, string>, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, categories: [], suggestions: {}, selectedItem: "", live: false, canPickup: false, run: null, frameworks: fws, today: "2026-11-20", ...over });

function built() {
  let partners = addProject([], "Aghosh Orphan Homes").value;
  const id = partners[0]!.id;
  partners = addLevel(partners, id, "Branch", "").value;
  partners = addLevel(partners, id, "Class", "branch").value;
  partners = addType(partners, id, { name: "Child", levelId: "branch", frameworkId: fws[0]!.id, groupingIds: ["class"] }, fws).value;
  let nodes = addNode([], partners, id, "branch", "", "Branch 1").value;
  nodes = addNode(nodes, partners, id, "class", nodes[0]!.id, "Class 5A").value;
  nodes = addNode(nodes, partners, id, "class", nodes[0]!.id, "Class 5B").value;
  const allocated = addBeneficiaries([], partners, nodes, { projectId: id, nodeId: nodes[0]!.id, typeId: "child", name: "Orphan", count: 2, groupIds: [nodes[1]!.id] }).value;
  const loose = addBeneficiaries(allocated, partners, nodes, { projectId: id, nodeId: "", typeId: "child", name: "Waiting", count: 1 }).value;
  return { partners, nodes, outcomes: loose, id };
}

describe("beneficiariesPage", () => {
  it("has a form with a partner, a name, a number and how they are sponsored, and says to create a partner first when there are none", () => {
    const { partners, nodes, outcomes } = built();
    const html = beneficiariesPage(base({ projects: partners, nodes, outcomes }));
    for (const w of ['id="ben-partner"', 'id="ben-name"', 'id="ben-count"', 'id="ben-fw"', 'data-action="ben-add"']) expect(html).toContain(w);
    const none = beneficiariesPage(base());
    expect(none).toContain("Create a partner first");
    expect(none).toMatch(/data-action="ben-add"[^>]*disabled/);
  });
  it("lists everyone in one table with their ID, partner, kind, place, groups and units sponsored", () => {
    const { partners, nodes, outcomes } = built();
    const html = beneficiariesPage(base({ projects: partners, nodes, outcomes }));
    for (const w of ["<th>ID</th>", "<th>Partner</th>", "<th>Location</th>", "<th>Groups</th>", "Orphan 1", "Waiting", "Aghosh Orphan Homes", "0 of 3"]) expect(html).toContain(w);
    expect(html).toContain('data-ref="orphan-1"');
  });
  it("lets a beneficiary be placed afterwards: a place list, and a list of groups once it has a place", () => {
    const { partners, nodes, outcomes } = built();
    const html = beneficiariesPage(base({ projects: partners, nodes, outcomes }));
    expect(html).toContain('data-set-place="orphan-1"');
    expect(html).toMatch(/<option value="aghosh-orphan-homes-branch-1" selected>/); // already in Branch 1
    expect(html).toContain('data-set-group="orphan-1" data-level="class"');
    expect(html).toMatch(/<option value="aghosh-orphan-homes-class-5a" selected>/); // and in Class 5A
    expect(html).toContain("Class 5B"); // another group in the same place is offered
    expect(html).not.toContain('data-set-group="waiting"'); // one with no place has no group lists yet
    expect(html).toContain("No location");
  });
  it("filters by partner, by placed or not, and by search, and offers an ID tool for one partner", () => {
    const { partners, nodes, outcomes, id } = built();
    const unallocated = beneficiariesPage(base({ projects: partners, nodes, outcomes, benFilter: { partner: "", type: "", located: "no", text: "" } }));
    expect(unallocated).toContain("Waiting");
    expect(unallocated).not.toContain('aria-label="ID of Orphan 2"'); // the allocated ones are hidden
    expect(beneficiariesPage(base({ projects: partners, nodes, outcomes, benFilter: { partner: "", type: "", located: "", text: "orphan 2" } }))).not.toContain('aria-label="ID of Waiting"');
    const one = beneficiariesPage(base({ projects: partners, nodes, outcomes, benFilter: { partner: id, type: "", located: "", text: "" } }));
    expect(one).toContain('data-action="assign-refs"');
    expect(beneficiariesPage(base({ projects: partners, nodes, outcomes }))).not.toContain('data-action="assign-refs"');
    expect(beneficiariesPage(base({ projects: partners, nodes, outcomes, benFilter: { partner: "", type: "", located: "", text: "nobody" } }))).toContain("No beneficiaries match the filters");
  });
  it("shows beneficiaries that belong to no partner under their own filter, and never trusts names as HTML", () => {
    const { partners, nodes } = built();
    const old = [{ id: "abc-1", name: "<img src=x onerror=alert(1)>", type: "child", cohort: "", frameworkId: fws[0]!.id, active: true }];
    const html = beneficiariesPage(base({ projects: partners, nodes, outcomes: old }));
    expect(html).toContain("Not in a partner (1)");
    expect(html).toContain("No partner");
    expect(html).not.toContain("<img");
  });
});
