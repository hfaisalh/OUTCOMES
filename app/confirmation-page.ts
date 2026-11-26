/**
 * confirmation-page.ts
 *
 * What it does: draws the Confirmation page (DECISIONS 231), the step after Assignment where each assigned gift waits for its partner to say yes or no. Four tiles (waiting, late, confirmed, rejected) that filter the list, and a list with the gift, the partner and batch, the day it was assigned, the last day to answer, the answer, and the buttons for a person to answer for the partner.
 * A partner that holds a parked outcome ready is confirmed for by OUTCOMES, and the row says so. A late answer is only advised: the row says how many days late and points to Assignment, where a person may move the gift.
 * Who calls it: app/main.ts. Depends on: modules/11-confirmation/confirmation.ts (the rules), modules/08-assignment/assignment.ts, and View and esc from app/pages.ts. Pure: it takes a View and returns HTML.
 */

import { assignables, contextFrom, emptyAssignments, liveRecords } from "../modules/08-assignment/assignment";
import { confirmationOf, DEFAULT_CONFIRM_DAYS, type ConfirmStatus } from "../modules/11-confirmation/confirmation";
import { confirmDaysOf } from "../modules/02-project-rules/workflows";
import { shortDate } from "./dates";
import { SYM } from "./symbols";
import { esc, type View } from "./pages";

const MAX_ROWS = 150;
export type ConfirmFilter = "all" | "waiting" | "late" | "confirmed" | "rejected";

// --- The rows: one for each live assignment, with its answer worked out by the rules ---
interface Row { key: string; gift: string; partner: string; batch: number | undefined; assigned: string; st: ConfirmStatus; onBehalf: boolean; by: string }

function rowsOf(v: View): Row[] {
  const today = v.today ?? "2026-01-01";
  const partners = v.projects ?? [];
  const ctx = contextFrom({ workOrders: v.workOrders, partners, giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now: `${today}T00:00:00Z` });
  const units = new Map(assignables(ctx).map((u) => [u.key, u]));
  const answers = v.confirmations?.records ?? [];
  return liveRecords(ctx, (v.assignments ?? emptyAssignments()).records).map((a) => {
    const u = units.get(a.key);
    const fw = (v.frameworks ?? []).find((f) => f.id === (u?.w.frameworkId ?? ""));
    const st = confirmationOf(a, answers, fw ? confirmDaysOf(fw) : DEFAULT_CONFIRM_DAYS, today);
    const ans = answers.filter((r) => r.key === a.key && r.partnerId === a.partnerId && r.at >= a.at).sort((x, y) => y.at.localeCompare(x.at))[0];
    return { key: a.key, gift: u ? `${u.w.supporterName} · ${u.w.itemName}` : a.key, partner: partners.find((p) => p.id === a.partnerId)?.name ?? a.partnerId, batch: a.batch, assigned: a.at.slice(0, 10), st, onBehalf: ans?.onBehalf === true, by: ans?.by ?? "" };
  });
}

// Rule: late is waiting past the last day to answer. The tiles and the filter use the same test.
const isLate = (r: Row): boolean => r.st.state === "waiting" && r.st.lateDays > 0;
const matches = (r: Row, f: ConfirmFilter): boolean => f === "all" || (f === "late" ? isLate(r) : f === "waiting" ? r.st.state === "waiting" : r.st.state === f);
// The ones that need a person first: late, then waiting by last day, then rejected (a partner must be chosen again), then confirmed.
const ORDER = (r: Row): number => (isLate(r) ? 0 : r.st.state === "waiting" ? 1 : r.st.state === "rejected" ? 2 : 3);

// --- The answer cell and the buttons ---
function answerCell(r: Row): string {
  if (r.st.state === "confirmed") return `<span class="pill ready" title="${esc(`Confirmed ${shortDate(r.st.answeredAt.slice(0, 10))}${r.by ? ` by ${r.by}` : ""}`)}">${SYM.ok} Confirmed</span>${r.onBehalf ? ` <span class="muted" title="The partner holds a parked outcome ready for this benefit, so OUTCOMES confirmed for it.">for the partner</span>` : ""}`;
  if (r.st.state === "rejected") return `<span class="pill review" title="${esc(r.st.reason)}">${SYM.cancelled} Rejected</span> <span class="muted">${esc(r.st.reason)}</span>`;
  if (isLate(r)) return `<span class="pill unrouted" title="Past the last day to answer. Open Assignment to move it to another partner.">${SYM.pastDue} Late ${r.st.lateDays} day${r.st.lateDays === 1 ? "" : "s"}</span>`;
  return `<span class="pill">${SYM.waiting} Waiting</span>`;
}
const actions = (r: Row): string => r.st.state === "waiting"
  ? `<button type="button" class="primary" data-cnf="confirm" data-key="${esc(r.key)}">Confirm</button> <input data-cnf-reason="${esc(r.key)}" placeholder="Why, to reject" aria-label="Reason for rejecting" /> <button type="button" data-cnf="reject" data-key="${esc(r.key)}">Reject</button>`
  : r.st.state === "rejected" ? `<button type="button" data-nav="assignment">Choose another partner</button>` : "";

export function confirmationPage(v: View): string {
  const all = rowsOf(v);
  const filter = v.cnfFilter ?? "all";
  const count = (f: ConfirmFilter): number => all.filter((r) => matches(r, f)).length;
  const tile = (f: ConfirmFilter, label: string, cls = ""): string => `<button type="button" class="metric tile${cls}" data-tile="cnf:${f}" aria-pressed="${filter === f ? "true" : "false"}"><b>${count(f)}</b><span>${label}</span></button>`;
  const shown = all.filter((r) => matches(r, filter)).sort((x, y) => ORDER(x) - ORDER(y) || x.st.due.localeCompare(y.st.due));
  const rows = shown.slice(0, MAX_ROWS).map((r) => `<tr><td class="clip" title="${esc(r.gift)}">${esc(r.gift)}</td><td class="clip">${esc(r.partner)}</td><td class="num">${r.batch ?? ""}</td><td class="num">${esc(shortDate(r.assigned))}</td><td class="num">${esc(shortDate(r.st.due))}</td><td>${answerCell(r)}</td><td class="acts">${actions(r)}</td></tr>`).join("");
  return `<h1>Confirmation</h1>
    <p class="sub">A partner has a number of days, set on the workflow, to confirm or reject each gift assigned to it. A person answers here for a partner that has told you. A partner that already holds a parked outcome for the benefit is confirmed for automatically. A late answer is only advised: you decide whether to move the gift.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${tile("waiting", "Waiting")}${tile("late", "Late", count("late") ? " warn" : "")}${tile("confirmed", "Confirmed")}${tile("rejected", "Rejected", count("rejected") ? " warn" : "")}</div>
    <div class="card"><h2>Assigned gifts <span class="muted">(${shown.length})</span></h2>
      ${rows ? `<div class="tablewrap"><table><thead><tr><th>Gift</th><th>Partner</th><th class="num">Batch</th><th class="num">Assigned</th><th class="num">Answer by</th><th>Answer</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown. Use the tiles to narrow the list.</p>` : ""}` : `<div class="empty">${all.length === 0 ? "Nothing is assigned yet. Gifts appear here once Assignment hands them to a partner." : "Nothing matches this tile."}</div>`}</div>`;
}
