/**
 * allocation.ts
 *
 * What it does: Allocation rewired onto what has been built (DECISIONS 175). Once a gift has a partner (Assignment), it is allocated: a gift for a type where the beneficiary comes first (sponsorship) fills an open
 * place, which is an enrolment of an approved beneficiary in a cluster of the gift's project for that benefit. A gift for a type where the gift comes first (a pump, a camp) creates an outcome, and its recipients
 * are enrolled after. A gift for a type that has no beneficiary (a mosque) creates an outcome and waits for no one. The results are kept as separate records, so a test run can be reset.
 * Who calls it: the Allocate page (app/allocation/allocate-page.ts), the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), all through applyPlacementAction. Depends on: assignment.ts, enrolments.ts,
 * projects.ts (the types) and categories.ts (the types). Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Which gifts: those assigned to a partner and not allocated yet.
 * - Rule: a place. For a beneficiary-first type, a place is an active enrolment, without a role, of an active beneficiary (a person must be Ready), for the gift's benefit, in a cluster of the project.
 *   Its capacity is the units that make one whole beneficiary in the gift's workflow (3 parts for an orphan, 1 for a scholarship).
 * - Rule: which project. A gift that carries a project fills that project's places only. A gift with no project goes to a place in any project that offers the benefit and has the gift's assigned partner among
 *   its partners, so the partner that delivers is the partner for that place.
 * - Rule: which place (DECISIONS 183). The assigned partner's own children first, since a partner's room is its own children. Then (DECISIONS 282) a beneficiary marked Priority. Then the place with the lowest fill first, so more beneficiaries are sponsored, then the earliest enrolled. A gift goes whole into one place when it fits. When no single place can take all of it, it is
 *   spread over several (a gift of 2 units for a scholarship that needs 1 unit sponsors two children; 6 parts for an orphan who needs 3 sponsors two), each taking what it has free (DECISIONS 181).
 * - Rule: gift first. A gift for a gift-first type, or for a type with no beneficiary, creates an outcome (OUT-0001). It needs no place. Recipients are enrolled afterwards.
 * - Rule (DECISIONS 186): nothing is deleted. An allocation has a start (when it was made) and, once it ends, an end date and a reason (the plan paused, cancelled or completed; the child left; a person moved or took it back).
 *   An ended allocation is history: it frees the child's place and is kept. Each run first ends the allocations of a gift whose plan is now parked and of a child who has left. A plan that runs again is given its previous
 *   child back if that child is still free, else a new place like any gift. Only a reset (a test run) clears history.
 * - A gift with no beneficiary to fund waits, with the reason: no one is enrolled for the benefit, or every beneficiary for it is already fully funded. A gift for an item with no type yet waits too, and says the type is missing (DECISIONS 178).
 * - A person can place a gift in a chosen place that is open and fits, or take an allocation back. Nothing is changed in place: every function returns a new value.
 */

import type { Assignable, Assignment } from "../08-assignment/assignment.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import { unitsOfItem } from "../02-project-rules/benefits.js";
import type { GiftProject } from "../06-projects/projects.js";
import { comparePlaces, DEFAULT_STEPS, type Step } from "./order.js";
import { addStock, freeStock, removeStock, setStockPriority, usedStock, type StockItem } from "./stock.js";
import type { Beneficiary } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolment, ItemRules } from "../07-beneficiaries/enrolments.js";

// Why an allocation ended (DECISIONS 186). The first three are the plan's own status in the CRM.
export type EndReason = "paused" | "cancelled" | "completed" | "beneficiary-left" | "unassigned" | "released" | "moved" | "taken-back";
export const END_LABEL: Record<EndReason, string> = { paused: "The plan was paused", cancelled: "The plan was cancelled", completed: "The plan was completed", "beneficiary-left": "The beneficiary left", unassigned: "The gift's assignment to a partner was withdrawn", released: "The gift is no longer in scope", moved: "A person moved it to another beneficiary", "taken-back": "A person took it back" };
const RESUMABLE: EndReason[] = ["paused", "cancelled", "completed"]; // a plan that ended for one of these and runs again is offered its previous child
export const isActive = (p: { to?: string }): boolean => p.to === undefined;

