/**
 * timeline.ts
 *
 * What it does: the time a benefit has to be fulfilled, and when a gift's journey starts (DECISIONS 316, which replaces the first version in 314). The journey start comes from the workflow, not from the item: a workflow that releases only when fully paid starts the journey at full payment, any other starts it at the first payment, and a single payment starts it the day it is paid. The item holds just one number: the days a gift of that benefit has to be fulfilled, counted from the journey start.
 * Who calls it: the Benefits page (app/setup/benefits-page.ts), the server and demo (item-timeline action), the partner details (modules/13-partner-portal/gift-details.ts) and the Dashboard (app/dashboard/trends-data.ts). Depends on: categories.ts (the instalment rule type). Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a single (one-off) payment starts its journey the day it is paid: it is paid in full at once.
 * - Rule: a workflow that releases only when fully paid (instalment rule "share_of_whole") starts the journey when the last payment of the plan is made, so until then the gift has not started. A plan with no end can never be paid in full. Any other workflow starts the journey at the first payment.
 * - Rule: the days to fulfil a gift are the item's own number, else a default of the organisation. What counts as fulfilled (allocated, delivered or complete) is set on the workflow, and what happens after that (reports that repeat) is left to the workflow.
 */

import type { InstalmentRule } from "./categories.js";

// --- The item's own number ---
export interface ItemTimeline { days?: number }
export type ItemTimelines = Record<string, ItemTimeline>; // by item id
export const DEFAULT_DAYS = 90;
export const MAX_DAYS = 3650;
export const daysOf = (own: ItemTimelines | undefined, itemId: string, fallback = DEFAULT_DAYS): number => own?.[itemId]?.days ?? fallback;

// Sets the days of an item. An empty number takes the item's own back, so the default applies.
export function setItemTimeline(own: ItemTimelines, itemId: string, part: unknown, value: unknown): { value: ItemTimelines } | { error: string } {
  if (itemId === "") return { error: "Choose an item." };
  if (part !== "days") return { error: "Choose what to set." };
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const { [itemId]: _gone, ...rest } = own;
  if (raw === "" || raw === "0") return { value: rest };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) return { error: `The days to fulfil a gift are a whole number from 1 to ${MAX_DAYS}.` };
  return { value: { ...rest, [itemId]: { days: n } } };
}

// --- When a gift's journey starts ---
// `paid` are the dates the gift's payments were made, oldest first. `planned` is the number of payments in the plan: 1 for a single payment, "open" for a plan with no end, null when not known.
export interface GiftPayments { paid: string[]; planned: number | "open" | null }
export function journeyStart(rule: InstalmentRule | undefined, g: GiftPayments): string | null {
  if (g.paid.length === 0) return null;
  if (g.planned === 1) return g.paid[0] as string; // a single payment starts at once
  if (rule !== "share_of_whole") return g.paid[0] as string;
  if (typeof g.planned === "number" && g.paid.length >= g.planned) return g.paid[g.planned - 1] as string;
  return null; // not paid in full yet
}
