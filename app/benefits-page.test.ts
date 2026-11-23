/**
 * benefits-page.test.ts
 *
 * What it does: tests the Benefits page (DECISIONS 143): every item is listed with its kind (suggested until chosen), its workflow and a picker, the kinds are described, and
 * item names from the CRM are never trusted as HTML. Invented data. These tests double as examples. Who calls it: vitest. Depends on: benefits-page.ts.
 */

import { describe, expect, it } from "vitest";
import { benefitsPage } from "./benefits-page";
import type { View } from "./pages";

const view = (over: Partial<View> = {}): View => ({
  workOrders: [], review: [], itemCategories: {}, flaggedItems: [{ id: "I1", name: "Small Pump", count: 1 }, { id: "I2", name: "Orphan Sponsorship", count: 1 }, { id: "I3", name: "Mystery Gift", count: 1 }],
  filter: "all", message: "", categories: [], frameworks: [], itemFramework: {}, ...over,
} as unknown as View);

describe("the Benefits page", () => {
  it("lists every item with a kind picker, suggesting a kind from its name and asking when it cannot", () => {
    const html = benefitsPage(view());
    expect(html).toContain("<h1>Benefits</h1>");
    expect(html).toContain('data-kind-item="I1"');
    expect(html).toContain("Suggested: Build"); // Small Pump
    expect(html).toContain("Suggested: Person(s)"); // Orphan Sponsorship
    expect(html).toContain("Choose a type"); // Mystery Gift
    expect(html).toContain("0 chosen, 2 suggested, 1 to choose");
  });
  it("shows a chosen kind as chosen, and counts it", () => {
    const html = benefitsPage(view({ itemKinds: { I3: "activity" } }));
    expect(html).toContain('<option value="activity" selected>Activity</option>');
    expect(html).toContain("1 chosen, 2 suggested, 0 to choose");
  });
  it("lists the six kinds to choose from, always, with the number of items each has", () => {
    const html = benefitsPage(view());
    for (const k of ["Person(s)", "Activity", "Build", "Distribution", "Programme", "Waqf"]) expect(html).toContain(`<b>${k}</b>`);
    expect(html).not.toContain("<b>Micro finance</b>");
    expect(html).toContain("Micro finance is a fund and is dealt with separately");
    expect(html).toContain('data-kind-select="waqf"');
    expect(html).toMatch(/Build<\/b><small>1 item/); // Small Pump
    expect(html).toContain("<h2>Person(s)</h2>"); // the first one is shown when none is chosen
  });
  it("shows the features of the chosen kind: its description, properties and profile fields", () => {
    const html = benefitsPage(view({ kindSel: "build" }));
    expect(html).toContain("<h2>Build</h2>");
    expect(html).toContain('data-kf="what"');
    expect(html).toMatch(/data-kf="prop" data-prop="location" data-kind="build" checked/); // a build needs a location
    expect(html).not.toMatch(/data-kf="prop" data-prop="sensitive" data-kind="build" checked/);
    expect(html).toContain('data-prop="receiver"');
    expect(html).toContain('value="GPS location"'); // a profile field
    expect(html).toMatch(/data-kf="required" data-kind="build" data-field-id="location" checked/);
    expect(html).toContain('data-kf-act="field-add"');
    expect(html).not.toContain('data-kf-act="reset"'); // nothing changed yet
    expect(benefitsPage(view({ kindSel: "person" }))).toMatch(/data-kf="prop" data-prop="sensitive" data-kind="person" checked/);
  });
  it("shows a kind a person changed, and offers to reset it", () => {
    const changed = { build: { what: "Mine", props: { location: false, sensitive: true, eligibility: false, onBehalf: false, receiver: "" }, fields: [{ id: "x", label: "Only field", type: "text", required: false, inReport: false }] } };
    const html = benefitsPage(view({ kindSel: "build", kindFeatures: changed }));
    expect(html).toContain("Mine");
    expect(html).toContain('value="Only field"');
    expect(html).not.toContain('value="GPS location"');
    expect(html).toContain('data-kf-act="reset"');
    expect(html).toContain(", changed"); // the list says so
  });
  it("shows the workflow of each item", () => {
    const html = benefitsPage(view({ frameworks: [{ id: "w", name: "Transactional", unit: "", cycle: "on_delivery", reportType: "", unitsPerBeneficiary: 1 }], itemFramework: { I1: "w" } }));
    expect(html).toContain("Transactional");
    expect(html).toContain("No workflow"); // the others
  });
  it("never trusts an item name as HTML", () => {
    const html = benefitsPage(view({ flaggedItems: [{ id: "I9", name: "<img src=x onerror=alert(1)>", count: 1 }] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
