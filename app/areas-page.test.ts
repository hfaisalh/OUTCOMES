/**
 * areas-page.test.ts
 *
 * What it does: tests the Areas page (DECISIONS 275): the counts, the list of typed areas with Find place, the matches under a row, the map and the table. Invented people and places.
 * Who calls it: vitest. Depends on: areas-page.ts.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister } from "../modules/07-beneficiaries/beneficiaries";
import { areasPage, noAreasUi } from "./areas-page";
import type { View } from "./pages";

const kasur = { id: "osm:N1", name: "Kasur", district: "Kasur District", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.1, lon: 74.4 };
function view(): View {
  let r = emptyRegister();
  for (const [name, area, locationId] of [["Amina Khan", "Kasur", "osm:N1"], ["Bilal Ahmed", "Swat Valley", ""], ["Chand Bibi", "swat valley", ""], ["Dawood Ali", "", ""]] as const) {
    const x = addBeneficiary(r, "person", { name, area, ...(locationId ? { locationId } : {}) }, true, "2026-11-01");
    if ("error" in x) throw new Error(x.error);
    r = x.value;
  }
  return { beneficiaries: r, locations: [kasur] } as unknown as View;
}

describe("the Areas page", () => {
  it("counts checked, typed and empty areas, lists each typed area once with Find place, and tables the places", () => {
    const html = areasPage(view(), noAreasUi());
    expect(html).toContain("<b>4</b><span>Beneficiaries");
    expect(html).toContain("<b>1</b><span>With a checked place");
    expect(html).toContain("<b>2</b><span>Typed, to check");
    expect(html).toContain('data-action="ar-find"');
    expect(html.match(/data-action="ar-find"/g)).toHaveLength(1); // both spellings are one area
    expect(html).toContain("Kasur District, Punjab");
    expect(html).toContain('class="ar-map"');
  });
  it("shows the matches under the row being looked at, and says so while searching or when none is found", () => {
    const key = "swat valley";
    expect(areasPage(view(), { finding: key, results: [kasur], searching: false })).toContain('data-action="ar-choose"');
    expect(areasPage(view(), { finding: key, results: [], searching: true })).toContain("Searching...");
    expect(areasPage(view(), { finding: key, results: [], searching: false })).toContain("No place found");
  });
  it("is calm when there is nothing to show", () => {
    const html = areasPage({ beneficiaries: emptyRegister(), locations: [] } as unknown as View, noAreasUi());
    expect(html).toContain("Nothing to do here");
    expect(html).toContain("The map appears when");
  });
});
