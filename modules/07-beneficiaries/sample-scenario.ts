/**
 * sample-scenario.ts
 *
 * What it does: the sample scenario (DECISIONS 329): on top of the sample world's gifts and the sample setup, it makes the records of a working organisation, dated back from today, so every part of the journey and every new feature has something to show: gifts assigned long ago and just now, answers on time, late, refused and missing, allocations, phases done on time and late, work waiting for review, work sent back, a repeating report, messages in a partner's inbox, a gift marked Priority. It also sets the workflow decisions (loop, moving, days to fulfil) and the automatic settings.
 * Who calls it: the server (modules/00-platform/outcomes-handler.ts, sample-scenario-load). Depends on: the assignment, allocation, confirmation and progress records, the partner inbox, and the workflow type. Pure: the engines that assign and allocate are passed in, so this file reads no store.
 * Data flow: the assignable gifts + a function that assigns and one that allocates -> the records. Every date is counted back from `today`, so the lateness is real whenever it is loaded.
 *
 * Rules:
 * - Rule: everything is invented and marked by where it came from: the gifts are the sample world's, the partners are the sample setup's. Nothing real is touched.
 * - Rule: the scenario uses the same engines a person's buttons use (assign, allocate), then only moves their dates back, so the records are ones the app could have made.
 * - Rule: a step is only recorded if its date is not in the future.
 */

import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import type { Assignments } from "../08-assignment/assignment.js";
import type { Allocations } from "../09-allocation/allocation.js";
import { addDays, type Confirmations } from "../11-confirmation/confirmation.js";
import type { Progress, ProgressEntry } from "../12-progress/progress.js";
import { dueMessage, movedMessage, newBatchMessage, sentBackMessage, type NewMessage } from "../18-automation/messages.js";

export interface ScenarioUnit { key: string; itemName: string; frameworkId: string }
export interface ScenarioInput {
  today: string;
  units: ScenarioUnit[]; // the assignable gifts
  assign: (now: string) => Assignments; // assigns every gift that can be, from nothing
  allocate: (assignments: Assignments, now: string) => Allocations; // allocates the assignments it is given
  stepsOf: (frameworkId: string) => { phases: { id: string; days: number }[]; review: boolean };
}
export interface ScenarioRecords { assignments: Assignments; confirmations: Confirmations; allocations: Allocations; progress: Progress; partnerMessages: ReturnType<typeof messagesOf>; priorityGifts: string[] }

const AGES = [30, 2, 3, 4, 45, 9, 20, 15, 25, 28, 60, 12]; // days since each gift was assigned, in turn: the ones that get answered are mostly old, so the work they lead to has had time to be done
const at = (day: string): string => `${day}T09:00:00Z`;
const messagesOf = (list: NewMessage[]) => list.map((m) => ({ ...m, read: false }));

