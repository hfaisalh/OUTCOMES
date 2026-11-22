/**
 * filter.ts
 *
 * What it does: narrows the list of work orders by what a person types or picks: free text, item,
 * category, one-off or recurring, and paid dates.
 * Who calls it: the Work orders page (app/main.ts). Depends on: work-orders.ts types only.
 * Pure function: no database, no screen, so it can be ported as it is.
 *
 * Rule: every box that is filled in must match (AND). An empty box matches everything. Text is matched
 * ignoring case against the line id, order reference, supporter name and id, group, item, and subscription.
 */

import type { WorkOrder } from "./work-orders.js";

export interface Criteria {
  text: string;
  itemId: string; // "" for any item
  categoryId: string; // "" for any category
  status: string; // "" for any status, or a work order status such as "ready", "unrouted", "excluded"
  kind: "any" | "recurring" | "oneoff" | "custom"; // custom: a payment marked for manual allocation (DECISIONS 113)
  legacy: "" | "only" | "hide"; // legacy uploads: all, only them, or without them (DECISIONS 55)
  from: string; // paid on or after, "YYYY-MM-DD" or ""
  to: string; // paid on or before, "YYYY-MM-DD" or ""
}

export const NO_CRITERIA: Criteria = { text: "", itemId: "", categoryId: "", status: "", kind: "any", legacy: "", from: "", to: "" };

export const isFiltering = (c: Criteria): boolean => c.text.trim() !== "" || c.itemId !== "" || c.categoryId !== "" || c.status !== "" || c.kind !== "any" || c.legacy !== "" || c.from !== "" || c.to !== "";

export function filterWorkOrders(orders: WorkOrder[], c: Criteria): WorkOrder[] {
  const words = c.text.toLowerCase().split(/\s+/).filter((x) => x !== "");
  return orders.filter((w) => {
    if (c.itemId !== "" && w.itemId !== c.itemId) return false;
    if (c.legacy === "only" && w.legacyUpload !== true) return false;
    if (c.legacy === "hide" && w.legacyUpload === true) return false;
    if (c.categoryId !== "" && w.categoryId !== c.categoryId) return false;
    if (c.status !== "" && w.status !== c.status) return false;
    // Rule: recurring means the line belongs to a subscription.
    if (c.kind === "recurring" && w.subscriptionId === "") return false;
    if (c.kind === "oneoff" && w.subscriptionId !== "") return false;
    if (c.kind === "custom" && (w.partsManual === undefined || w.partsFixed !== undefined)) return false;
    const day = w.paidDate.slice(0, 10);
    if (c.from !== "" && (day === "" || day < c.from)) return false;
    if (c.to !== "" && (day === "" || day > c.to)) return false;
    if (words.length > 0) {
      const hay = [w.key, w.transactionRef, w.supporterName, w.supporterId, w.group, w.itemName, w.subscriptionId].join(" ").toLowerCase();
      if (!words.every((x) => hay.includes(x))) return false;
    }
    return true;
  });
}