export interface Allocation {
  key: string; // one gift can have several records when it is spread over several places (DECISIONS 181) // the assignment (the subscription as "sub:" and its id, or the line id)
  kind: "beneficiary" | "outcome"; // a place filled, or an outcome created from the gift
  enrolmentId: string; // the place filled, "" for an outcome
  outcomeRef: string; // the outcome created, "" for a place
  stockId?: string; // the parked outcome it took (DECISIONS 209), absent when the outcome was made new from the gift
  giftProjectId: string;
  itemId: string;
  parts: number;
  how: "auto" | "manual";
  at: string; // ISO time it started
  to?: string; // the day it ended, YYYY-MM-DD. Absent while it holds the place
  endReason?: EndReason; // why it ended
}
export interface Allocations { records: Allocation[]; counter: number; stock?: StockItem[]; stockCounter?: number } // stock: the parked outcomes partners have loaded (DECISIONS 209)
export const emptyAllocations = (): Allocations => ({ records: [], counter: 0 });

export interface AllocationContext {
  assignments: Assignment[];
  assignables: Assignable[]; // the gifts, for the page
  enrolments: Enrolment[];
  beneficiaries: Beneficiary[];
  giftProjects: GiftProject[];
  frameworks: FrameworkTemplate[];
  live: Set<string>; // the assignments still in scope: a gift of a paused, cancelled or completed plan holds no place (DECISIONS 185)
  parkedBy: Record<string, EndReason>; // for a gift whose plan is paused, cancelled or completed: which, so its allocation ends with that reason (DECISIONS 186)
  itemUnits: Record<string, number>; // the units that make one whole beneficiary, by item, when an item has its own number (DECISIONS 188)
  itemFramework: Record<string, string>; // the workflow each item is in, from its gifts, to know the units that make one whole beneficiary
  rulesOf: (itemId: string) => ItemRules | undefined;
  now: string; // ISO time
  urgent?: Set<string>; // the assignments marked Priority (DECISIONS 284): allocated before the others. Absent: none
  steps?: Step[]; // the order a gift looks for a place in (DECISIONS 293). Absent: the usual order
}

// Builds the context from what the callers hold. The workflow of an item is the one its gifts are routed under.
export function allocateContext(a: { assignments: Assignment[]; assignables: Assignable[]; workOrders: { itemId: string; frameworkId?: string; subscriptionId?: string; paidDate?: string; planStatus?: string }[]; enrolments: Enrolment[]; beneficiaries: Beneficiary[]; giftProjects: GiftProject[]; frameworks: FrameworkTemplate[]; rulesOf: (itemId: string) => ItemRules | undefined; now: string; itemUnits?: Record<string, number>; urgent?: Set<string>; steps?: Step[] }): AllocationContext {
  const itemFramework: Record<string, string> = {};
  for (const w of a.workOrders) if ((w.frameworkId ?? "") !== "" && itemFramework[w.itemId] === undefined) itemFramework[w.itemId] = w.frameworkId as string;
  // The gifts still in scope. When no list of gifts is given (a caller that only has assignments), every assignment counts.
  const live = new Set(a.assignables.length > 0 ? a.assignables.map((u) => u.key) : a.assignments.map((x) => x.key));
  // The plan status of each recurring gift, from its newest line that has one.
  const parkedBy: Record<string, EndReason> = {};
  const bySub = new Map<string, { paidDate: string; planStatus: string }[]>();
  for (const w of a.workOrders) if ((w.subscriptionId ?? "") !== "" && w.planStatus !== undefined) bySub.set(w.subscriptionId as string, [...(bySub.get(w.subscriptionId as string) ?? []), { paidDate: w.paidDate ?? "", planStatus: w.planStatus }]);
  for (const [sub, lines] of bySub) {
    const status = [...lines].sort((x, y) => x.paidDate.localeCompare(y.paidDate)).at(-1)?.planStatus ?? "";
    if (status === "paused" || status === "cancelled" || status === "completed") parkedBy[`sub:${sub}`] = status;
  }
  return { assignments: a.assignments.filter((x) => live.has(x.key)), live, parkedBy, itemUnits: a.itemUnits ?? {}, assignables: a.assignables, enrolments: a.enrolments, beneficiaries: a.beneficiaries, giftProjects: a.giftProjects, frameworks: a.frameworks, itemFramework, rulesOf: a.rulesOf, now: a.now, ...(a.urgent ? { urgent: a.urgent } : {}), ...(a.steps ? { steps: a.steps } : {}) };
}

