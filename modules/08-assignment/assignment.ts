/**
 * assignment.ts
 *
 * What it does: Assignment (DECISIONS 138, 154, 170). It hands each released work order to the first eligible partner that has room, in the order of the gift's project. A work order is a gift line that has a workflow.
 * The workflow decides whether this is done automatically or only suggested to a person (its Assignment setting), and whether a person may reassign it (its Reassign switch). An urgent gift is placed first.
 * The result is kept as separate records, one per work order, never written onto the gift itself, so the whole run can be reset and run again.
 * Who calls it: the Assignment page (app/assignment-page.ts), the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), all through applyAssignmentAction. Depends on: work-orders.ts and projects.ts
 * (the types and partner rules only). Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Which gifts (DECISIONS 172): work orders that are ready (routed to a workflow), not excluded, not a custom amount (those are done by hand), and not already assigned. A recurring gift is ONE assignment, however many
 *   payments it has: all the payments of a subscription go to the same partner, and it takes its units (the parts of one instalment) once. A one-off payment is its own assignment.
 * - Which partners (DECISIONS 154): a gift for a project goes to that project's partners in the project's order. The project must offer the benefit. A gift with no project, or a blank or "Where Needed Most" one,
 *   is not a general fund: it is for its own item and goes to any partner that delivers it.
 * - A partner is eligible when it is active with its due diligence approved and in date, delivers the item, and its capacity for the item is not 0.
 * - Rule: room. A partner's capacity for an item is the units it can take (the benefit's capacity, else the partner's total). The units already given to it for that item, and those handed out earlier in the same run, are
 *   counted. A gift needs its units to fit: if it does not, the next partner is tried. A partner with no capacity set has no limit.
 * - Rule: order. Urgent gifts first, then the oldest payment first, so the order is the same every time.
 * - Rule: automatic or suggested. A workflow set to automatic is assigned at once (recorded as automatic). One set to suggest only shows its suggestion, and a person confirms it or chooses another partner.
 * - Rule: reassign. A gift that is already assigned can be moved to another eligible partner only when its workflow allows reassigning. A gift with no one to go to waits, with the reason, for a person.
 * - Nothing is changed in place: every function returns a new value.
 */

import { partsOf, type WorkOrder } from "../01c-crm-connector/work-orders.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import { assignOf, flagOf } from "../02-project-rules/workflows.js";
import { typeForFramework } from "../05-outcomes/outcome-types.js";
import type { OutcomeType } from "../05-outcomes/outcome-types.js";
import { capacityFor, crmMatchNames, eligiblePartners, isGeneralProjectName, projectOffers, projectVendors, type GiftProject, type Project } from "../06-projects/projects.js";

export interface Assignment {
  key: string; // "sub:" and the subscription id for a recurring gift, or the work order (the CRM line id) for a one-off payment
  partnerId: string;
  giftProjectId: string; // the project the gift belongs to, "" when it has none
  itemId: string;
  parts: number; // the units it takes from the partner's room
  how: "auto" | "manual";
  at: string; // ISO time
}
export interface Assignments { records: Assignment[] }
export const emptyAssignments = (): Assignments => ({ records: [] });

export interface AssignContext {
  workOrders: WorkOrder[];
  partners: Project[];
  giftProjects: GiftProject[];
  modeOf: (frameworkId: string) => "auto" | "suggest"; // the workflow's Assignment setting
  reassignOf: (frameworkId: string) => boolean; // the workflow's Reassign switch
  urgent: Set<string>; // work order keys marked urgent
  today: string; // YYYY-MM-DD
  now: string; // ISO time
}

export interface Candidate { partnerId: string; name: string; ok: boolean; why: string }
export interface Suggestion {
  key: string;
  projectId: string; // "" when the gift has no project
  itemId: string;
  parts: number;
  payments: number; // how many payments the assignment covers: more than one for a recurring gift
  mode: "auto" | "suggest";
  partnerId: string; // the first partner with room, "" when none
  why: string; // in plain words: who it goes to or why no one
  blocked: "" | "not-offered" | "not-set-up" | "no-partner" | "none-delivers" | "full"; // why no one, in a word for counting: "" when a partner has room
  candidates: Candidate[]; // every partner considered, in order, with whether it has room
  urgent: boolean;
}
type Result = { value: Assignments } | { error: string };

