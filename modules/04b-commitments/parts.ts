/**
 * parts.ts
 *
 * What it does: works out how many parts a gift is from the price of one part (DECISIONS 112, 113). A framework (soon a workflow) can carry a price for one
 * part with start dates, for example 35 from the start and 40 from 1 Jan 2027. A payment with no bundle is that many parts as it holds whole prices. A payment
 * that is not a clean multiple is a custom amount, marked for manual allocation. A person can also mark a gift as manual, or set its parts.
 * Who calls it: the pick-up and the setup save (modules/00-platform), the demo (app/main.ts) and the Gifts page. Depends on: the work order type only.
 * Pure functions: no database, no screen.
 *
 * Rules:
 * - Only a framework that has a part price takes part. Without one nothing changes, and parts stay bundle times quantity.
 * - A line with a bundle keeps its bundle (parts = bundle x quantity). Parts are never taken from the amount for those.
 * - For the others the unit price must be the price of one part in force on the gift's first real payment (times the months a single payment covers,
 *   period_count). Then the parts are the quantity. Any other unit price is a custom amount, even a multiple such as 70 for 35, and is manual (DECISIONS 114).
 * - Parts are worked out once and then kept (`partsAuto`). A later price does not change a gift that already has its parts, so an existing 35 subscriber
 *   stays 1 part when the price becomes 40. A gift that is manual is looked at again when a price is added.
 * - A person's own setting (`partsFixed`) always wins, and a person can mark any gift manual (`partsManual`).
 * - Legacy uploads are left alone: their amount is a placeholder for payments made on the old website.
 */

import { lineValue, periodsOf, type WorkOrder } from "../01c-crm-connector/work-orders.js";

export interface PartPrice { from: string; price: number } // from is YYYY-MM-DD

// Rule: the price in force on a date: the latest start that is on or before it. Null when none has started yet.
export function priceAt(prices: PartPrice[], date: string): number | null {
  const d = date.slice(0, 10);
  const started = prices.filter((p) => p.from <= d).sort((a, b) => b.from.localeCompare(a.from));
  return started[0]?.price ?? null;
}

const money = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export type PartsVerdict = { parts: number } | { manual: string };

// Rule (DECISIONS 114): the parts of one payment, or why it is manual. A bundle keeps its bundle. Otherwise a line is a normal catalogue line only when its
// unit price is exactly the price of one part (times the months a single payment covers), and then its parts are its quantity. Any other unit price is a
// custom amount the donor chose, even when it is a multiple (70 is not 35), so a person allocates it. `firstDate` is the date of the gift's first real
// payment, which decides the price.
export function derivePartsFor(w: WorkOrder, prices: PartPrice[], firstDate: string): PartsVerdict {
  if ((w.bundleQty ?? 1) > 1) return { parts: (w.bundleQty ?? 1) * w.quantity };
  const price = priceAt(prices, firstDate);
  if (price === null || price <= 0) return { manual: `No price for a part had started by ${firstDate.slice(0, 10)}` };
  const oneOff = w.subscriptionId === "" && w.instalmentCount === "";
  const periods = oneOff ? periodsOf(w) : 1;
  const expected = price * periods;
  if (Math.abs(w.amount - expected) <= 0.005 * expected && w.quantity >= 1) return { parts: w.quantity };
  return { manual: `A custom amount: ${money(w.amount)}${periods > 1 ? ` over ${periods} months` : ""} is not the price of a part (${money(expected)})` };
}

const groupOf = (w: WorkOrder): string => (w.subscriptionId !== "" ? w.subscriptionId : `once-${w.key}`);

/**
 * Rule: gives parts to every work order that has none yet, and returns only the ones that changed. `pricesOf` gives the part prices of a framework id
 * (empty when it has none, which leaves its orders alone). A work order with `partsAuto` or `partsFixed` is kept. One marked manual by a person is kept.
 * One that was manual only for lack of a price is looked at again, so adding a price resolves it.
 */
export function applyPartPrices(orders: WorkOrder[], pricesOf: (frameworkId: string) => PartPrice[]): WorkOrder[] {
  const firstReal = new Map<string, string>();
  for (const w of orders) {
    if (w.status === "excluded" || w.legacyUpload === true || w.paidDate === "") continue;
    const g = groupOf(w);
    const have = firstReal.get(g);
    if (have === undefined || w.paidDate < have) firstReal.set(g, w.paidDate);
  }
  // Rule (DECISIONS 114): what a person decided for a gift carries to its later payments of the same amount, so a new instalment does not undo it. A person's
  // parts are passed on as their parts, and a person's manual mark as the same mark.
  const decided = new Map<string, WorkOrder>();
  for (const w of orders) if (w.status !== "excluded" && w.legacyUpload !== true && (w.partsFixed !== undefined || w.partsByPerson === true)) decided.set(groupOf(w), w);
  const changed: WorkOrder[] = [];
  for (const w of orders) {
    if (w.status === "excluded" || w.legacyUpload === true || w.partsFixed !== undefined || w.partsAuto !== undefined || w.partsByPerson === true) continue;
    const prices = pricesOf(w.frameworkId ?? "");
    if (prices.length === 0) continue;
    const before = decided.get(groupOf(w));
    if (before && before.amount === w.amount && (w.partsFixed === undefined)) {
      changed.push(before.partsFixed !== undefined ? { ...w, partsFixed: before.partsFixed } : { ...w, partsManual: before.partsManual ?? "Marked by a person", partsByPerson: true });
      continue;
    }
    const v = derivePartsFor(w, prices, firstReal.get(groupOf(w)) ?? w.paidDate);
    if ("parts" in v) {
      const { partsManual: _m, ...rest } = w;
      changed.push({ ...rest, partsAuto: v.parts });
    } else if (w.partsManual !== v.manual) changed.push({ ...w, partsManual: v.manual });
  }
  return changed;
}

// Rule (DECISIONS 113): a person marks a gift's payment manual, or takes the mark back and lets the price decide again.
export function setManual(w: WorkOrder, manual: boolean, reason = "Marked by a person"): { order: WorkOrder } | { error: string } {
  if (w.status !== "unrouted" && w.status !== "ready") return { error: "Work has already started on this one, or it is excluded, so it cannot be changed." };
  const { partsManual: _m, partsByPerson: _b, partsAuto: _a, ...rest } = w;
  return { order: manual ? { ...rest, partsManual: reason.slice(0, 200), partsByPerson: true } : rest };
}
