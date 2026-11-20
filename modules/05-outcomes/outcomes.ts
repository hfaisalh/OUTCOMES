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

// Rule: does this commitment still hold capacity? A fully paid limited per-period commitment has run its course.
export function takesCapacity(c: Commitment, fw: FrameworkTemplate[]): boolean {
  const f = frameworkOf(fw, c.frameworkId);
  if (!f || f.instalment === undefined) return false;
  // Rule (DECISIONS 60, 62): a plan the CRM has cancelled no longer holds capacity, so it reopens for someone else.
  if (c.planStatus === "cancelled") return false;
  return f.instalment === "per_period" ? c.state !== "complete" : true;
}

// How full one outcome is, from the allocations that are still live.
export function fillOf(o: Outcome, fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[]): Fill {
  const capacity = capacityOf(o, fw);
  const live = new Set(commitments.filter((c) => takesCapacity(c, fw)).map((c) => c.subscriptionId));
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

// ---- Allocation ----

export interface AutoResult {
  allocations: Allocation[];
  placed: number; // commitments newly allocated
  released: number; // allocations dropped because their outcome is inactive, gone, or the commitment no longer holds capacity
  unplaced: { commitmentKey: string; why: string }[]; // commitments that take capacity but found none, with the reason
}

/**
 * Rule: automatic allocation (DECISIONS 60d). First release what no longer holds: allocations to an inactive or missing
 * outcome, and to commitments that no longer hold capacity. Then place every unallocated commitment, oldest first, in the
 * first active outcome with the same framework and enough free capacity. A commitment already allocated and still valid is never moved.
 */
export function autoAllocate(commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], at: string): AutoResult {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const holding = new Map(commitments.filter((c) => takesCapacity(c, fw)).map((c) => [c.subscriptionId, c]));
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
    const candidates = outcomes.filter((o) => o.active && o.frameworkId === c.frameworkId);
    if (candidates.length === 0) {
      unplaced.push({ commitmentKey: c.subscriptionId, why: "No active outcome uses its framework." });
      continue;
    }
    const target = candidates.find((o) => capacityOf(o, fw) - (used.get(o.id) ?? 0) >= c.partsPerInstalment);
    if (!target) {
      unplaced.push({ commitmentKey: c.subscriptionId, why: "No outcome has room for it." });
      continue;
    }
    next.push({ commitmentKey: c.subscriptionId, outcomeId: target.id, parts: c.partsPerInstalment, how: "auto", at });
    used.set(target.id, (used.get(target.id) ?? 0) + c.partsPerInstalment);
    placed++;
  }
  return { allocations: next, placed, released, unplaced };
}

// Rule: reallocation at a donor's request. Move one commitment to another active outcome with the same framework and room for it.
export function moveAllocation(allocations: Allocation[], commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], commitmentKey: string, outcomeId: string, at: string): Changed<Allocation[]> {
  const c = commitments.find((x) => x.subscriptionId === commitmentKey);
  const to = outcomes.find((o) => o.id === outcomeId);
  if (!c) return { value: allocations, error: "That commitment was not found." };
  if (!to || !to.active) return { value: allocations, error: "Choose an active outcome." };
  if (to.frameworkId !== c.frameworkId) return { value: allocations, error: "That outcome uses a different framework." };
  const others = allocations.filter((a) => a.commitmentKey !== commitmentKey);
  const fill = fillOf(to, fw, others, commitments);
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
export function timelineOf(o: Outcome, fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[], months: string[], today: string): MonthSlots[] {
  const byKey = new Map(commitments.filter((c) => takesCapacity(c, fw)).map((c) => [c.subscriptionId, c]));
  const slots: (Commitment | null)[] = [];
  for (const a of allocations.filter((x) => x.outcomeId === o.id).sort((x, y) => x.commitmentKey.localeCompare(y.commitmentKey))) {
    const c = byKey.get(a.commitmentKey);
    if (c) for (let i = 0; i < a.parts; i++) slots.push(c);
  }
  const cap = capacityOf(o, fw);
  while (slots.length < cap) slots.push(null);
  return months.map((month) => ({ month, slots: slots.slice(0, Math.max(cap, 0)).map((c) => ({ status: c ? monthStatus(c, month, today) : "f", commitmentKey: c?.subscriptionId ?? "" })) }));
}
