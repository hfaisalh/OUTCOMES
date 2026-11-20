/**
 * allocation-page.test.ts
 *
 * What it does: tests the Place gifts page on an invented project: the summary, a waiting gift with its suggestion, a directed gift, the drop targets, and escaping.
 * Who calls it: vitest. Depends on: allocation-page.ts and Modules 5 and 6.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { addBeneficiaries, addLevel, addNode, addProject, addType } from "../modules/06-projects/projects";
import { allocationPage } from "./allocation-page";
import { starterFrameworks } from "./demo-data";
import type { View } from "./pages";

const fws = starterFrameworks();
const shared = fws.find((f) => f.id === "sponsorship-shared-parts")!;
const base = (over: Partial<View> = {}): View => ({ workOrders: [], review: [], itemCategories: {} as Record<string, string>, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, categories: [], suggestions: {}, selectedItem: "", live: false, canPickup: false, run: null, frameworks: fws, today: "2026-11-20", ...over });
const order = (key: string, sub: string, projectName: string, over: Partial<WorkOrder> = {}): WorkOrder => ({ key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-10-05 10:00:00", supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId: "I1", itemName: "Orphan Sponsorship", amount: 40, quantity: 1, intention: "", subscriptionId: sub, instalmentNumber: "1", instalmentCount: "12", categoryId: "c", status: "ready", frameworkId: shared.id, projectName, planStatus: "active", planNextDue: "2026-12-05", planPaid: 1, ...over });

function built() {
  let projects = addProject([], "Aghosh Orphan Homes", ["Aghosh"]).value;
  const id = projects[0]!.id;
  projects = addLevel(projects, id, "Branch", "").value;
  projects = addType(projects, id, { name: "Child", levelId: "branch", frameworkId: shared.id }, fws).value;
  const nodes = addNode([], projects, id, "branch", "", "Branch 1", { Location: "Lahore" }).value;
  const outcomes = addBeneficiaries([], projects, nodes, { projectId: id, nodeId: nodes[0]!.id, typeId: "child", name: "Orphan", count: 2 }).value;
  // Only an active partner with approved due diligence takes gifts (DECISIONS 69).
  return { projects: projects.map((p) => ({ ...p, status: "active" as const, ddStatus: "approved" as const })), nodes, outcomes };
}

describe("allocationPage", () => {
  it("shows the summary, a directed and a general gift waiting with where each would go, and the places to drop on", () => {
    const { projects, nodes, outcomes } = built();
    const html = allocationPage(base({ projects, nodes, outcomes, workOrders: [order("1", "S1", "Aghosh"), order("2", "S2", "Where Needed Most")] }));
    expect(html).toContain("Gifts waiting");
    expect(html).toContain("Aghosh Orphan Homes");
    expect(html).toContain("Directed: Aghosh");
    expect(html).toContain("General");
    expect(html).toContain("Suggested: Branch 1 &gt; Orphan 1");
    expect(html).toContain('draggable="true"');
    expect(html).toContain('data-drop-node="');
    expect(html).toContain('data-place-select="S1"');
    expect(html).toContain("data-buffer");
  });
  it("says whether each partner takes gifts and why not, and how many gifts are asking for a place", () => {
    const { projects, nodes, outcomes } = built();
    const orders = [order("1", "S1", "Aghosh")];
    const active = allocationPage(base({ projects, nodes, outcomes, workOrders: orders }));
    expect(active).toContain("<th>Takes gifts</th>");
    expect(active).toContain("Yes, any item");
    expect(active).toContain("1 gift in all, 1 asking for a place");
    const pending = allocationPage(base({ projects: projects.map((p) => ({ ...p, status: "pending" as const })), nodes, outcomes, workOrders: orders }));
    expect(pending).toContain("No: status is pending");
    const noDd = allocationPage(base({ projects: projects.map((p) => ({ ...p, ddStatus: "pending" as const })), nodes, outcomes, workOrders: orders }));
    expect(noDd).toContain("No: due diligence is not approved");
    expect(allocationPage(base({ projects: projects.map((p) => ({ ...p, itemIds: ["A", "B"] })), nodes, outcomes, workOrders: orders }))).toContain("Yes, 2 items");
  });
  it("says so when there is nothing to place, and when there are no partners", () => {
    expect(allocationPage(base())).toContain("No partners yet");
    const { projects, nodes, outcomes } = built();
    expect(allocationPage(base({ projects, nodes, outcomes }))).toContain("Nothing is waiting");
  });
  it("never trusts a CRM project name as HTML", () => {
    const { projects, nodes, outcomes } = built();
    const html = allocationPage(base({ projects, nodes, outcomes, workOrders: [order("1", "S1", "<img src=x onerror=alert(1)>")] }));
    expect(html).not.toContain("<img");
  });
});
