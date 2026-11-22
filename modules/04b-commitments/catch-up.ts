/**
 * catch-up.ts
 *
 * What it does: finds recurring payments that look like a catch-up (one payment that covers more than one instalment, for example a failed month
 * taken together with the next), works out which months it fills, and counts the months a gift has paid when some payments cover more than one (DECISIONS 84).
 * Who calls it: commitments.ts (paid months and paid count), gifts.ts (the suggestion on a gift) and the Gifts page.
 * Depends on: the work order type and lineValue only. Pure functions: no database, no screen. OUTCOMES's own suggestion method, no AI, so it is
 * explainable and can be ported to Apex.
 *
 * Rules:
 * - A payment covers 1 instalment unless a person says otherwise (`covers` on the work order). 1 set by a person means "checked, it is a normal payment".
 * - A suggestion is made only for a payment nobody has checked yet. The usual value is the value that most of the gift's payments share, and it needs
 *   at least two payments with that value. A payment worth 2 to 6 times the usual value, within 2 percent, is suggested as a catch-up covering that many.
 * - Which months a catch-up fills (Faisal, DECISIONS 84): a gap before it comes first, nearest the payment first. With no gap it covers the month
 *   before, and the one before that, and so on. It never fills a month another payment already covers.
 * - A suggestion changes nothing. A person applies it or dismisses it.
 */

import { lineValue, type WorkOrder } from "../01c-crm-connector/work-orders.js";

// Rule (DECISIONS 96): an amount in words has no decimals when it is whole (70), and two when it is not (17.50).
const plain = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export const monthOf = (paidDate: string): string => paidDate.slice(0, 7);

