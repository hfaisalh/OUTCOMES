/**
 * workflow-flowchart.ts
 *
 * What it does: draws the flow chart of one workflow (DECISIONS 136, 137) as an inline SVG. It follows the diagram-design method: shape carries the type (oval for start and end,
 * rectangle for a step, diamond for the one decision), straight right-angle connectors with an arrow, every branch labelled, and one accent on the focal step.
 * It describes the RULES only, never the inputs (no numbers of units, no names of items or outcomes). A step decided by a rule carries that rule's icon.
 * Each step is a button for its stage, so clicking the chart opens that stage's rules below.
 * Who calls it: app/workflows-page.ts. Depends on: the workflow and its outcome type (types only). Pure: it takes data and returns an SVG string.
 */

import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import { assignOf, unitModeOf } from "../modules/02-project-rules/workflows";
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

const W = 104, SW = 96, H = 56, GAP = 26, Y = 52, X0 = 8;
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Text in the middle of a box, one line per bar-separated part.
const lines = (text: string, x: number, y: number): string => text.split("|").map((t, i, all) => `<text x="${x}" y="${y + (i - (all.length - 1) / 2) * 13}" text-anchor="middle" class="fc-t">${esc(t)}</text>`).join("");
const ruleIcon = (key: string, x: number, y: number): string => { const r = RULE_PATHS[key]; return r ? `<g transform="translate(${x} ${y}) scale(.62)" class="fc-ri"><title>${esc(r[1])}</title>${r[0]}</g>` : ""; };
// A stage name cut into at most two short lines.
const wrap = (label: string, max = 15): string => {
  const words = label.split(/\s+/);
  const out: string[] = [];
  for (const w of words) { const last = out[out.length - 1]; if (last !== undefined && (last + " " + w).length <= max) out[out.length - 1] = last + " " + w; else out.push(w); }
  return out.slice(0, 2).map((x, i, all) => (i === all.length - 1 && out.length > 2 ? x.slice(0, max - 1) + "\u2026" : x.slice(0, max))).join("|");
};