export type Blocked = "" | "no-beneficiary" | "full" | "no-project-beneficiary" | "no-type";
export interface AllocationOption { enrolmentId: string; beneficiaryId: string; name: string; giftProjectId: string; clusterId: string; used: number; capacity: number; fits: boolean }
export interface AllocationSuggestion {
  stockId?: string; // the parked outcome the gift would take (DECISIONS 209)
  stockName?: string;
  key: string;
  itemId: string;
  parts: number;
  kind: "beneficiary" | "outcome" | "";
  enrolmentId: string; // the first place it would fill
  shares: { enrolmentId: string; parts: number }[]; // every place it would fill, with the units in each: more than one when it is spread
  why: string;
  blocked: Blocked;
  options: AllocationOption[]; // every place considered, in order, with whether the gift fits
}
type Result = { value: Allocations } | { error: string };

// How many units make one whole beneficiary of an item, from the workflow its gifts are in (3 parts for an orphan, 1 for a scholarship). 1 when it is not known.
const wholeOf = (ctx: AllocationContext, itemId: string): number => unitsOfItem(ctx.itemUnits, itemId, ctx.frameworks.find((f) => f.id === ctx.itemFramework[itemId])?.unitsPerBeneficiary ?? 1); // the item's own number, else its workflow's (DECISIONS 188)

const used = (records: Allocation[], enrolmentId: string, live?: Set<string>): number => records.filter((p) => isActive(p) && p.enrolmentId === enrolmentId && (!live || live.has(p.key))).reduce((n, p) => n + p.parts, 0);

// The places a gift could fill, in the order they are tried, with the room in each.
export function optionsFor(ctx: AllocationContext, a: Assignment, records: Allocation[], prefer: Set<string> = new Set()): AllocationOption[] {
  const whole = wholeOf(ctx, a.itemId);
  const byId = new Map(ctx.beneficiaries.map((b) => [b.id, b]));
  const inProject = (gpId: string): boolean => {
    if (a.giftProjectId !== "") return gpId === a.giftProjectId; // a gift for a project fills that project only
    const gp = ctx.giftProjects.find((g) => g.id === gpId);
    return !!gp && gp.partnerIds.includes(a.partnerId) && ((gp.itemIds ?? []).length === 0 || (gp.itemIds ?? []).includes(a.itemId)); // any project the assigned partner delivers for
  };
  return ctx.enrolments
    .filter((e) => e.status === "active" && e.role === "" && e.itemId === a.itemId && inProject(e.giftProjectId))
    .filter((e) => { const b = byId.get(e.beneficiaryId); return !!b && b.status === "active" && (b.kind !== "person" || b.eligibility === "ready"); })
    .map((e): AllocationOption => { const u = used(records, e.id, ctx.live); return { enrolmentId: e.id, beneficiaryId: e.beneficiaryId, name: byId.get(e.beneficiaryId)?.name ?? e.beneficiaryId, giftProjectId: e.giftProjectId, clusterId: e.clusterId, used: u, capacity: whole, fits: u + a.parts <= whole }; })
    // Rule (DECISIONS 186): a plan that runs again is offered its previous child first. Rule (DECISIONS 183): then the assigned partner's own children, since a partner's room is its own children. Rule (DECISIONS 282): then a beneficiary marked Priority. Then the lowest fill, then the earliest enrolled.
    // Rule (DECISIONS 293): the steps in between are the organisation's own order; the previous beneficiary comes first and the earliest enrolled decides a tie.
    .sort((x, y) => Number(prefer.has(y.enrolmentId)) - Number(prefer.has(x.enrolmentId)) || comparePlaces(ctx.steps ?? DEFAULT_STEPS, { own: byId.get(x.beneficiaryId)?.partnerId === a.partnerId, priority: byId.get(x.beneficiaryId)?.priority === true, used: x.used }, { own: byId.get(y.beneficiaryId)?.partnerId === a.partnerId, priority: byId.get(y.beneficiaryId)?.priority === true, used: y.used }) || x.enrolmentId.localeCompare(y.enrolmentId));
}

