/**
 * cluster-people.ts
 *
 * What it does: the Beneficiaries tab of a cluster or sub cluster (DECISIONS 167). It lists who is enrolled here and in everything inside it (name and ID, benefit, role, where, since), with a button to end an
 * enrolment and a list to move it to another cluster of the project. A form enrols a beneficiary from the register: the benefit (one the project offers), the beneficiary, and a role if the cluster lists any.
 * On a master cluster it says how much of the total capacity is taken. The rules (who a benefit allows, approval first, capacity, roles) are in modules/07-beneficiaries/enrolments.ts and answer with a message
 * that is shown above the tab. Pure: it takes the project's clusters, the register and the enrolments and returns HTML.
 * The Outcomes tab (DECISIONS 209, 210) lists the outcomes a partner has parked in the cluster, with a form to park one. Each tab has its form on top, then its list in a framed box, and a row's actions sit behind a small menu.
 * Who calls it: app/clusters-tab.ts. Depends on: modules 06 (clusters) and 07 (beneficiaries, enrolments) and esc from pages.ts.
 */

import { ELIGIBILITY_LABEL, type Beneficiary } from "../modules/07-beneficiaries/beneficiaries";
import { activeIn, masterOf, type Enrolment } from "../modules/07-beneficiaries/enrolments";
import { countOfEnrolment } from "../modules/09-placement/history";
import type { Placement } from "../modules/09-placement/placement";
import { usedStock, type StockItem } from "../modules/09-placement/stock";
import { pathOf, type Cluster, type ClusterState } from "../modules/06-projects/clusters";
import { esc } from "./pages";

// What the tab needs besides the clusters: the project, the benefits it can enrol for, the register and the enrolments.
export interface PeopleContext {
  projectId: string;
  items: { id: string; name: string }[]; // the benefits the project offers (all flagged items when it names none)
  itemNames?: Record<string, string>; // the name of every benefit, so a row never shows a code (DECISIONS 210)
  enrolItemIds?: string[]; // the benefits a person or household can be enrolled for: not those where the gift comes first or there is no beneficiary. All when not given
  beneficiaries: Beneficiary[];
  enrolments: Enrolment[];
  stock?: StockItem[]; // the parked outcomes partners have loaded in this project (DECISIONS 209)
  stockItems?: { id: string; name: string }[]; // the benefits that can have parked outcomes: the gift comes first, or there is no beneficiary
  partners?: { id: string; name: string }[]; // the partners of this project
  placements?: Placement[]; // every placement, ended ones included, for the history button (DECISIONS 186)
}

// How many people are enrolled in a cluster and everything inside it (role holders are not counted), for the tab's count.
export const peopleCount = (state: ClusterState, ctx: PeopleContext, clusterId: string): number => activeIn({ records: ctx.enrolments, counter: 0 }, state, ctx.projectId, clusterId, true).length;

// A row's actions behind one small menu, so the name and the benefit keep the width: move to another cluster, or end the enrolment (DECISIONS 210).
const rowMenu = (inner: string): string => `<details class="rowmenu"><summary title="Actions" aria-label="Actions">&#8943;</summary><div class="rowmenu-box">${inner}</div></details>`;

export function clusterPeopleHtml(state: ClusterState, c: Cluster, ctx: PeopleContext): string {
  const enr = { records: ctx.enrolments, counter: 0 };
  const here = activeIn(enr, state, ctx.projectId, c.id);
  const name = (id: string): Beneficiary | undefined => ctx.beneficiaries.find((b) => b.id === id);
  const itemName = (id: string): string => ctx.itemNames?.[id] ?? ctx.items.find((i) => i.id === id)?.name ?? id;
  const where = (id: string): string => { const p = pathOf(state, id); return p.slice(pathOf(state, c.id).length - 1).map((x) => x.name).join(" › "); };
  const moveTargets = (e: Enrolment): string => `<select data-cl="enr-move" data-id="${esc(e.id)}" aria-label="Move to another cluster"><option value="">Move to...</option>${state.clusters.filter((x) => x.id !== e.clusterId && x.status === "active").map((x) => `<option value="${esc(x.id)}">${esc(pathOf(state, x.id).map((p) => p.name).join(" \u203A "))}</option>`).join("")}</select>`;
  const rows = here.map((e) => {
    const b = name(e.beneficiaryId);
    const n = countOfEnrolment(ctx.placements ?? [], e.id);
    return `<tr><td class="nm"><b>${esc(b?.name ?? e.beneficiaryId)}</b> <span class="muted">${esc(e.beneficiaryId)}</span></td><td>${esc(itemName(e.itemId))}</td><td>${esc(e.role)}</td><td class="muted">${esc(e.clusterId === c.id ? "Here" : where(e.clusterId))}</td><td class="muted">${esc(e.since)}</td>
      <td class="actcol">${n > 0 ? `<button type="button" class="linkish" data-hist="enrolment" data-id="${esc(e.id)}" title="Every gift that has sponsored this child">History (${n})</button> ` : ""}${rowMenu(`${moveTargets(e)}<button type="button" class="danger" data-cl="enr-end" data-id="${esc(e.id)}">End this enrolment</button>`)}</td></tr>`;
  }).join("");
  // Capacity: the total belongs to the master cluster, and counts everyone inside it except role holders.
  const top = masterOf(state, c.id);
  const taken = top ? activeIn(enr, state, ctx.projectId, top.id, true).length : 0;
  const capacity = top && top.capacity !== undefined ? `<p class="muted"><b>${taken}</b> of <b>${top.capacity}</b> places taken in ${esc(top.name)}.</p>` : "";
  const people = ctx.beneficiaries.filter((b) => b.status === "active");
  const roles = c.roles ?? [];
  // Rule (DECISIONS 210): only a benefit that takes a person or a household is offered here. A benefit where the gift comes first, or with no beneficiary, is parked on the Outcomes tab instead.
  const enrolItems = ctx.items.filter((i) => ctx.enrolItemIds === undefined || ctx.enrolItemIds.includes(i.id));
  const form = enrolItems.length === 0 ? '<p class="muted">No benefit of this project takes a person. Choose its benefits on the project\'s Details tab.</p>' : people.length === 0 ? '<p class="muted">The register is empty. Add people on the Beneficiaries page first.</p>' :
    `<div class="cl-add"><select id="en-item" aria-label="Benefit">${enrolItems.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("")}</select>
      <select id="en-ben" aria-label="Beneficiary">${people.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} (${esc(b.id)})${b.kind === "person" && b.eligibility ? ` \u00B7 ${esc(ELIGIBILITY_LABEL[b.eligibility])}` : ""}</option>`).join("")}</select>
      <select id="en-role" aria-label="Role"><option value="">No role (an ordinary beneficiary)</option>${roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select>
      <button type="button" class="iconact ok" data-cl="enr-add" data-id="${esc(c.id)}" title="Enrol in ${esc(c.name)}" aria-label="Enrol in ${esc(c.name)}">+</button></div>
      <p class="muted small">A person must have the admission decision Ready before being enrolled where a beneficiary comes first. The benefit's type decides whether it takes a person or a household. A role holder does not use up a place.</p>`;
  return `<section>${capacity}
    <h4 class="wf-h">Enrol someone in ${esc(c.name)}</h4>
    ${form}
    ${here.length ? `<div class="tablewrap listframe"><table class="subtable"><thead><tr><th>Beneficiary</th><th>Benefit</th><th>Role</th><th>Where</th><th>Since</th><th class="actcol"></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Nobody is enrolled here yet.</p>'}</section>`;
}

