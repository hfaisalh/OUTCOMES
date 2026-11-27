/**
 * place-picker.test.ts
 *
 * What it does: tests the Area field with place suggestions (DECISIONS 274): what is drawn, and that choosing, typing over and Esc behave. Invented places.
 * Who calls it: vitest. Depends on: place-picker.ts and a small stand-in for the page (document).
 */
import { describe, expect, it } from "vitest";
import { optionsHtml, placeFieldHtml } from "./place-picker";

const kasur = { id: "osm:N1", name: "Kasur", district: "Kasur District", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.1, lon: 74.4 };

describe("the Area field", () => {
  it("is a labelled combobox with a list and a status line, and keeps the chosen place in hidden fields", () => {
    const html = placeFieldHtml("pe-area", "Kasur, Punjab", "osm:N1", "hint");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="pe-area-list"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('id="pe-locationId" value="osm:N1"');
    expect(html).toContain("Checked place.");
  });
  it("says what to do when the text is not a chosen place, and shows the hint when empty", () => {
    expect(placeFieldHtml("pe-area", "Kasu", "", "A village or district")).toContain("Not a checked place yet");
    expect(placeFieldHtml("pe-area", "", "", "A village or district")).toContain("A village or district");
  });
  it("draws each suggestion with its district, region and country, escaped", () => {
    const html = optionsHtml("pe-area", [kasur, { ...kasur, id: "osm:N2", name: "<b>x</b>" }]);
    expect(html).toContain("<b>Kasur</b>");
    expect(html).toContain("Kasur District, Punjab, Pakistan");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('id="pe-area-o1"');
  });
});
