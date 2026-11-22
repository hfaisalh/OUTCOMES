/**
 * parts.ts
 *
 * What it does: the parts of a gift, and the gifts that need a person (DECISIONS 129). An item's price is fixed in the CRM catalogue, so a payment of an item is a
 * unit whatever its price is today or was before: its parts are what the CRM sent (the bundle size times the quantity). Nothing about prices is checked or
 * assumed here. The only gifts managed by hand are **custom amount** gifts: the CRM has an item for them (its price is "Donor chooses the amount"), so they are not
 * tied to a catalogue item. A person decides what to do with each: choose its parts and allocate it, or exclude it from project management.
 * Who calls it: the pick-up, the Gifts list read and the setup save (modules/00-platform), the demo (app/main.ts) and the Gifts window. Pure functions.
 *
 * Rules:
 * - A work order from a custom amount item is marked for manual allocation. Automatic allocation never places it.
 * - A person's own setting (`partsFixed`) always wins, and a person can mark any gift manual (`partsManual` with `partsByPerson`).
 * - What a person decided for a gift carries to its later payments of the same amount.
 * - Legacy uploads are left alone: their amount is a placeholder for payments made on the old website.
 */

import type { WorkOrder } from "../01c-crm-connector/work-orders.js";

export const CUSTOM_AMOUNT_REASON = "A custom amount: the donor chose the amount, so it is not tied to a catalogue item";

const real = (w: WorkOrder): boolean => w.status !== "excluded" && w.legacyUpload !== true && w.paidDate !== "";
const groupOf = (w: WorkOrder): string => (w.subscriptionId !== "" ? w.subscriptionId : `once-${w.key}`);

/**
 * Rule: marks every work order from a custom amount item for manual allocation, and takes the mark off one that is not (the item was changed in the CRM).
 * A person's setting, or a manual mark a person made, is never touched. What a person decided for a gift carries to its later payments of the same amount.
 * Returns only what changed.
 */
export function markCustomAmounts(orders: WorkOrder[]): WorkOrder[] {
  const decided = new Map<string, WorkOrder>();
  for (const w of orders) if (real(w) && (w.partsFixed !== undefined || w.partsByPerson === true)) decided.set(groupOf(w), w);
  const changed: WorkOrder[] = [];
  for (const w of orders) {
    if (!real(w) || w.partsFixed !== undefined || w.partsByPerson === true) continue;
    const before = decided.get(groupOf(w));
    if (before && before.amount === w.amount) {
      changed.push(before.partsFixed !== undefined ? { ...w, partsFixed: before.partsFixed } : { ...w, partsManual: before.partsManual ?? "Marked by a person", partsByPerson: true });
      continue;
    }
    if (w.customAmount === true) {
      if (w.partsManual !== CUSTOM_AMOUNT_REASON) { const { partsAuto: _a, ...rest } = w; changed.push({ ...rest, partsManual: CUSTOM_AMOUNT_REASON }); }
    } else if (w.partsManual !== undefined || w.partsAuto !== undefined) {
      const { partsManual: _m, partsAuto: _a, ...rest } = w; // an older rule marked it, or the item is no longer a custom amount item
      changed.push(rest);
    }
  }
  return changed;
}

// Rule (DECISIONS 113): a person marks a gift's payment manual, or takes the mark back.
export function setManual(w: WorkOrder, manual: boolean, reason = "Marked by a person"): { order: WorkOrder } | { error: string } {
  if (w.status !== "unrouted" && w.status !== "ready") return { error: "Work has already started on this one, or it is excluded, so it cannot be changed." };
  const { partsManual: _m, partsByPerson: _b, partsAuto: _a, ...rest } = w;
  return { order: manual ? { ...rest, partsManual: reason.slice(0, 200), partsByPerson: true } : rest };
}
