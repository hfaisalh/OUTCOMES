/**
 * areas.ts
 *
 * What it does: the rules that work on the Area of beneficiaries (DECISIONS 275): which areas are only typed text and still to be checked, resolving one typed area to a checked place for everyone who typed it, and counting beneficiaries by place for reports and a map.
 * Who calls it: the staff server (modules/00-platform/outcomes-handler.ts), the Areas page (app/areas-page.ts) and the tests. Depends on: locations.ts and the Register type. Pure: no network, no database, so it can be ported (CLAUDE.md rule 4).
 * Rules:
 * - Rule: an area is "unchecked" when it has text and no place id. Many people usually typed the same area, so they are listed once with a count, and one choice fixes them all.
 * - Rule: the same typed area is found whatever its case, accents or spacing (normPlace).
 * - Rule (DECISIONS 278): where a beneficiary is FROM (their Area) and where the benefit is SERVED (the location of the cluster they are enrolled in) are different. An orphanage in Lahore serves beneficiaries who come from all over Pakistan. A sub cluster with no location of its own is served where the cluster it sits in is.
 * - Rule: reports count persons and households that have an area. A beneficiary with no area is counted apart, never hidden.
 */

import type { Beneficiary, Register } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolment } from "../07-beneficiaries/enrolments.js";
import type { Cluster } from "../06-projects/clusters.js";
import { label, normPlace, type Place } from "./locations.js";

// --- Areas still to check ---
export interface UncheckedArea { key: string; text: string; count: number; ids: string[] }

export function uncheckedAreas(reg: Register): UncheckedArea[] {
  const groups = new Map<string, { texts: Map<string, number>; ids: string[] }>();
  for (const b of reg.records) {
    const key = normPlace(b.area);
    if (key === "" || b.locationId) continue;
    const g = groups.get(key) ?? { texts: new Map<string, number>(), ids: [] as string[] };
    g.texts.set(b.area.trim(), (g.texts.get(b.area.trim()) ?? 0) + 1);
    g.ids.push(b.id);
    groups.set(key, g);
  }
  // The text shown is the one typed most often. Biggest groups first, so the most useful fix is at the top.
  return [...groups].map(([key, g]) => ({ key, text: [...g.texts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key, count: g.ids.length, ids: g.ids })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

// Gives every unchecked beneficiary whose typed area matches `typed` the chosen place. Returns how many were changed.
export function resolveArea(reg: Register, typed: string, place: Place): { register: Register; changed: number } {
  const key = normPlace(typed);
  let changed = 0;
  const records = reg.records.map((b: Beneficiary) => {
    if (key === "" || b.locationId || normPlace(b.area) !== key) return b;
    changed++;
    return { ...b, area: label(place), locationId: place.id };
  });
  return { register: { ...reg, records }, changed };
}

// --- Counting by place ---
export interface PlaceCount { id: string; name: string; district: string; region: string; country: string; lat: number; lon: number; count: number }
export interface AreaReport { places: PlaceCount[]; countries: { country: string; count: number }[]; checked: number; unchecked: number; none: number }

export function areaReport(reg: Register, places: Place[], only?: Set<string>): AreaReport {
  const byId = new Map(places.map((p) => [p.id, p]));
  const counts = new Map<string, number>();
  let checked = 0, unchecked = 0, none = 0;
  for (const b of reg.records) {
    if (only && !only.has(b.id)) continue; // a project's own beneficiaries only
    if (b.locationId && byId.has(b.locationId)) { checked++; counts.set(b.locationId, (counts.get(b.locationId) ?? 0) + 1); }
    else if (normPlace(b.area) !== "") unchecked++;
    else none++;
  }
  const rows: PlaceCount[] = [...counts].map(([id, count]) => ({ ...(byId.get(id) as Place), count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const countries = new Map<string, number>();
  for (const r of rows) countries.set(r.country, (countries.get(r.country) ?? 0) + r.count);
  return { places: rows, countries: [...countries].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count), checked, unchecked, none };
}

// --- A simple map ---
// Places are laid out on a flat 0 to 100 square from their longitude and latitude, fitted to the places there are (with a margin), so a country or a region fills the picture. A real base map can replace this later; the counts stay the same.
export interface MapPoint { id: string; x: number; y: number; r: number; count: number; name: string }
export function mapPoints(rows: PlaceCount[]): MapPoint[] {
  if (rows.length === 0) return [];
  const lons = rows.map((r) => r.lon), lats = rows.map((r) => r.lat);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const span = Math.max(e - w, n - s, 0.5); // one scale for both directions so shapes are not stretched; at least half a degree so one place sits in the middle
  const max = Math.max(...rows.map((r) => r.count));
  return rows.map((r) => ({ id: r.id, name: r.name, count: r.count, x: round(10 + 80 * ((r.lon - (w + e) / 2) / span + 0.5)), y: round(10 + 80 * (0.5 - (r.lat - (s + n) / 2) / span)), r: round(2 + 5 * Math.sqrt(r.count / max)) }));
}
const round = (v: number): number => Math.round(v * 10) / 10;

// --- Where it is served ---
// The beneficiaries of one project: those enrolled in it and those waiting for it.
export function projectBeneficiaries(reg: Register, enrolments: Enrolment[], projectId: string): Set<string> {
  const ids = new Set(enrolments.filter((e) => e.giftProjectId === projectId && e.status === "active").map((e) => e.beneficiaryId));
  for (const b of reg.records) if (b.targetProjectId === projectId) ids.add(b.id);
  return ids;
}

// The checked place a cluster is served at: its own, else that of the cluster it sits in, and so on up.
function placeOfCluster(clusters: Cluster[], id: string, byId: Map<string, Place>): Place | undefined {
  for (let c = clusters.find((x) => x.id === id), guard = 0; c && guard < 20; c = clusters.find((x) => x.id === c?.parentId), guard++) {
    const p = c.locationId ? byId.get(c.locationId) : undefined;
    if (p) return p;
  }
  return undefined;
}

export interface ServedReport { places: PlaceCount[]; served: number; unplaced: number }
// Counts active enrolments (one per beneficiary and project, however many benefits) by the place their cluster is served at. `projects` are the gift projects with their clusters; `projectId` "" means all.
export function servedReport(projects: { id: string; clusters?: Cluster[] }[], enrolments: Enrolment[], places: Place[], projectId = ""): ServedReport {
  const byId = new Map(places.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  let unplaced = 0;
  for (const e of enrolments) {
    if (e.status !== "active" || (projectId !== "" && e.giftProjectId !== projectId)) continue;
    const once = `${e.giftProjectId}|${e.beneficiaryId}`;
    if (seen.has(once)) continue;
    seen.add(once);
    const gp = projects.find((p) => p.id === e.giftProjectId);
    const p = placeOfCluster(gp?.clusters ?? [], e.clusterId, byId);
    if (p) counts.set(p.id, (counts.get(p.id) ?? 0) + 1); else unplaced++;
  }
  const rows: PlaceCount[] = [...counts].map(([id, count]) => ({ ...(byId.get(id) as Place), count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { places: rows, served: seen.size - unplaced, unplaced };
}
