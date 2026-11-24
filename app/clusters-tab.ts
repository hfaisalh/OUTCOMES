/**
 * clusters-tab.ts
 *
 * What it does: the Clusters tab of the project window (DECISIONS 158, 161, 162). A cluster is the master distribution of a project (a school, a university, a home) and holds as many sub clusters
 * as are needed, to any depth. The tab has two views, so a big project never makes one long screen:
 * - The LIST: only the master clusters, one short line each (name, called, place, capacity, how many are inside, status) with a settings button. A row at the bottom adds a cluster.
 * - A CLUSTER (opened with its settings button): a path across the top (Aghosh Home > Block A > Classroom 1), then two tabs. Details: name, called, place, roles, status and, on a master cluster, the
 *   total capacity (a sub cluster shows its even share as a guide). Inside: the tree of what is in it, as folders that open and close, with + to add inside and a settings button to open that one in turn.
 * Rule (Faisal): capacity is set on the master cluster only, and shared evenly down. Pure: it takes the clusters and returns HTML.
 * Who calls it: app/project-form.ts. Depends on: modules/06-projects/clusters.ts and esc from pages.ts.
 */

import { clusterRows, evenShare, insideCount, pathOf, subRows, suggestLabel, type Cluster, type ClusterState } from "../modules/06-projects/clusters";
import { esc } from "./pages";

// What is open, kept for the session so editing does not close it: the folders whose sub list is showing, the cluster a sub cluster is being added to, and the cluster window that is open ("" is the list).
export const openClusters = new Set<string>();
export const clusterUi = { adding: "", node: "", nodeTab: "details" as "details" | "inside" };

const SEARCH_FROM = 8; // a search box shows once a list is longer than this

const labelsList = (state: ClusterState): string => `<datalist id="cl-labels">${[...new Set(state.clusters.map((c) => c.label).filter((l) => l !== ""))].map((l) => `<option value="${esc(l)}"></option>`).join("")}</datalist>`;
const gear = (c: Cluster): string => `<button type="button" class="iconact" data-cl="goto" data-id="${esc(c.id)}" title="Settings of ${esc(c.name)}" aria-label="Settings of ${esc(c.name)}">&#9881;</button>`;
const remove = (c: Cluster): string => `<button type="button" class="iconact" data-cl="cluster-rm" data-id="${esc(c.id)}" title="Remove this cluster" aria-label="Remove ${esc(c.name)}">&times;</button>`;
const statusPill = (c: Cluster): string => `<span class="pill${c.status === "closed" ? " muted" : ""}">${c.status === "closed" ? "Closed" : "Active"}</span>`;
const searchBox = (n: number): string => (n > SEARCH_FROM ? '<input type="search" id="cl-search" placeholder="Search clusters" aria-label="Search clusters">' : "");

