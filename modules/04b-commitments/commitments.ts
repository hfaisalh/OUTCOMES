/**
 * commitments.ts
 *
 * What it does: groups work orders into commitments. A commitment is one recurring gift: every paid
 * instalment that shares a subscription id, with how many are paid out of how many planned. It also
 * lists recurring lines that have no subscription id (the CRM did not link them) and suggests which
 * commitment each may belong to.
 * Who calls it: the Commitments page (app/pages.ts). Depends on: work-orders.ts types only.
 * Pure functions: no database, no screen. Read only: it changes nothing and saves nothing (DECISIONS 53).
 *
 * Rules:
 * - A commitment is the work orders with the same subscription id. Excluded work orders are left out.
 * - A legacy upload (the migration's opening record) is shown in the list but not counted as an instalment: it stands for
 *   everything paid on the old website, which we do not hold (DECISIONS 56).
 * - Planned is the instalment count the lines carry. "Indefinitely" means the plan runs until cancelled.
 * - Paid is how many work orders we hold. The export may start part way through a plan, so a plan whose
 *   lowest instalment number is above 1 is marked "starts late": earlier instalments are not in our data.
 * - A gap is an instalment number missing between the lowest and highest we hold.
 * - A suggestion is only a suggestion: same supporter and same item, nearest paid date first. A person
 *   decides, and nothing here links anything.
 * - Units are not worked out here. Whether an instalment is a month or a share of a whole depends on the
 *   category (DECISIONS 52), so units belong to the allocation module.
 */

import { partsOf, type WorkOrder } from "../01c-crm-connector/work-orders.js";
import { coverage, plusMonths } from "./catch-up.js";

// Rule (DECISIONS 83): the parts of one instalment. A payment that covers several instalments holds that many instalments worth of parts.
const partsPer = (w: WorkOrder): number => Math.max(1, Math.round(partsOf(w) / (w.covers ?? 1)));

export type CommitmentState = "complete" | "in_progress" | "open_ended";

export interface Commitment {
  subscriptionId: string;
  supporterId: string;
  supporterName: string;
  itemId: string;
  itemName: string;
  categoryId: string;
  frameworkId: string; // the framework the first instalment was routed under ("" when none), which decides how units count
  partsPerInstalment: number; // from the first instalment. See partsVary
  partsVary: boolean; // true when the instalments do not all have the same parts, which needs a look
  planned: number | null; // null when the plan runs until cancelled or the count is unknown
  paid: number; // work orders held
  state: CommitmentState;
  firstPaid: string; // YYYY-MM-DD
  lastPaid: string;
  numbers: number[]; // instalment numbers held, ascending
  gaps: number[]; // instalment numbers missing between the lowest and highest held
  legacyOpening: boolean; // the first record is a legacy upload: the instalments paid on the old website are not in our data and are not counted
  planStatus: string; // the CRM plan's own status (active, paused, cancelled, completed, pending, past_due), "" when unknown (DECISIONS 62)
  nextDue: string; // the plan's next due date, YYYY-MM-DD, "" when unknown
  planPaid: number | null; // instalments the CRM says are paid
  paidMonths: string[]; // the months (YYYY-MM) in which a real instalment was paid, legacy uploads left out
  projectName: string; // the project the donor chose, "" when none. Where Needed Most and blank are general (DECISIONS 66)
  once?: true; // a single payment that covers several periods, not a subscription (DECISIONS 64). Its subscriptionId is "once-" plus the line id
  endMonth?: string; // for a one-off payment: the last month it covers, YYYY-MM
  startsLate: boolean; // the lowest number held is above 1
  conflict: boolean; // the lines do not agree on supporter or item, which needs a look
  lines: { key: string; paidDate: string; instalmentNumber: string; transactionRef: string; legacyUpload: boolean }[]; // oldest first
}

export interface Suggestion {
  subscriptionId: string;
  daysApart: number | null; // the unlinked line's paid date minus the commitment's first paid date. Negative means it was paid before. Null for a legacy upload, whose date is not a payment date
}

