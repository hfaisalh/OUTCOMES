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
 * - Rule: which place (DECISIONS 183). The assigned partner's own children first, since a partner's room is its own children. Then the place with the lowest fill first, so more beneficiaries are sponsored, then the earliest enrolled. A gift goes whole into one place when it fits. When no single place can take all of it, it is
 *   spread over several (a gift of 2 units for a scholarship that needs 1 unit sponsors two children; 6 parts for an orphan who needs 3 sponsors two), each taking what it has free (DECISIONS 181).
 * - Rule: gift first. A gift for a gift-first type, or for a type with no beneficiary, creates an outcome (OUT-0001). It needs no place. Recipients are enrolled afterwards.
 * - Rule (DECISIONS 186): nothing is deleted. A placement has a start (when it was made) and, once it ends, an end date and a reason (the plan paused, cancelled or completed; the child left; a person moved or took it back).
 *   An ended placement is history: it frees the child's place and is kept. Each run first ends the placements of a gift whose plan is now parked and of a child who has left. A plan that runs again is given its previous
 *   child back if that child is still free, else a new place like any gift. Only a reset (a test run) clears history.
 * - A gift with no place waits, with the reason: no one is enrolled for the benefit, or every place for it is full. A gift for an item with no type yet waits too, and says the type is missing (DECISIONS 178).
 * - A person can place a gift in a chosen place that is open and fits, or take a placement back. Nothing is changed in place: every function returns a new value.
 */

import type { Assignable, Assignment } from "../08-assignment/assignment.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import type { GiftProject } from "../06-projects/projects.js";
import type { Beneficiary } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolment, ItemRules } from "../07-beneficiaries/enrolments.js";

// Why a placement ended (DECISIONS 186). The first three are the plan's own status in the CRM.
export type EndReason = "paused" | "cancelled" | "completed" | "child-left" | "released" | "moved" | "taken-back";
export const END_LABEL: Record<EndReason, string> = { paused: "The plan was paused", cancelled: "The plan was cancelled", completed: "The plan was completed", "child-left": "The child left", released: "The gift is no longer in scope", moved: "A person moved it to another child", "taken-back": "A person took it back" };
const RESUMABLE: EndReason[] = ["paused", "cancelled", "completed"]; // a plan that ended for one of these and runs again is offered its previous child
export const isActive = (p: { to?: string }): boolean => p.to === undefined;

export interface Placement {
  key: string; // one gift can have several records when it is spread over several places (DECISIONS 181) // the assignment (the subscription as "sub:" and its id, or the line id)
  kind: "place" | "outcome"; // a place filled, or an outcome created from the gift
  enrolmentId: string; // the place filled, "" for an outcome
  outcomeRef: string; // the outcome created, "" for a place
  giftProjectId: string;
  itemId: string;
  parts: number;
  how: "auto" | "manual";
  at: string; // ISO time it started
  to?: string; // the day it ended, YYYY-MM-DD. Absent while it holds the place
  endReason?: EndReason; // why it ended
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
  live: Set<string>; // the assignments still in scope: a gift of a paused, cancelled or completed plan holds no place (DECISIONS 185)
  parkedBy: Record<string, EndReason>; // for a gift whose plan is paused, cancelled or completed: which, so its placement ends with that reason (DECISIONS 186)
  itemFramework: Record<string, string>; // the workflow each item is in, from its gifts, to know the units that make one whole beneficiary
  rulesOf: (itemId: string) => ItemRules | undefined;
  now: string; // ISO time
}

// Builds the context from what the callers hold. The workflow of an item is the one its gifts are routed under.
export function placementContext(a: { assignments: Assignment[]; assignables: Assignable[]; workOrders: { itemId: string; frameworkId?: string; subscriptionId?: string; paidDate?: string; planStatus?: string }[]; enrolments: Enrolment[]; beneficiaries: Beneficiary[]; giftProjects: GiftProject[]; frameworks: FrameworkTemplate[]; rulesOf: (itemId: string) => ItemRules | undefined; now: string }): PlaceContext {
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
  return { assignments: a.assignments.filter((x) => live.has(x.key)), live, parkedBy, assignables: a.assignables, enrolments: a.enrolments, beneficiaries: a.beneficiaries, giftProjects: a.giftProjects, frameworks: a.frameworks, itemFramework, rulesOf: a.rulesOf, now: a.now };
}