// ---- The list of master clusters ----
function listHtml(state: ClusterState): string {
  const tops = clusterRows(state).filter((r) => r.depth === 0).map((r) => r.cluster);
  const rows = tops.map((c) => `<tr data-find="${esc(`${c.name} ${c.label} ${c.place}`.toLowerCase())}"><td><b>${esc(c.name)}</b></td><td>${esc(c.label)}</td><td class="muted">${esc(c.place)}</td><td class="num">${c.capacity ?? '<span class="muted">-</span>'}</td><td class="num">${insideCount(state, c.id)}</td><td>${statusPill(c)}</td><td class="actcol">${gear(c)}${remove(c)}</td></tr>`).join("");
  return `<section><h3>Clusters <span class="muted">(${tops.length})</span></h3>
    <p class="muted">A cluster is how a project is distributed: a school, a university, a home, a region. Open one with its settings button to set its details and to add the sub clusters inside it (a faculty, a department, a classroom).</p>
    ${searchBox(tops.length)}
    ${tops.length ? `<div class="tablewrap"><table class="subtable cl-table"><thead><tr><th>Cluster</th><th>Called</th><th>Place</th><th class="num">Capacity</th><th class="num">Inside</th><th>Status</th><th class="actcol"></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No clusters yet. Add the first one below.</p>'}
    ${labelsList(state)}
    <div class="cl-add"><input id="cl-tname" placeholder="New cluster, for example Lahore University" aria-label="New cluster name">
      <input id="cl-tlabel" list="cl-labels" value="${esc(suggestLabel(state, ""))}" placeholder="Called, for example University" aria-label="What it is called"><input id="cl-tplace" placeholder="Place" aria-label="Place"><input id="cl-tcap" type="number" min="0" placeholder="Total capacity" aria-label="Total capacity">
      <button type="button" class="iconact ok" data-cl="cluster-add" data-id="" title="Add the cluster" aria-label="Add the cluster">+</button></div></section>`;
}

// ---- One cluster: its path, Details and Inside ----
function detailsHtml(state: ClusterState, c: Cluster): string {
  const share = evenShare(state, c.id);
  const top = c.parentId === "";
  return `<section class="cl-form">
    <label>Name<input id="cn-name" value="${esc(c.name)}"></label>
    <label>Called<input id="cn-label" list="cl-labels" value="${esc(c.label)}" placeholder="For example Home, Faculty, Classroom"></label>
    <label>Place<input id="cn-place" value="${esc(c.place)}"></label>
    <label>Roles it needs<input id="cn-roles" value="${esc((c.roles ?? []).join(", "))}" placeholder="For example Principal, Warden (separate with commas)"></label>
    <label>Status<select id="cn-status"><option value="active"${c.status === "active" ? " selected" : ""}>Active</option><option value="closed"${c.status === "closed" ? " selected" : ""}>Closed</option></select></label>
    ${top ? `<label>Total capacity<input id="cn-capacity" type="number" min="0" value="${c.capacity ?? ""}" placeholder="Shared evenly down through what is inside"></label>` : `<p class="muted">Capacity is set on the master cluster. Its even share here is ${share !== undefined ? `about <b>${share}</b>` : "not set yet"}, as a guide.</p>`}
    <div class="actions"><button type="button" data-cl="node-save" data-id="${esc(c.id)}">Save</button></div>
    ${labelsList(state)}</section>`;
}

function insideHtml(state: ClusterState, c: Cluster, adding: string): string {
  const rows = subRows(state, c.id);
  const byId = new Map(state.clusters.map((x) => [x.id, x]));
  // Rule: a row shows only when every cluster between it and this one is opened.
  const shown = (parentId: string): boolean => parentId === c.id || (openClusters.has(parentId) && shown(byId.get(parentId)?.parentId ?? ""));
  const kids = (id: string): number => state.clusters.filter((x) => x.parentId === id).length;
  const addSub = (parentId: string, depth: number): string => `<tr class="cl-addrow"><td colspan="5" style="padding-left:${10 + (depth + 1) * 22}px"><div class="cl-add"><input id="cl-sname" placeholder="New sub cluster name" aria-label="New sub cluster name"><input id="cl-slabel" list="cl-labels" value="${esc(suggestLabel(state, parentId))}" placeholder="Called" aria-label="What it is called"><input id="cl-splace" placeholder="Place" aria-label="Place">
      <button type="button" class="iconact ok" data-cl="cluster-add" data-id="${esc(parentId)}" title="Add the sub cluster" aria-label="Add the sub cluster">+</button><button type="button" class="iconact" data-cl="sub-cancel" title="Cancel" aria-label="Cancel">&times;</button></div></td></tr>`;
  const tree = rows.filter(({ cluster: x }) => shown(x.parentId)).map(({ cluster: x, depth }) => {
    const n = kids(x.id);
    const open = openClusters.has(x.id);
    const toggle = n > 0 ? `<button type="button" class="iconact" data-cl="toggle" data-id="${esc(x.id)}" aria-expanded="${open}" title="${open ? "Hide" : "Show"} what is inside" aria-label="${open ? "Hide" : "Show"} what is inside ${esc(x.name)}">${open ? "&#9662;" : "&#9656;"}</button>` : '<span class="cl-nobtn"></span>';
    const row = `<tr data-find="${esc(`${x.name} ${x.label} ${x.place}`.toLowerCase())}"><td style="padding-left:${10 + depth * 22}px"><span class="cl-name">${toggle}<span class="cl-icon" aria-hidden="true">${n > 0 ? "&#128193;" : "&#128196;"}</span><b>${esc(x.name)}</b>${n > 0 ? `<span class="pill" title="Inside">${n}</span>` : ""}</span></td><td>${esc(x.label)}</td><td class="muted">${esc(x.place)}</td><td>${statusPill(x)}</td>
      <td class="actcol">${gear(x)}<button type="button" class="iconact ok" data-cl="sub-open" data-id="${esc(x.id)}" title="Add a sub cluster inside" aria-label="Add a sub cluster inside ${esc(x.name)}">+</button>${remove(x)}</td></tr>`;
    return row + (adding === x.id ? addSub(x.id, depth) : "");
  }).join("");
  return `<section>${searchBox(rows.length)}
    ${rows.length ? `<div class="tablewrap"><table class="subtable cl-table"><thead><tr><th>Inside ${esc(c.name)}</th><th>Called</th><th>Place</th><th>Status</th><th class="actcol"></th></tr></thead><tbody>${tree}</tbody></table></div>` : '<p class="muted">Nothing inside yet. Add the first sub cluster below.</p>'}
    <div class="cl-add"><input id="cl-bname" placeholder="New sub cluster, for example Classroom 1" aria-label="New sub cluster name"><input id="cl-blabel" list="cl-labels" value="${esc(suggestLabel(state, c.id))}" placeholder="Called" aria-label="What it is called"><input id="cl-bplace" placeholder="Place" aria-label="Place">
      <button type="button" class="iconact ok" data-cl="cluster-add-b" data-id="${esc(c.id)}" title="Add inside ${esc(c.name)}" aria-label="Add inside ${esc(c.name)}">+</button></div>${labelsList(state)}</section>`;
}

function clusterHtml(state: ClusterState, c: Cluster): string {
  const path = pathOf(state, c.id);
  const crumbs = ['<button type="button" class="linkish" data-cl="goto" data-id="">Clusters</button>', ...path.map((p, i) => (i === path.length - 1 ? `<b>${esc(p.name)}</b>` : `<button type="button" class="linkish" data-cl="goto" data-id="${esc(p.id)}">${esc(p.name)}</button>`))].join('<span class="cl-sep" aria-hidden="true"> &rsaquo; </span>');
  const n = insideCount(state, c.id);
  const tab = clusterUi.nodeTab;
  return `<nav class="cl-path" aria-label="Where you are">${crumbs}</nav>
    <nav class="pf-tabs" role="tablist"><button type="button" role="tab" class="${tab === "details" ? "on" : ""}" data-cl="node-tab" data-tab="details">Details</button><button type="button" role="tab" class="${tab === "inside" ? "on" : ""}" data-cl="node-tab" data-tab="inside">Inside <span class="muted">(${n})</span></button></nav>
    ${tab === "details" ? detailsHtml(state, c) : insideHtml(state, c, clusterUi.adding)}`;
}

export function clustersTabHtml(state: ClusterState, error = ""): string {
  const open = clusterUi.node === "" ? undefined : state.clusters.find((c) => c.id === clusterUi.node);
  return `<div class="pf-body">
    ${error ? `<div class="note" role="alert">${esc(error)}</div>` : ""}
    ${open ? clusterHtml(state, open) : listHtml(state)}
    <p class="muted">Who holds each role, and the beneficiaries enrolled in each cluster, come next.</p>
  </div>`;
}
