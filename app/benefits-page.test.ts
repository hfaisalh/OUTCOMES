/**
 * benefits-page.test.ts
 *
 * What it does: tests the Benefits page (DECISIONS 143): every item is listed with its kind (suggested until chosen), its workflow and a picker, the kinds are described, and
 * item names from the CRM are never trusted as HTML. Invented data. These tests double as examples. Who calls it: vitest. Depends on: benefits-page.ts.
 */

import { describe, expect, it } from "vitest";
import { benefitsPage } from "./benefits-page";
import type { View } from "./pages";

import { addStarterKinds } from "../modules/05-outcomes/outcome-types";

const kinds = addStarterKinds([]).types;
const view = (over: Partial<View> = {}): View => ({
  workOrders: [], review: [], itemCategories: {}, flaggedItems: [{ id: "I1", name: "Small Pump", count: 1 }, { id: "I2", name: "Orphan Sponsorship", count: 1 }, { id: "I3", name: "Mystery Gift", count: 1 }],
  filter: "all", message: "", categories: [], frameworks: [], itemFramework: {}, outcomeTypes: kinds, outcomes: [], ...over,
} as unknown as View);

describe("the Benefits page", () => {
  it("lists every item with a kind picker, suggesting a kind from its name and asking when it cannot", () => {
    const html = benefitsPage(view());
    expect(html).toContain("<h1>Benefits</h1>");
    expect(html).toContain('data-kind-item="I1"');
    expect(html).toContain("Suggested: Build"); // Small Pump
    expect(html).toContain("Suggested: Person(s)"); // Orphan Sponsorship
    expect(html).toContain("Choose a kind"); // Mystery Gift
    expect(html).toContain("0 chosen, 2 suggested, 1 to choose");
  });
  it("shows a chosen kind as chosen, counts it, and offers only the kinds the organisation has", () => {
    const html = benefitsPage(view({ itemKinds: { I3: "activity" } }));
    expect(html).toContain('<option value="activity" selected>Activity</option>');
    expect(html).toContain("1 chosen, 2 suggested, 0 to choose");
    expect(benefitsPage(view({ outcomeTypes: kinds.filter((k) => k.id !== "build") }))).not.toContain("Suggested: Build"); // no Build kind, so no suggestion
  });
  it("lists the kinds to choose and configure, with its properties and profile fields", () => {
    const html = benefitsPage(view({ kindSel: "build" }));
    for (const k of ["Person(s)", "Activity", "Build", "Distribution", "Programme", "Waqf"]) expect(html).toContain(`<b>${k}</b>`);
    expect(html).not.toContain("<b>Micro finance</b>");
    expect(html).toContain('data-kind-select="build"');
    expect(html).toContain('<h2>Build</h2>');
    expect(html).toContain('data-ot="blurb"');
    expect(html).toMatch(/data-ot="prop" data-prop="location" data-type-id="build" checked/); // a build needs a location
    expect(html).not.toMatch(/data-ot="prop" data-prop="sensitive" data-type-id="build" checked/);
    expect(html).toContain('data-prop="receiver"');
    expect(html).toContain("GPS location"); // a profile field
    expect(html).not.toContain('data-ot="assign"'); // assignment is a workflow decision now
        expect(benefitsPage(view({ kindSel: "person" }))).toMatch(/data-prop="sensitive" data-type-id="person" checked/);
  });
  it("offers to add the standard kinds when some are missing, and lets a kind be added", () => {
    const html = benefitsPage(view({ outcomeTypes: [] }));
    expect(html).toContain('data-ot-act="kinds-starters"');
    expect(html).toContain("Add the standard kinds to start");
    expect(html).toContain('id="newot"');
    expect(benefitsPage(view())).not.toContain('data-ot-act="kinds-starters"');
  });
  it("shows the workflow of each item", () => {
    const html = benefitsPage(view({ frameworks: [{ id: "w", name: "Transactional", unit: "", cycle: "on_delivery", reportType: "", unitsPerBeneficiary: 1 }], itemFramework: { I1: "w" } }));
    expect(html).toContain("Transactional");
    expect(html).toContain("No workflow"); // the others
    expect(html).toContain("Micro finance is a fund");
  });
  it("never trusts an item name as HTML", () => {
    const html = benefitsPage(view({ flaggedItems: [{ id: "I9", name: "<img src=x onerror=alert(1)>", count: 1 }] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
