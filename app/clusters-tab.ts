/**
 * clusters-tab.ts
 *
 * What it does: the Clusters tab of the project window (DECISIONS 158, 161, 162). A cluster is the master distribution of a project (a school, a university, a home) and holds as many sub clusters
 * as are needed, to any depth. The tab has two views, so a big project never makes one long screen:
 * - The LIST: only the master clusters, one short line each (name, called, place, capacity, how many are inside, status) with a settings button. A row at the bottom adds a cluster.
 * - A CLUSTER (opened with its settings button): a path across the top (Aghosh Home > Block A > Classroom 1), then two tabs. Details: name, called, place, roles, status and, on a master cluster, the
 *   total capacity (a sub cluster shows its even share as a guide). Sub-Clusters: the tree of what is in it, as folders that open and close, with + to add inside and a settings button to open that one in turn.
 * A third tab, Beneficiaries, enrols people in the cluster (app/cluster-people.ts, DECISIONS 167).
 * Rule (Faisal): capacity is set on the master cluster only, and shared evenly down. Pure: it takes the clusters and returns HTML.
 * Who calls it: app/project-form.ts. Depends on: modules/06-projects/clusters.ts and esc from pages.ts.
 */

import { evenShare, insideCount, pathOf, treeRows, suggestLabel, type Cluster, type ClusterState } from "../modules/06-projects/clusters";
import { clusterPeopleHtml, clusterStockHtml, peopleCount, stockHere, type PeopleContext } from "./cluster-people";
import { ICON_SETTINGS } from "./icons";
import { esc } from "./pages";

// What is shown, kept for the session so editing does not change it: the folders a person has closed (every folder is open until closed), the cluster a sub cluster is being added to, and the cluster window that is open ("" is the list).
export const closedClusters = new Set<string>();
export const clusterUi = { adding: "", node: "", nodeTab: "details" as "details" | "inside" | "people" | "outcomes", notice: "" };

const SEARCH_FROM = 8; // a search box shows once a list is longer than this

const labelsList = (state: ClusterState): string => `<datalist id="cl-labels">${[...new Set(state.clusters.map((c) => c.label).filter((l) => l !== ""))].map((l) => `<option value="${esc(l)}"></option>`).join("")}</datalist>`;
const gear = (c: Cluster): string => `<button type="button" class="iconact gear" data-cl="goto" data-id="${esc(c.id)}" title="Settings of ${esc(c.name)}" aria-label="Settings of ${esc(c.name)}">${ICON_SETTINGS}</button>`;
const remove = (c: Cluster): string => `<button type="button" class="iconact" data-cl="cluster-rm" data-id="${esc(c.id)}" title="Remove this cluster" aria-label="Remove ${esc(c.name)}">&times;</button>`;
const statusPill = (c: Cluster): string => `<span class="pill${c.status === "closed" ? " muted" : ""}">${c.status === "closed" ? "Closed" : "Active"}</span>`;
const searchBox = (n: number): string => (n > SEARCH_FROM ? '<input type="search" id="cl-search" placeholder="Search clusters" aria-label="Search clusters">' : "");

