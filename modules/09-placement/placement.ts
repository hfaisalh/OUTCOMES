/**
 * placement.ts
 *
 * What it does: Allocation rewired onto what has been built (DECISIONS 175). Once a gift has a partner (Assignment), it is placed: a gift for a type where the beneficiary comes first (sponsorship) fills an open
 * place, which is an enrolment of an approved beneficiary in a cluster of the gift's project for that benefit. A gift for a type where the gift comes first (a pump, a camp) creates an outcome, and its recipients
 * are enrolled after. A gift for a type that has no beneficiary (a mosque) creates an outcome and waits for no one. The results are kept as separate records, so a test run can be reset.
 * Who calls it: the Allocate page (app/allocate-page.ts), the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), all through applyPlacementAction. Depends on: assignment.ts, enrolments.ts,
 * projects.ts (the types) and categories.ts (the types). Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Which gifts: those assigned to a partner and not placed yet.
 * - Rule: a place. For a beneficiary-first type, a place is an active enrolment, without a role, of an active beneficiary (a person must be Ready), for the gift's benefit, in a cluster of the project.
 *   Its capacity is the units that make one whole beneficiary in the gift's workflow (3 parts for an orphan, 1 for a scholarship).
 * - Rule: which project. A gift that carries a project fills that project's places only. A gift with no project goes to a place in any project that offers the benefit and has the gift's assigned partner among
 *   its partners, so the partner that delivers is the partner for that place.
 * - Rule: which place. The place with the lowest fill first, so more beneficiaries are sponsored, then the earliest enrolled. A gift's units must fit in the place's free units, else the next place is tried.
 * - Rule: gift first. A gift for a gift-first type, or for a type with no beneficiary, creates an outcome (OUT-0001). It needs no place. Recipients are enrolled afterwards.
 * - A gift with no place waits, with the reason: no one is enrolled for the benefit, or every place for it is full. A gift for an item with no type yet waits too, and says the type is missing (DECISIONS 178).
 * - A person can place a gift in a chosen place that is open and fits, or take a placement back. Nothing is changed in place: every function returns a new value.
 */

import type { Assignable, Assignment } from "../08-assignment/assignment.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import type { GiftProject } from "../06-projects/projects.js";
import type { Beneficiary } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolment, ItemRules } from "../07-beneficiaries/enrolments.js";

export interface Placement {
  key: string; // the assignment (the subscription as "sub:" and its id, or the line id)
  kind: "place" | "outcome"; // a place filled, or an outcome created from the gift
  enrolmentId: string; // the place filled, "" for an outcome
  outcomeRef: string; // the outcome created, "" for a place
  giftProjectId: string;
  itemId: string;
  parts: number;
  how: "auto" | "manual";
  at: string; // ISO time
}
export interface Placements { records: Placement[]; counter: number }
export const emptyPlacements = (): Placements => ({ records: [], counter: 0 });

export interface PlaceContext {
  assignments: Assignment[];
  assignables: Assignable[]; // the gifts, for the page
  enrolments: Enrolment[];
  beneficiaries: Beneficiary[];
  giftProjects: GiftProject[];
  frameworks: FrameworkTemplate[];
  itemFramework: Record<string, string>; // the workflow each item is in, from its gifts, to know the units that make one whole beneficiary
  rulesOf: (itemId: string) => ItemRules | undefined;
  now: string; // ISO time
}

// Builds the context from what the callers hold. The workflow of an item is the one its gifts are routed under.
export function placementContext(a: { assignments: Assignment[]; assignables: Assignable[]; workOrders: { itemId: string; frameworkId?: string }[]; enrolments: Enrolment[]; beneficiaries: Beneficiary[]; giftProjects: GiftProject[]; frameworks: FrameworkTemplate[]; rulesOf: (itemId: string) => ItemRules | undefined; now: string }): PlaceContext {
  const itemFramework: Record<string, string> = {};
  for (const w of a.workOrders) if ((w.frameworkId ?? "") !== "" && itemFramework[w.itemId] === undefined) itemFramework[w.itemId] = w.frameworkId as string;
  return { assignments: a.assignments, assignables: a.assignables, enrolments: a.enrolments, beneficiaries: a.beneficiaries, giftProjects: a.giftProjects, frameworks: a.frameworks, itemFramework, rulesOf: a.rulesOf, now: a.now };
}

