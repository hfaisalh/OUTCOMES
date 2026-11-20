/**
 * outcomes.ts
 *
 * What it does: outcomes (what a gift is for: a child, a student, a widow, a tutor, a bride, a building, a location, an
 * activity), how full each is, and the rules that allocate commitments to them. The first cut of the journey from gift to
 * outcome (DECISIONS 60, 61).
 * Who calls it: the Outcomes page (app/) and the /api/outcomes endpoint (modules/00-platform/handlers.ts).
 * Depends on: Module 2 (framework templates) and Module 4b (commitments) types. Pure functions: no database, no screen.
 *
 * Rules:
 * - An outcome has a framework. The framework's units per beneficiary is its capacity: 3 parts a month for an orphan,
 *   1 for a scholarship, 1 whole for a pump or a building.
 * - A commitment takes capacity equal to its parts per instalment, from the first outcome that has it free
 *   and uses the same framework, oldest commitment first (the order donations were given).
 * - A limited per-period commitment that is fully paid stops taking capacity. A commitment to a whole item keeps it.
 * - An inactive outcome takes nothing new, and what was allocated to it is released and placed again (decision 60c).
 * - A person can move a commitment to another outcome that has room (reallocation at a donor's request, decision 60d).
 * - A one-off payment for a per-period item is allocated too (DECISIONS 64): it is paid up front for the months of the item's plan, and frees its parts after the last of them.
 * - Nothing is changed in place: every function returns a new value.
 */

import type { Commitment } from "../04b-commitments/commitments.js";
import { slugify, type FrameworkTemplate } from "../02-project-rules/categories.js";

export interface Outcome {
  id: string; // stable, made from the name
  name: string;
  type: string; // what kind of outcome, in the organisation's words: child, student, widow, well, camp
  cohort: string; // the group it belongs to, "" for none. Cohort management comes later
  frameworkId: string; // the framework that gives its unit and capacity
  active: boolean;
  projectId?: string; // the project it belongs to, absent for one made before projects existed (DECISIONS 65)
  nodeId?: string; // the place in the project's structure where it lives
  typeId?: string; // the project's type of beneficiary it is
  groupIds?: string[]; // the groups it is in inside its place, such as a class and a house (DECISIONS 71)
}

export interface Allocation {
  commitmentKey: string; // the subscription id, or "once-" and the line id for a one-off payment
  outcomeId: string;
  parts: number; // capacity taken: the commitment's parts per instalment when it was allocated
  how: "auto" | "manual";
  at: string; // ISO time
}

export type Availability = "open" | "part" | "full" | "inactive";

export interface Fill {
  capacity: number;
  used: number;
  free: number;
  state: Availability;
}

export interface Changed<T> {
  value: T;
  error?: string; // plain English, set when nothing was changed
}

// Rule (DECISIONS 64): does a framework count a payment as a period? Used to decide which one-off payments can be allocated.
export const perPeriodRule = (fw: FrameworkTemplate[]) => (frameworkId: string): boolean => fw.find((f) => f.id === frameworkId)?.instalment === "per_period";

const frameworkOf = (fw: FrameworkTemplate[], id: string) => fw.find((f) => f.id === id);

// Capacity of one outcome, from its framework. Without a framework it takes nothing.
export const capacityOf = (o: Outcome, fw: FrameworkTemplate[]): number => frameworkOf(fw, o.frameworkId)?.unitsPerBeneficiary ?? 0;

// The rule for plans that stop paying (DECISIONS 66). A plan that has missed more than `bufferMonths` payments no longer holds its place.
export interface Policy {
  today: string; // YYYY-MM-DD
  bufferMonths: number; // missed payments a plan may have and still hold its place. The sheet's "1 month payment policy" is 1
}
export const DEFAULT_BUFFER_MONTHS = 1;

const monthIdx = (d: string): number => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));

// How many payments a plan is behind: its next due date and each monthly due date after it that has come, and no more than it has left to pay.
export function overdueMonths(c: Commitment, today: string): number {
  if (c.once || c.nextDue === "" || c.nextDue > today) return 0;
  if (c.planStatus === "paused" || c.planStatus === "cancelled" || c.planStatus === "completed") return 0;
  const left = c.planned === null ? Infinity : Math.max(c.planned - (c.planPaid ?? c.paid), 0);
  const dueByNow = monthIdx(today) - monthIdx(c.nextDue) + (Number(today.slice(8, 10)) >= Number(c.nextDue.slice(8, 10)) ? 1 : 0);
  return Math.min(dueByNow, left);
}

