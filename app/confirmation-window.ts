/**
 * confirmation-window.ts
 *
 * What it does: groups the assigned gifts into batches (a partner's batch, DECISIONS 203) for the Confirmation page, and draws the window that opens on one batch (DECISIONS 243): how far it has been answered, "Confirm all" and "Reject all" for the whole batch, and every gift in it with its own Confirm and Reject.
 * Who calls it: app/confirmation-page.ts (batchesOf) and app/main.ts (confirmationWindowHtml, drawn outside the page). Depends on: app/confirmation-rows.ts, View and esc from app/pages.ts. Pure: it takes rows or a View and returns data or HTML.
 */

import { shortDate } from "./dates";
import { esc, type View } from "./pages";
import { actions, answerCell, isLate, rowsOf, type Row } from "./confirmation-rows";

// --- Batches ---
export interface Batch { id: string; partnerId: string; partner: string; batch: number; gifts: Row[]; waiting: number; late: number; confirmed: number; rejected: number; assigned: string; due: string }

// Rule: a batch is one partner's batch number. Gifts assigned with no batch number are grouped as batch 0, "No batch".
export const batchId = (partnerId: string, batch: number | undefined): string => `${partnerId}|${batch ?? 0}`;

export function batchesOf(rows: Row[]): Batch[] {
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(batchId(r.partnerId, r.batch), [...(by.get(batchId(r.partnerId, r.batch)) ?? []), r]);
  const out = [...by.entries()].map(([id, gifts]): Batch => {
    const waiting = gifts.filter((g) => g.st.state === "waiting");
    return {
      id, partnerId: gifts[0]!.partnerId, partner: gifts[0]!.partner, batch: gifts[0]!.batch ?? 0, gifts, waiting: waiting.length, late: waiting.filter(isLate).length,
      confirmed: gifts.filter((g) => g.st.state === "confirmed").length, rejected: gifts.filter((g) => g.st.state === "rejected").length,
      assigned: gifts.map((g) => g.assigned).sort()[0] ?? "", due: waiting.map((g) => g.st.due).sort()[0] ?? "",
    };
  });
  // The ones that need a person first: late, then waiting by last day, then those with a rejection, then the finished.
  const order = (b: Batch): number => (b.late > 0 ? 0 : b.waiting > 0 ? 1 : b.rejected > 0 ? 2 : 3);
  return out.sort((x, y) => order(x) - order(y) || x.due.localeCompare(y.due) || x.partner.localeCompare(y.partner) || x.batch - y.batch);
}

export const batchLabel = (n: number): string => (n === 0 ? "No batch" : `Batch ${n}`);

// A bar of how far a batch is answered: confirmed, rejected, then still waiting.
export function answerBar(b: Batch): string {
  const n = Math.max(1, b.gifts.length);
  const w = (x: number): string => `${((x / n) * 100).toFixed(1)}%`;
  return `<span class="cw-bar" role="img" aria-label="${b.confirmed} confirmed, ${b.rejected} rejected, ${b.waiting} waiting"><i class="ok" style="width:${w(b.confirmed)}"></i><i class="no" style="width:${w(b.rejected)}"></i><i class="late" style="width:${w(b.late)}"></i></span>`;
}

// --- The window ---
export function confirmationWindowHtml(v: View, id: string): string {
  const b = batchesOf(rowsOf(v)).find((x) => x.id === id);
  if (!b) return "";
  const waitingKeys = b.gifts.filter((g) => g.st.state === "waiting").map((g) => g.key);
  const stat = (n: number, label: string, cls = ""): string => `<span class="cw-stat${cls}"><b>${n}</b> ${label}</span>`;
  const bulk = b.waiting > 0
    ? `<div class="cw-bulk"><button type="button" class="primary" data-cnf="confirm-batch" data-keys="${esc(waitingKeys.join(" "))}">Confirm all ${b.waiting} waiting</button>
        <input data-cnf-batchreason placeholder="Why, to reject them all" aria-label="Reason for rejecting the whole batch" />
        <button type="button" data-cnf="reject-batch" data-keys="${esc(waitingKeys.join(" "))}">Reject all ${b.waiting}</button></div>
       <p class="muted cw-note">Only the gifts still waiting are answered. A gift that already has an answer is left as it is.</p>`
    : `<p class="muted cw-note">Every gift in this batch has an answer.${b.rejected ? ` <button type="button" data-nav="assignment" data-cnfclose="x">Choose other partners in Assignment</button>` : ""}</p>`;
  const rows = b.gifts.map((r) => `<tr><td class="clip" title="${esc(r.gift)}">${esc(r.gift)}</td><td class="num">${esc(shortDate(r.assigned))}</td><td class="num">${esc(shortDate(r.st.due))}</td><td>${answerCell(r)}</td><td class="acts">${actions(r)}</td></tr>`).join("");
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Batch" data-cnfclose="overlay"><div class="pf-box">
    <header class="gw-head"><div><h2>${esc(b.partner)}</h2><div class="gw-sub"><span class="muted">${[batchLabel(b.batch), `${b.gifts.length} gift${b.gifts.length === 1 ? "" : "s"}`, `assigned ${esc(shortDate(b.assigned))}`, ...(b.due ? [`answer by ${esc(shortDate(b.due))}`] : [])].join(" · ")}</span></div></div><button data-cnfclose="x" aria-label="Close">Close</button></header>
    <div class="pf-body gw cw-body">
      <section class="cw-hero">${answerBar(b)}<div class="cw-stats">${b.late ? stat(b.late, "late", " warn") : ""}${b.waiting - b.late > 0 || (b.waiting === 0 && b.late === 0) ? stat(b.waiting - b.late, "waiting") : ""}${stat(b.confirmed, "confirmed")}${b.rejected ? stat(b.rejected, "rejected", " warn") : ""}</div></section>
      <section class="gw-card"><h3>Answer for the whole batch</h3>${bulk}</section>
      <section class="gw-card"><h3>Gifts in this batch</h3><div class="cw-list"><table><thead><tr><th>Gift</th><th class="num">Assigned</th><th class="num">Answer by</th><th>Answer</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>
    </div>
  </div></div>`;
}