// Month arithmetic on "YYYY-MM".
export function plusMonths(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// Rule: the months a catch-up fills. Gaps between the earliest paid month and this one first (nearest first), then the months before the earliest.
export function fillMonths(month: string, extra: number, taken: Set<string>): string[] {
  const earlier = [...taken].filter((m) => m < month).sort();
  const earliest = earlier[0] ?? month;
  const out: string[] = [];
  for (let m = plusMonths(month, -1); m >= earliest && out.length < extra; m = plusMonths(m, -1)) if (!taken.has(m)) out.push(m);
  for (let m = plusMonths(earliest, -1); out.length < extra; m = plusMonths(m, -1)) if (!taken.has(m)) out.push(m);
  return out.sort();
}

const real = (payments: WorkOrder[]): WorkOrder[] => payments.filter((w) => w.status !== "excluded" && w.legacyUpload !== true && w.paidDate !== "").sort((a, b) => a.paidDate.localeCompare(b.paidDate) || a.key.localeCompare(b.key));

/**
 * Rule: the months each payment covers. Every payment covers the month it was paid in. One that covers more also fills earlier months (see fillMonths).
 * Returns the months for each payment key, and all months together.
 */
export function coverage(payments: WorkOrder[]): { byKey: Map<string, string[]>; months: string[]; filled: string[] } {
  const list = real(payments);
  const taken = new Set(list.map((w) => monthOf(w.paidDate)));
  const byKey = new Map<string, string[]>();
  const filled: string[] = [];
  for (const w of list) {
    const own = monthOf(w.paidDate);
    const extra = Math.max(0, (w.covers ?? 1) - 1);
    const fills = extra > 0 ? fillMonths(own, extra, taken) : [];
    for (const m of fills) { taken.add(m); filled.push(m); }
    byKey.set(w.key, [...fills, own].sort());
  }
  return { byKey, months: [...taken].sort(), filled: filled.sort() };
}

export interface CatchUp {
  key: string; // the payment
  covers: number; // instalments it seems to cover
  fills: string[]; // the months it would fill besides its own, YYYY-MM
  value: number;
  usual: number;
  reason: string; // in plain words
}

// Rule: the value most payments share, when at least two do. 0 when there is none.
function usualValue(list: WorkOrder[]): number {
  const counts = new Map<number, number>();
  for (const w of list) {
    const v = Math.round(lineValue(w) * 100) / 100;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 1;
  for (const [v, n] of counts) if (n > bestCount || (n === bestCount && n > 1 && v < best)) { best = v; bestCount = n; }
  return best;
}

export function suggestCatchUps(payments: WorkOrder[]): CatchUp[] {
  const list = real(payments);
  const usual = usualValue(list);
  if (usual <= 0) return [];
  const out: CatchUp[] = [];
  for (const w of list) {
    if (w.covers !== undefined) continue; // a person has already decided
    const value = Math.round(lineValue(w) * 100) / 100;
    const k = Math.round(value / usual);
    if (k < 2 || k > 6 || Math.abs(value - k * usual) > 0.02 * usual * k) continue;
    // The months are worked out as if the person applied it: every other payment, and every earlier decision, counts.
    const others = list.filter((x) => x.key !== w.key);
    const taken = new Set(coverage(others).months);
    out.push({ key: w.key, covers: k, fills: fillMonths(monthOf(w.paidDate), k - 1, taken), value, usual, reason: `${plain(value)} is ${k} times the usual ${plain(usual)}` });
  }
  return out;
}

// Rule: a person says how many instalments a payment covers. 1 to 6, and only whole numbers.
export function setCovers(w: WorkOrder, covers: number): { order: WorkOrder } | { error: string } {
  if (!Number.isInteger(covers) || covers < 1 || covers > 6) return { error: "A payment covers 1 to 6 instalments." };
  if (w.status !== "unrouted" && w.status !== "ready") return { error: "Work has already started on this one, or it is excluded, so it cannot be changed." };
  return { order: { ...w, covers } };
}

// Rule (DECISIONS 86): a person says they have checked what a gift's Needs a look notes say. The text kept is the notes themselves, so a new problem reopens it.
export function setLooked(w: WorkOrder, looked: string): { order: WorkOrder } | { error: string } {
  if (looked.length > 400) return { error: "That is too long." };
  if (w.status === "excluded") return { error: "That payment is excluded." };
  const { looked: _old, ...rest } = w;
  return { order: looked === "" ? rest : { ...rest, looked } };
}

export interface PartFix {
  key: string; // the payment
  parts: number; // the parts the line total fits
  sent: number; // the parts the CRM's quantity gives
  unit: number; // the unit price on this line
  usualUnit: number; // the unit price most payments share
  reason: string;
}

/**
 * Rule (DECISIONS 87): a payment whose quantity looks wrong. Most payments of a gift share one unit price. A line at a different unit price whose total
 * fits a whole number of the usual unit gets that many parts suggested instead (35 for 2 units at 17.50 each fits 1 part at 35). The usual unit price
 * needs at least two payments, and on a tie the higher price is the usual one, since a part-price line is the odd one. Only a suggestion.
 * A payment a person has already set (partsFixed) is not suggested again.
 */
export function suggestPartFixes(payments: WorkOrder[]): PartFix[] {
  const list = real(payments);
  const counts = new Map<number, number>();
  for (const w of list) counts.set(w.amount, (counts.get(w.amount) ?? 0) + 1);
  let usual = 0;
  let best = 1;
  for (const [u, n] of counts) if (n > best || (n === best && n > 1 && u > usual)) { usual = u; best = n; }
  if (usual <= 0) return [];
  const out: PartFix[] = [];
  for (const w of list) {
    if (w.partsFixed !== undefined || (w.covers ?? 1) > 1 || w.amount === usual) continue; // a catch-up is its own question (see suggestCatchUps)
    const value = lineValue(w);
    const k = Math.round(value / usual);
    const sent = (w.bundleQty ?? 1) * w.quantity;
    if (k < 1 || Math.abs(value - k * usual) > 0.02 * usual * k || k === sent) continue;
    out.push({ key: w.key, parts: k, sent, unit: w.amount, usualUnit: usual, reason: `${plain(value)} for ${sent} at ${plain(w.amount)} each, but the usual price is ${plain(usual)} each, so it fits ${k}` });
  }
  return out;
}

// Rule: a person sets the parts of a payment, 1 to 20. Setting what the CRM sent confirms it is right, so it is not suggested again.
export function setParts(w: WorkOrder, parts: number): { order: WorkOrder } | { error: string } {
  if (!Number.isInteger(parts) || parts < 1 || parts > 20) return { error: "Parts are a whole number from 1 to 20." };
  if (w.status !== "unrouted" && w.status !== "ready") return { error: "Work has already started on this one, or it is excluded, so it cannot be changed." };
  return { order: { ...w, partsFixed: parts } };
}