// Rule: behind, but still inside the buffer, so it keeps its place for now.
export const inBuffer = (c: Commitment, p: Policy): boolean => overdueMonths(c, p.today) > 0 && overdueMonths(c, p.today) <= p.bufferMonths;

// Rule: does this commitment still hold capacity? A fully paid limited per-period commitment has run its course, a cancelled plan
// has gone, and (when a policy is given) a plan that is behind by more than the buffer has lapsed. A commitment to a whole item keeps it.
export function takesCapacity(c: Commitment, fw: FrameworkTemplate[], policy?: Policy): boolean {
  const f = frameworkOf(fw, c.frameworkId);
  if (!f || f.instalment === undefined) return false;
  // Rule (DECISIONS 60, 62): a plan the CRM has cancelled no longer holds capacity, so it reopens for someone else.
  if (c.planStatus === "cancelled") return false;
  if (policy && overdueMonths(c, policy.today) > policy.bufferMonths) return false;
  return f.instalment === "per_period" ? c.state !== "complete" : true;
}

export interface HoldingReport {
  total: number; // commitments (subscriptions and one-off payments)
  holding: number; // those that ask for capacity
  noFramework: number; // no framework on them, so nothing to allocate to
  noRule: number; // their framework does not say how an instalment counts
  cancelled: number; // the CRM plan is cancelled
  finished: number; // fully paid and per period, so the capacity is free
  lapsed: number; // behind by more than the buffer, so they no longer hold a place
  inBuffer: number; // behind, but inside the buffer, so they still hold a place (counted in holding too)
}

// Rule: say why commitments are not asking for capacity, so "0 waiting" is never a mystery.
export function holdingReport(commitments: Commitment[], fw: FrameworkTemplate[], policy?: Policy): HoldingReport {
  const r: HoldingReport = { total: commitments.length, holding: 0, noFramework: 0, noRule: 0, cancelled: 0, finished: 0, lapsed: 0, inBuffer: 0 };
  for (const c of commitments) {
    const f = frameworkOf(fw, c.frameworkId);
    if (!f) r.noFramework++;
    else if (f.instalment === undefined) r.noRule++;
    else if (c.planStatus === "cancelled") r.cancelled++;
    else if (policy && overdueMonths(c, policy.today) > policy.bufferMonths) r.lapsed++;
    else if (!takesCapacity(c, fw)) r.finished++;
    else {
      r.holding++;
      if (policy && inBuffer(c, policy)) r.inBuffer++;
    }
  }
  return r;
}

// How full one outcome is, from the allocations that are still live.
export function fillOf(o: Outcome, fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[], policy?: Policy): Fill {
  const capacity = capacityOf(o, fw);
  const live = new Set(commitments.filter((c) => takesCapacity(c, fw, policy)).map((c) => c.subscriptionId));
  const used = allocations.filter((a) => a.outcomeId === o.id && live.has(a.commitmentKey)).reduce((n, a) => n + a.parts, 0);
  const free = Math.max(capacity - used, 0);
  const state: Availability = !o.active ? "inactive" : used >= capacity && capacity > 0 ? "full" : used > 0 ? "part" : "open";
  return { capacity, used, free, state };
}

// ---- Adding and changing outcomes ----