// The parked outcomes in a cluster and inside it (DECISIONS 209): outcomes a partner has loaded ahead of any gift. A gift assigned to the partner takes one.
export const stockHere = (state: ClusterState, ctx: PeopleContext, clusterId: string): StockItem[] => (ctx.stock ?? []).filter((s) => s.clusterId === clusterId || pathOf(state, s.clusterId).some((x) => x.id === clusterId));

export function clusterStockHtml(state: ClusterState, c: Cluster, ctx: PeopleContext): string {
  const itemName = (id: string): string => ctx.itemNames?.[id] ?? ctx.items.find((i) => i.id === id)?.name ?? id;
  const where = (id: string): string => { const p = pathOf(state, id); return p.slice(pathOf(state, c.id).length - 1).map((x) => x.name).join(" \u203A "); };
  const used = usedStock((ctx.placements ?? []).filter((p) => p.to === undefined));
  const refOf = (id: string): string => (ctx.placements ?? []).find((p) => p.stockId === id && p.to === undefined)?.outcomeRef ?? "";
  const here = stockHere(state, ctx, c.id);
  const partnerName = (id: string): string => ctx.partners?.find((p) => p.id === id)?.name ?? id;
  const rows = here.map((s) => `<tr><td class="nm"><b>${esc(s.name)}</b> <span class="muted">${esc(s.id)}</span></td><td>${esc(itemName(s.itemId))}</td><td>${esc(partnerName(s.partnerId))}</td><td class="muted">${esc(s.clusterId === c.id ? "Here" : where(s.clusterId))}</td><td>${used.has(s.id) ? `<span class="pill">Used by ${esc(refOf(s.id))}</span>` : '<span class="pill ready">Free</span>'}</td><td class="actcol">${used.has(s.id) ? "" : rowMenu(`<button type="button" class="danger" data-cl="stock-rm" data-id="${esc(s.id)}">Remove this outcome</button>`)}</td></tr>`).join("");
  const form = (ctx.stockItems ?? []).length === 0 ? "" : (ctx.partners ?? []).length === 0 ? '<p class="muted">Add a partner to this project first, on its Details tab.</p>' :
    `<div class="cl-add"><select id="st-item" aria-label="Benefit">${(ctx.stockItems ?? []).map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("")}</select>
      <select id="st-partner" aria-label="Partner">${(ctx.partners ?? []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select>
      <input id="st-name" type="text" maxlength="120" placeholder="Name, for example the village or site" aria-label="Name of the outcome" />
      <button type="button" class="iconact ok" data-cl="stock-add" data-id="${esc(c.id)}" title="Park an outcome in ${esc(c.name)}" aria-label="Park an outcome in ${esc(c.name)}">+</button></div>`;
  return `<section>
    <h4 class="wf-h">Park an outcome in ${esc(c.name)}</h4>
    <p class="muted small">A partner can load the outcomes it is ready to deliver, so a gift assigned to it takes one straight away.</p>
    ${form}
    ${here.length ? `<div class="tablewrap listframe"><table class="subtable"><thead><tr><th>Outcome</th><th>Benefit</th><th>Partner</th><th>Where</th><th>State</th><th class="actcol"></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Nothing is parked here yet.</p>'}</section>`;
}
