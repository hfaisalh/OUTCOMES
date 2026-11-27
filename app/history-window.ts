/**
 * history-window.ts
 *
 * What it does: the allocation history windows (DECISIONS 186), small pop-ups so the history does not crowd the gift window or a cluster. Two of them: for one gift, every child (or outcome) it has held; for one place
 * (a child enrolled in a cluster for a benefit), every gift that has sponsored it. Each row has the day it started, the day it ended or "Now", the units, and why it ended. Newest first.
 * Pure: it takes the records and the lookups and returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/09-allocation/history.ts, 06-projects/clusters.ts and esc from pages.ts.
 */

import { clusterStateOf, pathOf } from "../modules/06-projects/clusters";
import type { GiftProject } from "../modules/06-projects/projects";
import type { Beneficiary } from "../modules/07-beneficiaries/beneficiaries";
import type { Enrolment } from "../modules/07-beneficiaries/enrolments";
import { historyOfEnrolment, historyOfGift, type HistoryRow } from "../modules/09-allocation/history";
import type { Allocation } from "../modules/09-allocation/allocation";
import { shortDate } from "./dates";
import { esc } from "./pages";

export interface HistoryData {
  allocations: Allocation[]; // every record, ended ones included
  enrolments: Enrolment[];
  beneficiaries: Beneficiary[];
  giftProjects: GiftProject[];
  gifts: Map<string, { donor: string; item: string; payments: number }>; // by allocation key: the donor, the item, and how many payments it has
  itemName: (itemId: string) => string;
}

const frame = (title: string, sub: string, body: string): string => `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Allocation history"><div class="pf-box">
    <header><h2>${title}</h2><button data-hist="close" aria-label="Close">Close</button></header>
    <div class="pf-body">${sub ? `<p class="muted">${sub}</p>` : ""}${body}</div>
    <footer><button data-hist="close">Close</button></footer>
  </div></div>`;

const when = (r: HistoryRow): string => `<td>${esc(shortDate(r.from))}</td><td>${r.holds ? '<span class="pill">Now</span>' : esc(shortDate(r.to))}</td>`;
const why = (r: HistoryRow): string => `<td class="muted">${r.holds ? "" : esc(r.why)}</td>`;

// Where a place is: the project and the cluster path from the master cluster down.
function where(d: HistoryData, enrolmentId: string): string {
  const e = d.enrolments.find((x) => x.id === enrolmentId);
  if (!e) return "";
  const gp = d.giftProjects.find((g) => g.id === e.giftProjectId);
  return `${gp ? esc(gp.name) : ""} › ${esc(pathOf(clusterStateOf(gp?.levels, gp?.clusters), e.clusterId).map((c) => c.name).join(" › "))}`;
}
const childOf = (d: HistoryData, enrolmentId: string): { name: string; id: string } => {
  const e = d.enrolments.find((x) => x.id === enrolmentId);
  const b = e ? d.beneficiaries.find((x) => x.id === e.beneficiaryId) : undefined;
  return { name: b?.name ?? (e ? e.beneficiaryId : "A beneficiary that no longer exists"), id: e?.beneficiaryId ?? "" };
};

// The history of one gift: every child (or outcome) it has held.
export function giftHistoryHtml(d: HistoryData, key: string): string {
  const g = d.gifts.get(key);
  const rows = historyOfGift(d.allocations, key);
  const body = rows.length === 0 ? '<div class="empty">This gift has not been allocated yet.</div>' : `<div class="tablewrap"><table class="subtable"><thead><tr><th>Beneficiary or outcome</th><th>Where</th><th class="num">Units</th><th>From</th><th>To</th><th>Why it ended</th></tr></thead><tbody>${rows.map((r) => {
    const who = r.outcomeRef ? `<b>${esc(r.outcomeRef)}</b> <span class="muted">outcome</span>` : `<b>${esc(childOf(d, r.enrolmentId).name)}</b> <span class="muted">${esc(childOf(d, r.enrolmentId).id)}</span>`;
    return `<tr><td>${who}</td><td class="muted">${r.outcomeRef ? "" : where(d, r.enrolmentId)}</td><td class="num">${r.units}</td>${when(r)}${why(r)}</tr>`;
  }).join("")}</tbody></table></div>`;
  return frame(`Allocation history${g ? ` <span class="muted">${esc(g.donor)} · ${esc(g.item)}</span>` : ""}`, g && g.payments > 1 ? `A recurring gift of ${g.payments} payments. Each row is a beneficiary it held, from the day it was allocated until the day it ended.` : "Each row is a beneficiary or outcome this gift held, from the day it was allocated until the day it ended.", body);
}

// The history of one place: every gift that has sponsored this child for this benefit.
export function enrolmentHistoryHtml(d: HistoryData, enrolmentId: string): string {
  const e = d.enrolments.find((x) => x.id === enrolmentId);
  const c = childOf(d, enrolmentId);
  const rows = historyOfEnrolment(d.allocations, enrolmentId);
  const body = rows.length === 0 ? '<div class="empty">No gift has been allocated to this beneficiary yet.</div>' : `<div class="tablewrap"><table class="subtable"><thead><tr><th>Gift</th><th class="num">Units</th><th>From</th><th>To</th><th>Why it ended</th></tr></thead><tbody>${rows.map((r) => {
    const g = d.gifts.get(r.key);
    return `<tr><td>${g ? `<b>${esc(g.donor)}</b> <span class="muted">${esc(g.item)}${g.payments > 1 ? ` · recurring, ${g.payments} payments` : ""}</span>` : `<span class="muted">${esc(r.key)}</span>`}</td><td class="num">${r.units}</td>${when(r)}${why(r)}</tr>`;
  }).join("")}</tbody></table></div>`;
  return frame(`Sponsorship history <span class="muted">${esc(c.name)}${e ? ` · ${esc(d.itemName(e.itemId))}` : ""}</span>`, `${e ? where(d, enrolmentId) : ""}. Each row is a gift that sponsored this beneficiary, from the day it was allocated until the day it ended.`, body);
}