// Rule: add several outcomes at once with a numbered name, so a cohort can be set up in one go. Names must be new.
export function addOutcomes(outcomes: Outcome[], o: { name: string; count: number; type: string; cohort: string; frameworkId: string }): Changed<Outcome[]> {
  const name = o.name.trim().replace(/\s+/g, " ");
  if (name === "") return { value: outcomes, error: "Give the outcome a name." };
  if (!Number.isInteger(o.count) || o.count < 1 || o.count > 500) return { value: outcomes, error: "Say how many to add, from 1 to 500." };
  const taken = new Set(outcomes.map((x) => x.id));
  const names = new Set(outcomes.map((x) => x.name.toLowerCase()));
  const added: Outcome[] = [];
  // A first existing number is carried on, so "Orphan" added twice gives Orphan 1 to 10 then Orphan 11 to 20.
  const start = o.count === 1 ? 0 : nextNumber(outcomes, name);
  for (let i = 0; i < o.count; i++) {
    const label = o.count === 1 ? name : `${name} ${start + i}`;
    if (names.has(label.toLowerCase())) return { value: outcomes, error: `There is already an outcome called "${label}".` };
    let id = slugify(label) || "outcome";
    for (let n = 2; taken.has(id); n++) id = `${slugify(label)}-${n}`;
    taken.add(id);
    names.add(label.toLowerCase());
    added.push({ id, name: label, type: o.type.trim(), cohort: o.cohort.trim(), frameworkId: o.frameworkId, active: true });
  }
  return { value: [...outcomes, ...added] };
}

