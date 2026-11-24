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
    expect(html).toContain('data-prop="first"');
    expect(html).toContain('<option value="gift" selected>The gift: it creates the outcome, recipients come after</option>'); // a build: the gift comes first
    expect(benefitsPage(view({ kindSel: "person" }))).toContain('<option value="beneficiary" selected>The beneficiary: enrolled first, waits for a sponsor</option>'); // a person type: the beneficiary comes first
    expect(html).toContain('value="GPS location"'); // a profile field
    expect(html).toMatch(/data-kf="required" data-kind="build" data-field-id="location" checked/);
    expect(html).toContain('data-kf-act="field-add"');
    expect(html).not.toContain('data-kf-act="reset"'); // nothing changed yet
    expect(benefitsPage(view({ kindSel: "person" }))).toMatch(/data-kf="prop" data-prop="sensitive" data-kind="person" checked/);
  });
  it("shows the rules of a type: its ID prefix, what makes a duplicate, and what happens when a beneficiary ends (DECISIONS 148)", () => {
    const html = benefitsPage(view({ kindSel: "person" }));
    expect(html).toContain('data-kf="prefix" data-kind="person" value="PRS"');
    expect(html).toContain("PRS-0001");
    expect(html).toContain("permanent and never used twice");
    expect(html).toMatch(/data-kf="dup" data-kind="person" data-field-id="full-name" checked/);
    expect(html).toMatch(/data-kf="dup" data-kind="person" data-field-id="date-of-birth" checked/);
    expect(html).not.toMatch(/data-kf="dup" data-kind="person" data-field-id="photo" checked/);
    expect(html).toContain("blocked, with a message saying the beneficiary already exists");
    expect(html).toContain('<option value="reallocate" selected>');
    expect(benefitsPage(view({ kindSel: "build" }))).toContain('<option value="unallocated" selected>');
  });
  it("shows a kind a person changed, and offers to reset it", () => {
    const changed = { build: { what: "Mine", props: { location: false, sensitive: true, eligibility: false, onBehalf: false, receiver: "", first: "gift" }, fields: [{ id: "x", label: "Only field", type: "text", required: false, inReport: false }] } };
    const html = benefitsPage(view({ kindSel: "build", kindFeatures: changed }));
    expect(html).toContain("Mine");
    expect(html).toContain('value="Only field"');
    expect(html).not.toContain('value="GPS location"');
    expect(html).toContain('data-kf-act="reset"');
    expect(html).toContain(", changed"); // the list says so
  });
  it("shows, for each item, the projects that offer it, the partners that can take it, and whether it is connected end to end (DECISIONS 156)", () => {
    const partner = { id: "p", name: "Aghosh", status: "active", ddStatus: "approved", aliases: [], levels: [], types: [], itemIds: ["I1"] };
    const fw = { id: "w", name: "Transactional", unit: "", cycle: "on_delivery", reportType: "", unitsPerBeneficiary: 1 } as never;
    const html = benefitsPage(view({ frameworks: [fw], itemFramework: { I1: "w", I2: "w" }, projects: [partner] as never, today: "2026-11-23", giftProjects: [{ id: "d", name: "Dadyal", crmNames: [], partnerIds: ["p"], itemIds: ["I1"] }] as never }));
    expect(html).toContain("<th>Projects</th><th>Partners</th><th>Connected</th>");
    expect(html).toContain('title="Dadyal">1 project</td>');
    expect(html).toContain('title="Aghosh">1 partner</td>');
    expect(html).toContain('<span class="pill ok" title="Connected: workflow, type and a partner">Ready</span>'); // Small Pump has all three
    expect(html).toMatch(/title="No partner can take it">No partner can take it<\/span>/); // Orphan Sponsorship: Aghosh delivers only the pump
    expect(html).toContain("No workflow, No type, No partner can take it"); // Mystery Gift: nothing connected
    expect(html).toContain("1 of 3</b> items are connected end to end");
  });
  it("leaves Custom Amount items for later", () => {
    const html = benefitsPage(view({ flaggedItems: [{ id: "C1", name: "Custom Amount", count: 3 }] as never, workOrders: [{ key: "k", itemId: "C1", customAmount: true, status: "ready" }] as never }));
    expect(html).toContain("custom, later");
    expect(html).toContain("1 custom amount item left for later");
    expect(html).not.toContain(">Ready<");
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
