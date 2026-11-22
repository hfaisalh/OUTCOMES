/**
 * work-orders.ts
 *
 * What it does: turns feed lines that need feedback into work orders (instruction tokens), and
 * compares them with the work orders that already exist, so running the same feed twice never
 * creates a second work order.
 * Who calls it: the pick-up job (DECISIONS 20) and, later, Module 4 (import and triage).
 * Depends on: feed.ts (pure functions, no database, no screen).
 *
 * Which category an item belongs to is set in OUTCOMES, not in the CRM (DECISIONS 31). The CRM
 * only says whether an item needs feedback.
 */

import type { Credit } from "./credits.js";
import type { FeedLine } from "./feed.js";

// A work order moves through these stages. The planner only creates the first two.
// "excluded" is set by a person (DECISIONS 47): the work order is kept on file but is out of the active list.
export type WorkOrderStatus = "unrouted" | "ready" | "in_progress" | "delivered" | "reported" | "excluded";

// Why, by whom and when a work order was excluded, and the status to return to when it is restored.
export interface Exclusion {
  reason: string;
  by: string;
  at: string;
  was: "unrouted" | "ready";
}

export interface WorkOrder {
  key: string; // the CRM line id, unique and never reused, so it is the guard against duplicates (DECISIONS 46)
  lineId: string;
  transactionRef: string;
  paidDate: string;
  supporterId: string;
  supporterName: string; // display name only (privacy rule)
  group: string;
  supporterKind?: string; // "organisation" or "group" when the donor is not an individual. Absent on work orders made before DECISIONS 44
  credits?: Credit[]; // the credit chain, nearest first. Absent when the feed had none
  itemId: string;
  itemName: string;
  amount: number; // the price of one unit, for reference only (DECISIONS 81)
  covers?: number; // how many instalments this payment covers, set by a person (DECISIONS 83). Absent: not checked, 1 is assumed. 1: checked, a normal payment
  lineTotal?: number; // what the whole line cost, when the CRM sent it (DECISIONS 82)
  currency?: string; // the currency code of the amount, absent when the feed gave none
  quantity: number;
  legacyUpload?: true; // uploaded from an old system, so paid date is the upload date (DECISIONS 55). Absent means a normal line
  bundleQty?: number; // parts of the item in the bundle bought, absent means 1 (DECISIONS 51)
  projectName?: string; // the project the donor chose on the line, absent when none or when general (DECISIONS 66)
  periodCount?: number; // for a one-off payment: the months it covers (the item's plan length), absent means one period (DECISIONS 64)
  intention: string;
  subscriptionId: string;
  instalmentNumber: string;
  instalmentCount: string;
  planStatus?: string; // the plan's status, next due date and instalments paid in the CRM. They change as the plan goes on, so they are refreshed quietly at each import (DECISIONS 62)
  planNextDue?: string;
  planPaid?: number;
  frameworkId?: string; // the framework template it was routed under (DECISIONS 59). Set when routed and kept: changing an item's framework later does not move work already made
  categoryId: string; // the category it is routed to, "" while unrouted
  status: WorkOrderStatus;
  exclusion?: Exclusion; // present only while status is "excluded"
}

// Rule (DECISIONS 51): parts = the bundle quantity times the order quantity. Prices play no part, so an old price does not matter.
export const partsOf = (w: Pick<WorkOrder, "quantity" | "bundleQty">): number => (w.bundleQty ?? 1) * w.quantity;

export interface PlanOptions {
  categoryByItem: Record<string, string>; // CRM item id to category id, set in OUTCOMES
  frameworkByItem?: Record<string, string>; // CRM item id to the framework template that applies to it (its own, else its category's). DECISIONS 59
  usesFrameworks: boolean; // false for an organisation with no categories set up (DECISIONS 31, 40)
  feedIsComplete?: boolean; // true when the feed is the whole picture, not just recent lines, so missing lines can be spotted
  coverage?: { from: string; to: string }; // when given, only work orders paid inside these dates can be judged missing (an export covers a date range)
}

export interface ReviewItem {
  key: string;
  reason: "changed" | "no_longer_needs_feedback" | "missing_from_feed";
  message: string;
  was?: string; // for "changed": what was saved, in words, so a person can see the difference (DECISIONS 48)
  now?: string; // for "changed": what the CRM says now
}

export interface Plan {
  created: WorkOrder[]; // new work orders to save
  updated: WorkOrder[]; // existing work orders given the bundle quantity they were missing (catalogue data, not a donor change)
  rerouted: WorkOrder[]; // existing unrouted work orders whose item now has a category (updated copies)
  unchanged: WorkOrder[];
  review: ReviewItem[]; // held for a person to approve, never changed automatically (DECISIONS 21)
}

// The category used when an organisation has none: a simple default journey.
export const DEFAULT_CATEGORY = "default";

