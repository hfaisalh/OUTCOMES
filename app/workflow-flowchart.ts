/**
 * workflow-flowchart.ts
 *
 * What it does: draws the flow chart of one workflow (DECISIONS 136 to 139) as an inline SVG. It follows the diagram-design method: shape carries the type (a rectangle is a stage, a diamond is a process), straight right-angle connectors with an arrow, every branch labelled, and one accent on the focal step.
 * It describes the RULES only, never the inputs (no numbers of units, no names of items or outcomes). A step decided by a rule carries that rule's icon.
 * Each step is a button for its stage, so clicking the chart opens that stage's rules below.
 * Who calls it: app/workflows-page.ts. Depends on: the workflow and its outcome type (types only). Pure: it takes data and returns an SVG string.
 */

import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import { assignOf, confirmDaysOf, flagOf, unitModeOf } from "../modules/02-project-rules/workflows";
import type { OutcomeType } from "../modules/05-outcomes/outcome-types";

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
  report: ['<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', "Rule: tasks and the donor report"],
};

const W = 104, SW = 96, H = 56, GAP = 28, Y = 52, X0 = 8;
const ROOM = 30; // extra length of an arrow that carries an approved tick, so the line runs in and out of it
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A small circled tick (approved, green) or circled cross (rejected, red), drawn on an arrow.
const badge = (cx: number, cy: number, ok: boolean): string => `<g transform="translate(${cx} ${cy})" class="fc-badge ${ok ? "ok" : "no"}"><title>${ok ? "Approved" : "Rejected"}</title><circle r="8.5"/>${ok ? '<path d="M-4 0.5 L-1.2 3.3 L4 -2.6"/>' : '<path d="M-3.2 -3.2 L3.2 3.2 M3.2 -3.2 L-3.2 3.2"/>'}</g>`;

// Text in the middle of a box, one line per bar-separated part.
const lines = (text: string, x: number, y: number): string => text.split("|").map((t, i, all) => `<text x="${x}" y="${y + (i - (all.length - 1) / 2) * 13}" text-anchor="middle" class="fc-t">${esc(t)}</text>`).join("");
const ruleIcon = (key: string, x: number, y: number): string => { const r = RULE_PATHS[key]; return r ? `<g transform="translate(${x} ${y}) scale(.62)" class="fc-ri"><title>${esc(r[1])}</title>${r[0]}</g>` : ""; };
// A section name cut into at most two short lines.
const wrap = (label: string, max = 15): string => {
  const words = label.split(/\s+/);
  const out: string[] = [];
  for (const w of words) { const last = out[out.length - 1]; if (last !== undefined && (last + " " + w).length <= max) out[out.length - 1] = last + " " + w; else out.push(w); }
  return out.slice(0, 2).map((x, i, all) => (i === all.length - 1 && out.length > 2 ? x.slice(0, max - 1) + "\u2026" : x.slice(0, max))).join("|");
};

/**
 * Rule (DECISIONS 139): a rectangle is a stage (a state the work order is in) and a diamond is a process (something done to move it on, which can be approved or rejected).
 * Gift, Work order, Allocation, Report and Complete are stages. Fully paid, Assignment, Confirm and Review are processes. Allocation is where the work order sits in a specific outcome
 * profile, so the profile's sections (each with its days) are drawn inside it. A rejected confirm goes back to Assignment, a rejected review goes back to Allocation.
 * Clickable parts open the panel of their stage below: 1 work orders, 2 assignment, 3 confirm, 4 allocation, 5 review, 6 report.
 */
