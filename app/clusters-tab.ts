/**
 * clusters-tab.ts
 *
 * What it does: the Clusters tab of the project window (DECISIONS 158). A cluster organises a cohort of beneficiaries inside a project: a region, a classroom, a tent village, a medical camp.
 * The tab has the project's levels on one line (edited in place, for example Region > Classroom) and the clusters as a tree with one row each: name, level, place, capacity and status.
 * A row at the bottom adds a cluster. Pure: it takes a project and returns HTML.
 * Who calls it: app/project-form.ts. Depends on: modules/06-projects/clusters.ts and esc from pages.ts.
 */

import { clusterRows, orderedLevels, type ClusterState } from "../modules/06-projects/clusters";
import { esc } from "./pages";

export function clustersTabHtml(state: ClusterState, error = ""): string {
  const levels = orderedLevels(state);
  const rows = clusterRows(state);
  const levelName = (id: string): string => levels.find((l) => l.id === id)?.name ?? "";
  const chips = levels.map((l, i) => `${i ? '<span class="cl-sep" aria-hidden="true">&rsaquo;</span>' : ""}<span class="cl-level"><input data-cl="level-name" data-id="${esc(l.id)}" value="${esc(l.name)}" aria-label="Level name" size="${Math.max(8, l.name.length + 1)}"><button type="button" class="iconact" data-cl="level-rm" data-id="${esc(l.id)}" title="Remove this level" aria-label="Remove the level ${esc(l.name)}">&times;</button></span>`).join("");
  const tree = rows.map(({ cluster: c, depth, levelName: ln }) => `<tr><td style="padding-left:${10 + depth * 22}px"><input data-cl="name" data-id="${esc(c.id)}" value="${esc(c.name)}" aria-label="Cluster name"></td><td class="muted">${esc(ln)}</td>
      <td><input data-cl="place" data-id="${esc(c.id)}" value="${esc(c.place)}" placeholder="Place" aria-label="Place"></td><td class="num"><input type="number" min="0" data-cl="capacity" data-id="${esc(c.id)}" value="${c.capacity ?? ""}" placeholder="Capacity" aria-label="Capacity"></td>
      <td><select data-cl="status" data-id="${esc(c.id)}" aria-label="Status"><option value="active"${c.status === "active" ? " selected" : ""}>Active</option><option value="closed"${c.status === "closed" ? " selected" : ""}>Closed</option></select></td>
      <td class="actcol"><button type="button" class="iconact" data-cl="cluster-rm" data-id="${esc(c.id)}" title="Remove this cluster" aria-label="Remove ${esc(c.name)}">&times;</button></td></tr>`).join("");
  const add = levels.length
    ? `<div class="cl-add"><input id="cl-name" placeholder="New cluster, for example Classroom 5A" aria-label="New cluster name">
        <select id="cl-level" aria-label="Level">${levels.map((l) => `<option value="${esc(l.id)}" data-parent="${esc(l.parentId)}">${esc(l.name)}</option>`).join("")}</select>
        <select id="cl-parent" aria-label="Inside which cluster">${state.clusters.map((c) => `<option value="${esc(c.id)}" data-level="${esc(c.levelId)}">${esc(levelName(c.levelId))}: ${esc(c.name)}</option>`).join("")}</select>
        <input id="cl-place" placeholder="Place" aria-label="Place"><input id="cl-capacity" type="number" min="0" placeholder="Capacity" aria-label="Capacity">
        <button type="button" class="iconact ok" data-cl="cluster-add" title="Add the cluster" aria-label="Add the cluster">+</button></div>
      <p class="muted">A cluster of the first level sits in nothing. A cluster of any other level sits inside a cluster of the level above.</p>`
    : "";
  return `<div class="pf-body">
    ${error ? `<div class="note" role="alert">${esc(error)}</div>` : ""}
    <section><h3>Levels</h3><p class="muted">The groups beneficiaries are organised in inside this project, from the biggest to the smallest, for example Region, then Classroom. A project can have no clusters.</p>
      <div class="cl-levels">${chips || '<span class="muted">No levels yet.</span>'}</div>
      <div class="actions"><input id="cl-newlevel" placeholder="${levels.length ? "Next level, for example Classroom" : "First level, for example Region, Block or Tent village"}" aria-label="New level name"><button type="button" data-cl="level-add">Add level</button></div></section>
    <section><h3>Clusters <span class="muted">(${state.clusters.length})</span></h3>
      ${rows.length ? `<div class="tablewrap"><table class="subtable cl-table"><thead><tr><th>Cluster</th><th>Level</th><th>Place</th><th class="num">Capacity</th><th>Status</th><th class="actcol"></th></tr></thead><tbody>${tree}</tbody></table></div>` : levels.length ? '<p class="muted">No clusters yet. Add the first one below.</p>' : '<p class="muted">Add a level first, then the clusters in it.</p>'}
      ${add}</section>
    <p class="muted">Roles for each level (a class teacher, a warden, a site engineer) and the beneficiaries in each cluster come next.</p>
  </div>`;
}
