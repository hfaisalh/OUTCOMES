/**
 * parts.ts
 *
 * What it does: checks each payment against the prices an item really sells at, and marks a payment at an unknown price for manual allocation
 * (DECISIONS 127). Donors cannot give custom amounts at item level: an item's amounts are set in the CRM catalogue. So the price of one part for one month
 * (the payment divided by its bundle size and by the months it covers) must be a price the catalogue has offered. OUTCOMES learns the valid prices from the
 * gifts themselves and from the catalogue price list, so nothing is typed in and a price change in the CRM needs no change here.
 * Who calls it: the pick-up, the Gifts list read and the price actions (modules/00-platform), the demo (app/main.ts), the Prices page and the Gifts window.
 * Depends on: the work order type only. Pure functions: no database, no screen.
 *
 * Rules (DECISIONS 127, refined by 128):
 * - The unit price of a payment is its amount / bundle size / months covered (months only for a single payment that covers several).
 * - A unit price is NORMAL for an item when it is in the catalogue price list, or has been seen on at least MIN_GIFTS gifts of that item, or a person accepted it.
 *   A person can also reject a price.
 * - A price that is not normal is still treated as the going price of that gift (ASSUMED) as long as it does not look like a custom amount: an earlier or newer
 *   catalogue price (42 when the list now says 48, 40 when it was 35) is not a whole multiple or a simple fraction of a normal price. It is not flagged.
 * - A price that IS a whole multiple (2 or more) or a simple fraction (a half, a third...) of a normal price is UNUSUAL: it looks like an amount somebody chose
 *   (70 for a normal 35, 17.50). It is marked for manual allocation. A rejected price is unusual however often it was seen.
 * - An item with no normal price at all has nothing to compare with, so its gifts are not flagged.
 * - A payment at a normal or assumed price keeps the parts the CRM sent (bundle times quantity). A single payment with no months given that is a whole multiple of a
 *   normal price is unusual, and the months that would make it normal are suggested (300 is 12 months at 25).
 * - A person's own setting (`partsFixed`) always wins and a person can mark any gift manual (`partsManual` with `partsByPerson`).
 * - What a person decided for a gift carries to its later payments of the same amount.
 * - Legacy uploads are left alone: their amount is a placeholder for payments made on the old website.
 */

import { periodsOf, type WorkOrder } from "../01c-crm-connector/work-orders.js";

export const MIN_GIFTS = 3;

export interface PriceKey { itemId: string; price: number }
export interface PriceBook {
  catalogue: Record<string, number[]>; // item code to the prices (one part, one month) in the catalogue price list
  accepted: PriceKey[];
  rejected: PriceKey[];
}
export const emptyBook = (): PriceBook => ({ catalogue: {}, accepted: [], rejected: [] });

const cents = (n: number): number => Math.round(n * 100) / 100;
const money = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const groupOf = (w: WorkOrder): string => (w.subscriptionId !== "" ? w.subscriptionId : `once-${w.key}`);
const isOneOff = (w: WorkOrder): boolean => w.subscriptionId === "" && w.instalmentCount === "";

// Rule: the price of one part for one month, from the payment's amount, its bundle size and the months it covers.
export function unitPrice(w: WorkOrder): number {
  const periods = isOneOff(w) ? periodsOf(w) : 1;
  return cents(w.amount / Math.max(1, w.bundleQty ?? 1) / periods);
}

export interface PriceEntry {
  itemId: string;
  itemName: string;
  price: number;
  gifts: number;
  payments: number;
  first: string; // YYYY-MM-DD
  last: string;
  inCatalogue: boolean;
  accepted: boolean;
  rejected: boolean;
  valid: boolean; // normal: in the catalogue, seen on several gifts, or accepted
  kind: "normal" | "assumed" | "unusual"; // assumed: not normal, but not a multiple or fraction of a normal price, so treated as the going price (DECISIONS 128)
}

const real = (w: WorkOrder): boolean => w.status !== "excluded" && w.legacyUpload !== true && w.paidDate !== "";

// Rule: every price each item was paid at, how many gifts and payments, and whether it is valid. Items in A to Z order, most used price first.
// Rule (DECISIONS 128): does a price look like a whole multiple (2 or more) or a simple fraction of one of the normal prices? Returns the reason, or "".
export function looksCustom(price: number, normal: number[]): string {
  for (const v of normal) {
    if (v <= 0 || price <= 0) continue;
    const up = price / v;
    if (up >= 2 && Math.abs(up - Math.round(up)) <= 0.005 * Math.round(up)) return `${Math.round(up)} times a normal price (${money(v)})`;
    const down = v / price;
    if (down >= 2 && Math.abs(down - Math.round(down)) <= 0.005 * Math.round(down)) return `a ${Math.round(down) === 2 ? "half" : `1/${Math.round(down)}`} of a normal price (${money(v)})`;
  }
  return "";
}

