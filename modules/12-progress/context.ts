/**
 * context.ts
 *
 * What it does: builds what the Progress rules need to know about gifts (DECISIONS 232) from the records the app holds: which gifts are assigned, when each was placed, its workflow's phases and flags, and which gifts share a batch. One builder, so the server and the demo cannot differ.
 * Who calls it: the server (modules/00-platform/handlers.ts), the demo (app/main.ts) and the Progress page. Depends on: progress.ts, modules/08-assignment/batches.ts, modules/02-project-rules (the workflow's shape and flags). Pure: no store, no screen.
 */
import { labelBatches } from "../08-assignment/batches.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import { flagOf } from "../02-project-rules/workflows.js";
import { progressOf, type GiftProgress, type ProgressContext, type ProgressEntry, type Steps } from "./progress.js";

export interface ProgressInput {
  assignments: { key: string; partnerId: string; at: string; batch?: number }[];
  placements: { key: string; at: string; to?: string }[]; // every placement record, the live ones count
  frameworkOf: (key: string) => string; // the workflow id of an assigned gift, "" when it has none
  frameworks: FrameworkTemplate[];
  sizeOf: (partnerId: string) => number; // the partner's batch size, for an assignment made before batches existed
  today: string;
}

// Rule: the steps of a gift are its workflow's phases, then review and feedback unless the workflow turns them off. A gift with no workflow gets the usual: no phases, review and feedback on.
export function stepsFor(fw: FrameworkTemplate | undefined): Steps {
  return { phases: (fw?.stages ?? []).map((s) => ({ id: s.id, label: s.label, days: s.days })), review: fw ? flagOf(fw, "approve") : true, feedback: fw ? flagOf(fw, "feedback") : true };
}

export function progressContext(a: ProgressInput): ProgressContext {
  const assigned = labelBatches(a.assignments, a.sizeOf);
  const placedAt = (key: string): string | undefined => a.placements.filter((p) => p.key === key && p.to === undefined).map((p) => p.at).sort()[0];
  return {
    today: a.today,
    gift: (key) => (assigned.some((x) => x.key === key) ? { placedAt: placedAt(key), steps: stepsFor(a.frameworks.find((f) => f.id === a.frameworkOf(key))) } : undefined),
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
    return g ? [{ ...progressOf(x.key, g.placedAt, records, g.steps, a.today), key: x.key, partnerId: x.partnerId, batch: x.batch }] : [];
  });
}