// ---- The tree: one row per cluster, drawn with hierarchy lines like a folder list ----
// Each row starts with its lines (a master cluster has none): a vertical line for every level between that carries on, then an elbow (or a tee when more follow) to the cluster itself. A folder shows an arrow to close or open it.
function treeHtml(state: ClusterState, rootId: string, adding: string): string {
  const rows = treeRows(state, rootId);
  const byId = new Map(state.clusters.map((x) => [x.id, x]));
  // Rule: a row shows unless a cluster between it and the root has been closed.
  const shown = (parentId: string): boolean => parentId === rootId || (!closedClusters.has(parentId) && shown(byId.get(parentId)?.parentId ?? rootId));
  const kids = (id: string): number => state.clusters.filter((x) => x.parentId === id).length;
  const lines = (guides: boolean[], last: boolean, depth: number): string => (depth === 0 ? "" : `<span class="tls">${guides.slice(1).map((g) => `<span class="tl${g ? " v" : ""}"></span>`).join("")}<span class="tl ${last ? "end" : "mid"}"></span></span>`);
  const addSub = (parentId: string, depth: number): string => `<tr class="cl-addrow"><td colspan="6"><div class="cl-add" style="margin-left:${(depth + 1) * 22 + 12}px"><input id="cl-sname" placeholder="New sub cluster name" aria-label="New sub cluster name"><input id="cl-slabel" list="cl-labels" value="${esc(suggestLabel(state, parentId))}" placeholder="Called" aria-label="What it is called"><input id="cl-splace" placeholder="Location" aria-label="Location">
      <button type="button" class="iconact ok" data-cl="cluster-add" data-id="${esc(parentId)}" title="Add the sub cluster" aria-label="Add the sub cluster">+</button><button type="button" class="iconact" data-cl="sub-cancel" title="Cancel" aria-label="Cancel">&times;</button></div></td></tr>`;
  const body = rows.filter(({ cluster: x }) => shown(x.parentId)).map(({ cluster: x, depth, last, guides }) => {
    const n = kids(x.id);
    const isClosed = closedClusters.has(x.id);
    const toggle = n > 0 ? `<button type="button" class="iconact tgl" data-cl="toggle" data-id="${esc(x.id)}" aria-expanded="${!isClosed}" title="${isClosed ? "Show" : "Hide"} what is inside" aria-label="${isClosed ? "Show" : "Hide"} what is inside ${esc(x.name)}">${isClosed ? "&#9656;" : "&#9662;"}</button>` : '<span class="cl-nobtn"></span>';
    const share = evenShare(state, x.id);
    const cap = depth === 0 && x.parentId === "" ? (x.capacity !== undefined ? String(x.capacity) : '<span class="muted">-</span>') : share !== undefined ? `<span class="muted" title="The total shared evenly down">about ${share}</span>` : '<span class="muted">-</span>';
    const row = `<tr class="cl-trow${x.parentId === "" ? " cl-top" : ""}" data-find="${esc(`${x.name} ${x.label} ${x.place}`.toLowerCase())}"><td class="cl-treecell"><div class="cl-node">${lines(guides, last, depth)}${toggle}<span class="cl-icon" aria-hidden="true">${n > 0 ? "&#128193;" : "&#128196;"}</span><b>${esc(x.name)}</b>${n > 0 ? `<span class="pill" title="Directly inside">${n}</span>` : ""}</div></td><td>${esc(x.label)}</td><td class="muted">${esc(x.place)}</td><td class="num">${cap}</td><td>${statusPill(x)}</td>
      <td class="actcol">${gear(x)}<button type="button" class="iconact ok" data-cl="sub-open" data-id="${esc(x.id)}" title="Add a sub cluster inside" aria-label="Add a sub cluster inside ${esc(x.name)}">+</button>${remove(x)}</td></tr>`;
    return row + (adding === x.id ? addSub(x.id, depth) : "");
  }).join("");
  const anyFolder = rows.some((r) => kids(r.cluster.id) > 0);
  return `${anyFolder ? '<div class="cl-bar"><button type="button" data-cl="expand-all">Expand all</button><button type="button" data-cl="collapse-all">Collapse all</button></div>' : ""}
    <div class="tablewrap"><table class="subtable cl-table cl-tree"><thead><tr><th>Cluster</th><th>Called</th><th>Location</th><th class="num">Capacity</th><th>Status</th><th class="actcol"></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---- The list: every cluster as a tree ----
function listHtml(state: ClusterState): string {
  const tops = state.clusters.filter((c) => c.parentId === "");
  return `<section><h3>Clusters <span class="muted">(${state.clusters.length})</span></h3>
    <p class="muted">A cluster is how a project is distributed: a school, a university, a home, a region. The tree shows every cluster with the sub clusters inside it. Use the gear to set one up, + to add a sub cluster inside it.</p>
    ${searchBox(state.clusters.length)}
    ${tops.length ? treeHtml(state, "", clusterUi.adding) : '<p class="muted">No clusters yet. Add the first one below.</p>'}
    ${labelsList(state)}
    <div class="cl-add"><input id="cl-tname" placeholder="New cluster, for example Lahore University" aria-label="New cluster name">
      <input id="cl-tlabel" list="cl-labels" value="${esc(suggestLabel(state, ""))}" placeholder="Called, for example University" aria-label="What it is called"><input id="cl-tplace" placeholder="Location" aria-label="Location"><input id="cl-tcap" type="number" min="0" placeholder="Total capacity" aria-label="Total capacity">
      <button type="button" class="iconact ok" data-cl="cluster-add" data-id="" title="Add the cluster" aria-label="Add the cluster">+</button></div></section>`;
}

// ---- One cluster: its path, Details and Inside ----
function detailsHtml(state: ClusterState, c: Cluster): string {
  const share = evenShare(state, c.id);
  const top = c.parentId === "";
  return `<section class="cl-form">
    <label>Name<input id="cn-name" value="${esc(c.name)}"></label>
    <label>Called<input id="cn-label" list="cl-labels" value="${esc(c.label)}" placeholder="For example Home, Faculty, Classroom"></label>
    <label>Location<input id="cn-place" value="${esc(c.place)}"></label>
    <label>Roles it needs<input id="cn-roles" value="${esc((c.roles ?? []).join(", "))}" placeholder="For example Principal, Warden (separate with commas)"></label>
    <label>Status<select id="cn-status"><option value="active"${c.status === "active" ? " selected" : ""}>Active</option><option value="closed"${c.status === "closed" ? " selected" : ""}>Closed</option></select></label>
    ${top ? `<label>Total capacity<input id="cn-capacity" type="number" min="0" value="${c.capacity ?? ""}" placeholder="Shared evenly down through what is inside"></label>` : `<p class="muted">Capacity is set on the master cluster. Its even share here is ${share !== undefined ? `about <b>${share}</b>` : "not set yet"}, as a guide.</p>`}
    <div class="actions"><button type="button" data-cl="node-save" data-id="${esc(c.id)}">Save</button></div>
    ${labelsList(state)}</section>`;
}

function insideHtml(state: ClusterState, c: Cluster, adding: string): string {
  const n = insideCount(state, c.id);
  return `<section>${searchBox(n)}
    ${n ? treeHtml(state, c.id, adding) : "<p class=\"muted\">No sub clusters yet. Add the first one below.</p>"}
    <div class="cl-add"><input id="cl-bname" placeholder="New sub cluster, for example Classroom 1" aria-label="New sub cluster name"><input id="cl-blabel" list="cl-labels" value="${esc(suggestLabel(state, c.id))}" placeholder="Called" aria-label="What it is called"><input id="cl-bplace" placeholder="Location" aria-label="Location">
      <button type="button" class="iconact ok" data-cl="cluster-add-b" data-id="${esc(c.id)}" title="Add inside ${esc(c.name)}" aria-label="Add inside ${esc(c.name)}">+</button></div>${labelsList(state)}</section>`;
}

function clusterHtml(state: ClusterState, c: Cluster, people?: PeopleContext): string {
  const path = pathOf(state, c.id);
  const crumbs = ['<button type="button" class="linkish" data-cl="goto" data-id="">Clusters</button>', ...path.map((p, i) => (i === path.length - 1 ? `<b>${esc(p.name)}</b>` : `<button type="button" class="linkish" data-cl="goto" data-id="${esc(p.id)}">${esc(p.name)}</button>`))].join('<span class="cl-sep" aria-hidden="true"> &rsaquo; </span>');
  const n = insideCount(state, c.id);
  const tab = clusterUi.nodeTab;
  return `<nav class="cl-path" aria-label="Where you are">${crumbs}</nav>
    <nav class="pf-tabs" role="tablist"><button type="button" role="tab" class="${tab === "details" ? "on" : ""}" data-cl="node-tab" data-tab="details">Details</button><button type="button" role="tab" class="${tab === "inside" ? "on" : ""}" data-cl="node-tab" data-tab="inside">Sub-Clusters <span class="muted">(${n})</span></button>${people ? `<button type="button" role="tab" class="${tab === "people" ? "on" : ""}" data-cl="node-tab" data-tab="people">Beneficiaries <span class="muted">(${peopleCount(state, people, c.id)})</span></button>` : ""}${people && (people.stockItems ?? []).length > 0 ? `<button type="button" role="tab" class="${tab === "outcomes" ? "on" : ""}" data-cl="node-tab" data-tab="outcomes">Outcomes <span class="muted">(${stockHere(state, people, c.id).length})</span></button>` : ""}</nav>
    ${tab === "people" && people ? clusterPeopleHtml(state, c, people) : tab === "outcomes" && people ? clusterStockHtml(state, c, people) : tab === "inside" ? insideHtml(state, c, clusterUi.adding) : detailsHtml(state, c)}`;
}

export function clustersTabHtml(state: ClusterState, error = "", people?: PeopleContext): string {
  const open = clusterUi.node === "" ? undefined : state.clusters.find((c) => c.id === clusterUi.node);
  return `<div class="pf-body">
    ${error ? `<div class="note" role="alert">${esc(error)}</div>` : clusterUi.notice ? `<div class="note ok" role="status">${esc(clusterUi.notice)}</div>` : ""}
    ${open ? clusterHtml(state, open, people) : listHtml(state)}
  </div>`;
}
