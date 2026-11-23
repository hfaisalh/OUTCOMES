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
    expect(html).toContain("Items assigned to this workflow follow these set rules.");
    for (const n of [1, 2, 3, 4, 5, 6]) expect(html).toContain(`data-wf-stage="${n}"`); // the flow chart has a step for each stage
    expect(html).toContain("2 checks"); // the review step of the chart counts the MEAL checks
    const words = html.replace(/<[^>]*>/g, " ");
    expect(words).not.toMatch(/\bparts?\b/i); // units and shares, never parts or instalments, on this page
    expect(words).not.toMatch(/instalment/i);
    expect(html).not.toContain("What one delivery is");
    expect(html).not.toContain("Category");
  });
  it("asks how a unit supports an outcome, with three answers worded by the outcome, and the number of units for a share", () => {
    const at = (id: string) => workflowsPage(view({ workflowSel: { id, stage: 1, parts: 1, allocated: false, pick: "" } }));
    const orphan = at("orphan-sponsorship");
    expect(orphan).toContain("<h3>Work orders: gift into units and shares</h3>");
    expect(orphan).toContain('data-wf-shares="orphan-sponsorship" value="3"'); // units that make one orphan
    expect(orphan).toContain("data-wf-shares");
    expect(orphan).not.toContain("<select data-wf-mode"); // no dropdown any more
    expect(orphan).not.toContain("data-wf-full=\"orphan-sponsorship\" checked");
    expect(at("student-sponsorship")).toContain('data-wf-shares="student-sponsorship" value="1"');
    const pump = at("water-pump");
    expect(pump).toContain('data-wf-full="water-pump" checked'); // release only when fully paid
    expect(pump).toContain('data-wf-shares="water-pump" value="1" disabled');
    expect(pump).not.toMatch(/Unit(s)? support/i);
    expect(pump.replace(/<[^>]*>/g, " ").match(/PUMP/g)).toBeNull(); // generic wording: no kind of outcome named in the rule
  });
  it("shows the rules of the chosen stage", () => {
    const at = (stage: number, id = "water-pump") => workflowsPage(view({ workflowSel: { id, stage, parts: 1, allocated: false, pick: "" } }));
    expect(at(1)).toContain("Release only when fully paid");
    expect(at(1)).toContain("wf-rule");
    expect(at(2)).toContain("Decision: assignment for implementation");
    expect(at(2)).toContain('data-wf-assign="water-pump"');
    expect(at(2)).toContain('<option value="suggest" selected>'); // a pump is assigned by a person
    expect(at(2, "orphan-sponsorship")).toContain('<option value="auto" selected>');
    expect(at(2)).toMatch(/data-wf-flag="reassign" data-wf="water-pump" checked/);
    expect(at(2)).toMatch(/data-wf-flag="urgent" data-wf="water-pump" checked/);
    expect(at(3)).toContain("Decision: the partner confirms the batch");
    expect(at(3)).toContain('data-wf-confirm="days"');
    expect(at(3)).toContain('data-wf-confirm="tell"');
    expect(at(4)).toContain("Allocation: the outcome profile");
    expect(at(4)).toContain('data-wf-sub="days"');
    expect(at(4)).toContain("Basic details");
    expect(at(4)).toContain("Tell the donor that it is done");
    expect(at(5)).toContain("Decision: approval");
    expect(at(5)).toMatch(/data-wf-flag="approve" data-wf="water-pump" checked/);
    expect(at(5)).toContain("Installation update with GPS and photos"); // the checks
    expect(at(5)).toContain('data-wf-act="task-add"');
    expect(at(6)).toContain("Decision: reporting protocol");
    expect(at(6)).toContain("A transactional order");
    expect(at(6, "orphan-sponsorship")).toContain("A living order");
    expect(at(4)).not.toContain("wf-pie"); // no pie on this stage
    expect(at(4)).not.toContain("ID prefix"); // the outcome is set by the item
  });
  it("draws one outcome as a pie split into as many slices as units make it", () => {
    const sel = (id: string) => ({ id, stage: 1, parts: 1, allocated: false, pick: "" });
    const orphan = workflowsPage(view({ workflowSel: sel("orphan-sponsorship") }));
    expect(orphan).toContain("3 units make one outcome.");//");
    expect((orphan.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(workflowsPage(view({ workflowSel: sel("water-pump") }))).toContain("1 unit: a whole outcome.");
  });
  it("lists every item with a switch: on in this workflow, off when unassigned, locked when in another (DECISIONS 133)", () => {
    const html = workflowsPage(view());
    expect(html).toContain("Switch an item on to put it in Orphan sponsorship");
    expect(html).toMatch(/data-wf-toggle="I1" data-wf="orphan-sponsorship" checked/); // Orphan Sponsorship is in this workflow
    expect(html).toMatch(/data-wf-toggle="I2"[^>]*aria-label/); // Small Pump has no workflow
    expect(html).not.toMatch(/data-wf-toggle="I2"[^>]*disabled/);
    expect(html).toContain("Suggested: Water pump");
    expect(html).not.toContain("data-wf-drop"); // no drag and drop any more
    const other = workflowsPage(view({ workflowSel: { id: "water-pump", stage: 1, parts: 1, allocated: false, pick: "" } }));
    expect(other).toMatch(/data-wf-toggle="I1"[^>]*disabled/); // in another workflow, so locked here
    expect(other).toContain("Orphan sponsorship"); // and it says which one
    expect(html).not.toContain("Category");
  });
  it("gives each workflow its own icon, a target when none is chosen, and a picker for it (DECISIONS 134)", () => {
    const html = workflowsPage(view({ workflowSel: { id: "water-pump", stage: 1, parts: 1, allocated: false, pick: "" } }));
    expect(html).toContain('data-wf-iconopen="water-pump"');
    expect(html).toMatch(/data-wf-iconopen="water-pump"[\s\S]{0,160}title="Water pump"/); // its own icon, the pump here
    const plain = workflowsPage(view({ frameworks: [{ id: "x", name: "Transactional", unit: "", cycle: "on_delivery", reportType: "", unitsPerBeneficiary: 1 }], workflowSel: { id: "x", stage: 1, parts: 1, allocated: false, pick: "" } }));
    expect(plain).toMatch(/data-wf-iconopen="x"[\s\S]{0,160}title="Transactional"/);
    expect(plain).toContain('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>'); // a target
  });
  it("shows the flow chart with rule icons, and opens an icon library popup to choose from (DECISIONS 135)", () => {
    const html = workflowsPage(view());
    expect(html).toContain('class="fc"');
    expect(html).toContain("order units &amp; shares");
    expect(html).toContain("Rule: gift into work order units and shares");
    expect(html).toContain('data-wf-iconopen="orphan-sponsorship"'); // the icon itself opens the library
    expect(html).not.toContain("wf-modal"); // closed until it is clicked
    expect(html).not.toContain('data-tpl="icon"'); // no dropdown any more
    const open = workflowsPage(view({ workflowSel: { id: "orphan-sponsorship", stage: 1, parts: 1, allocated: false, pick: "", iconPick: "tent" } }));
    expect(open).toContain("wf-modal");
    expect(open).toMatch(/data-wf-iconchoose="tent" aria-pressed="true"/);
    expect(open).toContain('data-wf-iconok="orphan-sponsorship"');
    expect(open).toContain("data-wf-iconcancel");
  });
});