export type Blocked = "" | "no-places" | "full" | "no-project-places" | "no-type";
export interface PlaceOption { enrolmentId: string; beneficiaryId: string; name: string; giftProjectId: string; clusterId: string; used: number; capacity: number; fits: boolean }
export interface PlaceSuggestion {
  key: string;
  itemId: string;
  parts: number;
  kind: "place" | "outcome" | "";
  enrolmentId: string; // the first place it would fill
  shares: { enrolmentId: string; parts: number }[]; // every place it would fill, with the units in each: more than one when it is spread
  why: string;
  blocked: Blocked;
  options: PlaceOption[]; // every place considered, in order, with whether the gift fits
}
type Result = { value: Placements } | { error: string };

// How many units make one whole beneficiary of an item, from the workflow its gifts are in (3 parts for an orphan, 1 for a scholarship). 1 when it is not known.
const wholeOf = (ctx: PlaceContext, itemId: string): number => Math.max(1, ctx.frameworks.find((f) => f.id === ctx.itemFramework[itemId])?.unitsPerBeneficiary ?? 1);

const used = (records: Placement[], enrolmentId: string, live?: Set<string>): number => records.filter((p) => isActive(p) && p.enrolmentId === enrolmentId && (!live || live.has(p.key))).reduce((n, p) => n + p.parts, 0);

// The places a gift could fill, in the order they are tried, with the room in each.
export function placesFor(ctx: PlaceContext, a: Assignment, records: Placement[], prefer: Set<string> = new Set()): PlaceOption[] {
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
    .map((e): PlaceOption => { const u = used(records, e.id, ctx.live); return { enrolmentId: e.id, beneficiaryId: e.beneficiaryId, name: byId.get(e.beneficiaryId)?.name ?? e.beneficiaryId, giftProjectId: e.giftProjectId, clusterId: e.clusterId, used: u, capacity: whole, fits: u + a.parts <= whole }; })
    // Rule (DECISIONS 186): a plan that runs again is offered its previous child first. Rule (DECISIONS 183): then the assigned partner's own children, since a partner's room is its own children. Then the lowest fill, then the earliest enrolled.
    .sort((x, y) => Number(prefer.has(y.enrolmentId)) - Number(prefer.has(x.enrolmentId)) || Number(byId.get(y.beneficiaryId)?.partnerId === a.partnerId) - Number(byId.get(x.beneficiaryId)?.partnerId === a.partnerId) || x.used - y.used || x.enrolmentId.localeCompare(y.enrolmentId));
}

/**
 * Works out where every assigned gift that is not placed yet would go, counting what each place has taken as the run goes. Changes nothing.
 */
