/**
 * workflow-flowchart.ts
 *
 * What it does: draws the flow chart of one workflow (DECISIONS 136) as an inline SVG. It follows the diagram-design method: shape carries the type (oval for start and end,
 * rectangle for a step, diamond for the one decision), straight right-angle connectors with an arrow, every branch labelled, and one accent on the focal step.
 * It describes the RULES only, never the inputs (no numbers of units, no names of items or outcomes). A step decided by a rule carries that rule's icon.
 * Each step is a button for its stage, so clicking the chart opens that stage's rules below.
 * Who calls it: app/workflows-page.ts. Depends on: the workflow and its outcome type (types only). Pure: it takes data and returns an SVG string.
 */

import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import { unitModeOf } from "../modules/02-project-rules/workflows";
import type { OutcomeType } from "../modules/05-outcomes/outcome-types";

// Rule icons as line paths (24 by 24), the same set as the stage boxes use.
const RULE_PATHS: Record<string, [string, string]> = {
  split: ['<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v8.5l6 6M12 12l-6 6"/>', "Rule: gift into work order units and shares"],
  outcome: ['<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>', "The outcome is set by the item"],
  hold: ['<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', "Rule: release only when fully paid"],
  release: ['<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>', "Rule: released as each payment arrives"],
  assign: ['<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>', "Rule: how it is assigned to a partner"],
  deliver: ['<path d="M9 4h6v3H9zM6 6h12v15H6z"/><path d="M9 13l2 2 4-4"/>', "Rule: what the partner supplies"],
  report: ['<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', "Rule: tasks and the donor report"],
};

const W = 104, H = 56, GAP = 26, Y = 40, X0 = 8;
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cx = (i: number): number => X0 + i * (W + GAP) + W / 2;

// Two lines of text, centred, split at the bar.
const lines = (text: string, x: number, y: number): string => text.split("|").map((t, i, all) => `<text x="${x}" y="${y + (i - (all.length - 1) / 2) * 13}" text-anchor="middle" class="fc-t">${esc(t)}</text>`).join("");
const ruleIcon = (key: string, x: number, y: number): string => { const r = RULE_PATHS[key]; return r ? `<g transform="translate(${x} ${y}) scale(.62)" class="fc-ri"><title>${esc(r[1])}</title>${r[0]}</g>` : ""; };

export interface FlowNode { stage: number; shape: "rect" | "diamond"; label: string; rule: string }

// Rule (DECISIONS 136): the steps of the chart, from the workflow's rules. Step 3 is a decision only when release waits for full payment.
export function flowNodes(fw: FrameworkTemplate, type: OutcomeType | undefined): FlowNode[] {
  const once = unitModeOf(fw) === "once";
  const tasks = (fw.tasks ?? []).length;
  return [
    { stage: 1, shape: "rect", label: "Gift into work|order units & shares", rule: "split" },
    { stage: 2, shape: "rect", label: "Joins an|outcome", rule: "outcome" },
    once ? { stage: 3, shape: "diamond", label: "Fully paid?", rule: "hold" } : { stage: 3, shape: "rect", label: "Released as each|payment arrives", rule: "release" },
    { stage: 4, shape: "rect", label: type?.assign === "auto" ? "Assigned to a|partner automatically" : "Assigned to a|partner by suggestion", rule: "assign" },
    { stage: 5, shape: "rect", label: "Partner|delivers", rule: "deliver" },
    { stage: 6, shape: "rect", label: tasks ? `${tasks} task${tasks === 1 ? "" : "s"},|then report` : "Report", rule: "report" },
  ];
}

export function flowChart(fw: FrameworkTemplate, type: OutcomeType | undefined, stage: number): string {
  const nodes = flowNodes(fw, type);
  const once = unitModeOf(fw) === "once";
  const n = nodes.length + 2; // start and end ovals
  const width = X0 * 2 + n * W + (n - 1) * GAP;
  const mid = Y + H / 2;
  const parts: string[] = [];
  const arrow = (x1: number, x2: number, label = "", dashed = false): string => `<path d="M${x1} ${mid} H${x2}" class="fc-edge${dashed ? " dashed" : ""}" marker-end="url(#fc-arrow)"/>${label ? `<text x="${(x1 + x2) / 2}" y="${mid - 8}" text-anchor="middle" class="fc-lbl">${esc(label)}</text>` : ""}`;
  // Connectors first, so the boxes sit on top of them.
  for (let i = 0; i < n - 1; i++) parts.push(arrow(cx(i) + W / 2, cx(i + 1) - W / 2, once && i === 3 ? "Yes" : ""));
  // The start and the end.
  parts.push(`<rect x="${cx(0) - W / 2}" y="${Y + 8}" width="${W}" height="${H - 16}" rx="20" class="fc-node"/>${lines("Gift paid", cx(0), mid)}`);
  parts.push(`<rect x="${cx(n - 1) - W / 2}" y="${Y + 8}" width="${W}" height="${H - 16}" rx="20" class="fc-node"/>${lines("Outcome|delivered", cx(n - 1), mid)}`);
  nodes.forEach((nd, i) => {
    const x = cx(i + 1);
    const on = nd.stage === stage;
    const focal = once ? nd.stage === 3 : nd.stage === 1; // the single accent: the decision when there is one, otherwise the first rule
    const shape = nd.shape === "diamond"
      ? `<path d="M${x} ${Y - 4} L${x + W / 2} ${mid} L${x} ${Y + H + 4} L${x - W / 2} ${mid} Z" class="fc-node${focal ? " focal" : ""}${on ? " on" : ""}"/>`
      : `<rect x="${x - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node${focal ? " focal" : ""}${on ? " on" : ""}"/>`;
    const icon = nd.shape === "diamond" ? ruleIcon(nd.rule, x - 8, Y - 20) : ruleIcon(nd.rule, x - W / 2 + 4, Y + 3);
    parts.push(`<g data-wf-stage="${nd.stage}" class="fc-step" role="button" tabindex="0" aria-label="Stage ${nd.stage}: ${esc(nd.label.replace("|", " "))}">${shape}${icon}${lines(nd.label, x, mid + (nd.shape === "rect" ? 6 : 0))}</g>`);
  });
  // The one decision: not fully paid, so the unit waits as Funding and is checked again when the next payment arrives.
  if (once) {
    const x = cx(3);
    const hy = Y + H + 46;
    parts.push(`<path d="M${x} ${Y + H + 4} V${hy}" class="fc-edge" marker-end="url(#fc-arrow)"/><text x="${x + 8}" y="${Y + H + 24}" class="fc-lbl">No</text>`);
    parts.push(`<rect x="${x - W / 2}" y="${hy}" width="${W}" height="38" rx="6" class="fc-node muted"/>${lines("Held as Funding", x, hy + 19)}`);
    parts.push(`<path d="M${x - W / 2} ${hy + 19} H${x - W / 2 - 14} V${mid} H${x - W / 2 + 6}" class="fc-edge dashed" marker-end="url(#fc-arrow)"/><text x="${x - W / 2 - 18}" y="${hy + 14}" text-anchor="end" class="fc-lbl">next payment</text>`);
  }
  const height = once ? Y + H + 100 : Y + H + 24;
  return `<svg class="fc" viewBox="0 0 ${width} ${height}" width="${width}" role="img" aria-label="The flow of this workflow"><defs><marker id="fc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" class="fc-head"/></marker></defs>${parts.join("")}</svg>`;
}
