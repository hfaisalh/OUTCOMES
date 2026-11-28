/**
 * partner-dashboard.ts
 *
 * What it does: the partner's dashboard at the top of its home screen (DECISIONS 327): what it has to answer and deliver, what is late or sent back, its quality, and its gifts as bubbles of age against stage. A first version, to be improved with the partners.
 * Who calls it: app/portal/partner-home.ts. Depends on: the partner's figures (modules/13-partner-portal/dashboard.ts) and the age chart (app/dashboard/scatter-chart.ts). Pure: it takes the slice and today and returns HTML.
 * UX: late and sent back are said in words with the days (never colour alone); the list puts what is most late first; the quality figures only appear once there is something to measure.
 */

import { partnerDash, QUALITY_WORDS, type AttentionItem } from "../../modules/13-partner-portal/dashboard";
import type { PartnerSlice } from "../../modules/13-partner-portal/scope";
import { scatterHtml } from "../dashboard/scatter-chart";
import { shortDate } from "../shared/dates";
import { SYM } from "../shared/symbols";
import { esc, plural } from "./partner-outcomes";

const tile = (n: number, label: string, late = 0, lateWord = "late"): string => `<div class="metric${late > 0 ? " warn" : ""}"><b>${n}</b><span>${esc(label)}</span>${late > 0 ? `<div class="smrow"><span class="sm"><b>${late}</b> ${esc(lateWord)}</span></div>` : ""}</div>`;

function itemHtml(a: AttentionItem): string {
  const status = a.kind === "sent-back" ? `<span class="pill unrouted">${SYM.pastDue} Sent back</span>` : a.lateDays > 0 ? `<span class="pill unrouted">${SYM.pastDue} Late ${plural(a.lateDays, "day", "days")}</span>` : `<span class="pill">Due ${esc(shortDate(a.due))}</span>`;
  return `<li class="pd-item${a.lateDays > 0 || a.kind === "sent-back" ? " late" : ""}"><div class="pd-what"><b>${esc(a.benefit)}</b><span>${esc(a.what)}</span></div><div class="pd-st">${status}${a.lateDays > 0 && a.due ? `<span class="muted pd-d">was due ${esc(shortDate(a.due))}</span>` : ""}</div></li>`;
}

function qualityHtml(q: ReturnType<typeof partnerDash>["quality"]): string {
  const row = (label: string, v: number | null, hint: string): string => `<div class="pd-q"><div class="pd-q-h"><span>${esc(label)}</span><b>${v === null ? "No figure yet" : `${v}%`}</b></div><span class="meter" role="img" aria-label="${esc(label)}: ${v === null ? "not enough yet" : `${v} per cent`}"><i style="width:${v ?? 0}%"></i></span><span class="muted pd-hint">${esc(hint)}</span></div>`;
  return `<section class="card pd-card" aria-labelledby="pd-qh"><h2 id="pd-qh">Your quality score</h2>
    <div class="pd-score"><b>${q.score === null ? "–" : `${q.score}%`}</b><span>${esc(QUALITY_WORDS(q.score))}</span></div>
    ${row("Right first time", q.rightFirstTime, "Work MWF accepted at review without sending it back.")}${row("Answers on time", q.answersOnTime, "Gifts you accepted or refused by the day asked.")}${row("Steps on time", q.stepsOnTime, "Phases finished by their due day.")}</section>`;
}

export function partnerDashboardHtml(s: PartnerSlice, today: string): string {
  const d = partnerDash(s, today);
  const c = d.counts;
  if (s.assignments.length === 0) return `<section class="pd" aria-labelledby="pd-h"><h2 id="pd-h" class="pd-title">Your work at a glance</h2><div class="card"><div class="empty">No gift has been assigned to you yet. When one is, your figures appear here.</div></div></section>`;
  const list = d.attention.slice(0, 8);
  return `<section class="pd" aria-labelledby="pd-h"><h2 id="pd-h" class="pd-title">Your work at a glance</h2>
    <div class="metrics pd-tiles">${tile(c.toAnswer, "To accept or refuse", c.lateAnswers)}${tile(c.inDelivery, "In delivery", c.lateSteps, "with a late step")}${tile(c.sentBack, "Sent back to you")}${tile(c.complete, "Complete")}</div>
    <div class="pd-grid"><div class="pd-col">
      <section class="card pd-card" aria-labelledby="pd-ah"><h2 id="pd-ah">Needs your attention</h2>${list.length ? `<ul class="pd-list">${list.map(itemHtml).join("")}</ul>${d.attention.length > list.length ? `<p class="muted">The ${list.length} most urgent of ${d.attention.length} are shown.</p>` : ""}` : `<div class="empty">Nothing is waiting on you.</div>`}</section>
      ${qualityHtml(d.quality)}</div>
      <div class="pd-col">${scatterHtml(d.lives, today, 90, { own: true })}</div></div></section>`;
}