export function suggestPlacements(ctx: PlaceContext, existing: Placements): PlaceSuggestion[] {
  const running: Placement[] = [...existing.records];
  const done = new Set(existing.records.filter(isActive).map((p) => p.key)); // a gift whose placement has ended is no longer placed
  const out: PlaceSuggestion[] = [];
  for (const a of [...ctx.assignments].filter((x) => !done.has(x.key)).sort((x, y) => x.at.localeCompare(y.at) || x.key.localeCompare(y.key))) {
    const rules = ctx.rulesOf(a.itemId);
    // Rule: a gift for a type where the gift comes first, or with no beneficiary, creates an outcome. It needs no place.
    if (rules && (rules.first === "gift" || rules.receiver === "none")) {
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "outcome", enrolmentId: "", shares: [], blocked: "", options: [], why: rules.receiver === "none" ? "Creates an outcome for a community: it has no beneficiary." : "Creates an outcome. Its recipients are enrolled after." });
      continue;
    }
    // Rule (DECISIONS 178): an item with no type yet cannot say who receives it, so its gift waits and says so, instead of looking for a child that cannot exist.
    if (!rules) {
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "", enrolmentId: "", shares: [], blocked: "no-type", options: [], why: "The item has no type yet, so it is not known who receives it. Choose a type on the Benefits page." });
      continue;
    }
    // Rule (DECISIONS 186): a plan that ended because it was paused, cancelled or completed, and runs again, is offered the child it had, if still free.
    const previous = new Set(existing.records.filter((p) => p.key === a.key && p.kind === "place" && !isActive(p) && p.endReason !== undefined && RESUMABLE.includes(p.endReason)).map((p) => p.enrolmentId));
    const options = placesFor(ctx, a, running, previous);
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
      for (const sh of shares) running.push({ key: a.key, kind: "place", enrolmentId: sh.enrolmentId, outcomeRef: "", giftProjectId: options.find((o) => o.enrolmentId === sh.enrolmentId)?.giftProjectId ?? a.giftProjectId, itemId: a.itemId, parts: sh.parts, how: "auto", at: ctx.now });
      const first = options.find((o) => o.enrolmentId === shares[0]?.enrolmentId) as PlaceOption;
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "place", enrolmentId: first.enrolmentId, shares, blocked: "", options, why: shares.length === 1 ? `${previous.has(first.enrolmentId) ? "Takes back its previous child, " : "Fills a place for "}${first.name} (${first.used} of ${first.capacity} units taken)` : `Spread over ${shares.length} places, ${shares.map((x) => `${options.find((o) => o.enrolmentId === x.enrolmentId)?.name ?? x.enrolmentId} (${x.parts})`).join(", ")}, since no single place can take ${a.parts} units` });
    } else {
      const blocked: Blocked = options.length > 0 ? "full" : a.giftProjectId !== "" ? "no-places" : "no-project-places";
      out.push({ key: a.key, itemId: a.itemId, parts: a.parts, kind: "", enrolmentId: "", shares: [], blocked, options, why: options.length > 0 ? "Every place for this benefit is full." : a.giftProjectId !== "" ? "No approved beneficiary is enrolled for this benefit in the gift's project." : "No approved beneficiary is enrolled for this benefit with the assigned partner." });
    }
  }
  return out;
}

// Ends a list of placements today with a reason, keeping them as history.
const endRecords = (records: Placement[], when: (p: Placement) => EndReason | undefined, today: string): { records: Placement[]; ended: number } => {
  let ended = 0;
  const next = records.map((p) => {
    if (!isActive(p) || p.kind !== "place") return p;
    const reason = when(p);
    if (reason === undefined) return p;
    ended++;
    return { ...p, to: today, endReason: reason };
  });
  return { records: next, ended };
};

/**
 * Rule (DECISIONS 186): brings the placements up to date. A placement whose gift's plan is now paused, cancelled or completed ends with that reason; one whose gift has gone out of scope for another reason ends as released;
 * one whose child has left (the enrolment ended, or the child is inactive or no longer approved) ends as child-left. Nothing is deleted: the ended placement is history and the child's place is free.
 */
export function syncPlacements(ctx: PlaceContext, existing: Placements): { value: Placements; ended: number } {
  const today = ctx.now.slice(0, 10);
  const byId = new Map(ctx.beneficiaries.map((b) => [b.id, b]));
  const enrolled = new Map(ctx.enrolments.map((e) => [e.id, e]));
  const r = endRecords(existing.records, (p) => {
    if (!ctx.live.has(p.key)) return ctx.parkedBy[p.key] ?? "released";
    const e = enrolled.get(p.enrolmentId);
    const b = e ? byId.get(e.beneficiaryId) : undefined;
    if (!e || e.status !== "active" || !b || b.status !== "active" || (b.kind === "person" && b.eligibility !== "ready")) return "child-left";
    return undefined;
  }, today);
  return { value: { ...existing, records: r.records }, ended: r.ended };
}

// Runs Placement: first it brings the placements up to date (ending those of a parked plan or a child who has left), then every gift that has a place or creates an outcome is placed. Returns the new records and the counts.
export function runPlacement(ctx: PlaceContext, existing: Placements): { value: Placements; placed: number; outcomes: number; waiting: number; ended: number } {
  const synced = syncPlacements(ctx, existing);
  let records = synced.value.records;
  let counter = existing.counter;
  let placed = 0, outcomes = 0, waiting = 0;
  const start = ctx.now;
  for (const s of suggestPlacements(ctx, synced.value)) {
    const a = ctx.assignments.find((x) => x.key === s.key) as Assignment;
    if (s.kind === "place") { records = [...records, ...s.shares.map((sh): Placement => ({ key: s.key, kind: "place", enrolmentId: sh.enrolmentId, outcomeRef: "", giftProjectId: ctx.enrolments.find((e) => e.id === sh.enrolmentId)?.giftProjectId ?? a.giftProjectId, itemId: s.itemId, parts: sh.parts, how: "auto", at: start }))]; placed++; }
    else if (s.kind === "outcome") { counter++; records = [...records, { key: s.key, kind: "outcome", enrolmentId: "", outcomeRef: `OUT-${String(counter).padStart(4, "0")}`, giftProjectId: a.giftProjectId, itemId: s.itemId, parts: s.parts, how: "auto", at: start }]; outcomes++; }
    else waiting++;
  }
  return { value: { records, counter }, placed, outcomes, waiting, ended: synced.ended };
}

