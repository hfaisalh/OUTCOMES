/**
 * workflow-flowchart.ts
 *
 * What it does: draws the flow chart of one workflow (DECISIONS 136 to 140) as an inline SVG. It follows the diagram-design method: shape carries the type (a rectangle is a stage, a diamond is a process), straight right-angle connectors with an arrow, every branch labelled, and one accent on the focal step.
 * It describes the RULES only, never the inputs (no numbers of units, no names of items or outcomes). A step decided by a rule carries that rule's icon.
 * Each step is a button for its stage, so clicking the chart opens that stage's rules below.
 * Who calls it: app/setup/workflows-page.ts. Depends on: the workflow and its outcome type (types only). Pure: it takes data and returns an SVG string.
 */

import { CYCLE_LABELS, type FrameworkTemplate } from "../../modules/02-project-rules/categories";
import { reportLoopOf } from "../../modules/02-project-rules/workflows";
import type { OutcomeType } from "../../modules/05-outcomes/outcome-types";

// Rule icons as line paths (24 by 24), the same set as the stage boxes use.
const RULE_PATHS: Record<string, [string, string]> = {
  split: ['<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v8.5l6 6M12 12l-6 6"/>', "Rule: gift into work order units and shares"],
  outcome: ['<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>', "The outcome is set by the item"],
  hold: ['<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', "Rule: release only when fully paid"],
  release: ['<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>', "Rule: released as each payment arrives"],
  assign: ['<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>', "Rule: how it is assigned to a partner"],
  confirm: ['<path d="M5 12.5l4.5 4.5L19 7.5"/>', "Rule: the partner approves or rejects the batch"],
  approve: ['<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', "Rule: MWF approves before the donor sees the data"],
  deliver: ['<path d="M9 4h6v3H9zM6 6h12v15H6z"/><path d="M9 13l2 2 4-4"/>', "Rule: what the partner supplies"],
  feedback: ['<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>', "Feedback from the donor"],
  report: ['<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', "Rule: tasks and the donor report"],
};

const W = 104, H = 56, GAP = 28, Y = 52, X0 = 8;
const ROOM = 30; // extra length of an arrow that carries an approved tick, so the line runs in and out of it
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A small circled tick (approved, green) or circled cross (rejected, red), drawn on an arrow.
const badge = (cx: number, cy: number, ok: boolean): string => `<g transform="translate(${cx} ${cy})" class="fc-badge ${ok ? "ok" : "no"}"><title>${ok ? "Approved" : "Rejected"}</title><circle r="8.5"/>${ok ? '<path d="M-4 0.5 L-1.2 3.3 L4 -2.6"/>' : '<path d="M-3.2 -3.2 L3.2 3.2 M3.2 -3.2 L-3.2 3.2"/>'}</g>`;

// Text in the middle of a box, one line per bar-separated part.
const lines = (text: string, x: number, y: number): string => text.split("|").map((t, i, all) => `<text x="${x}" y="${y + (i - (all.length - 1) / 2) * 13}" text-anchor="middle" class="fc-t">${esc(t)}</text>`).join("");
const ruleIcon = (key: string, x: number, y: number): string => { const r = RULE_PATHS[key]; return r ? `<g transform="translate(${x} ${y}) scale(.62)" class="fc-ri"><title>${esc(r[1])}</title>${r[0]}</g>` : ""; };

/**
 * Rule (DECISIONS 140): each box carries only its title: Gift, Work order, Assignment, Confirmation, Allocation, Review, Report, Complete, Feedback. Everything else about a stage is
 * a decision, set in the panel under the chart. A rectangle is a stage (a state the work order is in) and a diamond is a process (done to move it on, approved or rejected).
 * Gift, Work order, Allocation, Report, Complete and Feedback are stages. Assignment, Confirmation and Review are processes. A rejected confirmation goes back to Assignment, a rejected
 * review goes back to Allocation. Clicking a box opens its panel: 1 Work order, 2 Assignment, 3 Confirmation, 4 Allocation, 5 Review, 6 Report, 7 Feedback. Gift and Complete have none.
 */