export type Blocked = "" | "no-places" | "full" | "no-project-places" | "no-type";
export interface PlaceOption { enrolmentId: string; beneficiaryId: string; name: string; giftProjectId: string; clusterId: string; used: number; capacity: number; fits: boolean }
export interface PlaceSuggestion {
  key: string;
  itemId: string;
  parts: number;
  kind: "place" | "outcome" | "";
  enrolmentId: string; // the place it would fill
  why: string;
  blocked: Blocked;
  options: PlaceOption[]; // every place considered, in order, with whether the gift fits
}
type Result = { value: Placements } | { error: string };

// How many units make one whole beneficiary of an item, from the workflow its gifts are in (3 parts for an orphan, 1 for a scholarship). 1 when it is not known.
const wholeOf = (ctx: PlaceContext, itemId: string): number => Math.max(1, ctx.frameworks.find((f) => f.id === ctx.itemFramework[itemId])?.unitsPerBeneficiary ?? 1);

const used = (records: Placement[], enrolmentId: string): number => records.filter((p) => p.enrolmentId === enrolmentId).reduce((n, p) => n + p.parts, 0);

// The places a gift could fill, in the order they are tried, with the room in each.
export function placesFor(ctx: PlaceContext, a: Assignment, records: Placement[]): PlaceOption[] {
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
    .map((e): PlaceOption => { const u = used(records, e.id); return { enrolmentId: e.id, beneficiaryId: e.beneficiaryId, name: byId.get(e.beneficiaryId)?.name ?? e.beneficiaryId, giftProjectId: e.giftProjectId, clusterId: e.clusterId, used: u, capacity: whole, fits: u + a.parts <= whole }; })
    .sort((x, y) => x.used - y.used || x.enrolmentId.localeCompare(y.enrolmentId)); // the lowest fill first, then the earliest enrolled
}

/**
 * Works out where every assigned gift that is not placed yet would go, counting what each place has taken as the run goes. Changes nothing.
 */
export function suggestPlacements(ctx: PlaceContext, existing: Placements): PlaceSuggestion[] {
  const running: Placement[] = [...existing.records];
  const done = new Set(existing.records.map((p) => p.key));
  const out: PlaceSuggestion[] = [];
  for (const a of [...ctx.assignments].filter((x) => !done.has(x.key)).sort((x, y) => x.at.localeCompare(y.at) || x.key.localeCompare(y.key))) {
    const rules = ctx.rulesOf(a.itemId);
    // Rule: a gift for a type where the gift comes first, or with no beneficiary, creates an outcome. It needs no place.
    if (rules && (rules.first === "gift" || rules.receiver === "none")) {
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "outcome", enrolmentId: "", blocked: "", options: [], why: rules.receiver === "none" ? "Creates an outcome for a community: it has no beneficiary." : "Creates an outcome. Its recipients are enrolled after." });
      continue;
    }
    // Rule (DECISIONS 178): an item with no type yet cannot say who receives it, so its gift waits and says so, instead of looking for a child that cannot exist.
    if (!rules) {
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "", enrolmentId: "", blocked: "no-type", options: [], why: "The item has no type yet, so it is not known who receives it. Choose a type on the Benefits page." });
      continue;
    }
    const options = placesFor(ctx, a, running);
    const open = options.find((o) => o.fits);
    if (open) {
      running.push({ key: a.key, kind: "place", enrolmentId: open.enrolmentId, outcomeRef: "", giftProjectId: open.giftProjectId, itemId: a.itemId, parts: a.parts, how: "auto", at: ctx.now });
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "place", enrolmentId: open.enrolmentId, blocked: "", options, why: `Fills a place for ${open.name} (${open.used} of ${open.capacity} units taken)` });
    } else {
      const blocked: Blocked = options.length > 0 ? "full" : a.giftProjectId !== "" ? "no-places" : "no-project-places";
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "", enrolmentId: "", blocked, options, why: options.length > 0 ? "Every place for this benefit is full." : a.giftProjectId !== "" ? "No approved beneficiary is enrolled for this benefit in the gift's project." : "No approved beneficiary is enrolled for this benefit with the assigned partner." });
    }
  }
  return out;
}

