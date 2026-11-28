/**
 * confirmation-rows.ts
 *
 * What it does: the rows of Confirmation (DECISIONS 231, 243): one for each live assignment, with its answer worked out by the rules, and the small pieces both the batch list and the batch window draw (the answer cell and a gift's buttons).
 * Who calls it: app/allocation/confirmation-page.ts (the list of batches) and app/allocation/confirmation-window.ts (the window of one batch). Depends on: modules/11-confirmation/confirmation.ts (the rules), modules/08-assignment/assignment.ts, and View and esc from app/shared/pages.ts. Pure: it takes a View and returns rows or HTML.
 */

import { prioritySet } from "../../modules/08-assignment/priority-gifts";
import { assignables, contextFrom, emptyAssignments, liveRecords } from "../../modules/08-assignment/assignment";
import { confirmationOf, DEFAULT_CONFIRM_DAYS, type ConfirmStatus } from "../../modules/11-confirmation/confirmation";
import { confirmDaysOf } from "../../modules/02-project-rules/workflows";
import { shortDate } from "../shared/dates";
import { SYM } from "../shared/symbols";
import { esc, type View } from "../shared/pages";

// --- The rows: one for each live assignment, with its answer worked out by the rules ---
export interface Row { key: string; gift: string; site: string; currency: string; partnerId: string; partner: string; batch: number | undefined; assigned: string; st: ConfirmStatus; onBehalf: boolean; by: string }

export function rowsOf(v: View): Row[] {
  const today = v.today ?? "2026-01-01";
  const partners = v.projects ?? [];
  const ctx = contextFrom({ urgent: prioritySet(v.priorityGifts), workOrders: v.workOrders, partners, giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now: `${today}T00:00:00Z` });
  const units = new Map(assignables(ctx).map((u) => [u.key, u]));
  const answers = v.confirmations?.records ?? [];
  return liveRecords(ctx, (v.assignments ?? emptyAssignments()).records).map((a) => {
    const u = units.get(a.key);
    const fw = (v.frameworks ?? []).find((f) => f.id === (u?.w.frameworkId ?? ""));
    const st = confirmationOf(a, answers, fw ? confirmDaysOf(fw) : DEFAULT_CONFIRM_DAYS, today);
    const ans = answers.filter((r) => r.key === a.key && r.partnerId === a.partnerId && r.at >= a.at).sort((x, y) => y.at.localeCompare(x.at))[0];
    return { key: a.key, partnerId: a.partnerId, gift: u ? `${u.w.supporterName} · ${u.w.itemName}` : a.key, site: u?.w.site ?? "", currency: u?.w.currency ?? "", partner: partners.find((p) => p.id === a.partnerId)?.name ?? a.partnerId, batch: a.batch, assigned: a.at.slice(0, 10), st, onBehalf: ans?.onBehalf === true, by: ans?.by ?? "" };
  });
}

// Rule: late is waiting past the last day to answer. The tiles and the filter use the same test.
export const isLate = (r: Row): boolean => r.st.state === "waiting" && r.st.lateDays > 0;

// --- The answer cell and the buttons ---
export function answerCell(r: Row): string {
  if (r.st.state === "confirmed") return `<span class="pill ready" title="${esc(`Confirmed ${shortDate(r.st.answeredAt.slice(0, 10))}${r.by ? ` by ${r.by}` : ""}`)}">${SYM.ok} Confirmed</span>${r.onBehalf ? ` <span class="muted" title="The partner holds a parked outcome ready for this benefit, so OUTCOMES confirmed for it.">for the partner</span>` : ""}`;
  if (r.st.state === "rejected") return `<span class="pill review" title="${esc(r.st.reason)}">${SYM.cancelled} Rejected</span> <span class="muted">${esc(r.st.reason)}</span>`;
  if (isLate(r)) return `<span class="pill unrouted" title="Past the last day to answer. Open Assignment to move it to another partner.">${SYM.pastDue} Late ${r.st.lateDays} day${r.st.lateDays === 1 ? "" : "s"}</span>`;
  return `<span class="pill">${SYM.waiting} Waiting</span>`;
}
export const actions = (r: Row): string => r.st.state === "waiting"
  ? `<button type="button" class="primary" data-cnf="confirm" data-key="${esc(r.key)}">Confirm</button> <input data-cnf-reason="${esc(r.key)}" placeholder="Why, to reject" aria-label="Reason for rejecting" /> <button type="button" data-cnf="reject" data-key="${esc(r.key)}">Reject</button>`
  : r.st.state === "rejected" ? `<button type="button" data-nav="assignment">Choose another partner</button>` : "";
