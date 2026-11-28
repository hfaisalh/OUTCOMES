/**
 * areas-page.ts
 *
 * What it does: draws "Where beneficiaries are" on the Dashboard and the pop-up window that fixes anomalies (DECISIONS 275, 276): how many beneficiaries have a checked place, a simple map and a count by place, and a button opening a window of the areas that were only typed and still need a place chosen (one choice fixes everyone who typed it).
 * Who calls it: app/main.ts (the card under the Dashboard, and the window). Depends on: the pure area rules (modules/14-locations/areas.ts) and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: the register and the list of places come in with the View; the buttons carry data-action="ar-find" or "ar-choose", handled by app/dashboard/areas-session.ts.
 * UX: the card is a 2D grid (map beside the table on a wide screen, one column on a phone); the fix window is a modal dialog (role, aria-modal, Close, Esc) that stays open so several areas can be fixed in a row. The map has a text alternative (the table), dots are sized by count and also labelled with it, and every button is a real button with a name.
 */

import { areaReport, mapPoints, projectBeneficiaries, servedReport, uncheckedAreas } from "../../modules/14-locations/areas";
import type { Place } from "../../modules/14-locations/locations";
import { label } from "../../modules/14-locations/locations";
import { dashIcon, kpiHtml } from "./dash-charts";
import { esc, type View } from "../shared/pages";

export interface AreasUi { open: boolean; finding: string; results: Place[]; searching: boolean }
export const noAreasUi = (open = false): AreasUi => ({ open, finding: "", results: [], searching: false });

const MAX_ROWS = 200;

