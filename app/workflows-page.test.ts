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
  itemFramework: { I1: "orphan-sponsorship" }, outcomes: [], itemIcons: {}, workflowSel: { id: "orphan-sponsorship", stage: 1, parts: 2, allocated: false }, workflowSuggestions: { I2: "water-pump" }, ...over,
} as unknown as View);

describe("the Workflows page", () => {
  it("lists the workflows with their items, and shows the chosen one as a sentence and six stages", () => {
    const html = workflowsPage(view());
    expect(html).toContain("<h1>Workflows</h1>");
    for (const n of ["Orphan sponsorship", "Student sponsorship", "Water pump", "House build", "Livelihood", "Activity"]) expect(html).toContain(`<b>${n}</b>`);
    expect(html).toContain("<small>1 item</small>"); // Orphan sponsorship has one item
    expect(html).toContain("When a gift for Orphan Sponsorship arrives, Each payment is a month of support. 3 parts make one orphan");
    expect((html.match(/class="wf-node/g) ?? []).length).toBe(6);
    expect(html).toContain("3 month basic check");
  });
  it("shows the rules of the chosen stage", () => {
    const at = (stage: number) => workflowsPage(view({ workflowSel: { id: "water-pump", stage, parts: 1, allocated: false } as View["workflowSel"] }));
    expect(at(1)).toContain('<option value="share_of_whole" selected>A share of one whole</option>');
    expect(at(1)).toContain("the CRM catalogue gives the bundle sizes and the months");
    expect(at(2)).toContain('<option value="water-pump" selected>Water pump</option>');
    expect(at(2)).toContain("ID prefix");
    expect(at(3)).toContain("<b>waits as Funding</b>");
    expect(workflowsPage(view({ workflowSel: { id: "orphan-sponsorship", stage: 3, parts: 1, allocated: false } as View["workflowSel"] }))).toContain("<b>released each month</b>");
    expect(at(4)).toContain('data-ot="assign"');
    expect(at(5)).toContain("Needed before a partner takes it: <b>Location</b>");
    expect(at(6)).toContain("Installation update with GPS and photos");
    expect(at(6)).toContain('data-wf-act="task-add"');
  });
  it("draws the sample gift as pies, green when allocated and orange when not, with its explanation", () => {
    const orange = workflowsPage(view({ workflowSel: { id: "orphan-sponsorship", stage: 1, parts: 4, allocated: false } as View["workflowSel"] }));
    expect(orange).toContain('stroke="#e08a1e"');
    expect(orange).toContain("4 parts fill 2 orphans, 3 parts to each.");
    expect(workflowsPage(view({ workflowSel: { id: "orphan-sponsorship", stage: 1, parts: 1, allocated: true } as View["workflowSel"] }))).toContain('stroke="#1f8a4c"');
    expect(workflowsPage(view({ workflowSel: { id: "water-pump", stage: 1, parts: 2, allocated: false } as View["workflowSel"] }))).toContain("2 parts need 2 pumps, each paid in full before release.");
  });
  it("has the items with their workflow, a suggestion, a category label and an icon", () => {
    const html = workflowsPage(view());
    expect(html).toContain('data-itemfw="I2"');
    expect(html).toContain("suggested: Water pump");
    expect(html).toContain('data-itemcat="I1"');
    expect(html).toContain('<option value="spons" selected>Sponsorship</option>');
    expect(html).toContain('data-icon-item="I1"');
    expect(html).toContain("Suggest workflows for 1 item");
  });
  it("asks to add the standard workflows when there are none, and never lets text become HTML", () => {
    expect(workflowsPage(view({ frameworks: [], outcomeTypes: [] }))).toContain("Add the standard workflows to start");
    const evil = workflowsPage(view({ frameworks: [{ ...set.frameworks[0]!, name: "<img src=x>" }], flaggedItems: [{ id: "I1", name: "<b>x</b>", count: 1 }] as View["flaggedItems"] }));
    expect(evil).not.toContain("<img");
    expect(evil).not.toContain("<b>x</b>");
  });
});