// Rule: a work order is identified by its CRM line id alone (DECISIONS 46). The line id is unique and never reused, while the
// order reference can be blank or appear later, which would otherwise change the key and make a duplicate.
export const workOrderKey = (line: Pick<FeedLine, "lineId">) => line.lineId;

// The plan facts a line carries, only when it has them.
const planFacts = (line: FeedLine): Pick<WorkOrder, "planStatus" | "planNextDue" | "planPaid"> => ({
  ...(line.planStatus !== "" ? { planStatus: line.planStatus } : {}),
  ...(line.planNextDue !== "" ? { planNextDue: line.planNextDue } : {}),
  ...(line.planPaid !== null ? { planPaid: line.planPaid } : {}),
});

// Rule: the framework a work order is routed under, kept on it from then on (DECISIONS 59). Nothing when the item has none.
const fwOf = (itemId: string, options: PlanOptions): { frameworkId?: string } => {
  const id = options.frameworkByItem?.[itemId] ?? "";
  return id === "" ? {} : { frameworkId: id };
};

// Rule: where a line goes. No categories in use: the default journey. Otherwise the item's category, or unrouted.
function route(itemId: string, options: PlanOptions): { categoryId: string; status: WorkOrderStatus } {
  if (!options.usesFrameworks) return { categoryId: DEFAULT_CATEGORY, status: "ready" };
  const categoryId = options.categoryByItem[itemId] ?? "";
  return categoryId === "" ? { categoryId: "", status: "unrouted" } : { categoryId, status: "ready" };
}

/**
 * Rules:
 * - A line needs a work order only when its item needs feedback.
 * - One work order per paid line. For recurring giving each paid instalment is its own line, so it
 *   is its own work order, linked to the subscription.
 * - Idempotent: a line that already has a work order is never created again.
 * - Unrouted (item not yet in a category) is allowed and never blocks. When the item is later
 *   mapped, the existing work order is rerouted.
 * - A work order is never changed or removed automatically after it exists. If the CRM line has
 *   since changed amount or supporter, lost its trigger, or (with a complete feed) disappeared, it is
 *   listed for review (DECISIONS 21).
 */
