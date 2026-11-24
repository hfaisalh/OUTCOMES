/**
 * assignment-page.test.ts
 *
 * What it does: tests the Assignment page (DECISIONS 170) on invented gifts and partners: the counts, the room left with each partner, the gifts with who each goes to or why no one, the lists of eligible partners,
 * the filter, the empty states, and that names are never trusted as HTML. These tests double as examples. Who calls it: vitest. Depends on: assignment-page.ts.
 */

import { describe, expect, it } from "vitest";
import { assignmentPage } from "./assignment-page";
import type { View } from "./pages";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import type { Project } from "../modules/06-projects/projects";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T-${key}`, paidDate: `2026-10-${key.slice(-2)}`, supporterId: "S1", supporterName: "Invented Donor", group: "", itemId: "I10", itemName: "Orphan Sponsorship Monthly", amount: 30, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "sponsorship", status: "ready", ...over,
});
const partner = (id: string, name: string, cap: number, over: Partial<Project> = {}): Project => ({ id, name, aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", ddReview: "2027-12-31", itemIds: ["I10"], benefitTerms: { I10: { capacity: cap } }, ...over });
const view = (over: Partial<View> = {}): View => ({
  workOrders: [wo("G01"), wo("G02"), wo("G03", { projectName: "Nowhere" })], projects: [partner("trust", "Trust", 1), partner("backup", "Backup", 5)], giftProjects: [], frameworks: [{ id: "wf", assign: "auto" } as FrameworkTemplate], outcomeTypes: [], today: "2026-11-24", ...over,
}) as View;

describe("the Assignment page", () => {
  it("counts the gifts that need a partner, the ones ready, the assigned and those that wait", () => {
    const html = assignmentPage(view());
    expect(html).toContain("<h1>Assignment</h1>");
    expect(html).toContain("<b>3</b><span>Need a partner</span>");
    expect(html).toContain("<b>2</b><span>Have a partner ready</span>");
    expect(html).toContain("<b>0</b><span>Assigned</span>");
    expect(html).toContain('<div class="metric warn"><b>1</b><span>Wait, no partner with room</span>');
    expect(html).toContain('data-asg="run"');
    expect(html).toContain('data-asg="reset" disabled'); // nothing assigned yet
  });
  it("shows the room left with each partner, and the first partner each gift would go to, with the reason", () => {
    const html = assignmentPage(view());
    expect(html).toContain("<td>Trust</td><td>Orphan Sponsorship Monthly</td><td class=\"num\">1</td><td class=\"num\">0</td><td class=\"num\">1</td>");
    expect(html).toContain("Goes to Trust (1 of 1 units free)");
    expect(html).toContain("Goes to Backup (5 of 5 units free)"); // the trust is full after the first gift
    expect(html).toContain("Will be assigned automatically");
    expect(html).toContain("The project Nowhere is not set up yet.");
    expect(html).toContain('<option value="">No partner with room</option>');
  });
  it("shows an assigned gift with its partner and a button to take it back, and enables Reset", () => {
    const html = assignmentPage(view({ assignments: { records: [{ key: "G01", partnerId: "backup", giftProjectId: "", itemId: "I10", parts: 1, how: "auto", at: "x" }] } }));
    expect(html).toContain('<span class="pill">Assigned</span>');
    expect(html).toContain('<option value="backup" selected>Backup</option>');
    expect(html).toContain('data-asg="unassign" data-key="G01"');
    expect(html).not.toContain('data-asg="reset" disabled');
  });
  it("offers only partners that are eligible for the item, never a lapsed one", () => {
    const html = assignmentPage(view({ projects: [partner("trust", "Trust", 5), partner("lapsed", "Lapsed", 5, { status: "pending" }), partner("other", "Other", 5, { itemIds: ["I99"] })] }));
    expect(html).toContain('<option value="trust"');
    expect(html).not.toContain("Lapsed</option>");
    expect(html).not.toContain("Other</option>");
  });
  it("filters to the gifts that need a partner or are assigned, and says so when there are none", () => {
    const a = { records: [{ key: "G01", partnerId: "backup", giftProjectId: "", itemId: "I10", parts: 1, how: "auto" as const, at: "x" }] };
    expect(assignmentPage(view({ assignments: a, assignFilter: "assigned" }))).not.toContain('data-key="G02"');
    expect(assignmentPage(view({ assignments: a, assignFilter: "open" }))).not.toContain('data-key="G01"');
    expect(assignmentPage(view({ workOrders: [] }))).toContain("No gifts here.");
    expect(assignmentPage(view({ projects: [] }))).toContain("No partner delivers a benefit yet.");
  });
  it("never trusts a name as HTML", () => {
    const html = assignmentPage(view({ workOrders: [wo("G01", { supporterName: "<img src=x onerror=alert(1)>", itemName: "<script>1</script>" })] }));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
  });
});