/**
 * Works out where every assigned gift that is not allocated yet would go, counting what each place has taken as the run goes. Changes nothing.
 */
export function suggestAllocations(ctx: AllocationContext, existing: Allocations): AllocationSuggestion[] {
  const running: Allocation[] = [...existing.records];
  const done = new Set(existing.records.filter(isActive).map((p) => p.key)); // a gift whose allocation has ended is no longer allocated
  const out: AllocationSuggestion[] = [];
  const takenStock = usedStock(existing.records); // parked outcomes used already, and those promised earlier in this run
  // Rule (DECISIONS 284): a gift marked Priority is looked after first, so it gets the place or outcome before the others; then the oldest.
  const first = (k: string): number => Number(ctx.urgent?.has(k) === true);
  for (const a of [...ctx.assignments].filter((x) => !done.has(x.key)).sort((x, y) => first(y.key) - first(x.key) || x.at.localeCompare(y.at) || x.key.localeCompare(y.key))) {
    const rules = ctx.rulesOf(a.itemId);
    // Rule: a gift for a type where the gift comes first, or with no beneficiary, creates an outcome. It needs no place.
    if (rules && (rules.first === "gift" || rules.receiver === "none")) {
      // Rule (DECISIONS 209): the partner's own parked outcome for the benefit is taken first. With none free, an outcome is made from the gift.
      const parked = freeStock(existing.stock ?? [], takenStock, a.partnerId, a.itemId, a.giftProjectId);
      if (parked) takenStock.add(parked.id);
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "outcome", enrolmentId: "", shares: [], blocked: "", options: [], ...(parked ? { stockId: parked.id, stockName: parked.name } : {}), why: parked ? `Takes the parked outcome ${parked.name}.` : rules.receiver === "none" ? "Creates an outcome for a community: it has no beneficiary." : "Creates an outcome. Its recipients are enrolled after." });
      continue;
    }
    // Rule (DECISIONS 178): an item with no type yet cannot say who receives it, so its gift waits and says so, instead of looking for a child that cannot exist.
    if (!rules) {
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "", enrolmentId: "", shares: [], blocked: "no-type", options: [], why: "The item has no type yet, so it is not known who receives it. Choose a type on the Benefits page." });
      continue;
    }
    // Rule (DECISIONS 186): a plan that ended because it was paused, cancelled or completed, and runs again, is offered the child it had, if still free.
    const previous = new Set(existing.records.filter((p) => p.key === a.key && p.kind === "beneficiary" && !isActive(p) && p.endReason !== undefined && RESUMABLE.includes(p.endReason)).map((p) => p.enrolmentId));
    const options = optionsFor(ctx, a, running, previous);
    const open = options.find((o) => o.fits);
    // Rule (DECISIONS 181): when no single place can take the whole gift, it is spread over the places that have room, the lowest fill first, if together they can take all of it.
    const shares: { enrolmentId: string; parts: number }[] = [];
    if (open) shares.push({ enrolmentId: open.enrolmentId, parts: a.parts });
    else {
      let left = a.parts;
      for (const o of options) { const take = Math.min(left, o.capacity - o.used); if (take > 0) { shares.push({ enrolmentId: o.enrolmentId, parts: take }); left -= take; } if (left === 0) break; }
      if (left > 0) shares.length = 0;
    }
    if (shares.length > 0) {
      for (const sh of shares) running.push({ key: a.key, kind: "beneficiary", enrolmentId: sh.enrolmentId, outcomeRef: "", giftProjectId: options.find((o) => o.enrolmentId === sh.enrolmentId)?.giftProjectId ?? a.giftProjectId, itemId: a.itemId, parts: sh.parts, how: "auto", at: ctx.now });
      const first = options.find((o) => o.enrolmentId === shares[0]?.enrolmentId) as AllocationOption;
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "beneficiary", enrolmentId: first.enrolmentId, shares, blocked: "", options, why: shares.length === 1 ? `${previous.has(first.enrolmentId) ? "Takes back its previous beneficiary, " : "Supports "}${first.name} (${first.used} of ${first.capacity} units taken)` : `Spread over ${shares.length} beneficiaries, ${shares.map((x) => `${options.find((o) => o.enrolmentId === x.enrolmentId)?.name ?? x.enrolmentId} (${x.parts})`).join(", ")}, since no single beneficiary can take ${a.parts} units` });
    } else {
      const blocked: Blocked = options.length > 0 ? "full" : a.giftProjectId !== "" ? "no-beneficiary" : "no-project-beneficiary";
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "", enrolmentId: "", shares: [], blocked, options, why: options.length > 0 ? "Every beneficiary for this benefit is already fully funded." : a.giftProjectId !== "" ? "No approved beneficiary is enrolled for this benefit in the gift's project." : "No approved beneficiary is enrolled for this benefit with the assigned partner." });
    }
  }
  return out;
}