export function flowChart(fw: FrameworkTemplate, type: OutcomeType | undefined, stage: number): string {
  const once = unitModeOf(fw) === "once";
  const sections = fw.stages ?? [];
  const tasks = (fw.tasks ?? []).length;
  const mid = Y + H / 2;
  const parts: string[] = [];
  const edges: string[] = [];
  let x = X0;
  let prevRight: number | null = null;
  const open = (n: number): string => (n === stage ? " on" : "");
  const link = (to: number, label = ""): void => { if (prevRight !== null) edges.push(`<path d="M${prevRight} ${mid} H${to}" class="fc-edge" marker-end="url(#fc-arrow)"/>${label === "Approve" ? badge((prevRight + to) / 2, mid, true) : label ? `<text x="${(prevRight + to) / 2}" y="${mid - 8}" text-anchor="middle" class="fc-lbl">${esc(label)}</text>` : ""}`); };
  const place = (w: number, draw: (cx: number) => string, label = ""): number => { if (label === "Approve") x += ROOM; link(x, label); const c = x + w / 2; parts.push(draw(c)); prevRight = x + w; x += w + GAP; return c; };
  const step = (n: number, aria: string, inner: string): string => `<g data-wf-stage="${n}" class="fc-step" role="button" tabindex="0" aria-label="${esc(aria)}">${inner}</g>`;
  const rect = (n: number, c: number, text: string, icon: string, focal = false): string => step(n, text.replace("|", " "), `<rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node${focal ? " focal" : ""}${open(n)}"/>${icon ? ruleIcon(icon, c - W / 2 + 4, Y + 3) : ""}${lines(text, c, mid + (icon ? 6 : 0))}`);
  const diamond = (n: number, c: number, text: string, icon: string, focal = false): string => step(n, text.replace("|", " "), `<path d="M${c} ${Y - 6} L${c + W / 2 + 6} ${mid} L${c} ${Y + H + 6} L${c - W / 2 - 6} ${mid} Z" class="fc-node${focal ? " focal" : ""}${open(n)}"/>${icon ? ruleIcon(icon, c - 8, Y - 22) : ""}${lines(text, c, mid)}`);

  place(W, (c) => `<g class="fc-fixed"><rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node"/>${lines("Gift", c, mid)}</g>`);
  place(W, (c) => rect(1, c, "Work order|units & shares", "split", !once));
  let holdX = 0;
  if (once) holdX = place(W, (c) => diamond(1, c, "Fully paid?", "hold", true));
  const assignX = place(W, (c) => diamond(2, c, assignOf(fw, type) === "auto" ? "Assignment|automatic" : "Assignment|by a person", "assign"), once ? "Yes" : "");
  const confirmX = place(W, (c) => diamond(3, c, `Confirm|${confirmDaysOf(fw)} day${confirmDaysOf(fw) === 1 ? "" : "s"}`, "confirm"));
  // Stage 4: allocation, the work order sits in an outcome profile. The profile's sections are drawn inside it.
  x += ROOM; // room for the approved tick on the arrow into the profile
  const groupLeft = x - 10;
  link(x, "Approve");
  const shown = sections.length ? sections : [{ id: "-", label: "Outcome profile", days: 0, needs: [], photo: false, canPause: true, tell: "" }];
  let gx = x;
  let gPrev: number | null = null;
  const boxes: string[] = [];
  shown.forEach((st, i) => {
    const c = gx + SW / 2;
    if (gPrev !== null) boxes.push(`<path d="M${gPrev} ${mid} H${gx}" class="fc-edge" marker-end="url(#fc-arrow)"/>`);
    const sub = sections.length ? `${st.days} day${st.days === 1 ? "" : "s"}` : "";
    boxes.push(`<g data-wf-stage="4" class="fc-step" role="button" tabindex="0" aria-label="Allocation: ${esc(st.label)}"><title>${esc(st.label)}${st.tell ? `. Tells the donor: ${esc(st.tell)}` : ""}</title><rect x="${gx}" y="${Y}" width="${SW}" height="${H}" rx="6" class="fc-node${open(4)}"/>${lines(sub ? `${wrap(st.label, 14)}|${sub}` : wrap(st.label, 14), c, mid)}${st.tell ? `<circle cx="${gx + SW - 9}" cy="${Y + 9}" r="3.5" class="fc-dot"><title>Tells the donor</title></circle>` : ""}</g>`);
    gPrev = gx + SW;
    gx += SW + (i < shown.length - 1 ? 22 : 0);
  });
  const groupRight = gx + SW + 10;
  parts.push(`<rect x="${groupLeft}" y="${Y - 30}" width="${groupRight - groupLeft}" height="${H + 44}" rx="10" class="fc-group"/><g data-wf-stage="4" class="fc-step">${ruleIcon("deliver", groupLeft + 8, Y - 27)}<text x="${groupLeft + 30}" y="${Y - 14}" class="fc-lbl strong">Allocation: outcome profile</text></g>`);
  parts.push(...boxes);
  const allocX = (groupLeft + groupRight) / 2;
  prevRight = groupRight - 10;
  x = groupRight + GAP;
  const reviewX = place(W, (c) => diamond(5, c, tasks ? `Review|${tasks} check${tasks === 1 ? "" : "s"}${flagOf(fw, "approve") ? "" : ", no approval"}` : `Review|${flagOf(fw, "approve") ? "MWF approves" : "no approval"}`, "approve"));
  place(W, (c) => rect(6, c, once ? "Report|one, then closed" : "Report|on a cycle", "report"), "Approve");
  place(W, (c) => `<g class="fc-fixed"><rect x="${c - W / 2}" y="${Y}" width="${W}" height="${H}" rx="6" class="fc-node"/>${lines(once ? "Complete" : "Ends", c, mid)}</g>`);
  const width = x - GAP + X0;
  // Rejected branches go back, under the row: a rejected confirm to assignment, a rejected review to allocation.
  const ly = Y + H + 30;
  const back = (from: number, to: number, label: string): string => `<path d="M${from} ${Y + H + 6} V${ly} H${to} V${Y + H + 6}" class="fc-edge dashed" marker-end="url(#fc-arrow)"/>${badge((from + to) / 2, ly, false)}<text x="${(from + to) / 2}" y="${ly + 20}" text-anchor="middle" class="fc-lbl">${esc(label)}</text>`;
  let extra = back(confirmX, assignX, "Reject: reassign") + back(reviewX, allocX, "Reject: back to the partner");
  if (once) {
    const hy = ly + 24;
    extra += `<path d="M${holdX} ${Y + H + 6} V${hy}" class="fc-edge" marker-end="url(#fc-arrow)"/><text x="${holdX + 8}" y="${Y + H + 24}" class="fc-lbl">No</text><rect x="${holdX - W / 2}" y="${hy}" width="${W}" height="34" rx="6" class="fc-node muted"/>${lines("Held as Funding", holdX, hy + 17)}`;
  }
  const height = (once ? ly + 24 + 34 : ly + 28) + 8;
  return `<svg class="fc" viewBox="0 0 ${width} ${height}" width="${width}" role="img" aria-label="The flow of this workflow"><defs><marker id="fc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" class="fc-head"/></marker></defs>${edges.join("")}${parts.join("")}${extra}</svg>`;
}