export function planWorkOrders(feed: FeedLine[], existing: WorkOrder[], options: PlanOptions): Plan {
  const byKey = new Map(existing.map((w) => [w.key, w]));
  const created: WorkOrder[] = [];
  const rerouted: WorkOrder[] = [];
  const updated: WorkOrder[] = [];
  const unchanged: WorkOrder[] = [];
  const review: ReviewItem[] = [];
  const seen = new Set<string>();

  for (const line of feed) {
    const key = workOrderKey(line);
    seen.add(key);
    const current = byKey.get(key);

    if (!current) {
      if (!line.needsFeedback) continue;
      if (created.some((w) => w.key === key)) continue; // the same line twice in one feed
      created.push({
        key,
        lineId: line.lineId,
        transactionRef: line.transactionRef,
        paidDate: line.paidDate,
        supporterId: line.supporterId,
        supporterName: line.supporterName,
        group: line.group,
        ...(line.supporterKind !== "individual" ? { supporterKind: line.supporterKind } : {}),
        ...(line.credits.length > 0 ? { credits: line.credits } : {}),
        itemId: line.itemId,
        itemName: line.itemName,
        amount: line.amount,
        ...(line.lineTotal !== null ? { lineTotal: line.lineTotal } : {}),
        ...(line.currency !== "" ? { currency: line.currency } : {}),
        quantity: line.quantity,
        ...(line.bundleQty !== 1 ? { bundleQty: line.bundleQty } : {}),
        ...(line.periodCount > 0 ? { periodCount: line.periodCount } : {}),
        ...(line.projectName !== "" ? { projectName: line.projectName } : {}),
        ...(line.legacyUpload ? { legacyUpload: true as const } : {}),
        intention: line.intention,
        subscriptionId: line.subscriptionId,
        instalmentNumber: line.instalmentNumber,
        instalmentCount: line.instalmentCount,
        ...planFacts(line),
        ...route(line.itemId, options),
        ...fwOf(line.itemId, options),
      });
      continue;
    }

    // Rule: an excluded work order is left alone. It is never reviewed, rerouted or recreated (DECISIONS 47).
    if (current.status === "excluded") {
      unchanged.push(current);
      continue;
    }

    // Rule: the bundle quantity and the legacy-upload mark come from the catalogue and the reference, not from the donor, so a work order made before they were known is given them quietly, and so is the plan link. Never reviewed.
    // A work order made before frameworks existed is given its framework once. One that already has a framework keeps it.
    const fwMissing = current.frameworkId === undefined && (options.frameworkByItem?.[current.itemId] ?? "") !== "";

    // Also the plan link (subscription, instalment number and count), which comes from the plans file and can be completed later (DECISIONS 56).
    let have = current;
    const refFilled = current.transactionRef === "" && line.transactionRef !== "";
    const planFactsChanged = (current.planStatus ?? "") !== line.planStatus || (current.planNextDue ?? "") !== line.planNextDue || (current.planPaid ?? null) !== line.planPaid;
    const planChanged = refFilled || planFactsChanged || current.subscriptionId !== line.subscriptionId || current.instalmentNumber !== line.instalmentNumber || current.instalmentCount !== line.instalmentCount;
    if (fwMissing || (current.currency ?? "") !== line.currency || (current.lineTotal ?? null) !== line.lineTotal || (current.bundleQty ?? 1) !== line.bundleQty || (current.periodCount ?? 0) !== line.periodCount || (current.projectName ?? "") !== line.projectName || (current.legacyUpload === true) !== line.legacyUpload || planChanged) {
      const { lineTotal: _lt, currency: _cu, bundleQty: _b, periodCount: _c, projectName: _j, legacyUpload: _l, planStatus: _s, planNextDue: _n, planPaid: _p, ...rest } = current;
      have = {
        ...rest,
        ...(fwMissing ? fwOf(current.itemId, options) : {}),
        transactionRef: current.transactionRef || line.transactionRef,
        subscriptionId: line.subscriptionId,
        instalmentNumber: line.instalmentNumber,
        instalmentCount: line.instalmentCount,
        ...planFacts(line),
        ...(line.currency !== "" ? { currency: line.currency } : {}),
        ...(line.lineTotal !== null ? { lineTotal: line.lineTotal } : {}),
        ...(line.bundleQty !== 1 ? { bundleQty: line.bundleQty } : {}),
        ...(line.periodCount > 0 ? { periodCount: line.periodCount } : {}),
        ...(line.projectName !== "" ? { projectName: line.projectName } : {}),
        ...(line.legacyUpload ? { legacyUpload: true as const } : {}),
      };
      updated.push(have);
    }

    if (!line.needsFeedback) {
      review.push({ key, reason: "no_longer_needs_feedback", message: "The CRM item no longer says it needs feedback. The work order was kept." });
    } else if (current.amount !== line.amount || current.supporterId !== line.supporterId) {
      review.push({ key, reason: "changed", message: "The amount or supporter changed in the CRM after the work order was created.", was: `amount ${current.amount}, supporter ${current.supporterId}`, now: `amount ${line.amount}, supporter ${line.supporterId}` });
    }

    if (current.status === "unrouted") {
      const r = route(current.itemId, options);
      if (r.status === "ready") {
        rerouted.push({ ...have, ...r, ...(have.frameworkId === undefined ? fwOf(have.itemId, options) : {}) });
        if (have !== current) updated.pop();
        continue;
      }
    }
    unchanged.push(have);
  }

  if (options.feedIsComplete) {
    for (const w of existing) {
      const inside = !options.coverage || (w.paidDate >= options.coverage.from && w.paidDate <= options.coverage.to && w.paidDate !== "");
      if (!seen.has(w.key) && inside && w.status !== "excluded" && w.legacyUpload !== true) review.push({ key: w.key, reason: "missing_from_feed", message: "The line is no longer in the CRM feed (refunded, deleted or replaced). The work order was kept." });
    }
  }
  return { created, updated, rerouted, unchanged, review };
}

// Rule (DECISIONS 47): a person can exclude a work order that has not started (unrouted or ready), for a stated reason.
// The work order stays on file so the import never recreates it. Returns the updated copy, or an error in plain English.
export function excludeWorkOrder(w: WorkOrder, reason: string, by: string, at: string): { order: WorkOrder } | { error: string } {
  const why = reason.trim();
  if (w.status === "excluded") return { error: "That work order is already excluded." };
  if (w.status !== "unrouted" && w.status !== "ready") return { error: "Work has already started on this one, so it cannot be excluded." };
  if (why.length < 3) return { error: "Give a reason for excluding it." };
  return { order: { ...w, status: "excluded", exclusion: { reason: why.slice(0, 300), by, at, was: w.status } } };
}

// Rule: restoring puts it back where it was (unrouted or ready). An unrouted one is rerouted by the normal rules.
export function restoreWorkOrder(w: WorkOrder): { order: WorkOrder } | { error: string } {
  if (w.status !== "excluded" || !w.exclusion) return { error: "That work order is not excluded." };
  const { exclusion, ...rest } = w;
  return { order: { ...rest, status: exclusion.was } };
}

// Rule (DECISIONS 82): what a line cost, for reference. The CRM's total when it sends one, else the unit price times the quantity.
export const lineValue = (w: Pick<WorkOrder, "amount" | "quantity" | "lineTotal">): number => w.lineTotal ?? w.amount * w.quantity;