// Ends a list of allocations today with a reason, keeping them as history.
const endRecords = (records: Allocation[], when: (p: Allocation) => EndReason | undefined, today: string): { records: Allocation[]; ended: number } => {
  let ended = 0;
  const next = records.map((p) => {
    if (!isActive(p) || p.kind !== "beneficiary") return p;
    const reason = when(p);
    if (reason === undefined) return p;
    ended++;
    return { ...p, to: today, endReason: reason };
  });
  return { records: next, ended };
};

/**
 * Rule (DECISIONS 186): brings the allocations up to date. An allocation whose gift's plan is now paused, cancelled or completed ends with that reason; one whose gift has gone out of scope for another reason ends as released;
 * one whose child has left (the enrolment ended, or the child is inactive or no longer approved) ends as child-left. Nothing is deleted: the ended allocation is history and the child's place is free.
 */
export function syncAllocations(ctx: AllocationContext, existing: Allocations): { value: Allocations; ended: number } {
  const today = ctx.now.slice(0, 10);
  const byId = new Map(ctx.beneficiaries.map((b) => [b.id, b]));
  const enrolled = new Map(ctx.enrolments.map((e) => [e.id, e]));
  // Rule (DECISIONS 187): an allocation cannot outlive its assignment. When a gift is no longer assigned to a partner (it was taken back, or the assignments were reset), its place ends as unassigned, and an outcome made from it is
  // removed, since an outcome never held a child.
  const assigned = new Set(ctx.assignments.map((a) => a.key));
  // Rule: an outcome is also removed when its item is no longer a gift-first or no-beneficiary type, or when the same gift now fills a place.
  const allocatedKeys = new Set(existing.records.filter((p) => p.kind === "beneficiary" && isActive(p)).map((p) => p.key));
  const stillOutcome = (itemId: string): boolean => { const r = ctx.rulesOf(itemId); return !r || r.first === "gift" || r.receiver === "none"; };
  const dropped = existing.records.filter((p) => p.kind === "outcome" && isActive(p) && ctx.live.has(p.key) && (!assigned.has(p.key) || allocatedKeys.has(p.key) || !stillOutcome(p.itemId)));
  const kept = existing.records.filter((p) => !dropped.includes(p));
  const r = endRecords(kept, (p) => {
    if (!ctx.live.has(p.key)) return ctx.parkedBy[p.key] ?? "released";
    if (!assigned.has(p.key)) return "unassigned";
    const e = enrolled.get(p.enrolmentId);
    const b = e ? byId.get(e.beneficiaryId) : undefined;
    if (!e || e.status !== "active" || !b || b.status !== "active" || (b.kind === "person" && b.eligibility !== "ready")) return "beneficiary-left";
    return undefined;
  }, today);
  return { value: { ...existing, records: r.records }, ended: r.ended + dropped.length };
}

