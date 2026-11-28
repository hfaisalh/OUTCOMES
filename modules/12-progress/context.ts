/**
 * context.ts
 *
 * What it does: builds what the Progress rules need to know about gifts (DECISIONS 232) from the records the app holds: which gifts are assigned, when each was allocated, its workflow's phases and flags, and which gifts share a batch. One builder, so the server and the demo cannot differ.
 * Who calls it: the server (modules/00-platform/handlers.ts), the demo (app/main.ts) and the Progress page. Depends on: progress.ts, modules/08-assignment/batches.ts, modules/02-project-rules (the workflow's shape and flags). Pure: no store, no screen.
 */
import { labelBatches } from "../08-assignment/batches.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import { flagOf, reportLoopOf } from "../02-project-rules/workflows.js";

// Days between the rounds of a repeating report (DECISIONS 319).
const CYCLE_DAYS: Record<string, number> = { monthly: 30, quarterly: 91, half_yearly: 182, annual: 365, on_delivery: 0 };
import { progressOf, type GiftProgress, type ProgressContext, type ProgressEntry, type Steps } from "./progress.js";

export interface ProgressInput {
  assignments: { key: string; partnerId: string; at: string; batch?: number }[];
  allocations: { key: string; at: string; to?: string; endReason?: string; kind?: string }[]; // every allocation record, the live ones count
  frameworkOf: (key: string) => string; // the workflow id of an assigned gift, "" when it has none
  frameworks: FrameworkTemplate[];
  sizeOf: (partnerId: string) => number; // the partner's batch size, for an assignment made before batches existed
  today: string;
}

// Rule: the steps of a gift are its workflow's phases, then review and feedback unless the workflow turns them off. A gift with no workflow gets the usual: no phases, review and feedback on.
export function stepsFor(fw: FrameworkTemplate | undefined): Steps {
  const every = fw ? reportLoopOf(fw) : null;
  return { phases: (fw?.stages ?? []).map((s) => ({ id: s.id, label: s.label, days: s.days })), review: fw ? flagOf(fw, "approve") : true, feedback: fw ? flagOf(fw, "feedback") : true, ...(every && fw ? { loop: { everyDays: CYCLE_DAYS[every] ?? 30, ...(fw.loopMonths ? { months: fw.loopMonths } : {}) } } : {}) };
}

export function progressContext(a: ProgressInput): ProgressContext {
  const assigned = labelBatches(a.assignments, a.sizeOf);
  const allocatedAt = (key: string): string | undefined => a.allocations.filter((p) => p.key === key && p.to === undefined).map((p) => p.at).sort()[0];
  return {
    today: a.today,
    gift: (key) => {
      if (!assigned.some((x) => x.key === key)) return undefined;
      const steps = stepsFor(a.frameworks.find((f) => f.id === a.frameworkOf(key)));
      const live = allocatedAt(key);
      // Rule (DECISIONS 319): a living gift whose plan was completed (its term is over) has finished its loop: it keeps its allocation date and gets the end date. Any other ended allocation leaves it unallocated.
      const done = steps.loop && live === undefined ? a.allocations.filter((p) => p.key === key && p.endReason === "completed" && p.to !== undefined).sort((x, y) => y.at.localeCompare(x.at))[0] : undefined;
      return done ? { allocatedAt: done.at, steps, endedAt: done.to as string } : { allocatedAt: live, steps };
    },
    batchOf: (key) => { const x = assigned.find((y) => y.key === key); return x && x.batch !== undefined ? { partnerId: x.partnerId, batch: x.batch } : undefined; },
    batchKeys: (partnerId, batch) => assigned.filter((x) => x.partnerId === partnerId && x.batch === batch).map((x) => x.key),
  };
}

// Where every assigned gift stands: its steps, what is next, and its partner and batch. One call for the pages, so none of them repeats the work.
export interface GiftStanding extends GiftProgress { key: string; partnerId: string; batch: number | undefined }
export function standings(a: ProgressInput, records: ProgressEntry[]): GiftStanding[] {
  const ctx = progressContext(a);
  return labelBatches(a.assignments, a.sizeOf).flatMap((x) => {
    const g = ctx.gift(x.key);
    return g ? [{ ...progressOf(x.key, g.allocatedAt, records, g.steps, a.today, g.endedAt), key: x.key, partnerId: x.partnerId, batch: x.batch }] : [];
  });
}
