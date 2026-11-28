/**
 * partner-form.test.ts
 *
 * What it does: tests the partner profile pop-up on invented data: what it asks for, that only the name and type are required, that the
 * organisation's own types, fields and items appear, that a partner being edited is filled in, and that nothing is trusted as HTML.
 * Who calls it: vitest. Depends on: partner-form.ts.
 */

import { describe, expect, it } from "vitest";
import { benefitRow, partnerProfileHtml } from "./partner-form";

const ctx = { types: ["Institute", "Contractor"], fields: ["Registration no."], items: [{ id: "MWF-WAT-001", name: "Small Water Pump" }, { id: "MWF-ORP-001", name: "Orphan Sponsorship" }], others: [{ id: "aghosh", name: "Aghosh" }] };

describe("partnerProfileHtml", () => {
  it("asks for the whole profile, with the organisation's own types, items and extra fields", () => {
    const html = partnerProfileHtml({}, "", ctx);
    for (const w of ["Who they are", "Contacts", "Where they work", "Benefits they are active for", "How they report", "Due diligence", "Notes and documents", "Extra fields", "Structure"]) expect(html).toContain(w);
    expect(html).toContain("New type...");
    expect(html).toContain(">Contractor<");
    expect(html).toContain("Small Water Pump");
    expect(html).toContain("Registration no.");
    expect(html).toContain("A copy of Aghosh");
    expect(html).toContain("Only the name and the type are required");
  });
  it("has no fixed list of types of its own", () => {
    const html = partnerProfileHtml({}, "", { ...ctx, types: [] });
    expect(html).not.toContain("Institute");
    expect(html).toContain("New type...");
  });
  it("fills in a partner being edited, ticks its items, keeps a type that is not in the list, and offers no structure copy", () => {
    const html = partnerProfileHtml({ name: "SDO", type: "Supplier", itemIds: ["MWF-WAT-001"], capacity: 40, ddStatus: "approved", custom: { "Registration no.": "R9" }, contacts: [{ name: "A Person", position: "", phone: "", mobile: "", email: "a@example.org", handles: "" }] }, "sdo", ctx);
    expect(html).toContain('value="SDO"');
    expect(html).toContain('<option value="Supplier" selected>');
    expect(html).toContain('class="pf-benrow" data-item="MWF-WAT-001"'); // its item is a line, and the other is in the selector
    expect(html).toContain('<option value="MWF-ORP-001">Orphan Sponsorship</option>');
    expect(html).not.toMatch(/value="MWF-ORP-001" checked/);
    expect(html).toContain('value="40"');
    expect(html).toContain('<option value="approved" selected>');
    expect(html).toContain('value="R9"');
    expect(html).toContain("a@example.org");
    expect(html).not.toContain("A copy of Aghosh");
  });
  it("shows an error where the person is looking, and never trusts text as HTML", () => {
    const html = partnerProfileHtml({ name: "<img src=x onerror=alert(1)>", notes: "<script>alert(1)</script>" }, "", ctx, "Give the partner a name.");
    expect(html).toContain("Give the partner a name.");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
  });
  it("lists only the benefits a partner is active for, one line each with capacity, cost and a remove button, and a selector to add another (DECISIONS 149)", () => {
    const html = partnerProfileHtml({ itemIds: ["I1"], benefitTerms: { I1: { capacity: 6, costPerUnit: 950.5 } } } as never, "p1", { types: [], items: [{ id: "I1", name: "Small Pump" }, { id: "I2", name: "Tent" }, { id: "I3", name: "Tanker" }], fields: [], others: [] } as never);
    expect((html.match(/class="pf-benrow"/g) ?? []).length).toBe(1); // only the ticked one is a line
    expect(html).toContain('class="pf-benrow" data-item="I1"');
    expect(html).toContain('value="6"');
    expect(html).toContain('value="950.5"');
    expect(html).toContain('data-pf="rm-item"');
    expect(html).toContain('<select id="pf-additem" aria-label="Add a benefit"><option value="">Add a benefit...</option><option value="I2">Tent</option><option value="I3">Tanker</option></select>'); // the others are in the selector
    expect(html).not.toContain('<option value="I1">'); // already added
    expect(html).toContain("capacity of 0 stops new work orders");
    expect(html).toContain('id="pf-benempty" hidden>'); // the "any benefit" note is hidden when there are lines
  });
  it("says it can take any benefit while none are added", () => {
    const html = partnerProfileHtml({} as never, "p1", { types: [], items: [{ id: "I1", name: "Small Pump" }], fields: [], others: [] } as never);
    expect(html).toContain('id="pf-benempty">No benefits added: this partner can take any benefit.');
    expect((html.match(/class="pf-benrow"/g) ?? []).length).toBe(0);
  });
  it("makes a benefit line with its name made safe", () => {
    expect(benefitRow("I9", "<b>x</b>")).not.toContain("<b>x</b>");
    const row = benefitRow("I9", "Pump", { costPerUnit: 250, currency: "GBP", inclusive: false, note: "Plus transport" });
    expect(row).toContain('class="pf-cur" data-item="I9" maxlength="3" placeholder="GBP" aria-label="Currency of the rate for Pump" value="GBP"');
    expect(row).toContain('value="Plus transport"');
    expect(row).toContain('role="switch"');
    expect(row).not.toMatch(/checked[^>]*data-pf-inclusive/); // not inclusive: off
    expect(benefitRow("I9", "Pump")).toMatch(/checked[^>]*data-pf-inclusive="I9"/); // all inclusive is the usual case: on
    expect(benefitRow("I9", "Pump", { capacity: 3 })).toContain('value="3"');
  });
});
