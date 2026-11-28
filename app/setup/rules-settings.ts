/**
 * rules-settings.ts
 *
 * What it does: the controls that sit beside each group of rules on the Rules page (DECISIONS 283, 325). Each uses the same data attributes as the Workflows, Benefits and Gifts screens, so the one change handler serves them all and each rule is changed in a single place.
 * Who calls it: app/setup/rules-page.ts. Depends on: the workflow helpers (modules/02-project-rules/workflows.ts), the switch component, the allocation order control and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: a change on a control is handled in app/setup/workflow-events.ts or app/main.ts; the page is then drawn again from the new setup.
 */

import { normaliseSteps } from "../../modules/09-allocation/order";
import { stepsHtml } from "./rules-steps";
import { switchHtml } from "../shared/switch";
import { CYCLE_LABELS, FULFILLED_LABELS, type Cycle, type Fulfilled } from "../../modules/02-project-rules/categories";
import { assignOf, confirmDaysOf, flagOf, fulfilledOf, reportLoopOf, unitModeOf } from "../../modules/02-project-rules/workflows";
import { batchSizeOf } from "../../modules/08-assignment/batches";
import { DEFAULT_DAYS } from "../../modules/02-project-rules/timeline";
import { esc, type View } from "../shared/pages";

export const DEFAULT_GRACE = 15;
const noWorkflow = `<p class="muted">No workflow yet. Add one on the Workflows page.</p>`;

// --- Assigning and confirming ---
export function assignSettings(v: View): string {
  const fws = v.frameworks ?? [];
  if (fws.length === 0) return noWorkflow;
  const partners = v.projects ?? [];
  const own = partners.filter((p) => p.batchSize !== undefined);
  return `<h3>Each workflow</h3><div class="tablewrap"><table class="ru-table"><thead><tr><th>Workflow</th><th>Assign</th><th>Priority gifts first</th><th>Move to another partner</th><th class="num">Days to confirm</th></tr></thead><tbody>${fws.map((f) => `<tr><th scope="row">${esc(f.name)}</th>
    <td><select data-wf-assign="${esc(f.id)}" aria-label="How ${esc(f.name)} is assigned"><option value="auto"${assignOf(f, undefined) === "auto" ? " selected" : ""}>Automatically</option><option value="suggest"${assignOf(f, undefined) === "suggest" ? " selected" : ""}>Suggest only</option></select></td>
    <td>${switchHtml({ label: `Priority gifts first in ${f.name}`, on: flagOf(f, "urgent"), attrs: `data-wf-flag="urgent" data-wf="${esc(f.id)}"`, compact: true })}</td>
    <td>${switchHtml({ label: `Move ${f.name} gifts to another partner`, on: flagOf(f, "reassign"), attrs: `data-wf-flag="reassign" data-wf="${esc(f.id)}"`, compact: true })}</td>
    <td class="num"><input type="number" min="0" max="60" data-wf-confirm="days" data-wf="${esc(f.id)}" value="${confirmDaysOf(f)}" aria-label="Days the partner has to confirm ${esc(f.name)}"></td></tr>`).join("")}</tbody></table></div>
    <p class="muted">A batch is ${batchSizeOf(undefined)} gifts unless a partner has its own size${own.length ? ` (${own.map((p) => `${esc(p.name)} ${p.batchSize}`).join(", ")})` : ""}. Set a partner's on its page.</p>`;
}
export const confirmSettings = (): string => `<p class="muted">The days to confirm are set for each workflow, in the table under Assigning a gift to a partner.</p>`;

// --- Allocating, waiting, releasing ---
export const allocateSettings = (v: View): string => `${stepsHtml(v.allocationSteps ?? normaliseSteps(undefined))}<h3>Setting</h3>${switchHtml({ label: "Allocate only to beneficiaries that have an ID", on: v.requireRef === true, attrs: 'data-require-ref="1"' })}`;

export function waitingSettings(v: View): string {
  const gps = v.giftProjects ?? [];
  if (gps.length === 0) return `<p class="muted">No project yet.</p>`;
  return `<h3>Enrol automatically, by project</h3><ul class="ru-list">${gps.map((g) => `<li><span>${esc(g.name)}</span><span class="pill ${g.enrolAuto ? "ready" : ""}">${g.enrolAuto ? "On" : "Off"}</span></li>`).join("")}</ul><p class="muted">Change it on the project's own window.</p>`;
}
export const releaseSettings = (v: View): string => `<h3>Setting</h3><label class="wf-field"><span>Days a payment may be unpaid before a place may be released</span><input type="number" min="0" max="90" data-grace="1" value="${v.graceDays ?? DEFAULT_GRACE}" aria-label="Grace days"></label>`;