export function buildScenario(i: ScenarioInput): ScenarioRecords {
  const today = i.today;
  const back = (days: number): string => addDays(today, -days);
  // --- Assigned at different times, so some are fresh and some are long overdue for an answer ---
  const first = i.assign(at(today));
  const records = [...first.records].sort((a, b) => a.key.localeCompare(b.key)).map((a, n) => ({ ...a, at: at(back(AGES[n % AGES.length] as number)) }));
  const assignments: Assignments = { records };
  // --- Answers: on time, on time, none, refused, late, none (by turn) ---
  const answers = records.flatMap((a, n) => {
    const given = (days: number, answer: "confirmed" | "rejected", reason = ""): Confirmations["records"][number][] => (days <= AGES[n % AGES.length]! ? [{ key: a.key, partnerId: a.partnerId, answer, at: at(addDays(a.at.slice(0, 10), days)), by: "Sample partner", reason }] : []);
    return [() => given(1, "confirmed"), () => given(1, "confirmed"), () => [], () => given(2, "rejected", "No capacity this month"), () => given(6, "confirmed"), () => []][n % 6]!();
  });
  const confirmations: Confirmations = { records: answers };
  // --- Allocated: the confirmed gifts, a day or two after they were assigned ---
  const confirmed = new Set(answers.filter((c) => c.answer === "confirmed").map((c) => c.key));
  const placed = i.allocate({ records: records.filter((a) => confirmed.has(a.key)) }, at(today));
  const allocations: Allocations = { ...placed, records: placed.records.map((p) => { const a = records.find((x) => x.key === p.key); return a ? { ...p, at: at(addDays(a.at.slice(0, 10), 2)) } : p; }) };
  // --- The partner's work: on time, waiting for review, sent back, late, not started ---
  const unit = new Map(i.units.map((u) => [u.key, u]));
  const progress: ProgressEntry[] = [];
  // The oldest allocation has had the most time, so it gets the furthest along: complete, then sent back, waiting for review, late on a phase, not started.
  const live = allocations.records.filter((p) => p.to === undefined).sort((a, b) => a.at.localeCompare(b.at));
  live.forEach((p, j) => {
    const u = unit.get(p.key);
    const s = i.stepsOf(u?.frameworkId ?? "");
    const start = p.at.slice(0, 10);
    const add = (kind: ProgressEntry["kind"], id: string, day: string, reason?: string): void => { if (day <= today) progress.push({ key: p.key, kind, id, at: at(day), by: "Sample", ...(reason ? { reason } : {}) }); };
    let when = start;
    const phases = s.phases;
    const pattern = [0, 2, 1, 3, 4][j % 5] as number; // 0 complete, 1 waiting for review, 2 sent back, 3 late on a phase, 4 not started
    // Rule: work that goes well is done early; work that is late is not.
    const donePhases = pattern === 4 ? 0 : pattern === 3 ? Math.min(1, phases.length) : phases.length;
    phases.slice(0, donePhases).forEach((ph) => { when = addDays(when, Math.max(1, Math.round(ph.days * (pattern <= 2 ? 0.25 : 0.7))));  add("phase", ph.id, when); });
    if (pattern <= 2 && s.review && donePhases === phases.length) {
      if (pattern === 1) return;
      if (pattern === 2) { add("reject", "review", addDays(when, 1), "The photo is blurred, please send a clear one."); return; }
      when = addDays(when, 1); add("stage", "review", when);
    }
    if (pattern === 0) { add("stage", "report", addDays(when, 1)); add("stage", "complete", addDays(when, 2)); }
  });
  // --- A partner's inbox, and one Priority gift ---
  const p1 = records[0]?.partnerId ?? "";
  const messages: NewMessage[] = p1 === "" ? [] : [
    newBatchMessage(p1, records[0]?.batch, records.filter((a) => a.partnerId === p1).length, at(back(20))),
    dueMessage("reminder", p1, "answer", 2, addDays(today, 1), today),
    dueMessage("late", p1, "phase", 1, "", today),
    movedMessage(p1, 1, 5, back(3)),
    sentBackMessage(p1, records[0] ? (unit.get(records[0].key)?.itemName ?? "your gift") : "your gift", "", "The photo is blurred, please send a clear one.", addDays(today, 20), at(back(2)), records[0]?.key ?? "sample"),
  ];
  return { assignments, confirmations, allocations, progress: { records: progress }, partnerMessages: messagesOf(messages), priorityGifts: records[0] ? [records[0].key] : [] };
}

// --- The workflow decisions and settings the scenario sets, so each new feature is on ---
// Sponsorships report on a quarterly loop for a year, an orphan gift unanswered 5 days past its deadline moves, a pump gift after 3.
export function scenarioWorkflows(fws: FrameworkTemplate[]): FrameworkTemplate[] {
  return fws.map((f) => {
    if (f.id === "orphan-sponsorship") return { ...f, cycle: "quarterly", loopMonths: 12, moveAfterDays: 5 };
    if (f.id === "student-sponsorship") return { ...f, cycle: "quarterly", moveAfterDays: 7 };
    if (f.id === "water-pump") return { ...f, moveAfterDays: 3, fulfilled: "complete" };
    return f;
  });
}
export const SCENARIO_TIMELINES: Record<string, { days: number }> = { "MWF-WAT-001": { days: 45 }, "MWF-ORP-001": { days: 30 }, "MWF-FAM-001": { days: 120 } };
export const SCENARIO_AUTO = { daily: true, remind: true, assign: true, allocate: false, remindBefore: 2, remindLate: true } as const;