export function flowChart(fw: FrameworkTemplate, _type: OutcomeType | undefined, stage: number): string {
  const mid = Y + H / 2;
  const parts: string[] = [];
  const edges: string[] = [];
  let x = X0;
  let prevRight: number | null = null;
  const open = (n: number): string => (n === stage ? " on" : "");
  const link = (to: number, label = ""): void => { if (prevRight !== null) edges.push(`<path d="M${prevRight} ${mid} H${to}" class="fc-edge" marker-end="url(#fc-arrow)"/>${label === "Approve" ? badge((prevRight + to) / 2, mid, true) : label ? `<text x="${(prevRight + to) / 2}" y="${mid - 8}" text-anchor="middle" class="fc-lbl">${esc(label)}</text>` : ""}`); };
  const place = (w: number, draw: (cx: number) => string, label = ""): number => { if (label === "Approve") x += ROOM; link(x, label); const c = x + w / 2; parts.push(draw(c)); prevRight = x + w; x += w + GAP; return c; };
  const step = (n: number, aria: string, inner: string): string => `<g data-wf-stage="${n}" class="fc-step" role="button" tabindex="0" aria-label="${esc(aria)}">${inner}</g>`;
  const rect = (n: number, c: number, title: string, icon: string): string => step(n, title, `<rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node${open(n)}"/>${icon ? ruleIcon(icon, c - W / 2 + 4, Y + 3) : ""}${lines(title, c, mid)}`);
  const diamond = (n: number, c: number, title: string, icon: string): string => step(n, title, `<path d="M${c} ${Y - 6} L${c + W / 2 + 6} ${mid} L${c} ${Y + H + 6} L${c - W / 2 - 6} ${mid} Z" class="fc-node${open(n)}"/>${icon ? ruleIcon(icon, c - 8, Y - 22) : ""}${lines(title, c, mid)}`);
  const fixed = (c: number, title: string): string => `<g class="fc-fixed"><rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node"/>${lines(title, c, mid)}</g>`;

  place(W, (c) => fixed(c, "Gift"));
  place(W, (c) => rect(1, c, "Work order", "split"));
  const assignX = place(W, (c) => diamond(2, c, "Assignment", "assign"));
  const confirmX = place(W, (c) => diamond(3, c, "Confirmation", "confirm"));
  const allocX = place(W, (c) => rect(4, c, "Allocation", "deliver"), "Approve");
  const reviewX = place(W, (c) => diamond(5, c, "Review", "approve"));
  const reportX = place(W, (c) => rect(6, c, "Report", "report"), "Approve");
  const completeX = place(W, (c) => fixed(c, "Complete"));
  const feedbackX = place(W, (c) => rect(7, c, "Feedback", "feedback"));
  const width = x - GAP + X0;
  // Rejected branches go back, under the row: a rejected confirmation to assignment, a rejected review to allocation.
  const ly = Y + H + 30;
  const back = (from: number, to: number, label: string): string => `<path d="M${from} ${Y + H + 6} V${ly} H${to} V${Y + H + 6}" class="fc-edge dashed" marker-end="url(#fc-arrow)"/>${badge((from + to) / 2, ly, false)}<text x="${(from + to) / 2}" y="${ly + 20}" text-anchor="middle" class="fc-lbl">${esc(label)}</text>`;
  // Rule (DECISIONS 317): a living workflow loops from Complete back to Report on its cycle while payments keep coming (above the row), and goes on to Feedback only when the gift stops or its plan ends (under the row).
  const every = reportLoopOf(fw);
  const top = Y - 28;
  const loopBadge = (cx: number, cy: number, broken: boolean): string => `<g transform="translate(${cx} ${cy})" class="fc-badge loop${broken ? " off" : ""}"><title>${broken ? "The loop ends" : "The report repeats"}</title><circle r="10"/><g transform="translate(-7.5 -7.5) scale(.62)" class="fc-ri">${RULE_PATHS["release"]?.[0] ?? ""}</g>${broken ? '<path d="M-8 8 L8 -8" class="slash"/>' : ""}</g>`;
  const loop = every
    ? `<path d="M${completeX} ${Y} V${top} H${reportX} V${Y - 2}" class="fc-edge loop" marker-end="url(#fc-arrow)"/>${loopBadge((reportX + completeX) / 2, top, false)}<text x="${(reportX + completeX) / 2}" y="${top - 14}" text-anchor="middle" class="fc-sub">Repeats ${esc(CYCLE_LABELS[every].toLowerCase())} while payments continue</text>`
      + `<path d="M${completeX} ${Y + H} V${ly} H${feedbackX} V${Y + H + 2}" class="fc-edge loop" marker-end="url(#fc-arrow)"/>${loopBadge((completeX + feedbackX) / 2, ly, true)}<text x="${(completeX + feedbackX) / 2}" y="${ly + 28}" text-anchor="middle" class="fc-sub">When the gift stops or its plan ends</text>`
    : "";
  const extra = back(confirmX, assignX, "Reject: reassign") + back(reviewX, allocX, "Reject: back to the partner") + loop;
  const height = ly + 28 + 8;
  return `<svg class="fc" viewBox="0 0 ${width} ${height}" width="${width}" role="group" aria-label="The flow of this workflow"><defs><marker id="fc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" class="fc-head"/></marker></defs>${edges.join("")}${parts.join("")}${extra}</svg>`;
}
