/**
 * rules-page.ts
 *
 * What it does: draws the Automation rules page (DECISIONS 283): the rules OUTCOMES follows when it assigns, confirms, allocates and enrols by itself, in plain English with the numbers now in use, and beside each group the settings that can be changed. It makes it obvious on what rules auto assign and auto allocate work.
 * Who calls it: app/main.ts. Depends on: the rule list (modules/16-rules/rules.ts), the workflow helpers (modules/02-project-rules/workflows.ts), and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: the settings here use the same data attributes as the Workflows and Gifts screens (data-wf-assign, data-wf-flag, data-wf-confirm, data-require-ref, data-grace), so the one change handler in main.ts serves them all and there is a single place where each rule is changed.
 * UX: a 2D grid, rules on the left and their settings on the right (one column on a phone); every setting has a visible label; rules are ordered lists because order matters; each rule names the decision it comes from, so a developer can find it.
 */

import { normaliseSteps } from "../modules/09-allocation/order";
import { stepsHtml } from "./rules-steps";
import { switchHtml } from "./switch";
import { automationRules, type RuleSection } from "../modules/16-rules/rules";
import { assignOf, confirmDaysOf, flagOf } from "../modules/02-project-rules/workflows";
import { batchSizeOf } from "../modules/08-assignment/batches";
import { esc, type View } from "./pages";

const DEFAULT_GRACE = 15;

// --- The settings that sit beside each group of rules ---
function assignSettings(v: View): string {
  const fws = v.frameworks ?? [];
  if (fws.length === 0) return `<p class="muted">No workflow yet. Add one on the Workflows page.</p>`;
  const partners = v.projects ?? [];
  const own = partners.filter((p) => p.batchSize !== undefined);
  return `<h3>Each workflow</h3><div class="tablewrap"><table class="ru-table"><thead><tr><th>Workflow</th><th>Assign</th><th>Priority gifts first</th><th>Move to another partner</th><th class="num">Days to confirm</th></tr></thead><tbody>${fws.map((f) => `<tr><th scope="row">${esc(f.name)}</th>
    <td><select data-wf-assign="${esc(f.id)}" aria-label="How ${esc(f.name)} is assigned"><option value="auto"${assignOf(f, undefined) === "auto" ? " selected" : ""}>Automatically</option><option value="suggest"${assignOf(f, undefined) === "suggest" ? " selected" : ""}>Suggest only</option></select></td>
    <td>${switchHtml({ label: `Priority gifts first in ${f.name}`, on: flagOf(f, "urgent"), attrs: `data-wf-flag="urgent" data-wf="${esc(f.id)}"`, compact: true })}</td>
    <td>${switchHtml({ label: `Move ${f.name} gifts to another partner`, on: flagOf(f, "reassign"), attrs: `data-wf-flag="reassign" data-wf="${esc(f.id)}"`, compact: true })}</td>
    <td class="num"><input type="number" min="0" max="60" data-wf-confirm="days" data-wf="${esc(f.id)}" value="${confirmDaysOf(f)}" aria-label="Days the partner has to confirm ${esc(f.name)}"></td></tr>`).join("")}</tbody></table></div>
    <p class="muted">A batch is ${batchSizeOf(undefined)} gifts unless a partner has its own size${own.length ? ` (${own.map((p) => `${esc(p.name)} ${p.batchSize}`).join(", ")})` : ""}. Set a partner's on its page.</p>`;
}

function allocateSettings(v: View): string {
  return `${stepsHtml(v.allocationSteps ?? normaliseSteps(undefined))}<h3>Setting</h3>${switchHtml({ label: "Allocate only to beneficiaries that have an ID", on: v.requireRef === true, attrs: 'data-require-ref="1"' })}`;
}

function waitingSettings(v: View): string {
  const gps = v.giftProjects ?? [];
  if (gps.length === 0) return `<p class="muted">No project yet.</p>`;
  return `<h3>Enrol automatically, by project</h3><ul class="ru-list">${gps.map((g) => `<li><span>${esc(g.name)}</span><span class="pill ${g.enrolAuto ? "ready" : ""}">${g.enrolAuto ? "On" : "Off"}</span></li>`).join("")}</ul><p class="muted">Change it on the project's own window.</p>`;
}

const releaseSettings = (v: View): string => `<h3>Setting</h3><label class="wf-field"><span>Days a payment may be unpaid before a place may be released</span><input type="number" min="0" max="90" data-grace="1" value="${v.graceDays ?? DEFAULT_GRACE}" aria-label="Grace days"></label>`;

// --- A group: its rules, and its settings beside it ---
function section(s: RuleSection, side: string): string {
  return `<section class="card ru-card" aria-labelledby="ru-${s.id}"><div class="ru-grid"><div><h2 id="ru-${s.id}">${esc(s.title)}</h2><p class="muted">${esc(s.intro)}</p>
    <ol class="ru-rules">${s.rules.map((r) => `<li>${esc(r.text)} <span class="ru-src">${esc(r.decision)}</span></li>`).join("")}</ol></div>
    <div class="ru-side">${side}</div></div></section>`;
}

export function rulesPage(v: View): string {
  const sections = automationRules({ graceDays: v.graceDays ?? DEFAULT_GRACE, requireRef: v.requireRef === true, steps: v.allocationSteps ?? normaliseSteps(undefined) });
  const side: Record<RuleSection["id"], string> = {
    assign: assignSettings(v),
    confirm: `<p class="muted">The days to confirm are set for each workflow, in the table under Assigning.</p>`,
    allocate: allocateSettings(v),
    waiting: waitingSettings(v),
    release: releaseSettings(v),
  };
  return `<h1>Automation rules</h1>
    <p class="sub">The rules OUTCOMES follows when it works by itself, in the order a gift travels. Each line says where it comes from. What can be changed has its control beside it; the rest is how the system is built, and changing it is a job for the developers.</p>
    ${v.message ? `<div class="note" role="status">${esc(v.message)}</div>` : ""}
    ${sections.map((s) => section(s, side[s.id])).join("")}`;
}
