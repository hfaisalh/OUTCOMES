/**
 * trends.ts
 *
 * What it does: the monthly trends behind the Dashboard (DECISIONS 304): how the journey of a gift looked at the end of each month, how fast each step was taken, and what changed since last month. It works out the past from the dates OUTCOMES already keeps on every step (when a payment came in, a gift was assigned, answered, allocated, delivered and completed), so there is nothing to switch on and history is there from the first gift.
 * Who calls it: app/dashboard/trends-data.ts, which builds each gift's dates from the screens' data, and the tests. Depends on facts.ts (the journey and its score). Pure: dates and numbers in, numbers out.
 * Data flow: a list of gifts with their dates in -> one point for each month (the state at the month's end, and what happened during the month) -> a short list of what improved.
 *
 * Rules:
 * - Rule: "as of month end" counts a gift at a step if it had taken that step by the last day of the month, so the score of an old month never changes when later months do.
 * - Rule: a speed is the median number of days (the middle one, so a single very slow gift does not hide a good month) between two steps, for the gifts that took the second step in that month. A month with none has no figure, shown as a gap, never as zero.
 * - Rule: on time means the partner answered within the days its workflow allows.
 * - Rule: "better" depends on the metric: a higher score is better, fewer days is better. A change smaller than half a unit is "no change", so noise is not called improvement.
 * - Not measured: a gift allocated and later taken back still counts as allocated at the month it was; history is kept, not rewritten.
 */

import { fulfilmentScore, journey } from "./facts.js";

// --- One gift's dates ---
export interface GiftLife {
  key: string;
  itemId: string;
  partnerId?: string; // the partner it was assigned to, absent until it is (DECISIONS 305)
  paidAt: string; // YYYY-MM-DD, the first payment
  assignedAt?: string;
  answeredAt?: string; // when the partner answered
  confirmedAt?: string; // when it accepted (the answer, if it was an acceptance)
  answerDays?: number; // the days its workflow allows to answer
  allocatedAt?: string;
  deliveredAt?: string; // the first of review, report or complete
  completedAt?: string;
}

// --- Months ---
export interface Month { key: string; label: string; start: string; end: string }
const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number): string => String(n).padStart(2, "0");

// The `n` months up to and including the one `today` (YYYY-MM-DD) is in, oldest first.
export function lastMonths(today: string, n: number): Month[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const idx = y * 12 + (m - 1) - (n - 1 - i);
    const yy = Math.floor(idx / 12), mm = (idx % 12) + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return { key: `${yy}-${p2(mm)}`, label: `${NAMES[mm - 1]} ${String(yy).slice(2)}`, start: `${yy}-${p2(mm)}-01`, end: `${yy}-${p2(mm)}-${p2(last)}` };
  });
}

const day = (iso: string): string => iso.slice(0, 10);
const inMonth = (iso: string | undefined, m: Month): boolean => iso !== undefined && iso !== "" && day(iso) >= m.start && day(iso) <= m.end;
const by = (iso: string | undefined, m: Month): boolean => iso !== undefined && iso !== "" && day(iso) <= m.end;
const DAY = 86400000;
const daysBetween = (a: string, b: string): number => Math.max(0, Math.round((Date.parse(`${day(b)}T00:00:00Z`) - Date.parse(`${day(a)}T00:00:00Z`)) / DAY));

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
const med1 = (nums: number[]): number | null => { const m = median(nums); return m === null ? null : Math.round(m * 10) / 10; };

// --- A month's point ---
export interface MonthPoint {
  month: Month;
  score: number | null; // the fulfilment score at the month's end
  paidIn: number; // payments (gifts) that came in during the month
  completed: number; // gifts completed during the month
  gifts: number; // gifts existing at the month's end
  backlog: number; // gifts not yet complete at the month's end
  daysToAssign: number | null; // payment to assignment
  daysToAnswer: number | null; // assignment to the partner's answer
  daysToAllocate: number | null; // the answer to allocation (an acceptance to a place)
  daysToComplete: number | null; // allocation to completion
  onTime: number | null; // % of answers in the month that were within the days allowed
}