// Runs Placement: every gift that has a place or creates an outcome is placed. Returns the new records and the counts.
export function runPlacement(ctx: PlaceContext, existing: Placements): { value: Placements; placed: number; outcomes: number; waiting: number } {
  let records = existing.records;
  let counter = existing.counter;
  let placed = 0, outcomes = 0, waiting = 0;
  for (const s of suggestPlacements(ctx, existing)) {
    const a = ctx.assignments.find((x) => x.key === s.key) as Assignment;
    if (s.kind === "place") { records = [...records, { key: s.key, kind: "place", enrolmentId: s.enrolmentId, outcomeRef: "", giftProjectId: a.giftProjectId, itemId: s.itemId, parts: s.parts, how: "auto", at: ctx.now }]; placed++; }
    else if (s.kind === "outcome") { counter++; records = [...records, { key: s.key, kind: "outcome", enrolmentId: "", outcomeRef: `OUT-${String(counter).padStart(4, "0")}`, giftProjectId: a.giftProjectId, itemId: s.itemId, parts: s.parts, how: "auto", at: ctx.now }]; outcomes++; }
    else waiting++;
  }
  return { value: { records, counter }, placed, outcomes, waiting };
}

// Rule: a person places a gift in a chosen place that is open and fits. A gift that already has a place is moved.
export function placeManual(ctx: PlaceContext, existing: Placements, key: string, enrolmentId: string): Result {
  const a = ctx.assignments.find((x) => x.key === key);
  if (!a) return { error: "That gift has not been assigned to a partner yet." };
  const rules = ctx.rulesOf(a.itemId);
  if (rules && (rules.first === "gift" || rules.receiver === "none")) return { error: "This gift creates an outcome. It does not fill a place." };
  const others = existing.records.filter((p) => p.key !== key);
  const option = placesFor(ctx, a, others).find((o) => o.enrolmentId === enrolmentId);
  if (!option) return { error: "That place is not open for this gift: it must be an approved beneficiary enrolled for this benefit in the right project." };
  if (!option.fits) return { error: `${option.name}'s place is full: ${option.used} of ${option.capacity} units taken, and this gift needs ${a.parts}.` };
  return { value: { ...existing, records: [...others, { key, kind: "place", enrolmentId, outcomeRef: "", giftProjectId: option.giftProjectId, itemId: a.itemId, parts: a.parts, how: "manual", at: ctx.now }] } };
}

export function unplace(existing: Placements, key: string): Result {
  if (!existing.records.some((p) => p.key === key)) return { error: "That gift is not placed." };
  return { value: { ...existing, records: existing.records.filter((p) => p.key !== key) } };
}

// How full each place is, for the page: the units taken and needed, from the gifts placed in it.
export interface PlaceFill { enrolmentId: string; used: number; capacity: number }
export function fills(ctx: PlaceContext, existing: Placements): PlaceFill[] {
  return ctx.enrolments
    .filter((e) => e.status === "active" && e.role === "" && (ctx.rulesOf(e.itemId)?.first ?? "beneficiary") === "beneficiary" && (ctx.rulesOf(e.itemId)?.receiver ?? "person") !== "none")
    .map((e) => ({ enrolmentId: e.id, used: used(existing.records, e.id), capacity: wholeOf(ctx, e.itemId) }));
}

/**
 * The requests the page makes on Placement, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about Placement.
 * plc-run places every gift that can be placed. plc-set places or moves one gift by a person. plc-unplace takes one back. plc-reset clears them all.
 */
export function applyPlacementAction(ctx: PlaceContext, existing: Placements, body: Record<string, unknown>): ({ value: Placements; message?: string } | { error: string }) | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "plc-run": {
      const r = runPlacement(ctx, existing);
      return { value: r.value, message: `Placed ${r.placed} in open places and created ${r.outcomes} outcome${r.outcomes === 1 ? "" : "s"}. ${r.waiting} wait with no open place.` };
    }
    case "plc-set": return placeManual(ctx, existing, str("key"), str("enrolmentId"));
    case "plc-unplace": return unplace(existing, str("key"));
    case "plc-reset": return { value: emptyPlacements(), message: "All placements were cleared." };
    default: return null;
  }
}