// --- The areas still to check ---
function checkList(v: View, ui: AreasUi): string {
  const list = uncheckedAreas(v.beneficiaries ?? { records: [], counters: {} });
  if (list.length === 0) return `<p class="muted">Every area is a checked place. Nothing to do here.</p>`;
  const open = (key: string): string => (ui.finding === key ? `<tr class="ar-open"><td colspan="3"><div class="ar-find" role="group" aria-label="Places that match">${ui.searching ? `<span class="muted">Searching...</span>` : ui.results.length === 0 ? `<span class="muted">No place found. Try the name another way, or leave it as typed.</span>` : ui.results.map((p, i) => `<button type="button" class="ar-pick" data-action="ar-choose" data-key="${esc(key)}" data-i="${i}">${esc(label(p))}</button>`).join("")}</div></td></tr>` : "");
  return `<div class="tablewrap"><table class="ar-table"><thead><tr><th>Typed area</th><th class="num">Beneficiaries</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.slice(0, MAX_ROWS).map((a) => `<tr><td>${esc(a.text)}</td><td class="num">${a.count}</td><td class="num"><button type="button" data-action="ar-find" data-key="${esc(a.key)}" data-text="${esc(a.text)}" aria-expanded="${ui.finding === a.key}">Find place</button></td></tr>${open(a.key)}`).join("")}</tbody></table></div>${list.length > MAX_ROWS ? `<p class="muted">Showing the first ${MAX_ROWS} of ${list.length}.</p>` : ""}`;
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
// A figure tile in the same look as the rest of the Dashboard (DECISIONS 303): icon badge, one number, its words.
const tile = (n: number, text: string, icon: string, hue: number, sub = ""): string => kpiHtml({ label: text, value: String(n), icon, hue, ...(sub ? { sub } : {}) });
// One whole split into parts (DECISIONS 303): a thin segmented bar with a 2px gap between parts and the numbers listed under it, so no meaning rests on colour.
function coverage(parts: { label: string; value: number; color: string }[]): string {
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (total === 0) return "";
  const shown = parts.filter((p) => p.value > 0);
  return `<div class="ar-cover-wrap"><div class="ar-cover" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${p.value}`).join(", "))}">${shown.map((p) => `<i style="flex:${p.value};background:${p.color}"></i>`).join("")}</div>
    <ul class="ar-cover-key">${parts.map((p) => `<li><span class="dash-sw" style="background:${p.color}" aria-hidden="true"></span>${esc(p.label)} <b>${p.value}</b> <span class="muted">${Math.round((p.value / total) * 100)}%</span></li>`).join("")}</ul></div>`;
}
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
  const total = rep.checked + rep.unchecked + rep.none;
  const tiles = from
    ? `${tile(total, "Beneficiaries", "people", 0)}${tile(rep.checked, "From a checked place", "pin", 2, total ? `${Math.round((rep.checked / total) * 100)}% of beneficiaries` : "")}${tile(rep.unchecked, "Typed, to check", "alert", 1, rep.unchecked ? "typed, not matched to a place" : "")}${tile(rep.none, "No area", "doc", 5, "nothing typed yet")}`
    : `${tile(srv.served + srv.unplaced, "Enrolled", "people", 0)}${tile(srv.served, "Served at a checked place", "pin", 2)}${tile(srv.unplaced, "At a cluster with no location", "alert", 1, srv.unplaced ? "set it on the cluster" : "")}`;
  const split = from
    ? coverage([{ label: "From a checked place", value: rep.checked, color: "#2a78d6" }, { label: "Typed, to check", value: rep.unchecked, color: "#eb6834" }, { label: "No area", value: rep.none, color: "#a8a7a0" }])
    : coverage([{ label: "Served at a checked place", value: srv.served, color: "#2a78d6" }, { label: "At a cluster with no location", value: srv.unplaced, color: "#eb6834" }]);
  const empty = from
    ? `<div class="ar-empty"><span class="dash-badge" style="--hue:#eb6834">${dashIcon("pin", 20)}</span><div><b>No place is checked yet</b><p class="muted">${anomalies > 0 ? `${anomalies} typed ${anomalies === 1 ? "area is" : "areas are"} waiting. Match each to a real place and the map and the table fill in. One choice fixes everyone who typed it.` : "Give a beneficiary an area, and choose a place from the list, and the map and the table fill in."}</p></div>${anomalies > 0 ? `<button type="button" class="primary" data-action="ar-open">Check typed areas (${anomalies})</button>` : ""}</div>`
    : `<div class="ar-empty"><span class="dash-badge" style="--hue:#eb6834">${dashIcon("pin", 20)}</span><div><b>No cluster has a checked location yet</b><p class="muted">Set the location on a cluster's Details tab. Then the map shows where each benefit is served.</p></div></div>`;
  const mode = (m: "from" | "served", text: string): string => `<button type="button" class="ar-seg" data-action="ar-mode" data-mode="${m}" aria-pressed="${view.mode === m}">${text}</button>`;
  return `<section class="card ar-card" aria-labelledby="ar-h"><div class="ar-head"><div><h2 id="ar-h">Where beneficiaries are</h2><p class="muted">${from ? "Where each beneficiary comes from, by village, town or district." : "Where the benefit is served: the location of the cluster each beneficiary is enrolled in. Set it on the cluster's Details tab."} A household address is never held.</p></div>
      <button type="button" data-action="ar-open"${anomalies ? ' class="primary"' : ""}>Fix anomalies${anomalies ? ` (${anomalies})` : ""}</button></div>
    <div class="ar-controls"><div class="ar-segs" role="group" aria-label="Map by">${mode("from", "Where they are from")}${mode("served", "Where it is served")}</div>
      <label class="ar-proj"><span class="muted">Project</span><select id="ar-project" aria-label="Project"><option value="">All projects</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === view.project ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label></div>
    <div class="dash-grid ar-tiles">${tiles}</div>${split}
    ${rows.length === 0 ? empty : `    <div class="ar-grid"><div><div id="ar-leaflet" class="ar-leaflet" data-rows="${esc(JSON.stringify(rows))}">${mapSvg(rows)}</div><p class="muted ar-note">Map data &copy; OpenStreetMap contributors. If the map cannot load, a plain layout by position is shown.</p></div>
      <div>${placeTable(rows, from ? "Beneficiaries" : "Enrolled")}${from && rep.countries.length ? `<p class="muted">By country: ${rep.countries.map((c) => `${esc(c.country)} ${c.count}`).join(", ")}.</p>` : ""}</div></div>`}</section>`;
}

// --- The pop-up window that fixes anomalies ---
export function areasWindowHtml(v: View, ui: AreasUi): string {
  const n = uncheckedAreas(v.beneficiaries ?? EMPTY).length;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-labelledby="ar-title"><div class="pf-box">
    <header role="none" class="gw-head"><div><h2 id="ar-title">Fix anomalies <span class="muted">(${n})</span></h2><div class="gw-sub muted">Areas that were typed, not chosen. Find the place for one, and everyone who typed it is fixed at once.</div></div><button type="button" id="ar-close" data-action="ar-close" aria-label="Close">Close</button></header>
    <div class="pf-body gw">${v.message ? `<div class="note" role="status">${esc(v.message)}</div>` : ""}${checkList(v, ui)}</div>
    <footer><button type="button" data-action="ar-close">Done</button></footer></div></div>`;
}
