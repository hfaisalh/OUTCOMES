/**
 * areas-page.ts
 *
 * What it does: draws "Where beneficiaries are" on the Dashboard and the pop-up window that fixes anomalies (DECISIONS 275, 276): how many beneficiaries have a checked place, a simple map and a count by place, and a button opening a window of the areas that were only typed and still need a place chosen (one choice fixes everyone who typed it).
 * Who calls it: app/main.ts (the card under the Dashboard, and the window). Depends on: the pure area rules (modules/14-locations/areas.ts) and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: the register and the list of places come in with the View; the buttons carry data-action="ar-find" or "ar-choose", handled by app/areas-session.ts.
 * UX: the card is a 2D grid (map beside the table on a wide screen, one column on a phone); the fix window is a modal dialog (role, aria-modal, Close, Esc) that stays open so several areas can be fixed in a row. The map has a text alternative (the table), dots are sized by count and also labelled with it, and every button is a real button with a name.
 */

import { areaReport, mapPoints, projectBeneficiaries, servedReport, uncheckedAreas } from "../modules/14-locations/areas";
import type { Place } from "../modules/14-locations/locations";
import { label } from "../modules/14-locations/locations";
import { esc, type View } from "./pages";

export interface AreasUi { open: boolean; finding: string; results: Place[]; searching: boolean }
export const noAreasUi = (open = false): AreasUi => ({ open, finding: "", results: [], searching: false });

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

const EMPTY = { records: [], counters: {} };

// --- The Dashboard card ---
// mode "from": where beneficiaries are from (their Area). mode "served": where the benefit is served (the place of the cluster they are enrolled in). `project` "" is all projects (DECISIONS 278).
export interface AreasView { mode: "from" | "served"; project: string }
export const noAreasView = (): AreasView => ({ mode: "from", project: "" });
const tile = (n: number, text: string, cls = ""): string => `<div class="metric${cls}"><b>${n}</b><span>${esc(text)}</span></div>`;
const placeTable = (rows: ReturnType<typeof areaReport>["places"], countLabel: string): string => rows.length === 0 ? `<p class="muted">Nothing to show yet.</p>` : `<div class="tablewrap"><table><thead><tr><th>Place</th><th>Region</th><th>Country</th><th class="num">${countLabel}</th></tr></thead><tbody>${rows.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc([p.district, p.region].filter((x) => x).join(", "))}</td><td>${esc(p.country)}</td><td class="num">${p.count}</td></tr>`).join("")}</tbody></table></div>`;

export function areasCard(v: View, view: AreasView = noAreasView()): string {
  const reg = v.beneficiaries ?? EMPTY;
  const projects = v.giftProjects ?? [];
  const only = view.project === "" ? undefined : projectBeneficiaries(reg, v.enrolments?.records ?? [], view.project);
  const anomalies = uncheckedAreas(reg).length;
  const from = view.mode === "from";
  const rep = areaReport(reg, v.locations ?? [], only);
  const srv = servedReport(projects, v.enrolments?.records ?? [], v.locations ?? [], view.project);
  const rows = from ? rep.places : srv.places;
  const tiles = from
    ? `${tile(rep.checked + rep.unchecked + rep.none, "Beneficiaries")}${tile(rep.checked, "From a checked place")}${tile(rep.unchecked, "Typed, to check", rep.unchecked ? " warn" : "")}${tile(rep.none, "No area")}`
    : `${tile(srv.served + srv.unplaced, "Enrolled")}${tile(srv.served, "Served at a checked place")}${tile(srv.unplaced, "At a cluster with no location", srv.unplaced ? " warn" : "")}`;
  const mode = (m: "from" | "served", text: string): string => `<button type="button" class="ar-seg" data-action="ar-mode" data-mode="${m}" aria-pressed="${view.mode === m}">${text}</button>`;
  return `<section class="card ar-card" aria-labelledby="ar-h"><div class="ar-head"><div><h2 id="ar-h">Where beneficiaries are</h2><p class="muted">${from ? "Where each beneficiary comes from, by village, town or district." : "Where the benefit is served: the location of the cluster each beneficiary is enrolled in. Set it on the cluster's Details tab."} A household address is never held.</p></div>
      <button type="button" data-action="ar-open"${anomalies ? ' class="primary"' : ""}>Fix anomalies${anomalies ? ` (${anomalies})` : ""}</button></div>
    <div class="ar-controls"><div class="ar-segs" role="group" aria-label="Map by">${mode("from", "Where they are from")}${mode("served", "Where it is served")}</div>
      <label class="ar-proj"><span class="muted">Project</span><select id="ar-project" aria-label="Project"><option value="">All projects</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === view.project ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label></div>
    <div class="metrics">${tiles}</div>
    <div class="ar-grid"><div>${mapSvg(rows)}<p class="muted ar-note">A plain layout by position. A full map can replace it later; the counts stay the same.</p></div>
      <div>${placeTable(rows, from ? "Beneficiaries" : "Enrolled")}${from && rep.countries.length ? `<p class="muted">By country: ${rep.countries.map((c) => `${esc(c.country)} ${c.count}`).join(", ")}.</p>` : ""}</div></div></section>`;
}

// --- The pop-up window that fixes anomalies ---
export function areasWindowHtml(v: View, ui: AreasUi): string {
  const n = uncheckedAreas(v.beneficiaries ?? EMPTY).length;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-labelledby="ar-title"><div class="pf-box">
    <header class="gw-head"><div><h2 id="ar-title">Fix anomalies <span class="muted">(${n})</span></h2><div class="gw-sub muted">Areas that were typed, not chosen. Find the place for one, and everyone who typed it is fixed at once.</div></div><button type="button" id="ar-close" data-action="ar-close" aria-label="Close">Close</button></header>
    <div class="pf-body gw">${v.message ? `<div class="note" role="status">${esc(v.message)}</div>` : ""}${checkList(v, ui)}</div>
    <footer><button type="button" data-action="ar-close">Done</button></footer></div></div>`;
}