function nextNumber(outcomes: Outcome[], base: string): number {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`, "i");
  return outcomes.reduce((m, x) => Math.max(m, Number(re.exec(x.name)?.[1] ?? 0)), 0) + 1;
}

export const setActive = (outcomes: Outcome[], id: string, active: boolean): Outcome[] => outcomes.map((o) => (o.id === id ? { ...o, active } : o));

// Rule: an outcome with live allocations cannot be removed, so nothing is orphaned. Say how many.
export function removeOutcome(outcomes: Outcome[], allocations: Allocation[], id: string): Changed<Outcome[]> {
  const n = allocations.filter((a) => a.outcomeId === id).length;
  if (n > 0) return { value: outcomes, error: `${n} commitment${n === 1 ? " is" : "s are"} allocated to this outcome. Move ${n === 1 ? "it" : "them"} first.` };
  return { value: outcomes.filter((o) => o.id !== id) };
}

// Rule: remove many at once, only those with no allocations at all. Ones that hold something stay, and the count of those is reported.
export function removeUnused(outcomes: Outcome[], allocations: Allocation[], ids: string[]): { value: Outcome[]; removed: number; kept: number } {
  const want = new Set(ids);
  const held = new Set(allocations.map((a) => a.outcomeId));
  const drop = new Set(outcomes.filter((o) => want.has(o.id) && !held.has(o.id)).map((o) => o.id));
  return { value: outcomes.filter((o) => !drop.has(o.id)), removed: drop.size, kept: want.size - drop.size };
}

// ---- Allocation ----

export interface AutoResult {
  allocations: Allocation[];
  placed: number; // commitments newly allocated
  released: number; // allocations dropped because their outcome is inactive, gone, or the commitment no longer holds capacity
  unplaced: { commitmentKey: string; why: string }[]; // commitments that take capacity but found none, with the reason
}

export interface AllocOptions {
  policy?: Policy; // the buffer for plans that stop paying
  partnerOk?: (projectId: string | undefined, itemId: string) => boolean; // whether a partner is active and delivers the gift's item (DECISIONS 69). Outcomes with no partner are always open
  projectIdsFor?: (crmProjectName: string) => string[]; // the partners a donor's chosen project goes to. Empty means a general gift. More than one means any of them (DECISIONS 68)
}

/**
 * Rule (DECISIONS 66): where a gift goes among the outcomes that could take it (same framework, active, enough free capacity).
 * Gifts are spread: the place (the group of beneficiaries that share a node) with the lowest share sponsored gets the next gift, so
 * sponsors reach more places before any one fills. Inside that place the beneficiary with the least room that still fits is used,
 * which fills a partly sponsored child first and keeps whole children free for bundles. Ties go to the order the outcomes were added.
 */
export function pickOutcome(candidates: Outcome[], fw: FrameworkTemplate[], used: Map<string, number>, need: number): Outcome | undefined {
  const free = (o: Outcome) => capacityOf(o, fw) - (used.get(o.id) ?? 0);
  const fits = candidates.filter((o) => free(o) >= need);
  if (fits.length === 0) return undefined;
  const placeOf = (o: Outcome) => o.nodeId ?? "";
  const share = new Map<string, { cap: number; used: number; order: number }>();
  candidates.forEach((o, i) => {
    const g = share.get(placeOf(o)) ?? { cap: 0, used: 0, order: i };
    share.set(placeOf(o), { ...g, cap: g.cap + capacityOf(o, fw), used: g.used + (used.get(o.id) ?? 0) });
  });
  const ratio = (g: { cap: number; used: number }) => (g.cap > 0 ? g.used / g.cap : 1);
  const places = [...new Set(fits.map(placeOf))].sort((x, y) => {
    const gx = share.get(x) as { cap: number; used: number; order: number };
    const gy = share.get(y) as { cap: number; used: number; order: number };
    return ratio(gx) - ratio(gy) || gx.order - gy.order;
  });
  const inPlace = fits.filter((o) => placeOf(o) === places[0]);
  return inPlace.reduce((best, o) => (free(o) < free(best) ? o : best));
}

/**
 * Rule: automatic allocation (DECISIONS 60d, 66). First release what no longer holds: allocations to an inactive or missing
 * outcome, and to commitments that no longer hold capacity (cancelled, fully paid, or behind by more than the buffer). Then place every
 * unallocated commitment, oldest first. A gift whose project matches a project here is **directed** and can only go to that project, and
 * waits when it is full. Any other gift is **general** and can go to any project's places. A commitment already allocated and still valid is never moved.
 */
export function autoAllocate(commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], at: string, opts: AllocOptions = {}): AutoResult {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const holding = new Map(commitments.filter((c) => takesCapacity(c, fw, opts.policy)).map((c) => [c.subscriptionId, c]));
  const kept = allocations.filter((a) => byId.get(a.outcomeId)?.active === true && holding.has(a.commitmentKey));
  const released = allocations.length - kept.length;
  const next = [...kept];
  const placedKeys = new Set(next.map((a) => a.commitmentKey));
  const used = new Map<string, number>();
  for (const a of next) used.set(a.outcomeId, (used.get(a.outcomeId) ?? 0) + a.parts);

  const todo = [...holding.values()].filter((c) => !placedKeys.has(c.subscriptionId)).sort((a, b) => (a.firstPaid || "9999").localeCompare(b.firstPaid || "9999") || a.subscriptionId.localeCompare(b.subscriptionId));
  const unplaced: AutoResult["unplaced"] = [];
  let placed = 0;
  for (const c of todo) {
    const ofKind = outcomes.filter((o) => o.active && o.frameworkId === c.frameworkId);
    const sameFramework = ofKind.filter((o) => opts.partnerOk?.(o.projectId, c.itemId) ?? true);
    if (sameFramework.length === 0) {
      unplaced.push({ commitmentKey: c.subscriptionId, why: ofKind.length > 0 ? "No active partner that delivers this item has a place of this kind." : "No active outcome uses its framework." });
      continue;
    }
    const directedTo = opts.projectIdsFor?.(c.projectName) ?? [];
    const candidates = directedTo.length > 0 ? sameFramework.filter((o) => o.projectId !== undefined && directedTo.includes(o.projectId)) : sameFramework;
    if (candidates.length === 0) {
      unplaced.push({ commitmentKey: c.subscriptionId, why: "The partner the donor chose has no one of this kind." });
      continue;
    }
    const target = pickOutcome(candidates, fw, used, c.partsPerInstalment);
    if (!target) {
      unplaced.push({ commitmentKey: c.subscriptionId, why: directedTo.length > 0 ? "The partner the donor chose is full. It waits for a person to decide." : "No outcome has room for it." });
      continue;
    }
    next.push({ commitmentKey: c.subscriptionId, outcomeId: target.id, parts: c.partsPerInstalment, how: "auto", at });
    used.set(target.id, (used.get(target.id) ?? 0) + c.partsPerInstalment);
    placed++;
  }
  return { allocations: next, placed, released, unplaced };
}

// Rule: reallocation at a donor's request. Move one commitment to another active outcome with the same framework and room for it.
export function moveAllocation(allocations: Allocation[], commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], commitmentKey: string, outcomeId: string, at: string, policy?: Policy): Changed<Allocation[]> {
  const c = commitments.find((x) => x.subscriptionId === commitmentKey);
  const to = outcomes.find((o) => o.id === outcomeId);
  if (!c) return { value: allocations, error: "That commitment was not found." };
  if (!to || !to.active) return { value: allocations, error: "Choose an active outcome." };
  if (to.frameworkId !== c.frameworkId) return { value: allocations, error: "That outcome uses a different framework." };
  const others = allocations.filter((a) => a.commitmentKey !== commitmentKey);
  const fill = fillOf(to, fw, others, commitments, policy);
  if (fill.free < c.partsPerInstalment) return { value: allocations, error: `${to.name} has no room for ${c.partsPerInstalment} part${c.partsPerInstalment === 1 ? "" : "s"}.` };
  return { value: [...others, { commitmentKey, outcomeId, parts: c.partsPerInstalment, how: "manual", at }] };
}

// Rule: release one allocation, so the next automatic allocation places the commitment again.
export const releaseAllocation = (allocations: Allocation[], commitmentKey: string): Allocation[] => allocations.filter((a) => a.commitmentKey !== commitmentKey);

// ---- The month by month view (DECISIONS 62) ----

// A month is "YYYY-MM". These helpers keep month arithmetic in one place.
const monthOf = (date: string): string => date.slice(0, 7);
function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}
const monthIndex = (month: string): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

// The months to show: some behind, this one, some ahead.
export const monthsAround = (today: string, back: number, ahead: number): string[] => Array.from({ length: back + ahead + 1 }, (_, i) => addMonths(monthOf(today), i - back));

// Status of one commitment in one month: p paid, e expected (scheduled, not due yet), m missed (expected and not received), f nothing expected.
export type UnitStatus = "p" | "e" | "m" | "f";

/**
 * Rule: a month with a real payment is paid. Otherwise a plan that is still going has a run of expected months, starting at its
 * next due date and lasting for the instalments it still has to pay (for ever when it has no limit). In that run, a month that has
 * passed, or this month once the due date has come, is missed, and a later month is expected (orange). A paused plan expects nothing
 * ahead. A cancelled or completed plan expects nothing. Everything else is nothing expected.
 */
export function monthStatus(c: Commitment, month: string, today: string): UnitStatus {
  if (c.paidMonths.includes(month)) return "p";
  if (c.planStatus === "cancelled" || c.planStatus === "completed" || c.state === "complete") return "f";
  const last = c.paidMonths[c.paidMonths.length - 1] ?? "";
  const start = c.nextDue !== "" ? monthOf(c.nextDue) : last !== "" ? addMonths(last, 1) : monthOf(today);
  const remaining = c.planned === null ? Infinity : Math.max(c.planned - (c.planPaid ?? c.paid), 0);
  const offset = monthIndex(month) - monthIndex(start);
  if (offset < 0 || offset >= remaining) return "f";
  const now = monthOf(today);
  if (month < now) return "m";
  if (month === now) return c.nextDue !== "" && c.nextDue <= today ? "m" : "e";
  return c.planStatus === "paused" ? "f" : "e";
}

export interface MonthSlots {
  month: string;
  slots: { status: UnitStatus; commitmentKey: string }[]; // one slot per unit of capacity, "" key when nothing is allocated to it
}

// Rule: the row for one outcome. Its capacity is a number of slots, filled in order by the live allocations, and each slot takes the status of its commitment in each month.
export function timelineOf(o: Outcome, fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[], months: string[], today: string, policy?: Policy): MonthSlots[] {
  const byKey = new Map(commitments.filter((c) => takesCapacity(c, fw, policy)).map((c) => [c.subscriptionId, c]));
  const slots: (Commitment | null)[] = [];
  for (const a of allocations.filter((x) => x.outcomeId === o.id).sort((x, y) => x.commitmentKey.localeCompare(y.commitmentKey))) {
    const c = byKey.get(a.commitmentKey);
    if (c) for (let i = 0; i < a.parts; i++) slots.push(c);
  }
  const cap = capacityOf(o, fw);
  while (slots.length < cap) slots.push(null);
  return months.map((month) => ({ month, slots: slots.slice(0, Math.max(cap, 0)).map((c) => ({ status: c ? monthStatus(c, month, today) : "f", commitmentKey: c?.subscriptionId ?? "" })) }));
}