// --- Delivery, review and fulfilment (DECISIONS 316, 320, 324) ---
export function deliverySettings(v: View): string {
  const fws = v.frameworks ?? [];
  if (fws.length === 0) return noWorkflow;
  return `<h3>Each workflow</h3><div class="tablewrap"><table class="ru-table"><thead><tr><th>Workflow</th><th>Release only when fully paid</th><th>Fulfilled when</th><th>MWF reviews</th><th>Donor feedback</th></tr></thead><tbody>${fws.map((f) => `<tr><th scope="row">${esc(f.name)}</th>
    <td>${switchHtml({ label: `Release ${f.name} only when fully paid`, on: unitModeOf(f) === "once", attrs: `data-wf-full="${esc(f.id)}"`, compact: true })}</td>
    <td><select data-wf-fulfilled="${esc(f.id)}" aria-label="When a ${esc(f.name)} gift counts as fulfilled">${(Object.keys(FULFILLED_LABELS) as Fulfilled[]).map((k) => `<option value="${k}"${fulfilledOf(f) === k ? " selected" : ""}>${esc(FULFILLED_LABELS[k].split(":")[0] ?? k)}</option>`).join("")}</select></td>
    <td>${switchHtml({ label: `MWF reviews the work of ${f.name}`, on: flagOf(f, "approve"), attrs: `data-wf-flag="approve" data-wf="${esc(f.id)}"`, compact: true })}</td>
    <td>${switchHtml({ label: `The donor is asked for feedback on ${f.name}`, on: flagOf(f, "feedback"), attrs: `data-wf-flag="feedback" data-wf="${esc(f.id)}"`, compact: true })}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted">The days of each phase are set on the workflow's own page, under Allocation.</p>`;
}

// --- Reporting that repeats (DECISIONS 317, 318) ---
export function reportingSettings(v: View): string {
  const fws = v.frameworks ?? [];
  if (fws.length === 0) return noWorkflow;
  return `<h3>Each workflow</h3><div class="tablewrap"><table class="ru-table"><thead><tr><th>Workflow</th><th>Repeat the report</th><th>How often</th><th class="num">Report for (months)</th></tr></thead><tbody>${fws.map((f) => {
    if (unitModeOf(f) === "once") return `<tr><th scope="row">${esc(f.name)}</th><td colspan="3" class="muted">Reported once, when it is complete (released only when fully paid).</td></tr>`;
    const every = reportLoopOf(f);
    return `<tr><th scope="row">${esc(f.name)}</th><td>${switchHtml({ label: `Repeat the report of ${f.name}`, on: every !== null, attrs: `data-wf-loop="${esc(f.id)}"`, compact: true })}</td>
      <td>${every ? `<select data-tpl="cycle" data-tplid="${esc(f.id)}" aria-label="How often the report of ${esc(f.name)} repeats">${(Object.keys(CYCLE_LABELS) as Cycle[]).filter((y) => y !== "on_delivery").map((y) => `<option value="${y}"${y === f.cycle ? " selected" : ""}>${esc(CYCLE_LABELS[y])}</option>`).join("")}</select>` : '<span class="muted">Not repeated</span>'}</td>
      <td class="num">${every ? `<input type="number" min="1" max="240" data-wf-loopmonths="${esc(f.id)}" value="${f.loopMonths ?? ""}" placeholder="While it runs" aria-label="Months of reporting for ${esc(f.name)}">` : ""}</td></tr>`;
  }).join("")}</tbody></table></div><p class="muted">Leave the months empty to report for as long as the gift runs. The loop also ends when the plan does.</p>`;
}

// --- How the clock runs (DECISIONS 316) ---
export function timingSettings(v: View): string {
  const own = Object.keys(v.itemTimelines ?? {}).length;
  return `<h3>Days to fulfil a gift</h3><p>The default is <b>${DEFAULT_DAYS} days</b>. ${own ? `${own} benefit${own === 1 ? " has" : "s have"} their own number.` : "No benefit has its own number yet."}</p><p class="muted">Set the days for a benefit on the Benefits page, in the Days to fulfil column. Whether the journey starts at the first or the full payment is set for each workflow, in the table under Delivery.</p>`;
}
