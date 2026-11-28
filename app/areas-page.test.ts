/**
 * areas-page.test.ts
 *
 * What it does: tests the Areas page (DECISIONS 275): the counts, the list of typed areas with Find place, the matches under a row, the map and the table. Invented people and places.
 * Who calls it: vitest. Depends on: areas-page.ts.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister } from "../modules/07-beneficiaries/beneficiaries";
import { areasCard, areasWindowHtml, noAreasUi } from "./areas-page";
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

describe("the Dashboard areas card and its fix window", () => {
  it("counts checked, typed and empty areas, lists each typed area once with Find place, and tables the places", () => {
    const html = areasCard(view()) + areasWindowHtml(view(), noAreasUi(true));
    expect(html).toContain("<b>4</b><span>Beneficiaries");
    expect(html).toContain("<b>1</b><span>From a checked place");
    expect(html).toContain("Fix anomalies (1)");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("<b>2</b><span>Typed, to check");
    expect(html).toContain('data-action="ar-find"');
    expect(html.match(/data-action="ar-find"/g)).toHaveLength(1); // both spellings are one area
    expect(html).toContain("Kasur District, Punjab");
    expect(html).toContain('class="ar-map"'); // the plain layout, kept as the fallback
    expect(html).toContain('id="ar-leaflet"');
    expect(html).toMatch(/data-rows="\[\{&quot;id&quot;:&quot;osm:N1&quot;/); // the places the real map draws
    expect(html).toContain("OpenStreetMap contributors");
  });
  it("shows the matches under the row being looked at, and says so while searching or when none is found", () => {
    const key = "swat valley";
    expect(areasWindowHtml(view(), { open: true, finding: key, results: [kasur], searching: false })).toContain('data-action="ar-choose"');
    expect(areasWindowHtml(view(), { open: true, finding: key, results: [], searching: true })).toContain("Searching...");
    expect(areasWindowHtml(view(), { open: true, finding: key, results: [], searching: false })).toContain("No place found");
  });
  it("is calm when there is nothing to show", () => {
    const html = areasCard({ beneficiaries: emptyRegister(), locations: [] } as unknown as View) + areasWindowHtml({ beneficiaries: emptyRegister(), locations: [] } as unknown as View, noAreasUi(true));
    expect(html).toContain("Nothing to do here");
    expect(html).toContain("The map and the table appear once one does."); // one calm message, not two
  });
});

describe("the two views and the project filter (DECISIONS 278)", () => {
  const lahore = { id: "osm:N5", name: "Lahore", district: "", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.5, lon: 74.3 };
  const v = () => {
    const base = view() as unknown as Record<string, unknown>;
    const ids = (base["beneficiaries"] as { records: { id: string }[] }).records.map((b) => b.id);
    return { ...base, locations: [kasur, lahore], giftProjects: [{ id: "g1", name: "Orphan care", clusters: [{ id: "home", name: "Home", label: "Home", parentId: "", place: "Lahore", locationId: "osm:N5", status: "active" }] }, { id: "g2", name: "Water", clusters: [] }],
      enrolments: { counter: 2, records: ids.slice(0, 2).map((b, i) => ({ id: `E${i}`, beneficiaryId: b, giftProjectId: "g1", clusterId: "home", itemId: "S", role: "", status: "active", since: "2026-01-01" })) } } as unknown as View;
  };
  it("shows where beneficiaries are from by default, with a switch and a project list", () => {
    const html = areasCard(v());
    expect(html).toContain('data-mode="from" aria-pressed="true"');
    expect(html).toContain('<option value="g1">Orphan care</option>');
    expect(html).toContain("From a checked place");
  });
  it("shows where it is served: enrolled beneficiaries at the cluster's place, though they are from elsewhere", () => {
    const html = areasCard(v(), { mode: "served", project: "" });
    expect(html).toContain("<b>2</b><span>Served at a checked place");
    expect(html).toContain("<td>Lahore</td>");
    expect(html).not.toContain("<td>Kasur</td>"); // Kasur is where one is from, not where anything is served
  });
  it("limits the view to one project", () => {
    expect(areasCard(v(), { mode: "served", project: "g2" })).toContain("<b>0</b><span>Enrolled");
    expect(areasCard(v(), { mode: "from", project: "g2" })).toContain("<b>0</b><span>Beneficiaries");
  });
});