// Runs Allocation: first it brings the allocations up to date (ending those of a parked plan or a child who has left), then every gift that has a place or creates an outcome is allocated. Returns the new records and the counts.
export function runAllocation(ctx: AllocationContext, existing: Allocations): { value: Allocations; allocated: number; outcomes: number; waiting: number; ended: number } {
  const synced = syncAllocations(ctx, existing);
  let records = synced.value.records;
  let counter = existing.counter;
  let allocated = 0, outcomes = 0, waiting = 0;
  const start = ctx.now;
  for (const s of suggestAllocations(ctx, synced.value)) {
    const a = ctx.assignments.find((x) => x.key === s.key) as Assignment;
    if (s.kind === "beneficiary") { records = [...records, ...s.shares.map((sh): Allocation => ({ key: s.key, kind: "beneficiary", enrolmentId: sh.enrolmentId, outcomeRef: "", giftProjectId: ctx.enrolments.find((e) => e.id === sh.enrolmentId)?.giftProjectId ?? a.giftProjectId, itemId: s.itemId, parts: sh.parts, how: "auto", at: start }))]; allocated++; }
    else if (s.kind === "outcome") { counter++; records = [...records, { key: s.key, kind: "outcome", enrolmentId: "", outcomeRef: `OUT-${String(counter).padStart(4, "0")}`, ...(s.stockId ? { stockId: s.stockId } : {}), giftProjectId: a.giftProjectId, itemId: s.itemId, parts: s.parts, how: "auto", at: start }]; outcomes++; }
    else waiting++;
  }
  return { value: { ...synced.value, records, counter }, allocated, outcomes, waiting, ended: synced.ended };
}

// Rule: a person places a gift in a chosen place that is open and fits. A gift that already has a place is moved.
export function allocateManual(ctx: AllocationContext, existing: Allocations, key: string, enrolmentId: string): Result {
  const a = ctx.assignments.find((x) => x.key === key);
  if (!a) return { error: "That gift has not been assigned to a partner yet." };
  const rules = ctx.rulesOf(a.itemId);
  if (rules && (rules.first === "gift" || rules.receiver === "none")) return { error: "This gift creates an outcome. It does not fund a beneficiary." };
  // Rule: a gift that fills a place is no longer an outcome, so any outcome it made earlier (before its item was a beneficiary type) is removed.
  existing = { ...existing, records: existing.records.filter((p) => !(p.key === key && p.kind === "outcome" && isActive(p))) };
  const others = existing.records.filter((p) => p.key !== key || !isActive(p)); // the gift's own active allocations leave the count while it is moved
  const option = optionsFor(ctx, a, others).find((o) => o.enrolmentId === enrolmentId);
  if (!option) return { error: "That beneficiary cannot take this gift: it must be an approved beneficiary enrolled for this benefit in the right project." };
  if (!option.fits) return { error: `${option.name} is already funded: ${option.used} of ${option.capacity} units taken, and this gift needs ${a.parts}.` };
  // Rule (DECISIONS 186): the gift's earlier allocation ends as moved and stays as history.
  const ended = existing.records.map((p) => (p.key === key && isActive(p) && p.kind === "beneficiary" ? { ...p, to: ctx.now.slice(0, 10), endReason: "moved" as const } : p));
  return { value: { ...existing, records: [...ended, { key, kind: "beneficiary", enrolmentId, outcomeRef: "", giftProjectId: option.giftProjectId, itemId: a.itemId, parts: a.parts, how: "manual", at: ctx.now }] } };
}

