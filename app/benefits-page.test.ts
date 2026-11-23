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
    expect(html).toContain("Choose a kind"); // Mystery Gift
    expect(html).toContain("0 chosen, 2 suggested, 1 to choose");
  });
  it("shows a chosen kind as chosen, and counts it", () => {
    const html = benefitsPage(view({ itemKinds: { I3: "activity" } }));
    expect(html).toContain('<option value="activity" selected>Activity</option>');
    expect(html).toContain("1 chosen, 2 suggested, 0 to choose");
  });
  it("describes each kind, leaves micro finance out, and shows the workflow of each item", () => {
    const html = benefitsPage(view({ frameworks: [{ id: "w", name: "Transactional", unit: "", cycle: "on_delivery", reportType: "", unitsPerBeneficiary: 1 }], itemFramework: { I1: "w" } }));
    for (const k of ["Person(s)", "Activity", "Build", "Distribution", "Programme", "Waqf"]) expect(html).toContain(`<b>${k}</b>`);
    expect(html).not.toContain("<b>Micro finance</b>");
    expect(html).toContain("Micro finance is dealt with separately");
    expect(html).toContain("Transactional");
    expect(html).toContain("No workflow"); // the others
  });
  it("never trusts an item name as HTML", () => {
    const html = benefitsPage(view({ flaggedItems: [{ id: "I9", name: "<img src=x onerror=alert(1)>", count: 1 }] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
