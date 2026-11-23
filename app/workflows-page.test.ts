/**
 * workflows-page.test.ts
 *
 * What it does: tests the Workflows page (DECISIONS 130): the list, the sentence, the flow, each stage's rules, the sample gift and the items table, and that CRM text cannot become HTML.
 * Invented data. Who calls it: vitest. Depends on: workflows-page.ts and the starting workflows.
 */

import { describe, expect, it } from "vitest";
import { addStarterWorkflows } from "../modules/02-project-rules/workflows";
import { starterOutcomeTypes } from "../modules/05-outcomes/outcome-types";
import { workflowsPage } from "./workflows-page";
import type { View } from "./pages";

const set = addStarterWorkflows([], starterOutcomeTypes());
const view = (over: Partial<View> = {}): View => ({
  workOrders: [], review: [], categories: [{ id: "spons", name: "Sponsorship", keywords: [], frameworkId: "" }], itemCategories: { I1: "spons", I2: "spons" },
  flaggedItems: [{ id: "I1", name: "Orphan Sponsorship", count: 1 }, { id: "I2", name: "Small Pump", count: 1 }], frameworks: set.frameworks, outcomeTypes: set.types,
  itemFramework: { I1: "orphan-sponsorship" }, outcomes: [], itemIcons: {}, workflowSel: { id: "orphan-sponsorship", stage: 1, parts: 2, allocated: false, pick: "" }, workflowSuggestions: { I2: "water-pump" }, ...over,
} as unknown as View);

describe("the Workflows page", () => {
  it("lists the workflows with their items, and shows the chosen one as a sentence and six stages", () => {
    const html = workflowsPage(view());
    expect(html).toContain("<h1>Workflows</h1>");
    for (const n of ["Orphan sponsorship", "Student sponsorship", "Water pump", "House build", "Livelihood", "Activity"]) expect(html).toContain(`<b>${n}</b>`);
    expect(html).toContain("<small>1 item</small>"); // Orphan sponsorship has one item
    expect(html).toContain("When a gift for Orphan Sponsorship arrives, each unit supports a share of an orphan: 3 units make one orphan");
    expect((html.match(/class="wf-node/g) ?? []).length).toBe(6);
    expect(html).toContain("3 month basic check");
    const words = html.replace(/<[^>]*>/g, " ");
    expect(words).not.toMatch(/\bparts?\b/i); // units and shares, never parts or instalments, on this page
    expect(words).not.toMatch(/instalment/i);
    expect(html).not.toContain("What one delivery is");
    expect(html).not.toContain("Category");
  });
  it("asks how a unit supports an outcome, with three answers worded by the outcome, and the number of units for a share", () => {
    const at = (id: string) => workflowsPage(view({ workflowSel: { id, stage: 1, parts: 1, allocated: false, pick: "" } }));
    const orphan = at("orphan-sponsorship");
    expect(orphan).toContain("<h3>Outcome unit allocation</h3>");
    expect(orphan).toContain('data-wf-shares="orphan-sponsorship" value="3"'); // units that make one orphan
    expect(orphan).toContain("Split: 3 units make one outcome");
    expect(orphan).not.toContain("<select data-wf-mode"); // no dropdown any more
    expect(orphan).not.toContain("data-wf-full=\"orphan-sponsorship\" checked");
    expect(at("student-sponsorship")).toContain("Complete: one unit is one whole outcome.");
    const pump = at("water-pump");
    expect(pump).toContain('data-wf-full="water-pump" checked'); // release only when fully paid
    expect(pump).toContain('data-wf-shares="water-pump" value="1" disabled');
    expect(pump).not.toMatch(/Unit(s)? support/i);
    expect(pump).not.toContain("PUMP"); // generic wording
  });
  it("shows the rules of the chosen stage", () => {
    const at = (stage: number) => workflowsPage(view({ workflowSel: { id: "water-pump", stage, parts: 1, allocated: false, pick: "" } }));
    expect(at(2)).toContain('<option value="water-pump" selected>Water pump</option>');
    expect(at(2)).toContain("ID prefix");
    expect(at(3)).toContain("<b>waits as Funding</b>");
    expect(workflowsPage(view({ workflowSel: { id: "orphan-sponsorship", stage: 3, parts: 1, allocated: false, pick: "" } }))).toContain("<b>released each month</b>");
    expect(at(4)).toContain('data-ot="assign"');
    expect(at(5)).toContain("Needed before a partner takes it: <b>Location</b>");
    expect(at(6)).toContain("Installation update with GPS and photos");
    expect(at(6)).toContain('data-wf-act="task-add"');
  });
  it("draws one outcome as a pie split into as many slices as units make it", () => {
    const sel = (id: string) => ({ id, stage: 1, parts: 1, allocated: false, pick: "" });
    const orphan = workflowsPage(view({ workflowSel: sel("orphan-sponsorship") }));
    expect(orphan).toContain("3 units make one orphan. Each donor's unit is one slice");
    expect((orphan.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(workflowsPage(view({ workflowSel: sel("water-pump") }))).toContain("One unit is the whole water pump, released when it is fully paid.");
  });
  it("has a pool of unassigned items and the items of the workflow, to drag between, and no category (DECISIONS 131)", () => {
    const html = workflowsPage(view());
    expect(html).toContain("Add items to Orphan sponsorship");
    expect(html).toContain('data-wf-drop=""'); // the pool
    expect(html).toContain('data-wf-select="orphan-sponsorship">'); // the list only selects, it is not a drop target
    expect(html).not.toContain('data-wf-select="orphan-sponsorship" data-wf-drop');
    expect(html).toContain('data-wf-drop="orphan-sponsorship">'); // only the open workflow takes items
    expect(html.split("wf-assign-arrow")[1]).toContain('data-wf-item="I1"'); // Orphan Sponsorship is in this workflow
    // Small Pump has no workflow of its own here, so it is in the pool with the name of the workflow it suggests
    const pool = html.split("wf-assign-arrow")[0] ?? "";
    expect(pool).toContain('data-wf-item="I2"');
    expect(pool).toContain("Water pump?");
    expect(pool).not.toContain('data-wf-item="I1"'); // an item in a workflow is not available to the others
    expect(html).toContain("Suggest 1 workflow from the item names");
    expect(html).toContain('data-icon-item="I1"'); // icons kept
    // a tapped item is marked, ready for a tap on a workflow
    expect(workflowsPage(view({ workflowSel: { id: "orphan-sponsorship", stage: 1, parts: 1, allocated: false, pick: "I2" } }))).toContain("wf-chip sel");
  });
  it("asks to add the standard workflows when there are none, and never lets text become HTML", () => {
    expect(workflowsPage(view({ frameworks: [], outcomeTypes: [] }))).toContain("Add the standard workflows to start");
    const evil = workflowsPage(view({ frameworks: [{ ...set.frameworks[0]!, name: "<img src=x>" }], flaggedItems: [{ id: "I1", name: "<b>x</b>", count: 1 }] as View["flaggedItems"] }));
    expect(evil).not.toContain("<img");
    expect(evil).not.toContain("<b>x</b>");
  });
});