export function monthlyTrends(lives: GiftLife[], months: Month[]): MonthPoint[] {
  return months.map((m) => {
    const c = (f: (g: GiftLife) => boolean): number => lives.filter(f).length;
    const gifts = c((g) => by(g.paidAt, m));
    const assigned = c((g) => by(g.assignedAt, m) && by(g.paidAt, m));
    const confirmed = c((g) => by(g.confirmedAt, m));
    const allocated = c((g) => by(g.allocatedAt, m));
    const stages = journey({ paymentsIn30: 0, gifts, assigned, confirmed, lateAnswers: 0, allocated, delivered: c((g) => by(g.deliveredAt, m)), lateDelivery: 0, complete: c((g) => by(g.completedAt, m)) });
    const answered = lives.filter((g) => inMonth(g.answeredAt, m) && g.assignedAt !== undefined);
    const withLimit = answered.filter((g) => g.answerDays !== undefined);
    return {
      month: m,
      score: fulfilmentScore(stages),
      paidIn: c((g) => inMonth(g.paidAt, m)),
      completed: c((g) => inMonth(g.completedAt, m)),
      gifts,
      backlog: gifts - c((g) => by(g.completedAt, m)),
      daysToAssign: med1(lives.filter((g) => inMonth(g.assignedAt, m)).map((g) => daysBetween(g.paidAt, g.assignedAt as string))),
      daysToAnswer: med1(answered.map((g) => daysBetween(g.assignedAt as string, g.answeredAt as string))),
      daysToAllocate: med1(lives.filter((g) => inMonth(g.allocatedAt, m) && g.confirmedAt !== undefined).map((g) => daysBetween(g.confirmedAt as string, g.allocatedAt as string))),
      daysToComplete: med1(lives.filter((g) => inMonth(g.completedAt, m) && g.allocatedAt !== undefined).map((g) => daysBetween(g.allocatedAt as string, g.completedAt as string))),
      onTime: withLimit.length === 0 ? null : Math.round((withLimit.filter((g) => daysBetween(g.assignedAt as string, g.answeredAt as string) <= (g.answerDays as number)).length / withLimit.length) * 100),
    };
  });
}

// --- What improved ---
export type Direction = "better" | "worse" | "same" | "none";
export interface Improvement { id: MetricId; label: string; unit: "pts" | "days" | "gifts" | "%"; now: number | null; before: number | null; change: number | null; direction: Direction; higherIsBetter: boolean }

export type MetricId = "score" | "completed" | "onTime" | "answer" | "complete";
export const METRICS: { id: MetricId; label: string; unit: Improvement["unit"]; higherIsBetter: boolean; of: (p: MonthPoint) => number | null }[] = [
  { id: "score", label: "Fulfilment score", unit: "pts", higherIsBetter: true, of: (p) => p.score },
  { id: "completed", label: "Gifts completed", unit: "gifts", higherIsBetter: true, of: (p) => p.completed },
  { id: "onTime", label: "Partner answers on time", unit: "%", higherIsBetter: true, of: (p) => p.onTime },
  { id: "answer", label: "Time for a partner to answer", unit: "days", higherIsBetter: false, of: (p) => p.daysToAnswer },
  { id: "complete", label: "Time from allocation to complete", unit: "days", higherIsBetter: false, of: (p) => p.daysToComplete },
];

// This month against the last month that has a figure before it, for each metric.
export function improvements(points: MonthPoint[]): Improvement[] {
  const now = points[points.length - 1];
  return METRICS.map((m) => {
    const cur = now ? m.of(now) : null;
    const before = [...points.slice(0, -1)].reverse().map(m.of).find((x) => x !== null) ?? null;
    const change = cur === null || before === null ? null : Math.round((cur - before) * 10) / 10;
    const direction: Direction = change === null ? "none" : Math.abs(change) < 0.5 ? "same" : (change > 0) === m.higherIsBetter ? "better" : "worse";
    return { id: m.id, label: m.label, unit: m.unit, now: cur, before, change, direction, higherIsBetter: m.higherIsBetter };
  });
}
