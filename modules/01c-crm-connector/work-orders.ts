/**
 * work-orders.ts
 *
 * What it does: turns feed lines that need feedback into work orders (instruction tokens), and
 * compares them with the work orders that already exist, so running the same feed twice never
 * creates a second work order.
 * Who calls it: the pick-up job (DECISIONS 20) and, later, Module 4 (import and triage).
 * Depends on: feed.ts (pure functions, no database, no screen).
 *
 * Which framework an item belongs to is set in OUTCOMES, not in the CRM (DECISIONS 31). The CRM
 * only says whether an item needs feedback.
 */

import type { FeedLine } from "./feed";

// A work order moves through these stages. The planner only creates the first two.
export type WorkOrderStatus = "unrouted" | "ready" | "in_progress" | "delivered" | "reported";

export interface WorkOrder {
  key: string; // transactionRef:lineId, unique and stable, the guard against duplicates
  lineId: string;
  transactionRef: string;
  paidDate: string;
  supporterId: string;
  supporterName: string; // display name only (privacy rule)
  group: string;
  itemId: string;
  itemName: string;
  amount: number; // for reference only
  quantity: number;
  intention: string;
  subscriptionId: string;
  instalmentNumber: string;
  instalmentCount: string;
  frameworkId: string; // "" while unrouted
  status: WorkOrderStatus;
}

export interface PlanOptions {
  frameworkByItem: Record<string, string>; // CRM item id to framework id, set in OUTCOMES
  usesFrameworks: boolean; // false for an organisation with no frameworks (DECISIONS 31)
  feedIsComplete?: boolean; // true when the feed is the whole picture, not just recent lines, so missing lines can be spotted
}

export interface ReviewItem {
  key: string;
  reason: "changed" | "no_longer_needs_feedback" | "missing_from_feed";
  message: string;
}

export interface Plan {
  created: WorkOrder[]; // new work orders to save
  rerouted: WorkOrder[]; // existing unrouted work orders whose item now has a framework (updated copies)
  unchanged: WorkOrder[];
  review: ReviewItem[]; // held for a person to approve, never changed automatically (DECISIONS 21)
}

// The framework used when an organisation has none: a simple default journey.
export const DEFAULT_FRAMEWORK = "default";

export const workOrderKey = (line: Pick<FeedLine, "transactionRef" | "lineId">) => `${line.transactionRef}:${line.lineId}`;

// Rule: where a line goes. No frameworks in use: the default journey. Otherwise the item's framework, or unrouted.
function route(itemId: string, options: PlanOptions): { frameworkId: string; status: WorkOrderStatus } {
  if (!options.usesFrameworks) return { frameworkId: DEFAULT_FRAMEWORK, status: "ready" };
  const frameworkId = options.frameworkByItem[itemId] ?? "";
  return frameworkId === "" ? { frameworkId: "", status: "unrouted" } : { frameworkId, status: "ready" };
}

/**
 * Rules:
 * - A line needs a work order only when its item needs feedback.
 * - One work order per paid line. For recurring giving each paid instalment is its own line, so it
 *   is its own work order, linked to the subscription.
 * - Idempotent: a line that already has a work order is never created again.
 * - Unrouted (item not yet in a framework) is allowed and never blocks. When the item is later
 *   mapped, the existing work order is rerouted.
 * - A work order is never changed or removed automatically after it exists. If the CRM line has
 *   since changed amount or supporter, lost its trigger, or (with a complete feed) disappeared, it is
 *   listed for review (DECISIONS 21).
 */
export function planWorkOrders(feed: FeedLine[], existing: WorkOrder[], options: PlanOptions): Plan {
  const byKey = new Map(existing.map((w) => [w.key, w]));
  const created: WorkOrder[] = [];
  const rerouted: WorkOrder[] = [];
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
        itemId: line.itemId,
        itemName: line.itemName,
        amount: line.amount,
        quantity: line.quantity,
        intention: line.intention,
        subscriptionId: line.subscriptionId,
        instalmentNumber: line.instalmentNumber,
        instalmentCount: line.instalmentCount,
        ...route(line.itemId, options),
      });
      continue;
    }

    if (!line.needsFeedback) {
      review.push({ key, reason: "no_longer_needs_feedback", message: "The CRM item no longer says it needs feedback. The work order was kept." });
    } else if (current.amount !== line.amount || current.supporterId !== line.supporterId) {
      review.push({ key, reason: "changed", message: "The amount or supporter changed in the CRM after the work order was created." });
    }

    if (current.status === "unrouted") {
      const r = route(current.itemId, options);
      if (r.status === "ready") {
        rerouted.push({ ...current, ...r });
        continue;
      }
    }
    unchanged.push(current);
  }

  if (options.feedIsComplete) {
    for (const w of existing) {
      if (!seen.has(w.key)) review.push({ key: w.key, reason: "missing_from_feed", message: "The line is no longer in the CRM feed (refunded, deleted or replaced). The work order was kept." });
    }
  }
  return { created, rerouted, unchanged, review };
}