// Rule: a person places a gift in a chosen place that is open and fits. A gift that already has a place is moved.
export function placeManual(ctx: PlaceContext, existing: Placements, key: string, enrolmentId: string): Result {
  const a = ctx.assignments.find((x) => x.key === key);
  if (!a) return { error: "That gift has not been assigned to a partner yet." };
  const rules = ctx.rulesOf(a.itemId);
  if (rules && (rules.first === "gift" || rules.receiver === "none")) return { error: "This gift creates an outcome. It does not fill a place." };
  const others = existing.records.filter((p) => p.key !== key || !isActive(p)); // the gift's own active placements leave the count while it is moved
  const option = placesFor(ctx, a, others).find((o) => o.enrolmentId === enrolmentId);
  if (!option) return { error: "That place is not open for this gift: it must be an approved beneficiary enrolled for this benefit in the right project." };
  if (!option.fits) return { error: `${option.name}'s place is full: ${option.used} of ${option.capacity} units taken, and this gift needs ${a.parts}.` };
  // Rule (DECISIONS 186): the gift's earlier placement ends as moved and stays as history.
  const ended = existing.records.map((p) => (p.key === key && isActive(p) && p.kind === "place" ? { ...p, to: ctx.now.slice(0, 10), endReason: "moved" as const } : p));
  return { value: { ...existing, records: [...ended, { key, kind: "place", enrolmentId, outcomeRef: "", giftProjectId: option.giftProjectId, itemId: a.itemId, parts: a.parts, how: "manual", at: ctx.now }] } };
}

// Rule (DECISIONS 186): taking a placement back ends it as taken back and keeps it as history. An outcome that was created is removed, since it never held a child.
export function unplace(existing: Placements, key: string, today = ""): Result {
  if (!existing.records.some((p) => p.key === key && isActive(p))) return { error: "That gift is not placed." };
  const day = today || new Date().toISOString().slice(0, 10);
  return { value: { ...existing, records: existing.records.filter((p) => !(p.key === key && isActive(p) && p.kind === "outcome")).map((p) => (p.key === key && isActive(p) ? { ...p, to: day, endReason: "taken-back" as const } : p)) } };
}

// How full each place is, for the page: the units taken and needed, from the gifts placed in it.
export interface PlaceFill { enrolmentId: string; used: number; capacity: number }
export function fills(ctx: PlaceContext, existing: Placements): PlaceFill[] {
  return ctx.enrolments
    .filter((e) => e.status === "active" && e.role === "" && (ctx.rulesOf(e.itemId)?.first ?? "beneficiary") === "beneficiary" && (ctx.rulesOf(e.itemId)?.receiver ?? "person") !== "none")
    .map((e) => ({ enrolmentId: e.id, used: used(existing.records, e.id, ctx.live), capacity: wholeOf(ctx, e.itemId) }));
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
      return { value: r.value, message: `Placed ${r.placed} in open places and created ${r.outcomes} outcome${r.outcomes === 1 ? "" : "s"}. ${r.waiting} wait with no open place.${r.ended ? ` ${r.ended} placement${r.ended === 1 ? "" : "s"} ended (a plan was parked or a child left) and ${r.ended === 1 ? "is" : "are"} kept as history.` : ""}` };
    }
    case "plc-set": return placeManual(ctx, existing, str("key"), str("enrolmentId"));
    case "plc-unplace": return unplace(existing, str("key"), ctx.now.slice(0, 10));
    case "plc-reset": return { value: emptyPlacements(), message: "All placements were cleared, history included." };
    default: return null;
  }
}