// Rule (DECISIONS 186): taking an allocation back ends it as taken back and keeps it as history. An outcome that was created is removed, since it never held a child.
export function unplace(existing: Allocations, key: string, today = ""): Result {
  if (!existing.records.some((p) => p.key === key && isActive(p))) return { error: "That gift is not allocated." };
  const day = today || new Date().toISOString().slice(0, 10);
  return { value: { ...existing, records: existing.records.filter((p) => !(p.key === key && isActive(p) && p.kind === "outcome")).map((p) => (p.key === key && isActive(p) ? { ...p, to: day, endReason: "taken-back" as const } : p)) } };
}

// How full each place is, for the page: the units taken and needed, from the gifts allocated in it.
export interface AllocationFill { enrolmentId: string; used: number; capacity: number }
export function fills(ctx: AllocationContext, existing: Allocations): AllocationFill[] {
  return ctx.enrolments
    .filter((e) => e.status === "active" && e.role === "" && (ctx.rulesOf(e.itemId)?.first ?? "beneficiary") === "beneficiary" && (ctx.rulesOf(e.itemId)?.receiver ?? "person") !== "none")
    .map((e) => ({ enrolmentId: e.id, used: used(existing.records, e.id, ctx.live), capacity: wholeOf(ctx, e.itemId) }));
}

/**
 * The requests the page makes on Allocation, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about Allocation.
 * alc-run places every gift that can be allocated. alc-set places or moves one gift by a person. alc-undo takes one back. alc-reset clears them all.
 */
export function applyAllocationAction(ctx: AllocationContext, existing: Allocations, body: Record<string, unknown>): ({ value: Allocations; message?: string } | { error: string }) | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "alc-run": {
      const r = runAllocation(ctx, existing);
      return { value: r.value, message: `Allocated ${r.allocated} with beneficiaries to fund and created ${r.outcomes} outcome${r.outcomes === 1 ? "" : "s"}. ${r.waiting} wait with no beneficiary to fund.${r.ended ? ` ${r.ended} allocation${r.ended === 1 ? "" : "s"} ended (a plan was parked or a beneficiary left) and ${r.ended === 1 ? "is" : "are"} kept as history.` : ""}` };
    }
    case "alc-set": return allocateManual(ctx, existing, str("key"), str("enrolmentId"));
    case "alc-undo": return unplace(existing, str("key"), ctx.now.slice(0, 10));
    case "alc-reset": return { value: { ...emptyAllocations(), ...(existing.stock ? { stock: existing.stock, stockCounter: existing.stockCounter ?? 0 } : {}) }, message: `All allocations were cleared, history included.${existing.stock?.length ? " Parked outcomes were kept." : ""}` };
    case "alc-stock-add": { const r = addStock(existing, { partnerId: str("partnerId"), giftProjectId: str("giftProjectId"), clusterId: str("clusterId"), itemId: str("itemId"), name: str("name") }, ctx.now); return "error" in r ? r : { value: r.value, message: "Parked outcome added." }; }
    case "alc-stock-priority": { const r = setStockPriority(existing, str("id"), body["priority"] === true, usedStock(existing.records.filter((p) => p.to === undefined))); return "error" in r ? r : { value: r.value, message: body["priority"] === true ? "Marked as priority: gifts take it first." : "Priority taken away." }; }
    case "alc-stock-remove": { const r = removeStock(existing, str("id"), usedStock(existing.records.filter((p) => p.to === undefined))); return "error" in r ? r : { value: r.value, message: "Parked outcome removed." }; }
    default: return null;
  }
}