// Builds the context from what the callers hold: each workflow gives its Assignment setting (automatic or suggest) and its Reassign switch.
export function contextFrom(a: { workOrders: WorkOrder[]; partners: Project[]; giftProjects: GiftProject[]; frameworks: FrameworkTemplate[]; outcomeTypes: OutcomeType[]; urgent?: Set<string>; today: string; now: string }): AssignContext {
  const fw = (id: string): FrameworkTemplate | undefined => a.frameworks.find((f) => f.id === id);
  return {
    workOrders: a.workOrders, partners: a.partners, giftProjects: a.giftProjects, urgent: a.urgent ?? new Set(), today: a.today, now: a.now,
    modeOf: (id) => { const f = fw(id); return f ? assignOf(f, typeForFramework(a.outcomeTypes, id)) : "suggest"; },
    reassignOf: (id) => { const f = fw(id); return f ? flagOf(f, "reassign") : true; },
  };
}

// Rule: the project a gift belongs to, by the CRM name on the line. Blank and "Where Needed Most" mean none.
export function projectOfOrder(w: WorkOrder, gps: GiftProject[]): GiftProject | undefined {
  const name = (w.projectName ?? "").trim().toLowerCase();
  if (isGeneralProjectName(name)) return undefined;
  return gps.find((g) => crmMatchNames(g).some((n) => n.trim().toLowerCase() === name));
}

// What is assigned as one: a recurring gift (all the payments of a subscription, one assignment) or a one-off payment. `w` is the payment that stands for it (the earliest), `payments` how many there are, and
// `parts` the units it takes: the parts of one instalment, not of every payment (DECISIONS 172).
export interface Assignable { key: string; w: WorkOrder; payments: number; parts: number }

// Rule (DECISIONS 173): a recurring gift is kept under "sub:" and its subscription id, so it can never be mistaken for a one-off payment whose line id has the same value.
export const subKey = (subscriptionId: string): string => `sub:${subscriptionId}`;

// Rule: the parts of one instalment. A payment that covers several instalments holds that many instalments' worth of parts.
const partsPerInstalment = (w: WorkOrder): number => Math.max(1, Math.round(partsOf(w) / (w.covers ?? 1)));

// Every assignable in scope, assigned or not: ready, with a workflow, not excluded, not a custom amount, not a legacy upload. Payments of one subscription are grouped. Urgent first, then the oldest payment.
export function assignables(ctx: AssignContext): Assignable[] {
  const live = ctx.workOrders.filter((w) => w.status === "ready" && (w.frameworkId ?? "") !== "" && w.customAmount !== true && w.legacyUpload !== true);
  const bySub = new Map<string, WorkOrder[]>();
  const out: Assignable[] = [];
  for (const w of live) {
    if (w.subscriptionId === "") out.push({ key: w.key, w, payments: 1, parts: partsOf(w) });
    else bySub.set(w.subscriptionId, [...(bySub.get(w.subscriptionId) ?? []), w]);
  }
  for (const [sub, lines] of bySub) {
    const sorted = [...lines].sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.key.localeCompare(b.key));
    const first = sorted[0] as WorkOrder;
    out.push({ key: subKey(sub), w: first, payments: lines.length, parts: partsPerInstalment(first) });
  }
  return out.sort((a, b) => Number(ctx.urgent.has(b.key) || ctx.urgent.has(b.w.key)) - Number(ctx.urgent.has(a.key) || ctx.urgent.has(a.w.key)) || a.w.paidDate.localeCompare(b.w.paidDate) || a.key.localeCompare(b.key));
}

// Which still need a partner: those with no assignment yet.
export function toAssign(ctx: AssignContext, existing: Assignments): Assignable[] {
  const done = new Set(existing.records.map((a) => a.key));
  return assignables(ctx).filter((x) => !done.has(x.key));
}

