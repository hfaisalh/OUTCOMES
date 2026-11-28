/**
 * progress-window.ts
 *
 * What it does: the window that opens on one gift of the Progress page (DECISIONS 322): what is being reviewed (the gift, who it was for, the partner, what it funds, the steps with their dates), and the decision at the foot. At Review the decision is Reviewed or Reject with a reason; at any other step it is the one button for the next step.
 * Who calls it: app/allocation/progress-window-session.ts, which draws it outside the page so a redraw does not close it. Depends on: standingsOf and the gift lookup (progress-page.ts), the shared dates, symbols and escape. Pure: it takes the View and a gift key and returns HTML.
 * Data flow: the buttons are the same ones the rows used (data-prg="next" and "reject"), handled in app/shared/list-events.ts; data-prgwinclose closes the window as the action is sent.
 */

import { siteBadge } from "../shared/site-chip";
import { shortDate } from "../shared/dates";
import { SYM } from "../shared/symbols";
import { esc, type View } from "../shared/pages";
import { STAGE_VERBS, type StageId } from "../../modules/12-progress/progress";
import { giftUnitsOf, standingsOf } from "./progress-page";

const row = (label: string, value: string): string => `<div class="gd-row"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;

export function progressWindowHtml(v: View, key: string): string {
  const s = standingsOf(v).find((x) => x.key === key);
  if (!s || !s.allocated) return "";
  const u = giftUnitsOf(v).get(key);
  const partner = (v.projects ?? []).find((p) => p.id === s.partnerId)?.name ?? s.partnerId;
  // What the gift funds: the beneficiary (by name) or the outcome (by reference). A beneficiary's own details stay on their record, not here.
  const held = (v.allocations?.records ?? []).filter((r) => r.key === key && r.to === undefined);
  const funds = held.map((r) => {
    if (r.kind !== "beneficiary") return esc(r.outcomeRef);
    const e = (v.enrolments?.records ?? []).find((x) => x.id === r.enrolmentId);
    return esc((v.beneficiaries?.records ?? []).find((b) => b.id === e?.beneficiaryId)?.name ?? r.enrolmentId);
  }).join(", ") || '<span class="muted">Not allocated</span>';
  const steps = s.steps.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.done ? `${SYM.ok} ${esc(shortDate(x.doneAt))}` : '<span class="muted">Not yet</span>'}</td><td class="num">${esc(shortDate(x.due))}</td><td>${x.lateDays > 0 ? `<span class="pill unrouted">Late ${x.lateDays} day${x.lateDays === 1 ? "" : "s"}</span>` : ""}</td></tr>`).join("");
  const rejections = (v.progress?.records ?? []).filter((r) => r.key === key && r.kind === "reject").sort((a, b) => b.at.localeCompare(a.at));
  const history = rejections.length ? `<section class="gw-card"><h3>Sent back before</h3><ul class="pw-hist">${rejections.map((r) => `<li><b>${esc(shortDate(r.at))}</b> ${esc(r.reason ?? "")} <span class="muted">${esc(r.by)}</span></li>`).join("")}</ul></section>` : "";
  const back = s.sentBack ? `<div class="note warnnote" role="status">${SYM.pastDue} Sent back to the partner (${esc(s.sentBack.phase)}): ${esc(s.sentBack.reason)}</div>` : "";
  // The decision. At Review: Reviewed, or Reject with a reason. Otherwise: the one next step. Taking a back-step is "Undo".
  const decision = !s.next ? `<p class="muted">Every step of this gift is taken.</p>`
    : s.next.id === "review"
      ? `<div class="pw-decide"><button type="button" class="primary" data-prg="next" data-key="${esc(key)}" data-prgwinclose="1">Reviewed</button>
         <label class="pw-why"><span>If it is not right, say why, so the partner knows what to put right</span><input class="rj" data-rj="${esc(key)}" placeholder="Reason, to reject" aria-label="Reason for rejecting the work"></label>
         <button type="button" data-prg="reject" data-key="${esc(key)}" data-prgwinclose="1">Reject, send back to the partner</button></div>`
      : `<div class="pw-decide"><button type="button" class="primary" data-prg="next" data-key="${esc(key)}">${esc(s.next.kind === "phase" ? `Done: ${s.next.label}` : STAGE_VERBS[s.next.id as StageId])}</button></div>`;
  const any = s.steps.some((x) => x.done);
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Gift progress" data-prgwinclose="overlay"><div class="pf-box">
    <header role="none" class="gw-head"><div><h2>${u ? siteBadge(u.w.site, u.w.currency) : ""}${esc(u ? u.w.itemName : key)}</h2><div class="gw-sub"><span class="muted">${esc([partner, s.batch !== undefined ? `Batch ${s.batch}` : "", s.ongoing && (s.round ?? 1) > 1 ? `Ongoing, round ${s.round}` : ""].filter(Boolean).join(" · "))}</span></div></div><button data-prgwinclose="x" aria-label="Close">Close</button></header>
    <div class="pf-body gw">
      ${back}
      <section class="gw-card"><h3>What you are reviewing</h3><dl class="gd">${row("Gift", esc(u ? `${u.w.supporterName} · paid ${shortDate(u.w.paidDate)}` : key))}${row("Project", esc((v.giftProjects ?? []).find((g) => g.id === (v.assignments?.records ?? []).find((a) => a.key === key)?.giftProjectId)?.name ?? "None"))}${row("Funds", funds)}${row("Units", String(u?.parts ?? ""))}</dl></section>
      <section class="gw-card"><h3>Steps</h3><div class="tablewrap"><table><thead><tr><th>Step</th><th>Taken</th><th class="num">Due</th><th><span class="sr-only">Late</span></th></tr></thead><tbody>${steps}</tbody></table></div></section>
      ${history}
      <section class="gw-card"><h3>Your decision</h3>${decision}${any ? `<p><button type="button" data-prg="undo" data-key="${esc(key)}" title="Take the latest step back">Undo the latest step</button></p>` : ""}</section>
    </div>
  </div></div>`;
}