export function priceTable(orders: WorkOrder[], book: PriceBook): PriceEntry[] {
  const by = new Map<string, { itemName: string; prices: Map<number, { gifts: Set<string>; payments: number; first: string; last: string }> }>();
  for (const w of orders.filter(real)) {
    const item = by.get(w.itemId) ?? { itemName: w.itemName, prices: new Map() };
    const p = unitPrice(w);
    const e = item.prices.get(p) ?? { gifts: new Set<string>(), payments: 0, first: "9999-99-99", last: "" };
    e.gifts.add(groupOf(w));
    e.payments++;
    const d = w.paidDate.slice(0, 10);
    if (d < e.first) e.first = d;
    if (d > e.last) e.last = d;
    item.prices.set(p, e);
    by.set(w.itemId, item);
  }
  // A catalogue price no gift has used yet is still listed.
  for (const [itemId, list] of Object.entries(book.catalogue)) {
    const item = by.get(itemId);
    if (!item) continue;
    for (const p of list.map(cents)) if (!item.prices.has(p)) item.prices.set(p, { gifts: new Set(), payments: 0, first: "", last: "" });
  }
  const out: PriceEntry[] = [];
  for (const [itemId, item] of by) {
    for (const [price, e] of item.prices) {
      const inCatalogue = (book.catalogue[itemId] ?? []).map(cents).includes(price);
      const accepted = book.accepted.some((k) => k.itemId === itemId && cents(k.price) === price);
      const rejected = book.rejected.some((k) => k.itemId === itemId && cents(k.price) === price);
      out.push({ itemId, itemName: item.itemName, price, gifts: e.gifts.size, payments: e.payments, first: e.first === "9999-99-99" ? "" : e.first, last: e.last, inCatalogue, accepted, rejected, valid: !rejected && (inCatalogue || accepted || e.gifts.size >= MIN_GIFTS), kind: "assumed" });
    }
  }
  // Classify: a price that is not normal is assumed unless it looks like a multiple or fraction of a normal price of the same item (or it was rejected).
  for (const e of out) {
    const normal = out.filter((x) => x.itemId === e.itemId && x.valid).map((x) => x.price);
    e.kind = e.valid ? "normal" : e.rejected || (normal.length > 0 && looksCustom(e.price, normal) !== "") ? "unusual" : "assumed";
  }
  return out.sort((a, b) => a.itemName.localeCompare(b.itemName) || b.gifts - a.gifts || a.price - b.price);
}

export type Verdict = { ok: true } | { ok: false; reason: string; valid: number[]; months?: number };

// Rule: is this payment at a price to be flagged? Normal and assumed prices are not. When it is unusual, why, and for a single payment with no months given, the
// months that would make it normal.
export function judgePayment(w: WorkOrder, table: PriceEntry[]): Verdict {
  const forItem = table.filter((e) => e.itemId === w.itemId);
  const normal = forItem.filter((e) => e.valid).map((e) => e.price).sort((a, b) => a - b);
  if (normal.length === 0) return { ok: true }; // nothing to compare it with
  const p = unitPrice(w);
  const entry = forItem.find((e) => e.price === p);
  if (entry ? entry.kind !== "unusual" : looksCustom(p, normal) === "") return { ok: true };
  const why = entry?.rejected ? "A price that was rejected" : `A custom amount: ${looksCustom(p, normal)}`;
  let months: number | undefined;
  if (isOneOff(w) && periodsOf(w) === 1) {
    for (const v of [...forItem].filter((e) => e.valid).sort((a, b) => b.gifts - a.gifts).map((e) => e.price)) {
      const m = w.amount / (Math.max(1, w.bundleQty ?? 1) * v);
      if (Number.isInteger(cents(m)) && m >= 2 && m <= 36) { months = m; break; }
    }
  }
  return { ok: false, reason: `${why}. ${money(p)} a part a month. Prices seen for this item: ${normal.map(money).join(", ")}`, valid: normal, ...(months !== undefined ? { months } : {}) };
}

/**
 * Rule: marks every work order at an unknown price for manual allocation, and takes the mark off one that is now at a valid price. Returns only what changed.
 * A person's setting, or a manual mark a person made, is never touched. What a person decided for a gift carries to its later payments of the same amount.
 */
export function applyPrices(orders: WorkOrder[], book: PriceBook): WorkOrder[] {
  const table = priceTable(orders, book);
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
    const v = judgePayment(w, table);
    if (v.ok) {
      if (w.partsManual !== undefined || w.partsAuto !== undefined) {
        const { partsManual: _m, partsAuto: _a, ...rest } = w;
        changed.push(rest);
      }
    } else if (w.partsManual !== v.reason) {
      const { partsAuto: _a, ...rest } = w;
      changed.push({ ...rest, partsManual: v.reason });
    }
  }
  return changed;
}

// Rule (DECISIONS 113): a person marks a gift's payment manual, or takes the mark back and lets the prices decide again.
export function setManual(w: WorkOrder, manual: boolean, reason = "Marked by a person"): { order: WorkOrder } | { error: string } {
  if (w.status !== "unrouted" && w.status !== "ready") return { error: "Work has already started on this one, or it is excluded, so it cannot be changed." };
  const { partsManual: _m, partsByPerson: _b, partsAuto: _a, ...rest } = w;
  return { order: manual ? { ...rest, partsManual: reason.slice(0, 200), partsByPerson: true } : rest };
}

// Rule: add a price a person accepted, or one they rejected. Either replaces any earlier choice for the same item and price.
export function choosePrice(book: PriceBook, itemId: string, price: number, choice: "accept" | "reject" | "clear"): PriceBook {
  const p = cents(price);
  const keep = (list: PriceKey[]) => list.filter((k) => !(k.itemId === itemId && cents(k.price) === p));
  return { ...book, accepted: choice === "accept" ? [...keep(book.accepted), { itemId, price: p }] : keep(book.accepted), rejected: choice === "reject" ? [...keep(book.rejected), { itemId, price: p }] : keep(book.rejected) };
}
