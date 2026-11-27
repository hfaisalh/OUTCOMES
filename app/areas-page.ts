/**
 * areas-page.ts
 *
 * What it does: draws the Areas page (DECISIONS 275): how many beneficiaries have a checked place, the areas that were only typed and still need a place chosen (one choice fixes everyone who typed it), a count by place, and a simple map of where beneficiaries are.
 * Who calls it: app/main.ts. Depends on: the pure area rules (modules/14-locations/areas.ts) and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: the register and the list of places come in with the View; the buttons carry data-action="ar-find" or "ar-choose", handled by app/areas-session.ts.
 * UX: a page of three blocks in a 2D grid (areas to check beside the map on a wide screen, the table below, one column on a phone). The map has a text alternative (the table), dots are sized by count and also labelled with it, and every button is a real button with a name.
 */

import { areaReport, mapPoints, uncheckedAreas } from "../modules/14-locations/areas";
import type { Place } from "../modules/14-locations/locations";
import { label } from "../modules/14-locations/locations";
import { esc, type View } from "./pages";

export interface AreasUi { finding: string; results: Place[]; searching: boolean }
export const noAreasUi = (): AreasUi => ({ finding: "", results: [], searching: false });

const MAX_ROWS = 200;

// --- The areas still to check ---
function checkList(v: View, ui: AreasUi): string {
  const list = uncheckedAreas(v.beneficiaries ?? { records: [], counters: {} });
  if (list.length === 0) return `<p class="muted">Every area is a checked place. Nothing to do here.</p>`;
  const open = (key: string): string => (ui.finding === key ? `<tr class="ar-open"><td colspan="3"><div class="ar-find" role="group" aria-label="Places that match">${ui.searching ? `<span class="muted">Searching...</span>` : ui.results.length === 0 ? `<span class="muted">No place found. Try the name another way, or leave it as typed.</span>` : ui.results.map((p, i) => `<button type="button" class="ar-pick" data-action="ar-choose" data-key="${esc(key)}" data-i="${i}">${esc(label(p))}</button>`).join("")}</div></td></tr>` : "");
  return `<div class="tablewrap"><table class="ar-table"><thead><tr><th>Typed area</th><th class="num">Beneficiaries</th><th></th></tr></thead><tbody>${list.slice(0, MAX_ROWS).map((a) => `<tr><td>${esc(a.text)}</td><td class="num">${a.count}</td><td class="num"><button type="button" data-action="ar-find" data-key="${esc(a.key)}" data-text="${esc(a.text)}" aria-expanded="${ui.finding === a.key}">Find place</button></td></tr>${open(a.key)}`).join("")}</tbody></table></div>${list.length > MAX_ROWS ? `<p class="muted">Showing the first ${MAX_ROWS} of ${list.length}.</p>` : ""}`;
}

// --- The map: a flat layout of the places, dots sized by how many beneficiaries ---
function mapSvg(rows: ReturnType<typeof areaReport>["places"]): string {
  const pts = mapPoints(rows);
  if (pts.length === 0) return `<p class="muted">The map appears when beneficiaries have a checked place.</p>`;
  return `<svg class="ar-map" viewBox="0 0 100 100" role="img" aria-label="Map of ${pts.length} places, sized by number of beneficiaries">${pts.map((p) => `<g><circle cx="${p.x}" cy="${p.y}" r="${p.r}"><title>${esc(p.name)}: ${p.count}</title></circle><text class="n" x="${p.x}" y="${p.y + 1.2}" text-anchor="middle">${p.count}</text><text class="nm" x="${p.x}" y="${p.y + p.r + 3.2}" text-anchor="middle">${esc(p.name)}</text></g>`).join("")}</svg>`;
}

export function areasPage(v: View, ui: AreasUi): string {
  const rep = areaReport(v.beneficiaries ?? { records: [], counters: {} }, v.locations ?? []);
  const total = rep.checked + rep.unchecked + rep.none;
  const tile = (n: number, text: string, cls = ""): string => `<div class="metric${cls}"><b>${n}</b><span>${esc(text)}</span></div>`;
  return `<h1>Areas</h1>
    <p class="sub">Where beneficiaries are, by village, town or district. A place is chosen from a free place search so it is always spelled the same, and reports and the map can count by it. A household address is never held.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${tile(total, "Beneficiaries")}${tile(rep.checked, "With a checked place")}${tile(rep.unchecked, "Typed, to check", rep.unchecked ? " warn" : "")}${tile(rep.none, "No area")}</div>
    <div class="ar-grid">
      <div class="card"><h2>Areas to check <span class="muted">(${uncheckedAreas(v.beneficiaries ?? { records: [], counters: {} }).length})</span></h2>${checkList(v, ui)}</div>
      <div class="card"><h2>Map</h2>${mapSvg(rep.places)}<p class="muted ar-note">A plain layout by position. A full map can replace it later; the counts stay the same.</p></div>
    </div>
    <div class="card"><h2>By place <span class="muted">(${rep.places.length})</span></h2>
      ${rep.places.length === 0 ? `<p class="muted">No beneficiary has a checked place yet.</p>` : `<div class="tablewrap"><table><thead><tr><th>Place</th><th>Region</th><th>Country</th><th class="num">Beneficiaries</th></tr></thead><tbody>${rep.places.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc([p.district, p.region].filter((x) => x).join(", "))}</td><td>${esc(p.country)}</td><td class="num">${p.count}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted">By country: ${rep.countries.map((c) => `${esc(c.country)} ${c.count}`).join(", ")}.</p>`}
    </div>`;
}
