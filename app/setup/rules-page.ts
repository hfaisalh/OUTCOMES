/**
 * rules-page.ts
 *
 * What it does: draws the Rules page (DECISIONS 283, 325): the rules OUTCOMES follows from a gift's payment to its report, in the order a gift travels, in plain English with the numbers now in use, and beside each group the settings that can be changed. It makes it obvious on what rules auto assign, auto allocate, review and reporting work, and what is not automatic yet.
 * Who calls it: app/main.ts. Depends on: the rule list (modules/16-rules/rules.ts), the controls beside each group (app/setup/rules-settings.ts), and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: the settings use the same data attributes as the Workflows, Benefits and Gifts screens, so the one change handler serves them all and there is a single place where each rule is changed.
 * UX: an at-a-glance strip first, then a list of the groups on the left (it stays in view on a wide screen) and the groups on the right, each as a numbered step with its rules in one reading column and its settings in a tinted panel beside them (below them on a phone); each rule names the decision it comes from, so a developer can find it.
 */

import { normaliseSteps } from "../../modules/09-allocation/order";
import { automationRules, type RuleSection } from "../../modules/16-rules/rules";
import { confirmDaysOf, flagOf, assignOf, reportLoopOf, unitModeOf } from "../../modules/02-project-rules/workflows";
import { allocateSettings, assignSettings, confirmSettings, DEFAULT_GRACE, deliverySettings, releaseSettings, reportingSettings, timingSettings, waitingSettings } from "./rules-settings";
import { esc, type View } from "../shared/pages";

// What the system does not do by itself yet, so nobody expects it to. Each is a candidate for a rule of its own.
const NOT_YET = [
  "Reminders to a partner that has not answered or is late on a phase: late is flagged, nothing is sent.",
  "Moving a batch to another partner when the first does not answer in time.",
  "Messages to donors (a partner confirmed, a report, a request for feedback) and to partners (work sent back): these need the CRM's outgoing channel.",
  "Running Assign and Allocate on a schedule: today a person presses the button.",
];

// --- At a glance ---
function glance(v: View): string {
  const fws = v.frameworks ?? [];
  const n = fws.length;
  const days = fws.map((f) => confirmDaysOf(f));
  const tile = (value: string, label: string, to: string): string => `<a class="metric ru-tile" href="#ru-${to}"><b>${esc(value)}</b><span>${esc(label)}</span></a>`;
  return `<div class="metrics ru-glance">${tile(`${fws.filter((f) => assignOf(f, undefined) === "auto").length} of ${n}`, "workflows assign by themselves", "assign")}
    ${tile(n === 0 ? "None" : Math.min(...days) === Math.max(...days) ? `${days[0]} days` : `${Math.min(...days)} to ${Math.max(...days)} days`, "for a partner to confirm", "confirm")}
    ${tile(`${v.graceDays ?? DEFAULT_GRACE} days`, "before a missed payment releases a place", "release")}
    ${tile(`${fws.filter((f) => flagOf(f, "approve")).length} of ${n}`, "workflows have MWF review the work", "delivery")}
    ${tile(String(fws.filter((f) => reportLoopOf(f) !== null && unitModeOf(f) !== "once").length), "workflows repeat their report", "reporting")}</div>`;
}

// --- A group: its number, its rules, and its settings beside it ---
// A group whose settings are a table of workflows gets the settings under its rules, across the full width.
const WIDE: RuleSection["id"][] = ["assign", "delivery", "reporting"];
function section(s: RuleSection, n: number, side: string): string {
  return `<section class="card ru-card${WIDE.includes(s.id) ? " ru-wide" : ""}" id="ru-${s.id}" aria-labelledby="ru-h-${s.id}"><div class="ru-grid"><div class="ru-main"><div class="ru-head"><span class="ru-num" aria-hidden="true">${n}</span><div><h2 id="ru-h-${s.id}">${esc(s.title)}</h2><p class="muted">${esc(s.intro)}</p></div></div>
    <ol class="ru-rules">${s.rules.map((r) => `<li>${esc(r.text)} <span class="ru-src">${esc(r.decision)}</span></li>`).join("")}</ol></div>
    <div class="ru-side"><div class="ru-side-h">You can change</div>${side}</div></div></section>`;
}

export function rulesPage(v: View): string {
  const sections = automationRules({ graceDays: v.graceDays ?? DEFAULT_GRACE, requireRef: v.requireRef === true, steps: v.allocationSteps ?? normaliseSteps(undefined) });
  const side: Record<RuleSection["id"], string> = {
    assign: assignSettings(v), confirm: confirmSettings(), allocate: allocateSettings(v), waiting: waitingSettings(v), release: releaseSettings(v),
    delivery: deliverySettings(v), reporting: reportingSettings(v), timing: timingSettings(v),
  };
  const nav = `<nav class="ru-nav" aria-label="Groups of rules"><ol>${sections.map((s, i) => `<li><a href="#ru-${s.id}"><span class="ru-num sm" aria-hidden="true">${i + 1}</span>${esc(s.title)}</a></li>`).join("")}<li><a href="#ru-notyet"><span class="ru-num sm off" aria-hidden="true">!</span>Not automatic yet</a></li></ol></nav>`;
  return `<h1>Rules</h1>
    <p class="sub">The rules OUTCOMES follows, from a gift's payment to its report, in the order a gift travels. Each line says where it comes from. What can be changed has its control beside it; the rest is how the system is built, and changing it is a job for the developers.</p>
    ${v.message ? `<div class="note" role="status">${esc(v.message)}</div>` : ""}
    ${glance(v)}
    <div class="ru-layout">${nav}<div class="ru-stack">${sections.map((s, i) => section(s, i + 1, side[s.id])).join("")}
      <section class="card ru-card ru-notyet" id="ru-notyet" aria-labelledby="ru-h-notyet"><div class="ru-head"><span class="ru-num off" aria-hidden="true">!</span><div><h2 id="ru-h-notyet">Not automatic yet</h2><p class="muted">These are done by a person, or not at all, today. Say which you want as a rule and it joins the list above.</p></div></div><ul class="ru-rules">${NOT_YET.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section></div></div>`;
}
