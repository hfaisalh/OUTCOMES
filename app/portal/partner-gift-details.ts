/**
 * partner-gift-details.ts
 *
 * What it does: the "Gift details" panel under a gift in the partner's batch (DECISIONS 259): everything a partner may know to decide whether to accept it, in plain words and a fixed order: what it is, how big, one-off or recurring, the cause and intention, the tribute, what delivering it involves, and the last day to answer.
 * Who calls it: app/portal/partner-batches.ts, when a person opens a gift's details. Depends on: the gift detail type (modules/13-partner-portal/gift-details.ts) and app/shared/dates.ts. Pure: it takes the detail and returns HTML.
 * Data flow: the detail comes with the partner's own slice, so it holds no donor and no money. A fact that is empty shows "Not given", so a gap is never hidden.
 */

import type { GiftDetail } from "../../modules/13-partner-portal/gift-details";
import { shortDate } from "../shared/dates";
import { esc, plural } from "./partner-outcomes";

const NONE = `<span class="muted">Not given</span>`;
const text = (s: string): string => (s.trim() === "" ? NONE : esc(s));

// One line for each phase: its name and the days it has.
function delivery(d: GiftDetail): string {
  const phases = d.phases.length === 0 ? `<span class="muted">No phases are set for this workflow.</span>` : `<ol class="gd-phases">${d.phases.map((p) => `<li>${esc(p.label)} <span class="muted">${plural(p.days, "day", "days")}</span></li>`).join("")}</ol>`;
  const after = [d.review ? "MWF reviews the work" : "", d.feedback ? "the donor is asked for feedback" : ""].filter((x) => x !== "").join(", then ");
  return `${phases}${after ? `<div class="muted">After delivery: ${esc(after)}.</div>` : ""}`;
}

export function giftDetailHtml(d: GiftDetail): string {
  const kind = d.recurring ? `Recurring${d.planned ? `: ${d.paid ?? 0} of ${d.planned} payments made` : d.paid ? `: ${plural(d.paid, "payment", "payments")} made so far` : ""}` : "One-off";
  const row = (label: string, value: string): string => `<div class="gd-row"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  return `<dl class="gd">${row("Gift reference", esc(d.reference))}${row("Units to deliver", String(d.units))}${row("Type", esc(kind))}${row("Cause", text(d.cause))}${row("Intention", text(d.intention))}${row("Tribute", text(d.tribute))}${row("Answer by", esc(shortDate(d.answerBy)))}${row("To deliver it", delivery(d))}</dl>`;
}
