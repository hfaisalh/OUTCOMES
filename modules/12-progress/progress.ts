/**
 * progress.ts
 *
 * What it does: Progress after allocation (DECISIONS 232). Once a gift is placed (a child enrolled for it, or an outcome made), it moves through the partner's implementation phases, then Review, Report, Complete and Feedback. This file holds the rules: the steps a gift has, which is next, when a phase is due and late, how a step is taken back, and when a batch may be closed.
 * Who calls it: the server (modules/00-platform/handlers.ts) and the demo (app/main.ts) through applyProgressAction, the Progress page, the Gifts list (the stage it shows) and the Batches card (Ready and Closed). Depends on: nothing but its own types. Pure functions: no database, no screen, so they can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: a gift has no progress until it is placed. Placing it is what starts the partner's work.
 * - Rule: the steps run in order: the workflow's implementation phases, then Review (unless the workflow does not ask MWF to approve), Report, Complete, and Feedback (unless the workflow does not ask the donor). The next step is the first one not yet taken.
 * - Rule: a phase is due its number of days after the step before it was taken (the first, after the gift was placed). A phase not taken past its due day is late. Late is advised, not acted on.
 * - Rule: a person can take back the latest step, one at a time, so a slip can be put right without a record being edited.
 * - Rule: a step of a gift in a closed batch cannot be taken back until the batch is opened again, so a closed batch never holds a gift that is not complete.
 * - Rule: a gift is complete once its Complete step is taken (or any later one). A batch is ready to close when every gift in it is complete, and is closed by a person, never by itself. A closed batch can be opened again.
 * - Nothing is changed in place: every function returns a new value.
 */

export type StageId = "review" | "report" | "complete" | "feedback";
export const STAGE_LABELS: Record<StageId, string> = { review: "Reviewed", report: "Reported", complete: "Completed", feedback: "Feedback" };
export const STAGE_VERBS: Record<StageId, string> = { review: "Mark reviewed", report: "Mark reported", complete: "Mark completed", feedback: "Mark feedback received" };

export interface ProgressEntry {
  key: string; // the gift (assignment) it is about, or "<partner>|<batch>" for a batch
  kind: "phase" | "stage" | "batch";
  id: string; // the phase id, the stage id, or "closed"
  at: string; // ISO time
  by: string; // who, a display name
}
export interface Progress { records: ProgressEntry[] }
export const emptyProgress = (): Progress => ({ records: [] });

// What the workflow says about a gift: its phases, and whether MWF reviews and the donor is asked for feedback.
export interface Steps { phases: { id: string; label: string; days: number }[]; review: boolean; feedback: boolean }

export interface StepRow { kind: "phase" | "stage"; id: string; label: string; done: boolean; doneAt: string; due: string; lateDays: number }
export interface GiftProgress {
  placed: boolean;
  steps: StepRow[]; // every step in order, taken or not
  next: StepRow | undefined; // the first not taken, undefined when all are
  stage: "allocation" | StageId; // where the gift stands: still with the partner, or the last stage taken
  complete: boolean; // the Complete step (or a later one) is taken
}

