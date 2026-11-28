/**
 * timeline.ts
 *
 * What it does: the timeline of a benefit (DECISIONS 314): when a gift's journey starts and how long its outcome lives. It belongs to the ITEM, because one workflow can hold several items on different payment terms. The workflow's instalment rule gives the starting default, so only an item that differs needs setting.
 * Who calls it: the Benefits page (app/setup/benefits-page.ts), the server and demo (item-timeline action), and the Dashboard trends (app/dashboard/trends-data.ts). Depends on: categories.ts (the instalment rule type). Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a single (one-off) payment starts its journey the day it is paid, whatever the item says: it is paid in full at once.
 * - Rule: "first" starts the journey at the first payment of a plan. "full" starts it only when every payment of the plan is made; until then the gift has not started. A plan with no end can never be paid in full, so it never starts under "full".
 * - Rule: life is how long the outcome lasts. "delivery": until it is delivered. "term": until the end of the payment plan. "open": with no end. A recurring gift whose life is not "delivery" is ongoing, so it is never measured against a target to complete.
 * - Rule: the default follows the workflow's instalment rule. A unit that is a whole item (pump, house) starts on full payment and ends on delivery. A unit that is one period (sponsorship) starts on the first payment and lasts for the term.
 */

import type { InstalmentRule } from "./categories.js";

// --- Types and words ---
export type Start = "first" | "full";
export type Life = "delivery" | "term" | "open";
export interface Timeline { start: Start; life: Life }
export type ItemTimelines = Record<string, Partial<Timeline>>; // an item's own choices, by item id
export const START_LABELS: Record<Start, string> = { first: "First payment", full: "Full payment" };
export const LIFE_LABELS: Record<Life, string> = { delivery: "Until delivered", term: "Until the plan ends", open: "No end" };

// --- Defaults and the item's own choice ---
export const defaultTimeline = (rule: InstalmentRule | undefined): Timeline => (rule === "share_of_whole" ? { start: "full", life: "delivery" } : { start: "first", life: "term" });
export const timelineOf = (own: Record<string, Partial<Timeline>> | undefined, itemId: string, rule: InstalmentRule | undefined): Timeline => ({ ...defaultTimeline(rule), ...(own?.[itemId] ?? {}) });

// Sets one part of an item's timeline. An empty value takes the item's own choice for that part back, so the workflow's default applies.
export function setItemTimeline(own: Record<string, Partial<Timeline>>, itemId: string, part: unknown, value: unknown): { value: Record<string, Partial<Timeline>> } | { error: string } {
  if (itemId === "") return { error: "Choose an item." };
  if (part !== "start" && part !== "life") return { error: "Choose what to set." };
  const v = typeof value === "string" ? value : "";
  const ok = part === "start" ? ["first", "full"] : ["delivery", "term", "open"];
  if (v !== "" && !ok.includes(v)) return { error: "That choice is not known." };
  const cur: Partial<Timeline> = { ...(own[itemId] ?? {}) };
  if (v === "") delete cur[part]; else (cur as Record<string, string>)[part] = v;
  const { [itemId]: _gone, ...rest } = own;
  return { value: Object.keys(cur).length === 0 ? rest : { ...rest, [itemId]: cur } };
}

// --- Applying it to one gift ---
// `paid` are the dates the gift's payments were made, oldest first. `planned` is the number of payments in the plan: 1 for a single payment, "open" for a plan with no end, null when not known.
export interface GiftPayments { paid: string[]; planned: number | "open" | null }
export function journeyStart(t: Timeline, g: GiftPayments): string | null {
  if (g.paid.length === 0) return null;
  if (g.planned === 1) return g.paid[0] as string; // a single payment starts at once
  if (t.start === "first") return g.paid[0] as string;
  if (typeof g.planned === "number" && g.paid.length >= g.planned) return g.paid[g.planned - 1] as string;
  return null; // not paid in full yet
}
export const isOngoing = (t: Timeline, g: GiftPayments): boolean => g.planned !== 1 && t.life !== "delivery";