export interface Unlinked {
  key: string; // the line id
  workOrder: WorkOrder;
  suggestions: Suggestion[]; // nearest first, empty when nothing matches
}

export interface CommitmentsView {
  commitments: Commitment[]; // needing a look first, then by last paid date, newest first
  unlinked: Unlinked[];
}

const dayNumber = (d: string): number => (d === "" ? 0 : Math.round(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / 86_400_000));

// Rule: "needs a look" is any of: a conflict, varying parts, a gap, or a plan that starts late.
// A late start that a legacy opening explains is not odd, so it does not count.
export const needsLook = (c: Commitment): boolean => c.conflict || c.partsVary || c.gaps.length > 0 || (c.startsLate && !c.legacyOpening);

export function buildCommitments(workOrders: WorkOrder[]): CommitmentsView {
  const live = workOrders.filter((w) => w.status !== "excluded");
  const bySub = new Map<string, WorkOrder[]>();
  for (const w of live) if (w.subscriptionId !== "") bySub.set(w.subscriptionId, [...(bySub.get(w.subscriptionId) ?? []), w]);

  const commitments: Commitment[] = [];
  for (const [subscriptionId, list] of bySub) {
    const sortedAll = [...list].sort((a, b) => Number(a.legacyUpload === true) - Number(b.legacyUpload === true) || a.paidDate.localeCompare(b.paidDate) || a.key.localeCompare(b.key));
    // Rule: only real instalments are counted and dated. Legacy uploads are listed but their dates are the load date.
    const real = sortedAll.filter((w) => w.legacyUpload !== true);
    const sorted = real.length > 0 ? real : sortedAll;
    const first = sorted[0] as WorkOrder;
    // The plan facts are the same on every line of a subscription. Take the newest line, since they are refreshed at each import.
    const latest = [...sortedAll].reverse().find((w) => w.planStatus !== undefined || w.planNextDue !== undefined) ?? first;
    const count = Number(first.instalmentCount);
    const planned = Number.isInteger(count) && count > 0 ? count : null;
    const numbers = sorted.map((w) => Number(w.instalmentNumber)).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
    const gaps: number[] = [];
    if (numbers.length > 0) {
      const have = new Set(numbers);
      for (let n = (numbers[0] as number) + 1; n < (numbers[numbers.length - 1] as number); n++) if (!have.has(n)) gaps.push(n);
    }
    // Rule (DECISIONS 83): a payment that covers more than one instalment counts for that many.
    const paid = real.reduce((n, w) => n + (w.covers ?? 1), 0);
    commitments.push({
      subscriptionId,
      supporterId: first.supporterId,
      supporterName: first.supporterName,
      itemId: first.itemId,
      itemName: first.itemName,
      categoryId: first.categoryId,
      frameworkId: first.frameworkId ?? "",
      projectName: first.projectName ?? "",
      partsPerInstalment: partsPer(first),
      partsVary: sorted.some((w) => partsPer(w) !== partsPer(first)),
      planned,
      paid,
      state: planned === null ? "open_ended" : paid >= planned ? "complete" : "in_progress",
      firstPaid: real.length > 0 ? first.paidDate.slice(0, 10) : "",
      lastPaid: real.length > 0 ? (sorted[sorted.length - 1] as WorkOrder).paidDate.slice(0, 10) : "",
      numbers,
      gaps,
      planStatus: latest.planStatus ?? "",
      nextDue: latest.planNextDue ?? "",
      planPaid: latest.planPaid ?? null,
      paidMonths: coverage(real).months,
      legacyOpening: sortedAll.length > real.length,
      startsLate: numbers.length > 0 && (numbers[0] as number) > 1,
      conflict: sortedAll.some((w) => w.supporterId !== first.supporterId || w.itemId !== first.itemId),
      lines: sortedAll.map((w) => ({ key: w.key, paidDate: w.paidDate.slice(0, 10), instalmentNumber: w.instalmentNumber, transactionRef: w.transactionRef, legacyUpload: w.legacyUpload === true })),
    });
  }
  commitments.sort((a, b) => Number(needsLook(b)) - Number(needsLook(a)) || b.lastPaid.localeCompare(a.lastPaid) || a.subscriptionId.localeCompare(b.subscriptionId));

  // Recurring lines with no subscription id: they carry an instalment count (the feed marks them recurring) but no link.
  const unlinked: Unlinked[] = live
    .filter((w) => w.subscriptionId === "" && w.instalmentCount !== "")
    .map((w) => ({
      key: w.key,
      workOrder: w,
      suggestions: commitments
        .filter((c) => c.supporterId === w.supporterId && c.itemId === w.itemId)
        .map((c) => ({ subscriptionId: c.subscriptionId, daysApart: w.legacyUpload ? null : dayNumber(w.paidDate) - dayNumber(c.firstPaid) }))
        .sort((a, b) => Math.abs(a.daysApart ?? 0) - Math.abs(b.daysApart ?? 0)),
    }))
    .sort((a, b) => a.workOrder.paidDate.localeCompare(b.workOrder.paidDate));
  return { commitments, unlinked };
}