const DAY = 86400000;
const addDays = (iso: string, days: number): string => new Date(Date.parse(iso.slice(0, 10) + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);

// The steps of a gift, in order, from its workflow (Rule: review and feedback are left out when the workflow does not ask for them).
export function stepsOf(s: Steps): { kind: "phase" | "stage"; id: string; label: string; days: number }[] {
  return [
    ...s.phases.map((p) => ({ kind: "phase" as const, id: p.id, label: p.label, days: p.days })),
    ...(s.review ? [{ kind: "stage" as const, id: "review", label: STAGE_LABELS.review, days: 0 }] : []),
    { kind: "stage" as const, id: "report", label: STAGE_LABELS.report, days: 0 },
    { kind: "stage" as const, id: "complete", label: STAGE_LABELS.complete, days: 0 },
    ...(s.feedback ? [{ kind: "stage" as const, id: "feedback", label: STAGE_LABELS.feedback, days: 0 }] : []),
  ];
}

export function progressOf(key: string, placedAt: string | undefined, records: ProgressEntry[], steps: Steps, today: string): GiftProgress {
  const placed = placedAt !== undefined;
  const mine = records.filter((r) => r.key === key && r.kind !== "batch");
  let from = placedAt ?? "";
  const rows: StepRow[] = stepsOf(steps).map((s) => {
    const hit = mine.filter((r) => r.kind === s.kind && r.id === s.id).sort((x, y) => y.at.localeCompare(x.at))[0];
    // Rule: a phase is due its days after the step before it was taken (the first, after the gift was placed).
    const due = placed && s.days > 0 && from !== "" ? addDays(from, s.days) : "";
    const late = !hit && due !== "" ? Math.max(0, Math.round((Date.parse(today.slice(0, 10) + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / DAY)) : 0;
    if (hit) from = hit.at;
    return { kind: s.kind, id: s.id, label: s.label, done: hit !== undefined, doneAt: hit?.at ?? "", due, lateDays: late };
  });
  const next = placed ? rows.find((r) => !r.done) : undefined;
  const lastStage = [...rows].reverse().find((r) => r.kind === "stage" && r.done);
  const complete = rows.some((r) => r.kind === "stage" && r.done && (r.id === "complete" || r.id === "feedback"));
  return { placed, steps: rows, next, stage: lastStage ? (lastStage.id as StageId) : "allocation", complete };
}

// ---- Batches (DECISIONS 232): closed by a person once every gift in them is complete ----
export const batchKey = (partnerId: string, batch: number): string => `${partnerId}|${batch}`;
export const isClosed = (records: ProgressEntry[], partnerId: string, batch: number): boolean => {
  const last = records.filter((r) => r.kind === "batch" && r.key === batchKey(partnerId, batch)).sort((x, y) => y.at.localeCompare(x.at))[0];
  return last?.id === "closed";
};

// What the requests need to know about the gifts, supplied by the caller from assignments, placements and workflows, so this file never reads a store.
export interface ProgressContext {
  gift: (key: string) => { placedAt: string | undefined; steps: Steps } | undefined; // undefined: not an assigned gift
  batchKeys: (partnerId: string, batch: number) => string[]; // the gifts in a batch
  batchOf: (key: string) => { partnerId: string; batch: number } | undefined; // the batch a gift is in
  today: string;
}
export type ProgressResult = { value: Progress; message?: string } | { error: string };

/**
 * The requests the Progress page makes, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about Progress.
 * prg-next takes the next step of a gift (`key`). prg-undo takes back its latest step. prg-close-batch and prg-open-batch (`partnerId`, `batch`) close and reopen a batch. prg-reset clears every step.
 */
export function applyProgressAction(ctx: ProgressContext, existing: Progress, body: Record<string, unknown>, by: string, at: string): ProgressResult | null {
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "prg-next": {
      const g = ctx.gift(str("key"));
      if (!g) return { error: "That gift was not found, or it is not assigned to a partner." };
      const p = progressOf(str("key"), g.placedAt, existing.records, g.steps, ctx.today);
      if (!p.placed) return { error: "That gift is not placed yet. Allocate it first." };
      if (!p.next) return { error: "Every step of that gift is already taken." };
      return { value: { records: [...existing.records, { key: str("key"), kind: p.next.kind, id: p.next.id, at, by }] }, message: `${p.next.label} taken.` };
    }
    case "prg-undo": {
      const mine = existing.records.filter((r) => r.key === str("key") && r.kind !== "batch").sort((x, y) => y.at.localeCompare(x.at));
      if (mine.length === 0) return { error: "Nothing has been taken for that gift." };
      const inBatch = ctx.batchOf(str("key"));
      if (inBatch && isClosed(existing.records, inBatch.partnerId, inBatch.batch)) return { error: "That gift is in a closed batch. Open the batch again before taking a step back." };
      const latest = mine[0]!;
      return { value: { records: existing.records.filter((r) => r !== latest) }, message: "The latest step was taken back." };
    }
    case "prg-close-batch": {
      const partnerId = str("partnerId"), batch = Number(body["batch"]);
      const keys = ctx.batchKeys(partnerId, batch);
      if (keys.length === 0) return { error: "That batch was not found." };
      if (isClosed(existing.records, partnerId, batch)) return { error: "That batch is already closed." };
      const open = keys.filter((k) => { const g = ctx.gift(k); return !g || !progressOf(k, g.placedAt, existing.records, g.steps, ctx.today).complete; }).length;
      if (open > 0) return { error: `${open} of its ${keys.length} gifts ${open === 1 ? "is" : "are"} not complete yet. A batch closes when every gift in it is complete.` };
      return { value: { records: [...existing.records, { key: batchKey(partnerId, batch), kind: "batch", id: "closed", at, by }] }, message: "The batch is closed." };
    }
    case "prg-open-batch": {
      const partnerId = str("partnerId"), batch = Number(body["batch"]);
      if (!isClosed(existing.records, partnerId, batch)) return { error: "That batch is not closed." };
      return { value: { records: [...existing.records, { key: batchKey(partnerId, batch), kind: "batch", id: "open", at, by }] }, message: "The batch is open again." };
    }
    case "prg-reset": return { value: emptyProgress(), message: "Every step was cleared." };
    default: return null;
  }
}
