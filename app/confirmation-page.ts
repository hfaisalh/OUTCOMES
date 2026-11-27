/**
 * confirmation-page.ts
 *
 * What it does: draws the Confirmation page (DECISIONS 231, 243), the step after Assignment where each assigned gift waits for its partner to say yes or no. The list has one line for each batch (a partner's batch), with how far it has been answered. A line opens a window with the gifts in the batch, where a person answers for the partner one gift at a time or for the whole batch. Four tiles (waiting, late, confirmed, rejected) count batches and filter the list.
 * A partner that holds a parked outcome ready is confirmed for by OUTCOMES, and the gift says so. A late answer is only advised: the gift says how many days late and points to Assignment, where a person may move it.
 * Who calls it: app/main.ts. Depends on: app/confirmation-rows.ts and app/confirmation-window.ts, and View and esc from app/pages.ts. Pure: it takes a View and returns HTML.
 */

import { shortDate } from "./dates";
import { esc, type View } from "./pages";
import { rowsOf } from "./confirmation-rows";
import { answerBar, batchesOf, batchLabel, type Batch } from "./confirmation-window";

export type ConfirmFilter = "all" | "waiting" | "late" | "confirmed" | "rejected";

// Rule: a batch is waiting or late if any gift in it is. It is confirmed when every gift is, and rejected if any gift was.
const matches = (b: Batch, f: ConfirmFilter): boolean => f === "all" || (f === "late" ? b.late > 0 : f === "waiting" ? b.waiting > 0 : f === "confirmed" ? b.waiting === 0 && b.rejected === 0 : b.rejected > 0);

export function confirmationPage(v: View): string {
  const rows = rowsOf(v);
  const all = batchesOf(rows);
  const filter = v.cnfFilter ?? "all";
  const count = (f: ConfirmFilter): number => all.filter((b) => matches(b, f)).length;
  const gifts = (f: ConfirmFilter): number => all.filter((b) => matches(b, f)).reduce((n, b) => n + b.gifts.length, 0);
  const tile = (f: ConfirmFilter, label: string, cls = ""): string => `<button type="button" class="metric tile${cls}" data-tile="cnf:${f}" aria-pressed="${filter === f ? "true" : "false"}"><b>${count(f)}</b><span>${label}</span><div class="smrow"><span class="sm"><b>${gifts(f)}</b> gifts</span></div></button>`;
  const shown = all.filter((b) => matches(b, filter));
  const line = (b: Batch): string => `<tr class="rowlink" data-cnfwin="${esc(b.id)}" tabindex="0"><td class="clip">${esc(b.partner)}</td><td>${batchLabel(b.batch)}</td><td class="num">${b.gifts.length}</td><td class="num">${esc(shortDate(b.assigned))}</td><td class="num">${b.due ? esc(shortDate(b.due)) : ""}</td><td><div class="cw-answers">${answerBar(b)}<span class="muted">${b.confirmed + b.rejected} of ${b.gifts.length} answered</span>${b.late ? ` <span class="pill unrouted">Late ${b.late}</span>` : ""}${b.rejected ? ` <span class="pill review">${b.rejected} rejected</span>` : ""}</div></td><td class="acts"><button type="button" data-cnfwin="${esc(b.id)}">Open</button></td></tr>`;
  return `<h1>Confirmation</h1>
    <p class="sub">A partner has a number of days, set on the workflow, to confirm or reject the gifts assigned to it. Each line is one batch: open it to see the gifts in it and to answer for a partner that has told you, one gift at a time or the whole batch. A partner that already holds a parked outcome for the benefit is confirmed for automatically. A late answer is only advised: you decide whether to move the gift.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${tile("waiting", "Batches waiting")}${tile("late", "Late", count("late") ? " warn" : "")}${tile("confirmed", "Confirmed")}${tile("rejected", "With a rejection", count("rejected") ? " warn" : "")}</div>
    <div class="card"><h2>Batches <span class="muted">(${shown.length})</span></h2>
      ${shown.length ? `<div class="tablewrap"><table><thead><tr><th>Partner</th><th>Batch</th><th class="num">Gifts</th><th class="num">Assigned</th><th class="num">Answer by</th><th>Answers</th><th></th></tr></thead><tbody>${shown.map(line).join("")}</tbody></table></div>` : `<div class="empty">${rows.length === 0 ? "Nothing is assigned yet. Gifts appear here once Assignment hands them to a partner." : "Nothing matches this tile."}</div>`}</div>`;
}