// ---- One-off payments (DECISIONS 64) ----

export const ONCE_PREFIX = "once-";

/**
 * Rule (DECISIONS 64): a single payment for a per-period item (one paid for a number of months) is a commitment too. It is paid up front,
 * so every month it covers is paid, counting from the month it was paid. Its parts are held for those months only: once the last
 * covered month has passed it is complete and the capacity is free again. The months it covers are the item's plan length, one
 * when that is not known. `isPerPeriod` says whether a framework counts a payment as a period, from the framework template.
 * Left out: recurring lines, excluded work orders, legacy uploads (their paid date is the load date) and items whose framework is not per period.
 */
export function oneOffCommitments(workOrders: WorkOrder[], isPerPeriod: (frameworkId: string) => boolean, today: string): Commitment[] {
  const now = today.slice(0, 7);
  return workOrders
    .filter((w) => w.status !== "excluded" && w.legacyUpload !== true && w.subscriptionId === "" && w.instalmentCount === "" && w.paidDate !== "" && isPerPeriod(w.frameworkId ?? ""))
    .map((w): Commitment => {
      const periods = w.periodCount ?? 1;
      const first = w.paidDate.slice(0, 7);
      const months = Array.from({ length: periods }, (_, i) => plusMonths(first, i));
      const endMonth = months[months.length - 1] as string;
      return {
        subscriptionId: ONCE_PREFIX + w.key,
        supporterId: w.supporterId,
        supporterName: w.supporterName,
        itemId: w.itemId,
        itemName: w.itemName,
        categoryId: w.categoryId,
        frameworkId: w.frameworkId ?? "",
        projectName: w.projectName ?? "",
        partsPerInstalment: partsOf(w),
        partsVary: false,
        planned: periods,
        paid: periods,
        state: endMonth < now ? "complete" : "in_progress",
        firstPaid: w.paidDate.slice(0, 10),
        lastPaid: w.paidDate.slice(0, 10),
        numbers: [],
        gaps: [],
        legacyOpening: false,
        planStatus: "",
        nextDue: "",
        planPaid: null,
        paidMonths: months,
        once: true,
        endMonth,
        startsLate: false,
        conflict: false,
        lines: [{ key: w.key, paidDate: w.paidDate.slice(0, 10), instalmentNumber: "", transactionRef: w.transactionRef, legacyUpload: false }],
      };
    });
}

// Everything that can be allocated to an outcome: the subscriptions, then the one-off payments.
export const allocatable = (workOrders: WorkOrder[], isPerPeriod: (frameworkId: string) => boolean, today: string): Commitment[] => [...buildCommitments(workOrders).commitments, ...oneOffCommitments(workOrders, isPerPeriod, today)];
