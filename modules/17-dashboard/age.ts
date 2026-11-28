/**
 * age.ts
 *
 * What it does: the "age against stage" measure of the Dashboard (DECISIONS 311, reworked in 316). For every gift it works out how far along the journey it is (its stage) and how old it is, measured against the days its benefit has to be fulfilled, and counts the gifts in each stage and age band so they can be drawn as a scatter of numbers.
 * Who calls it: app/dashboard/scatter-chart.ts, app/dashboard/scatter-open.ts and the tests. Depends on: the GiftLife dates in trends.ts. Pure: gifts in, counts out, so it can be ported (CLAUDE.md rule 4).
 * Data flow: gifts with dates + today + a default number of days -> a count for each stage and age band, each with a tone, and the totals.
 *
 * Rules:
 * - Rule: the stage is the furthest step the gift has taken: Paid, Assigned, Confirmed, Allocated, Delivered, Complete.
 * - Rule: a gift is fulfilled once it reaches the stage its workflow calls fulfilled (allocated for a sponsorship, complete for a build). What the workflow does after that, such as reports that repeat, is not measured here.
 * - Rule: age counts from the start of the journey (the workflow says whether that is the first or the full payment) to the day the gift was fulfilled, or to today while it is not. A gift not started yet (waiting for full payment) is counted apart and not placed on the chart.
 * - Rule: age is read against the days its benefit has to be fulfilled, in quarters of them, plus "over". So every benefit reads the same way whatever its own time: by a quarter of the time a gift should be a quarter of the way to its fulfilled stage, and so on, and a gift past its time should be fulfilled.
 * - Rule: a gift at or beyond the stage its age asks for is "on pace"; behind that is "behind pace"; past its time and not fulfilled is "past target"; fulfilled after its time is "completed late". A bubble takes the worst tone of the gifts in it.
 */

import { DEFAULT_DAYS } from "../02-project-rules/timeline.js";
import type { GiftLife } from "./trends.js";

// --- Stages and age bands ---
export const STAGES = ["Paid", "Assigned", "Confirmed", "Allocated", "Delivered", "Complete"] as const;
export const BANDS = 5; // four quarters of the time, then over it
export const TARGETS = [30, 60, 90, 120, 180];
export type Tone = "ok" | "behind" | "over" | "late";
export const TONES: { id: Tone; label: string }[] = [{ id: "ok", label: "On pace" }, { id: "behind", label: "Behind pace" }, { id: "over", label: "Past target, not fulfilled" }, { id: "late", label: "Fulfilled late" }];
const WORST: Tone[] = ["over", "behind", "late", "ok"]; // the order a bubble takes its tone in

const DAY = 86400000;
const daysBetween = (a: string, b: string): number => Math.max(0, Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY));

export function stageOf(g: GiftLife): number {
  return g.completedAt ? 5 : g.deliveredAt ? 4 : g.allocatedAt ? 3 : g.confirmedAt ? 2 : g.assignedAt ? 1 : 0;
}
export const fulfilledStageOf = (g: GiftLife): number => g.fulfilledStage ?? 5;
export const isFulfilled = (g: GiftLife): boolean => stageOf(g) >= fulfilledStageOf(g);
export const targetOf = (g: GiftLife, fallback: number): number => g.targetDays ?? fallback;
export const ageOf = (g: GiftLife, today: string): number => daysBetween(g.startAt ?? g.paidAt, isFulfilled(g) ? g.fulfilledAt ?? g.completedAt ?? today : today);

// The band of an age: 0 to 3 are the quarters of the time (the last quarter includes the last day itself), 4 is over it.
export const bandOf = (age: number, target: number): number => (age > target ? 4 : Math.min(3, Math.floor((age / target) * 4)));
// The stage a gift of that band should have reached on its way to its fulfilled stage.
export const expectedStage = (band: number, fulfilled = 5): number => Math.floor((band / 4) * fulfilled);
export function toneOf(stage: number, band: number, fulfilled = 5): Tone {
  if (band === BANDS - 1) return stage >= fulfilled ? "late" : "over";
  return stage >= expectedStage(band, fulfilled) ? "ok" : "behind";
}
export const giftBand = (g: GiftLife, today: string, fallback: number): number => bandOf(ageOf(g, today), targetOf(g, fallback));
// "0 to 22 days", "23 to 44 days", ... "Over 90 days".
export function bandLabel(band: number, target: number): string {
  if (band === BANDS - 1) return `Over ${target} days`;
  const from = Math.ceil((band * target) / 4), to = band === 3 ? target : Math.ceil(((band + 1) * target) / 4) - 1;
  return `${from} to ${to} days`;
}

// --- The counts ---
export interface Cell { stage: number; band: number; count: number; tone: Tone }
export interface AgeScatter { target: number | null; cells: Cell[]; total: number; byTone: Record<Tone, number>; notStarted: number; paceTo: number }

export function ageScatter(gifts: GiftLife[], today: string, fallback = DEFAULT_DAYS): AgeScatter {
  const cells = new Map<string, Cell>();
  const byTone: Record<Tone, number> = { ok: 0, behind: 0, over: 0, late: 0 };
  const targets = new Set<number>();
  let notStarted = 0, total = 0, paceTo = 0;
  for (const g of gifts) {
    if (g.startAt === null) { notStarted += 1; continue; }
    total += 1;
    const stage = stageOf(g), band = giftBand(g, today, fallback), fs = fulfilledStageOf(g), tone = toneOf(stage, band, fs);
    targets.add(targetOf(g, fallback));
    paceTo = Math.max(paceTo, fs);
    byTone[tone] += 1;
    const k = `${stage}|${band}`, c = cells.get(k);
    if (!c) cells.set(k, { stage, band, count: 1, tone });
    else { c.count += 1; if (WORST.indexOf(tone) < WORST.indexOf(c.tone)) c.tone = tone; }
  }
  return { target: targets.size === 1 ? ([...targets][0] as number) : null, cells: [...cells.values()], total, byTone, notStarted, paceTo: paceTo || 5 };
}
