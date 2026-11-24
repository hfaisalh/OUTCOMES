/**
 * clusters-tab.ts
 *
 * What it does: the Clusters tab of the project window (DECISIONS 158, 161). A cluster is the master distribution of a project (a school, a university, a care home) and holds as many sub clusters
 * as are needed (a faculty, a department, a classroom), each with its own name, label, place, roles and status. The tab shows the clusters first: the top ones are the visible rows, and the sub clusters
 * are a drop down list under each, closed until opened. A "+" on a row adds a sub cluster inside it. A row at the bottom adds a top cluster. There is no level setup: how deep a cluster is comes from where it sits.
 * Rule (Faisal): capacity is set on the top cluster only. Sub clusters show their even share of it as a guide ("about 10").
 * Pure: it takes the clusters and returns HTML. Who calls it: app/project-form.ts. Depends on: modules/06-projects/clusters.ts and esc from pages.ts.
 */

import { clusterRows, evenShare, suggestLabel, type ClusterState } from "../modules/06-projects/clusters";
import { esc } from "./pages";

// What is opened, kept for the session so adding or editing does not close it: the clusters whose sub list is showing, and the cluster a sub cluster is being added to ("" none).
export const openClusters = new Set<string>();
export const clusterUi = { adding: "" };

export function clustersTabHtml(state: ClusterState, error = ""): string {
  const rows = clusterRows(state);
  const byId = new Map(state.clusters.map((c) => [c.id, c]));
  // Rule: a row shows only when every cluster above it is opened.
  const shown = (parentId: string): boolean => parentId === "" || (openClusters.has(parentId) && shown(byId.get(parentId)?.parentId ?? ""));
  const kids = (id: string): number => state.clusters.filter((c) => c.parentId === id).length;
  const labels = [...new Set(state.clusters.map((c) => c.label).filter((l) => l !== ""))];
  const addSub = (parentId: string): string => `<tr class="cl-addrow"><td colspan="7" style="padding-left:${10 + (rows.find((r) => r.cluster.id === parentId)?.depth ?? 0) * 22 + 22}px"><div class="cl-add"><input id="cl-sname" placeholder="New sub cluster, for example Classroom 1" aria-label="New sub cluster name"><input id="cl-slabel" list="cl-labels" value="${esc(suggestLabel(state, parentId))}" placeholder="Called" aria-label="What it is called"><input id="cl-splace" placeholder="Place" aria-label="Place">
      <button type="button" class="iconact ok" data-cl="cluster-add" data-id="${esc(parentId)}" title="Add the sub cluster" aria-label="Add the sub cluster">+</button><button type="button" class="iconact" data-cl="sub-cancel" title="Cancel" aria-label="Cancel">&times;</button></div></td></tr>`;
  const tree = rows.filter(({ cluster: c }) => shown(c.parentId)).map(({ cluster: c, depth }) => {
    const n = kids(c.id);
    const open = openClusters.has(c.id);
    const toggle = n > 0 ? `<button type="button" class="iconact" data-cl="toggle" data-id="${esc(c.id)}" aria-expanded="${open}" title="${open ? "Hide" : "Show"} the sub clusters" aria-label="${open ? "Hide" : "Show"} the sub clusters of ${esc(c.name)}">${open ? "&#9662;" : "&#9656;"}</button>` : '<span class="cl-nobtn"></span>';
    const share = evenShare(state, c.id);
    const cap = depth === 0 ? `<input type="number" min="0" data-cl="capacity" data-id="${esc(c.id)}" value="${c.capacity ?? ""}" placeholder="Total" aria-label="Total capacity">` : share !== undefined ? `<span class="muted" title="The total shared evenly down">about ${share}</span>` : '<span class="muted">-</span>';
    const row = `<tr${depth === 0 ? ' class="cl-top"' : ""}><td style="padding-left:${10 + depth * 22}px"><span class="cl-name">${toggle}<input data-cl="name" data-id="${esc(c.id)}" value="${esc(c.name)}" aria-label="Cluster name">${n > 0 ? `<span class="pill" title="Sub clusters inside">${n}</span>` : ""}</span></td>
      <td><input data-cl="label" list="cl-labels" data-id="${esc(c.id)}" value="${esc(c.label)}" placeholder="Called" aria-label="What it is called"></td>
      <td><input data-cl="place" data-id="${esc(c.id)}" value="${esc(c.place)}" placeholder="Place" aria-label="Place"></td>
      <td><input data-cl="roles" data-id="${esc(c.id)}" value="${esc((c.roles ?? []).join(", "))}" placeholder="Roles, for example Principal" aria-label="Roles"></td>
      <td class="num">${cap}</td>
      <td><select data-cl="status" data-id="${esc(c.id)}" aria-label="Status"><option value="active"${c.status === "active" ? " selected" : ""}>Active</option><option value="closed"${c.status === "closed" ? " selected" : ""}>Closed</option></select></td>
      <td class="actcol"><button type="button" class="iconact ok" data-cl="sub-open" data-id="${esc(c.id)}" title="Add a sub cluster inside" aria-label="Add a sub cluster inside ${esc(c.name)}">+</button><button type="button" class="iconact" data-cl="cluster-rm" data-id="${esc(c.id)}" title="Remove this cluster" aria-label="Remove ${esc(c.name)}">&times;</button></td></tr>`;
    return row + (clusterUi.adding === c.id ? addSub(c.id) : "");
  }).join("");
  const addTop = `<div class="cl-add"><input id="cl-tname" placeholder="New cluster, for example Lahore University" aria-label="New cluster name">
      <input id="cl-tlabel" list="cl-labels" value="${esc(suggestLabel(state, ""))}" placeholder="Called, for example University" aria-label="What it is called"><input id="cl-tplace" placeholder="Place" aria-label="Place"><input id="cl-tcap" type="number" min="0" placeholder="Total capacity" aria-label="Total capacity">
      <button type="button" class="iconact ok" data-cl="cluster-add" data-id="" title="Add the cluster" aria-label="Add the cluster">+</button></div>`;
  return `<div class="pf-body">
    ${error ? `<div class="note" role="alert">${esc(error)}</div>` : ""}
    <section><h3>Clusters <span class="muted">(${state.clusters.length})</span></h3>
      <p class="muted">A cluster is how a project is distributed: a school, a university, a home, a region. Press + on a cluster to add sub clusters inside it (a faculty, a department, a classroom), as many as you need. Each has its own name, label, place and roles. Set the capacity once, on the cluster: it is shared evenly down.</p>
      ${rows.length ? `<div class="tablewrap"><table class="subtable cl-table"><thead><tr><th>Cluster</th><th>Called</th><th>Place</th><th>Roles</th><th class="num">Capacity</th><th>Status</th><th class="actcol"></th></tr></thead><tbody>${tree}</tbody></table></div>` : '<p class="muted">No clusters yet. Add the first one below.</p>'}
      <datalist id="cl-labels">${labels.map((l) => `<option value="${esc(l)}"></option>`).join("")}</datalist>
      ${addTop}</section>
    <p class="muted">Who holds each role, and the beneficiaries enrolled in each cluster, come next.</p>
  </div>`;
}
