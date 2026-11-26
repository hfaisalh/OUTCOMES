/**
 * stock.ts
 *
 * What it does: parked outcomes (DECISIONS 209), also called stock. A partner may load, ahead of any gift, the outcomes it is ready to deliver for a benefit where the gift comes first or there is no beneficiary
 * (a pump site, a house plot, a mosque): each has a name, a benefit, a project, a cluster and a partner. When a gift for that benefit is assigned to the partner, it takes one parked outcome instead of making a new one.
 * Who calls it: placement.ts (a gift takes a parked outcome), assignment.ts (a partner with stock has that much capacity), the cluster window and the Assignment page. Depends on: nothing but its own types.
 * Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: a parked outcome belongs to one partner, in one cluster of one project, for one benefit. It is free until a gift takes it, then it is used (by the outcome made from that gift) until that placement ends.
 * - Rule: a gift takes the oldest free parked outcome of its partner for the same benefit, in the gift's project when it has one. With none free, a new outcome is made from the gift as before.
 * - Rule: a parked outcome that has been used cannot be removed. A free one can.
 * - Rule: a partner that has parked outcomes for a benefit has that many units of capacity for it, and is full once they are all used.
 */

export interface StockItem {
  id: string; // STK-0001, permanent
  partnerId: string;
  giftProjectId: string;
  clusterId: string; // the cluster it is parked in, "" for the project as a whole
  itemId: string; // the benefit
  name: string; // what the partner calls it, for example "Hand pump, Chak 5 village"
  at: string; // ISO time it was loaded
}

interface Holder { stock?: StockItem[]; stockCounter?: number }
type Result<T extends Holder> = { value: T } | { error: string };

// The parked outcomes that a gift's placement is holding now: the ids named by active placements.
export const usedStock = (records: { stockId?: string; to?: string }[]): Set<string> => new Set(records.filter((p) => p.stockId !== undefined && p.to === undefined).map((p) => p.stockId as string));

// The free parked outcome a gift would take, or undefined. `taken` holds those already used or already promised in the same run.
export function freeStock(stock: StockItem[], taken: Set<string>, partnerId: string, itemId: string, giftProjectId: string): StockItem | undefined {
  return stock.filter((s) => s.partnerId === partnerId && s.itemId === itemId && (giftProjectId === "" || s.giftProjectId === giftProjectId) && !taken.has(s.id)).sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id))[0];
}

// How many parked outcomes a partner has for a benefit (free and used), in the gift's project when it has one, else in any.
export const stockCount = (stock: StockItem[], partnerId: string, itemId: string, giftProjectId: string): number => stock.filter((s) => s.partnerId === partnerId && s.itemId === itemId && (giftProjectId === "" || s.giftProjectId === giftProjectId)).length;

export function addStock<T extends Holder>(existing: T, a: { partnerId: string; giftProjectId: string; clusterId: string; itemId: string; name: string }, at: string): Result<T> {
  const name = a.name.trim().slice(0, 120);
  if (name === "") return { error: "Give the outcome a name, for example the village or the site." };
  if (a.partnerId === "") return { error: "Choose the partner that will deliver it." };
  if (a.itemId === "") return { error: "Choose the benefit it is for." };
  const counter = (existing.stockCounter ?? 0) + 1;
  const item: StockItem = { id: `STK-${String(counter).padStart(4, "0")}`, partnerId: a.partnerId, giftProjectId: a.giftProjectId, clusterId: a.clusterId, itemId: a.itemId, name, at };
  return { value: { ...existing, stock: [...(existing.stock ?? []), item], stockCounter: counter } };
}

// A parked outcome that a gift has taken cannot be removed. `used` is usedStock(...) of the placements.
export function removeStock<T extends Holder>(existing: T, id: string, used: Set<string>): Result<T> {
  if (!(existing.stock ?? []).some((s) => s.id === id)) return { error: "That parked outcome was not found." };
  if (used.has(id)) return { error: "A gift has taken that outcome, so it cannot be removed." };
  return { value: { ...existing, stock: (existing.stock ?? []).filter((s) => s.id !== id) } };
}
