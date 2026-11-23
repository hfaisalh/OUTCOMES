/**
 * partner-form.test.ts
 *
 * What it does: tests the partner profile pop-up on invented data: what it asks for, that only the name and type are required, that the
 * organisation's own types, fields and items appear, that a partner being edited is filled in, and that nothing is trusted as HTML.
 * Who calls it: vitest. Depends on: partner-form.ts.
 */

import { describe, expect, it } from "vitest";
import { partnerProfileHtml } from "./partner-form";

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
    expect(html).toMatch(/value="MWF-WAT-001" checked/);
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
  it("asks for a capacity and a cost per unit beside each benefit, and fills them in for a partner being edited (DECISIONS 149)", () => {
    const html = partnerProfileHtml({ itemIds: ["I1"], benefitTerms: { I1: { capacity: 6, costPerUnit: 950.5 } } } as never, "p1", { types: [], items: [{ id: "I1", name: "Small Pump" }, { id: "I2", name: "Tent" }], fields: [], others: [] } as never);
    expect(html).toContain('<table><thead><tr><th>Benefit</th><th class="num">Capacity</th><th class="num">Cost per unit</th></tr></thead>'); // one row per benefit, in aligned columns
    expect(html).toContain('class="pf-cap" data-item="I1"');
    expect(html).toMatch(/class="pf-cap" data-item="I2"[^>]*disabled/); // not ticked, so not filled in
    expect(html).not.toMatch(/class="pf-cap" data-item="I1"[^>]*disabled/);
    expect(html).toContain('value="6"');
    expect(html).toContain('value="950.5"');
    expect(html).toContain('class="pf-cost" data-item="I2"');
    expect(html).toContain("capacity of 0 stops new work orders");
  });
  it("asks for the legal, funding and safeguarding details, and suggests the usual document titles (DECISIONS 151)", () => {
    const html = partnerProfileHtml({ registrationNumber: "REG-1", fundingMethod: "banking", safeguardingLead: "A. Lead" } as never, "p1", { types: [], items: [], fields: [], others: [] } as never);
    for (const w of ["Legal and funding", "Safeguarding", "Registration number", "How money is sent to them"]) expect(html).toContain(w);
    expect(html).toContain('value="REG-1"');
    expect(html).toContain('<option value="banking" selected>Regulated banking</option>');
    expect(html).toContain('value="A. Lead"');
    expect(html).toContain('list="pf-doctitles"');
    expect(html).toContain('<option value="Safeguarding policy">');
    expect(html).toContain("does not manage money");
  });
});