// Rule (DECISIONS 137): the chart has three clickable parts, the stages of the workflow. 1 Work orders (gift into units and shares, and when they are released), 2 Assigned for
// implementation (the handoff rule and the partner's stages, each with its days), 3 Updates and report. A gift goes straight from paid to assigned for implementation.
export function flowChart(fw: FrameworkTemplate, type: OutcomeType | undefined, stage: number): string {
  const once = unitModeOf(fw) === "once";
  const stages = fw.stages ?? [];
  const tasks = (fw.tasks ?? []).length;
  const mid = Y + H / 2;
  const parts: string[] = [];
  const edges: string[] = [];
  let x = X0; // the left edge of the next box
  let prevRight: number | null = null;
  const link = (to: number, label = "", dashed = false): void => { if (prevRight !== null) edges.push(`<path d="M${prevRight} ${mid} H${to}" class="fc-edge${dashed ? " dashed" : ""}" marker-end="url(#fc-arrow)"/>${label ? `<text x="${(prevRight + to) / 2}" y="${mid - 8}" text-anchor="middle" class="fc-lbl">${esc(label)}</text>` : ""}`); };
  const place = (w: number, draw: (cx: number) => string, label = ""): number => { link(x, label); const c = x + w / 2; parts.push(draw(c)); prevRight = x + w; x += w + GAP; return c; };
  const open = (n: number): string => (n === stage ? " on" : "");

  place(W, (c) => `<rect x="${c - W / 2}" y="${Y + 8}" width="${W}" height="${H - 16}" rx="20" class="fc-node"/>${lines("Gift paid", c, mid)}`);
  // Stage 1: work orders. A decision only when release waits for full payment.
  let holdX = 0;
  place(W, (c) => `<g data-wf-stage="1" class="fc-step" role="button" tabindex="0" aria-label="Stage 1: work orders"><rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node${once ? "" : " focal"}${open(1)}"/>${ruleIcon("split", c - W / 2 + 4, Y + 3)}${lines("Gift into work|order units & shares", c, mid + 6)}</g>`);
  if (once) holdX = place(W, (c) => `<g data-wf-stage="1" class="fc-step" role="button" tabindex="0" aria-label="Stage 1: release only when fully paid"><path d="M${c} ${Y - 4} L${c + W / 2} ${mid} L${c} ${Y + H + 4} L${c - W / 2} ${mid} Z" class="fc-node focal${open(1)}"/>${ruleIcon("hold", c - 8, Y - 20)}${lines("Fully paid?", c, mid)}</g>`);
  // Stage 2: assigned for implementation, a labelled group holding the partner's stages.
  const how = assignOf(fw, type) === "auto" ? "automatic" : "by suggestion";
  const groupLeft = x - 10;
  link(x, once ? "Yes" : "");
  const shown = stages.length ? stages : [{ id: "-", label: "Assigned for implementation", days: 0, needs: [], photo: false, canPause: true, tell: "" }];
  const boxes: string[] = [];
  let gx = x;
  let gPrev: number | null = null;
  shown.forEach((st, i) => {
    const c = gx + SW / 2;
    if (gPrev !== null) boxes.push(`<path d="M${gPrev} ${mid} H${gx}" class="fc-edge" marker-end="url(#fc-arrow)"/>`);
    const sub = stages.length ? `${st.days} day${st.days === 1 ? "" : "s"}` : "";
    boxes.push(`<g data-wf-stage="2" class="fc-step" role="button" tabindex="0" aria-label="Stage 2: ${esc(st.label)}"><title>${esc(st.label)}${st.tell ? `. Tells the donor: ${esc(st.tell)}` : ""}</title><rect x="${gx}" y="${Y}" width="${SW}" height="${H}" rx="6" class="fc-node${open(2)}"/>${lines(sub ? `${wrap(st.label, 14)}|${sub}` : wrap(st.label, 14), c, mid)}${st.tell ? `<circle cx="${gx + SW - 9}" cy="${Y + 9}" r="3.5" class="fc-dot"><title>Tells the donor</title></circle>` : ""}</g>`);
    gPrev = gx + SW;
    gx += SW + (i < shown.length - 1 ? 22 : 0);
  });
  const groupRight = gx + SW + 10;
  parts.push(`<rect x="${groupLeft}" y="${Y - 30}" width="${groupRight - groupLeft}" height="${H + 44}" rx="10" class="fc-group"/><g data-wf-stage="2" class="fc-step">${ruleIcon("assign", groupLeft + 8, Y - 27)}<text x="${groupLeft + 30}" y="${Y - 14}" class="fc-lbl strong">Assigned for implementation, ${how}</text></g>`);
  parts.push(...boxes);
  prevRight = groupRight - 10; x = groupRight + GAP - 10 + 10;
  // Stage 3: updates and report.
  place(W, (c) => `<g data-wf-stage="3" class="fc-step" role="button" tabindex="0" aria-label="Stage 3: updates and report"><rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node${open(3)}"/>${ruleIcon("report", c - W / 2 + 4, Y + 3)}${lines(tasks ? `${tasks} task${tasks === 1 ? "" : "s"},|then report` : "Report", c, mid + 6)}</g>`);
  place(W, (c) => `<rect x="${c - W / 2}" y="${Y + 8}" width="${W}" height="${H - 16}" rx="20" class="fc-node"/>${lines("Outcome|delivered", c, mid)}`);
  const width = x - GAP + X0;
  // The decision's other branch: not fully paid, so the units wait as Funding and are checked again on the next payment.
  let extra = "";
  if (once) {
    const hy = Y + H + 52;
    extra = `<path d="M${holdX} ${Y + H + 4} V${hy}" class="fc-edge" marker-end="url(#fc-arrow)"/><text x="${holdX + 8}" y="${Y + H + 28}" class="fc-lbl">No</text><rect x="${holdX - W / 2}" y="${hy}" width="${W}" height="36" rx="6" class="fc-node muted"/>${lines("Held as Funding", holdX, hy + 18)}<path d="M${holdX - W / 2} ${hy + 18} H${holdX - W / 2 - 14} V${mid} H${holdX - W / 2 + 4}" class="fc-edge dashed" marker-end="url(#fc-arrow)"/><text x="${holdX - W / 2 - 18}" y="${hy + 14}" text-anchor="end" class="fc-lbl">next payment</text>`;
  }
  const height = once ? Y + H + 100 : Y + H + 24;
  return `<svg class="fc" viewBox="0 0 ${width} ${height}" width="${width}" role="img" aria-label="The flow of this workflow"><defs><marker id="fc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" class="fc-head"/></marker></defs>${edges.join("")}${parts.join("")}${extra}</svg>`;
}
