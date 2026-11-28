/**
 * areas.test.ts
 *
 * What it does: tests the Area rules (DECISIONS 275): unchecked areas, resolving them for everyone who typed them, counts by place and the map layout. Invented people and places.
 * Who calls it: vitest. Depends on: areas.ts and the register.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister, type Register } from "../07-beneficiaries/beneficiaries";
import { areaReport, mapPoints, projectBeneficiaries, resolveArea, servedReport, uncheckedAreas } from "./areas";
import type { Place } from "./locations";

const kasur: Place = { id: "osm:N1", name: "Kasur", district: "Kasur District", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.1, lon: 74.4 };
const swat: Place = { id: "osm:N2", name: "Swat", district: "", region: "Khyber", country: "Pakistan", countryCode: "PK", lat: 35.2, lon: 72.4 };

function reg(list: [string, string, string?][]): Register {
  let r = emptyRegister();
  for (const [name, area, locationId] of list) {
    const x = addBeneficiary(r, "person", { name, area, ...(locationId ? { locationId } : {}) }, true, "2026-11-01");
    if ("error" in x) throw new Error(x.error);
    r = x.value;
  }
  return r;
}

describe("areas still to check", () => {
  const r = reg([["Amina Khan", "Kasur"], ["Bilal Ahmed", " kasúr "], ["Chand Bibi", "Swat"], ["Dawood Ali", "Kasur, Punjab", "osm:N1"], ["Eman Noor", ""]]);
  it("lists typed areas once with a count, biggest first, skipping checked and empty ones", () => {
    const u = uncheckedAreas(r);
    expect(u.map((x) => [x.text, x.count])).toEqual([["Kasur", 2], ["Swat", 1]]);
    expect(u[0]?.ids).toHaveLength(2);
  });
  it("one choice fixes everyone who typed it, whatever the case or accents, and leaves the others", () => {
    const out = resolveArea(r, "KASUR", kasur);
    expect(out.changed).toBe(2);
    expect(out.register.records.filter((b) => b.locationId === "osm:N1").map((b) => b.area)).toEqual(["Kasur, Kasur District, Punjab, Pakistan", "Kasur, Kasur District, Punjab, Pakistan", "Kasur, Punjab"]);
    expect(uncheckedAreas(out.register).map((x) => x.text)).toEqual(["Swat"]);
    expect(resolveArea(r, "", kasur).changed).toBe(0);
  });
});

describe("counting by place", () => {
  const r = reg([["Amina Khan", "Kasur, X", "osm:N1"], ["Bilal Ahmed", "Kasur, X", "osm:N1"], ["Chand Bibi", "Swat", "osm:N2"], ["Dawood Ali", "Somewhere"], ["Eman Noor", ""]]);
  it("counts checked beneficiaries per place and country, and says how many are unchecked or have no area", () => {
    const rep = areaReport(r, [kasur, swat]);
    expect(rep.places.map((p) => [p.name, p.count])).toEqual([["Kasur", 2], ["Swat", 1]]);
    expect(rep.countries).toEqual([{ country: "Pakistan", count: 3 }]);
    expect([rep.checked, rep.unchecked, rep.none]).toEqual([3, 1, 1]);
  });
  it("treats a place id that is not in the list as unchecked, not as a place", () => {
    expect(areaReport(r, [swat]).unchecked).toBe(3);
  });
  it("lays places out on a square, the biggest with the biggest dot, north at the top", () => {
    const pts = mapPoints(areaReport(r, [kasur, swat]).places);
    const k = pts.find((p) => p.id === "osm:N1")!, s = pts.find((p) => p.id === "osm:N2")!;
    expect(k.r).toBeGreaterThan(s.r);
    expect(s.y).toBeLessThan(k.y); // Swat is further north
    expect(s.x).toBeLessThan(k.x); // and further west
    expect(mapPoints([])).toEqual([]);
    const one = mapPoints([{ ...kasur, count: 1 }])[0]!;
    expect([one.x, one.y]).toEqual([50, 50]);
  });
});

describe("where it is served, apart from where beneficiaries are from (DECISIONS 278)", () => {
  const lahore: Place = { id: "osm:N5", name: "Lahore", district: "", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.5, lon: 74.3 };
  const clusters = [
    { id: "home", name: "Home", label: "Home", parentId: "", place: "Lahore", locationId: "osm:N5", status: "active" as const },
    { id: "block", name: "Block A", label: "Block", parentId: "home", place: "", status: "active" as const },
    { id: "far", name: "Far", label: "Home", parentId: "", place: "", status: "active" as const },
  ];
  const enr = (id: string, beneficiaryId: string, clusterId: string, giftProjectId = "g1", status: "active" | "ended" = "active", itemId = "S") => ({ id, beneficiaryId, giftProjectId, clusterId, itemId, role: "", status, since: "2026-01-01" });
  const projects = [{ id: "g1", clusters }, { id: "g2", clusters: [] }];

  it("counts enrolments by the place of their cluster, a sub cluster taking its parent's place, once per person and project", () => {
    const r = servedReport(projects, [enr("1", "a", "block"), enr("2", "b", "home"), enr("3", "b", "home", "g1", "active", "T"), enr("4", "c", "far"), enr("5", "d", "home", "g1", "ended")], [lahore]);
    expect(r.places.map((p) => [p.name, p.count])).toEqual([["Lahore", 2]]);
    expect([r.served, r.unplaced]).toEqual([2, 1]);
  });
  it("can be limited to one project", () => {
    const r = servedReport(projects, [enr("1", "a", "home"), enr("2", "b", "x", "g2")], [lahore], "g2");
    expect([r.places.length, r.unplaced]).toEqual([0, 1]);
  });
  it("finds a project's beneficiaries: enrolled in it, or waiting for it", () => {
    let r = emptyRegister();
    for (const [name, t] of [["Amina Khan", "g1"], ["Bilal Ahmed", ""], ["Chand Bibi", "g2"]] as const) {
      const x = addBeneficiary(r, "person", { name, targetProjectId: t }, true, "2026-11-01");
      if ("error" in x) throw new Error(x.error);
      r = x.value;
    }
    const [a, b, c] = r.records;
    const ids = projectBeneficiaries(r, [enr("1", b!.id, "home")], "g1");
    expect([...ids].sort()).toEqual([a!.id, b!.id].sort());
    expect(ids.has(c!.id)).toBe(false);
    expect(areaReport(r, [], ids).none).toBe(2); // only the project's two are counted
  });
});
