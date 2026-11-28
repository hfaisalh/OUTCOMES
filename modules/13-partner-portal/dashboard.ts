/**
 * dashboard.ts
 *
 * What it does: the figures behind the partner's own dashboard (DECISIONS 327): what the partner has to answer, what is late, what MWF sent back, its quality, and each of its gifts as a point on the age against stage chart. All from the partner's own slice, so it can show nothing about another partner or any donor.
 * Who calls it: app/portal/partner-dashboard.ts and the tests. Depends on: the partner slice (scope.ts), the outcome rows (outcomes.ts), the Progress rules (modules/12-progress) and the GiftLife type of the Dashboard trends. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a gift's late days are the days past its answer-by day while unanswered, or past the due day of the next phase while in delivery. Late is advice: nothing moves by itself.
 * - Rule: quality is three plain shares, each shown only once there is something to measure: right first time (review decisions that passed, out of passes and rejections), answers on time (answers given by the answer-by day), steps on time (phases done by their due day). The quality score is their average.
 * - Rule: on the chart a gift's age counts from the day it was assigned to the partner, since the partner does not see the payment. A recurring gift is fulfilled once allocated, any other once complete.
 */

import type { GiftLife } from "../17-dashboard/trends.js";
import { progressOf } from "../12-progress/progress.js";
import { DEFAULT_DAYS } from "../02-project-rules/timeline.js";
import { partnerOutcomes, type PartnerOutcome } from "./outcomes.js";
import type { PartnerSlice } from "./scope.js";

export interface AttentionItem { key: string; benefit: string; kind: "answer" | "step" | "sent-back"; what: string; due: string; lateDays: number }
export interface Quality { rightFirstTime: number | null; answersOnTime: number | null; stepsOnTime: number | null; score: number | null }
export interface PartnerDash {
  counts: { toAnswer: number; lateAnswers: number; inDelivery: number; lateSteps: number; sentBack: number; complete: number };
  attention: AttentionItem[];
  quality: Quality;
  lives: GiftLife[];
}

const DAY = 86400000;
const daysLate = (due: string, today: string): number => (due === "" ? 0 : Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / DAY)));
const share = (good: number, all: number): number | null => (all === 0 ? null : Math.round((good / all) * 100));
export const QUALITY_WORDS = (n: number | null): string => (n === null ? "Not enough yet" : n >= 90 ? "Good" : n >= 70 ? "Fair" : "Needs attention");

export function partnerDash(s: PartnerSlice, today: string): PartnerDash {
  const rows = partnerOutcomes(s);
  const by = new Map<string, PartnerOutcome>(rows.map((r) => [r.key, r]));
  const attention: AttentionItem[] = [];
  const lives: GiftLife[] = [];
  let lateAnswers = 0, lateSteps = 0, stepsDone = 0, stepsOnTime = 0, answered = 0, answersOnTime = 0;
  for (const a of s.assignments) {
    const row = by.get(a.key);
    const d = s.gifts[a.key];
    const benefit = row?.benefit ?? a.itemId;
    const answer = s.confirmations.find((c) => c.key === a.key && c.partnerId === a.partnerId && c.at >= a.at);
    const records = s.progress.filter((r) => r.key === a.key);
    const live = s.allocations.filter((p) => p.key === a.key && p.to === undefined).map((p) => p.at).sort();
    const allocatedAt = live[0];
    // --- Answers ---
    if (answer && answer.answer === "confirmed" && !answer.onBehalf && d) { answered++; if (answer.at.slice(0, 10) <= d.answerBy) answersOnTime++; }
    if (!answer && d) { const late = daysLate(d.answerBy, today); if (late > 0) lateAnswers++; attention.push({ key: a.key, benefit, kind: "answer", what: "Accept or refuse", due: d.answerBy, lateDays: late }); }
    // --- Steps ---
    const p = d ? progressOf(a.key, allocatedAt, records, { phases: d.phases.map((x) => ({ id: x.id ?? x.label, label: x.label, days: x.days })), review: d.review, feedback: d.feedback }, today) : undefined;
    if (p?.allocated) {
      for (const r of p.steps) if (r.kind === "phase" && r.done && r.due !== "") { stepsDone++; if (r.doneAt.slice(0, 10) <= r.due) stepsOnTime++; }
      const next = p.next;
      if (next?.kind === "phase" && next.due !== "") { if (next.lateDays > 0) lateSteps++; attention.push({ key: a.key, benefit, kind: "step", what: next.label, due: next.due, lateDays: next.lateDays }); }
    }
    if (row?.sentBack) attention.push({ key: a.key, benefit, kind: "sent-back", what: `Sent back: ${row.sentBack.reason}`, due: row.sentBack.due, lateDays: daysLate(row.sentBack.due, today) });
    // --- The chart ---
    if (answer?.answer === "rejected") continue; // refused: it left the journey
    const stage = (id: string): string | undefined => records.filter((r) => r.kind === "stage" && r.id === id).map((r) => r.at).sort()[0];
    const phaseTimes = d ? d.phases.map((x) => records.find((r) => r.kind === "phase" && r.id === (x.id ?? x.label))?.at) : [];
    const delivered = d && allocatedAt ? (d.phases.length === 0 ? allocatedAt : phaseTimes.every((t) => t !== undefined) ? (phaseTimes as string[]).sort().at(-1) : undefined) : undefined;
    lives.push({
      key: a.key, itemId: a.itemId, paidAt: a.at.slice(0, 10), startAt: a.at.slice(0, 10), assignedAt: a.at,
      ...(answer?.answer === "confirmed" ? { confirmedAt: answer.at } : {}), ...(allocatedAt ? { allocatedAt } : {}),
      ...(delivered ? { deliveredAt: delivered } : {}), ...(stage("complete") ? { completedAt: stage("complete") as string } : {}),
      fulfilledStage: d?.recurring ? 3 : 5, ...(d?.recurring ? (allocatedAt ? { fulfilledAt: allocatedAt.slice(0, 10) } : {}) : (stage("complete") ? { fulfilledAt: (stage("complete") as string).slice(0, 10) } : {})),
      targetDays: d && d.completeWithin > 0 ? d.completeWithin : DEFAULT_DAYS,
    });
  }
  attention.sort((x, y) => y.lateDays - x.lateDays || x.due.localeCompare(y.due));
  const decisions = s.progress.filter((r) => r.kind === "stage" && r.id === "review").length;
  const rejections = s.progress.filter((r) => r.kind === "reject").length;
  const parts = [share(decisions, decisions + rejections), share(answersOnTime, answered), share(stepsOnTime, stepsDone)];
  const have = parts.filter((x): x is number => x !== null);
  return {
    counts: { toAnswer: rows.filter((r) => r.standing === "to-answer").length, lateAnswers, inDelivery: rows.filter((r) => r.standing === "allocated").length, lateSteps, sentBack: rows.filter((r) => r.sentBack).length, complete: rows.filter((r) => r.standing === "complete").length },
    attention, lives,
    quality: { rightFirstTime: parts[0] ?? null, answersOnTime: parts[1] ?? null, stepsOnTime: parts[2] ?? null, score: have.length === 0 ? null : Math.round(have.reduce((t, x) => t + x, 0) / have.length) },
  };
}
