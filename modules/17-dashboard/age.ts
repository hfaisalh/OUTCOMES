/**
 * age.ts
 *
 * What it does: the "age against stage" measure of the Dashboard (DECISIONS 311). For every gift it works out how far along the journey it is (its stage) and how old it is, measured against ONE target for the whole organisation (days to complete), and counts the gifts in each stage and age band so they can be drawn as a scatter of numbers.
 * Who calls it: app/dashboard/scatter-chart.ts and the tests. Depends on: the GiftLife dates in trends.ts. Pure: gifts in, counts out, so it can be ported (CLAUDE.md rule 4).
 * Data flow: gifts with dates + today + a target in days -> a count for each stage and age band, each with a tone, and the totals.
 *
 * Rules:
 * - Rule: the stage is the furthest step the gift has taken: Paid, Assigned, Confirmed, Allocated, Delivered, Complete.
 * - Rule: the age of a gift that is complete is the days from payment to completion; the age of any other gift is the days from payment to today.
 * - Rule: age is read against the target, in quarters of it, plus "over target". The same stage-for-age rule then fits every benefit and project, whatever its own deadline: 25% of the target should have reached Assigned, 50% Confirmed, 75% Allocated, and a gift past the target should be Complete.
 * - Rule: a gift at or beyond the stage its age asks for is "on pace", before it is "behind pace", past the target and not complete is "past target", and complete after the target is "completed late".
 */

import type { GiftLife } from "./trends.js";

// --- Stages and age bands ---
export const STAGES = ["Paid", "Assigned", "Confirmed", "Allocated", "Delivered", "Complete"] as const;
export const BANDS = 5; // four quarters of the target, then over the target
export const TARGETS = [30, 60, 90, 120, 180];
export type Tone = "ok" | "behind" | "over" | "late";
export const TONES: { id: Tone; label: string }[] = [{ id: "ok", label: "On pace" }, { id: "behind", label: "Behind pace" }, { id: "over", label: "Past target, not complete" }, { id: "late", label: "Completed late" }];

const DAY = 86400000;
const daysBetween = (a: string, b: string): number => Math.max(0, Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY));

export function stageOf(g: GiftLife): number {
  return g.completedAt ? 5 : g.deliveredAt ? 4 : g.allocatedAt ? 3 : g.confirmedAt ? 2 : g.assignedAt ? 1 : 0;
}
export const ageOf = (g: GiftLife, today: string): number => daysBetween(g.paidAt, g.completedAt ?? today);

// The band of an age: 0 to 3 are the quarters of the target (the last quarter includes the target day itself), 4 is over it.
export const bandOf = (age: number, target: number): number => (age > target ? 4 : Math.min(3, Math.floor((age / target) * 4)));
// The stage a gift of that band should have reached.
export const expectedStage = (band: number): number => Math.floor((band / 4) * 5);
export function toneOf(stage: number, band: number): Tone {
  if (band === BANDS - 1) return stage === 5 ? "late" : "over";
  return stage >= expectedStage(band) ? "ok" : "behind";
}
// "0 to 22 days", "23 to 44 days", ... "Over 90 days". Each quarter holds the ages from its start up to, but not including, the next quarter's start; the last quarter also holds the target day.
export function bandLabel(band: number, target: number): string {
  if (band === BANDS - 1) return `Over ${target} days`;
  const from = Math.ceil((band * target) / 4), to = band === 3 ? target : Math.ceil(((band + 1) * target) / 4) - 1;
  return `${from} to ${to} days`;
}

// --- The counts ---
export interface Cell { stage: number; band: number; count: number; tone: Tone }
export interface AgeScatter { target: number; cells: Cell[]; total: number; byTone: Record<Tone, number> }

export function ageScatter(gifts: GiftLife[], today: string, target: number): AgeScatter {
  const counts = new Map<string, number>();
  const byTone: Record<Tone, number> = { ok: 0, behind: 0, over: 0, late: 0 };
  for (const g of gifts) {
    const stage = stageOf(g), band = bandOf(ageOf(g, today), target);
    counts.set(`${stage}|${band}`, (counts.get(`${stage}|${band}`) ?? 0) + 1);
    byTone[toneOf(stage, band)] += 1;
  }
  const cells = [...counts].map(([k, count]) => { const [s, b] = k.split("|").map(Number) as [number, number]; return { stage: s, band: b, count, tone: toneOf(s, b) }; });
  return { target, cells, total: gifts.length, byTone };
}