// Units already given to a partner for an item (the records, and what this run has handed out so far).
const taken = (records: Assignment[], partnerId: string, itemId: string): number => records.filter((a) => a.partnerId === partnerId && a.itemId === itemId).reduce((n, a) => n + a.parts, 0);

// Does a partner have room for this many more units of an item? No capacity set means no limit.
export function hasRoom(p: Project, itemId: string, parts: number, records: Assignment[]): { ok: boolean; why: string } {
  const cap = capacityFor(p, itemId);
  if (cap === undefined) return { ok: true, why: "no limit" };
  const used = taken(records, p.id, itemId);
  return used + parts <= cap ? { ok: true, why: `${cap - used} of ${cap} units free` } : { ok: false, why: `full: ${used} of ${cap} units taken, needs ${parts}` };
}

// The partners a gift can be considered for, in order, and why a gift may have none.
function considered(ctx: AssignContext, w: WorkOrder): { gp: GiftProject | undefined; list: Project[]; reason: string; blocked: Suggestion["blocked"] } {
  const gp = projectOfOrder(w, ctx.giftProjects);
  if (!gp) {
    if ((w.projectName ?? "").trim() !== "" && !isGeneralProjectName(w.projectName ?? "")) return { gp, list: [], reason: `The project ${w.projectName} is not set up yet.`, blocked: "not-set-up" };
    const list = eligiblePartners(ctx.partners, w.itemId, ctx.today);
    return { gp, list, reason: list.length ? "" : "No active partner delivers this item.", blocked: list.length ? "" : "none-delivers" };
  }
  if (!projectOffers(gp, w.itemId)) return { gp, list: [], reason: `${gp.name} does not offer this benefit.`, blocked: "not-offered" };
  const list = projectVendors(gp, ctx.partners, w.itemId, ctx.today);
  return { gp, list, reason: list.length ? "" : gp.partnerIds.length === 0 ? `${gp.name} has no partner yet.` : `No partner of ${gp.name} is eligible for this item.`, blocked: list.length ? "" : gp.partnerIds.length === 0 ? "no-partner" : "none-delivers" };
}

/**
 * Works out where every gift that needs a partner would go, in order, counting the room each partner has left as the run goes. Changes nothing: the result is only the suggestion for each.
 */
export function suggestAssignments(ctx: AssignContext, existing: Assignments): Suggestion[] {
  const running: Assignment[] = [...existing.records];
  const out: Suggestion[] = [];
  for (const unit of toAssign(ctx, existing)) {
    const { w, parts } = unit;
    const { gp, list, reason, blocked } = considered(ctx, w);
    const candidates: Candidate[] = list.map((p) => ({ partnerId: p.id, name: p.name, ...hasRoom(p, w.itemId, parts, running) }));
    const first = candidates.find((c) => c.ok);
    if (first) running.push({ key: unit.key, partnerId: first.partnerId, giftProjectId: gp?.id ?? "", itemId: w.itemId, parts, how: "auto", at: ctx.now });
    out.push({
      key: unit.key, projectId: gp?.id ?? "", itemId: w.itemId, parts, payments: unit.payments, mode: ctx.modeOf(w.frameworkId ?? ""), partnerId: first?.partnerId ?? "", urgent: ctx.urgent.has(unit.key) || ctx.urgent.has(w.key), candidates,
      why: first ? `Goes to ${first.name} (${first.why})` : reason || `Every eligible partner is full (${candidates.map((c) => c.name).join(", ")}).`,
      blocked: first ? "" : blocked || "full",
    });
  }
  return out;
}

/**
 * Rule: runs Assignment. A gift whose workflow is set to automatic and that has a partner with room is assigned at once. The others stay as suggestions for a person. Returns the new records, and how many were
 * assigned and how many are left.
 */
export function runAssignment(ctx: AssignContext, existing: Assignments): { value: Assignments; assigned: number; suggested: number; waiting: number } {
  let records = existing.records;
  let assigned = 0, suggested = 0, waiting = 0;
  for (const s of suggestAssignments(ctx, existing)) {
    if (s.partnerId === "") { waiting++; continue; }
    if (s.mode === "auto") { records = [...records, { key: s.key, partnerId: s.partnerId, giftProjectId: s.projectId, itemId: s.itemId, parts: s.parts, how: "auto", at: ctx.now }]; assigned++; }
    else suggested++;
  }
  return { value: { records }, assigned, suggested, waiting };
}

/**
 * Rule: a person assigns a gift to a partner, or moves it. The partner must be eligible for the item and have room. Moving a gift that is already assigned needs its workflow to allow reassigning.
 * A person may choose a partner outside the project's order, as long as it is eligible.
 */
export function assignManual(ctx: AssignContext, existing: Assignments, key: string, partnerId: string): Result {
  const unit = assignables(ctx).find((x) => x.key === key);
  if (!unit) return { error: "That gift was not found, or it is not ready to be assigned: it needs a workflow." };
  const w = unit.w;
  const current = existing.records.find((a) => a.key === key);
  if (current && current.partnerId === partnerId) return { error: "It is already assigned to that partner." };
  if (current && !ctx.reassignOf(w.frameworkId ?? "")) return { error: "Reassigning is switched off for this workflow." };
  const p = eligiblePartners(ctx.partners, w.itemId, ctx.today).find((x) => x.id === partnerId);
  if (!p) return { error: "That partner is not eligible for this item: it must be active, with its due diligence approved and in date, and deliver the item." };
  const others = existing.records.filter((a) => a.key !== key);
  const room = hasRoom(p, w.itemId, unit.parts, others);
  if (!room.ok) return { error: `${p.name} is ${room.why}.` };
  const gp = projectOfOrder(w, ctx.giftProjects);
  return { value: { records: [...others, { key, partnerId, giftProjectId: gp?.id ?? "", itemId: w.itemId, parts: unit.parts, how: "manual", at: ctx.now }] } };
}

export function unassign(existing: Assignments, key: string): Result {
  if (!existing.records.some((a) => a.key === key)) return { error: "That gift is not assigned." };
  return { value: { records: existing.records.filter((a) => a.key !== key) } };
}

// The room each partner has left for each item it delivers: capacity, taken and free, for the partner table. A partner with no capacity set has no limit.
export interface Load { partnerId: string; itemId: string; capacity: number | undefined; taken: number }
export function loads(partners: Project[], existing: Assignments): Load[] {
  const out: Load[] = [];
  for (const p of partners) {
    const items = new Set([...(p.itemIds ?? []), ...existing.records.filter((a) => a.partnerId === p.id).map((a) => a.itemId)]);
    for (const itemId of items) out.push({ partnerId: p.id, itemId, capacity: capacityFor(p, itemId), taken: taken(existing.records, p.id, itemId) });
  }
  return out;
}

/**
 * The requests the page makes on Assignment, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about Assignment.
 * asg-run assigns every gift that can go automatically. asg-set assigns or moves one gift by a person. asg-confirm confirms every suggestion at once. asg-unassign takes one back. asg-reset clears them all.
 */
export function applyAssignmentAction(ctx: AssignContext, existing: Assignments, body: Record<string, unknown>): ({ value: Assignments; message?: string } | { error: string }) | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "asg-run": {
      const r = runAssignment(ctx, existing);
      return { value: r.value, message: `Assigned ${r.assigned} automatically. ${r.suggested} more are suggested for a person to confirm, and ${r.waiting} wait with no partner with room.` };
    }
    case "asg-confirm": {
      let records = existing.records;
      let n = 0;
      for (const s of suggestAssignments(ctx, existing)) if (s.partnerId !== "") { records = [...records, { key: s.key, partnerId: s.partnerId, giftProjectId: s.projectId, itemId: s.itemId, parts: s.parts, how: "manual", at: ctx.now }]; n++; }
      return { value: { records }, message: `Confirmed ${n} suggestion${n === 1 ? "" : "s"}.` };
    }
    case "asg-set": return assignManual(ctx, existing, str("key"), str("partnerId"));
    case "asg-unassign": return unassign(existing, str("key"));
    case "asg-reset": return { value: emptyAssignments(), message: "All assignments were cleared." };
    default: return null;
  }
}
