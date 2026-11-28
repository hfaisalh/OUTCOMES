/**
 * progress.ts
 *
 * What it does: Progress after allocation (DECISIONS 232). Once a gift is allocated (a child enrolled for it, or an outcome made), it moves through the partner's implementation phases, then Review, Report, Complete and Feedback. This file holds the rules: the steps a gift has, which is next, when a phase is due and late, how a step is taken back, and when a batch may be closed.
 * Who calls it: the server (modules/00-platform/handlers.ts) and the demo (app/main.ts) through applyProgressAction, the Progress page, the Gifts list (the stage it shows) and the Batches card (Ready and Closed). Depends on: nothing but its own types. Pure functions: no database, no screen, so they can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: a gift has no progress until it is allocated. Placing it is what starts the partner's work.
 * - Rule: the steps run in order: the workflow's implementation phases, then Review (unless the workflow does not ask MWF to approve), Report, Complete, and Feedback (unless the workflow does not ask the donor). The next step is the first one not yet taken.
 * - Rule: a phase is due its number of days after the step before it was taken (the first, after the gift was allocated). A phase not taken past its due day is late. Late is advised, not acted on.
 * - Rule (DECISIONS 320): at Review, MWF can reject the work and send it back to the partner, with a reason that is kept. The last phase of the workflow is opened again and falls due its days after the rejection; the steps before it stay done. Review is taken again once the partner has done it again. A workflow with no phases has none to open, so the gift gets a step of its own, "Put right by the partner", which a person marks when the partner has done it; Review comes after. Taking back the latest step also takes back a rejection.
 * - Rule: a person can take back the latest step, one at a time, so a slip can be put right without a record being edited.
 * - Rule: a step of a gift in a closed batch cannot be taken back until the batch is opened again, so a closed batch never holds a gift that is not complete.
 * - Rule: a gift is complete once its Complete step is taken (or any later one). A batch is ready to close when every gift in it is complete, and is closed by a person, never by itself. A closed batch can be opened again.
 * - Rule (DECISIONS 319): a living gift (a workflow whose report repeats) is fulfilled once allocated, and the workflow carries on in rounds: each round is Report, then Complete, and the next round's Report falls due the workflow's cycle after the last Complete. A round Complete counts as complete for the batch. The loop ends, and the gift moves on to Feedback, when its allocation ends because the plan was completed (its term is over), or when the months set for reporting have passed. A gift whose allocation ends for any other reason (plan paused or cancelled, the beneficiary left) falls back to before allocation and is no longer followed; if it is allocated again its rounds start afresh.
 * - Nothing is changed in place: every function returns a new value.
 */

export type StageId = "review" | "report" | "complete" | "feedback" | "resubmit";
export const STAGE_LABELS: Record<StageId, string> = { review: "Reviewed", report: "Reported", complete: "Completed", feedback: "Feedback", resubmit: "Put right by the partner" };
export const STAGE_VERBS: Record<StageId, string> = { review: "Mark reviewed", report: "Mark reported", complete: "Mark completed", feedback: "Mark feedback received", resubmit: "Partner has put it right" };

export interface ProgressEntry {
  key: string; // the gift (assignment) it is about, or "<partner>|<batch>" for a batch
  kind: "phase" | "stage" | "batch" | "reject";
  id: string; // the phase id, the stage id, "closed", or "review" for a rejection
  reason?: string; // a rejection: why it was sent back
  at: string; // ISO time
  by: string; // who, a display name
}
export interface Progress { records: ProgressEntry[] }
export const emptyProgress = (): Progress => ({ records: [] });

// What the workflow says about a gift: its phases, and whether MWF reviews and the donor is asked for feedback.
export interface Steps { phases: { id: string; label: string; days: number }[]; review: boolean; feedback: boolean; loop?: { everyDays: number; months?: number } } // loop: the report repeats every so many days, for so many months at most (DECISIONS 319)

export interface StepRow { kind: "phase" | "stage"; id: string; label: string; done: boolean; doneAt: string; due: string; lateDays: number }
export interface GiftProgress {
  allocated: boolean;
  steps: StepRow[]; // every step in order, taken or not
  next: StepRow | undefined; // the first not taken, undefined when all are
  stage: "allocation" | Exclude<StageId, "resubmit">; // where the gift stands: still with the partner, or the last stage taken
  complete: boolean; // the Complete step (or a later one) is taken. For a living gift: the first round is complete
  sentBack?: { at: string; reason: string; phase: string }; // MWF rejected the review and the last phase is open again (DECISIONS 320)
  round?: number; // a living gift: the round it is in, from 1
  ongoing?: boolean; // a living gift whose loop is still running
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

export function progressOf(key: string, allocatedAt: string | undefined, records: ProgressEntry[], steps: Steps, today: string, endedAt?: string): GiftProgress {
  const allocated = allocatedAt !== undefined;
  // Rule (DECISIONS 319): a living gift counts only the steps taken since it was allocated, so a new allocation starts afresh.
  const mine = records.filter((r) => r.key === key && r.kind !== "batch" && (!steps.loop || allocatedAt === undefined || r.at >= allocatedAt));
  if (steps.loop) return loopProgress(allocated, allocatedAt, mine, steps, today, endedAt);
  const rejectAt = mine.filter((r) => r.kind === "reject").map((r) => r.at).sort().at(-1);
  const lastPhase = steps.phases.at(-1)?.id;
  let from = allocatedAt ?? "";
  const rows: StepRow[] = stepsOf(steps).map((s) => {
    // Rule (DECISIONS 320): after a rejection at review, the last phase counts only if it was done again after it, and is due its days after the rejection.
    const reopened = s.kind === "phase" && s.id === lastPhase && rejectAt !== undefined;
    const hit = mine.filter((r) => r.kind === s.kind && r.id === s.id && (!reopened || r.at > (rejectAt as string))).sort((x, y) => y.at.localeCompare(x.at))[0];
    // Rule: a phase is due its days after the step before it was taken (the first, after the gift was allocated).
    const due = allocated && s.days > 0 && from !== "" ? addDays(reopened ? (rejectAt as string) : from, s.days) : "";
    const late = !hit && due !== "" ? Math.max(0, Math.round((Date.parse(today.slice(0, 10) + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / DAY)) : 0;
    if (hit) from = hit.at;
    return { kind: s.kind, id: s.id, label: s.label, done: hit !== undefined, doneAt: hit?.at ?? "", due, lateDays: late };
  });
  // Rule (DECISIONS 320, 322): with no phase to open, a rejection adds the step "Put right by the partner" before Review, until it is marked.
  const fix = rejectAt !== undefined && lastPhase === undefined && !mine.some((r) => r.kind === "stage" && r.id === "resubmit" && r.at > (rejectAt as string));
  if (fix) rows.splice(Math.max(0, rows.findIndex((r) => r.id === "review") >= 0 ? rows.findIndex((r) => r.id === "review") : rows.findIndex((r) => r.id === "report")), 0, { kind: "stage", id: "resubmit", label: STAGE_LABELS.resubmit, done: false, doneAt: "", due: "", lateDays: 0 });
  const next = allocated ? rows.find((r) => !r.done) : undefined;
  const lastStage = [...rows].reverse().find((r) => r.kind === "stage" && r.done && r.id !== "resubmit");
  const complete = rows.some((r) => r.kind === "stage" && r.done && (r.id === "complete" || r.id === "feedback"));
  const rej = mine.filter((r) => r.kind === "reject").sort((x, y) => y.at.localeCompare(x.at))[0];
  const open = rej && (fix ? { label: "" } : rows.find((r) => r.kind === "phase" && r.id === lastPhase && !r.done));
  return { allocated, steps: rows, next, stage: lastStage ? (lastStage.id as Exclude<StageId, "resubmit">) : "allocation", complete, ...(rej && open ? { sentBack: { at: rej.at, reason: rej.reason ?? "", phase: open.label } } : {}) };
}


// The progress of a living gift (DECISIONS 319): the phases and the review once, then rounds of Report and Complete, then Feedback when the loop ends.
function loopProgress(allocated: boolean, allocatedAt: string | undefined, mine: ProgressEntry[], steps: Steps, today: string, endedAt?: string): GiftProgress {
  const loop = steps.loop as { everyDays: number; months?: number };
  const at = (kind: ProgressEntry["kind"], id: string): ProgressEntry[] => mine.filter((r) => r.kind === kind && r.id === id).sort((x, y) => x.at.localeCompare(y.at));
  const rejectAt = mine.filter((r) => r.kind === "reject").map((r) => r.at).sort().at(-1);
  const reports = at("stage", "report"), completes = at("stage", "complete");
  // Rule: the loop ends when the plan was completed, or when the months set for reporting have passed since the first report.
  const monthsEnd = loop.months && reports[0] ? addDays(reports[0].at, Math.round(loop.months * 30.4)) : "";
  const ended = endedAt !== undefined ? endedAt : monthsEnd !== "" && monthsEnd <= today.slice(0, 10) ? monthsEnd : undefined;
  const rounds = completes.length;
  const lateOf = (due: string): number => (due === "" ? 0 : Math.max(0, Math.round((Date.parse(today.slice(0, 10) + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / DAY)));
  let from = allocatedAt ?? "";
  const rows: StepRow[] = [];
  for (const s of stepsOf(steps)) {
    if (s.id === "report" || s.id === "complete" || s.id === "feedback") continue;
    const reopened = s.kind === "phase" && s.id === steps.phases.at(-1)?.id && rejectAt !== undefined;
    const hit = at(s.kind, s.id).filter((r) => !reopened || r.at > (rejectAt as string)).at(-1);
    const due = allocated && s.days > 0 && from !== "" ? addDays(reopened ? (rejectAt as string) : from, s.days) : "";
    if (hit) from = hit.at;
    rows.push({ kind: s.kind, id: s.id, label: s.label, done: hit !== undefined, doneAt: hit?.at ?? "", due, lateDays: hit ? 0 : lateOf(due) });
  }
  const lastDone = completes.at(-1)?.at ?? "";
  const reportDue = rounds === 0 ? "" : addDays(lastDone, loop.everyDays);
  const reported = reports.length > rounds;
  const name = rounds > 0 && !ended ? ` (round ${rounds + 1})` : "";
  rows.push({ kind: "stage", id: "report", label: `${STAGE_LABELS.report}${name}`, done: ended !== undefined || reported, doneAt: reports.at(-1)?.at ?? ended ?? "", due: reported || ended ? "" : reportDue, lateDays: reported || ended ? 0 : lateOf(reportDue) });
  rows.push({ kind: "stage", id: "complete", label: `${STAGE_LABELS.complete}${name}`, done: ended !== undefined, doneAt: ended ?? "", due: "", lateDays: 0 });
  if (steps.feedback) { const fb = at("stage", "feedback").at(-1); rows.push({ kind: "stage", id: "feedback", label: STAGE_LABELS.feedback, done: fb !== undefined, doneAt: fb?.at ?? "", due: "", lateDays: 0 }); }
  // Review sits before the first report: it is already in `rows` from stepsOf, but it must come after the phases and before Report, which it does.
  const next = allocated ? rows.find((r) => !r.done) : undefined;
  return { allocated, steps: rows, next, stage: ended !== undefined || rounds > 0 ? "complete" : reported ? "report" : rows.some((r) => r.id === "review" && r.done) ? "review" : "allocation", complete: rounds > 0 || ended !== undefined, round: rounds + 1, ongoing: allocated && ended === undefined };
}

// ---- Batches (DECISIONS 232): closed by a person once every gift in them is complete ----
export const batchKey = (partnerId: string, batch: number): string => `${partnerId}|${batch}`;
export const isClosed = (records: ProgressEntry[], partnerId: string, batch: number): boolean => {
  const last = records.filter((r) => r.kind === "batch" && r.key === batchKey(partnerId, batch)).sort((x, y) => y.at.localeCompare(x.at))[0];
  return last?.id === "closed";
};

// What the requests need to know about the gifts, supplied by the caller from assignments, allocations and workflows, so this file never reads a store.
export interface ProgressContext {
  gift: (key: string) => { allocatedAt: string | undefined; steps: Steps; endedAt?: string } | undefined; // undefined: not an assigned gift
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
      const p = progressOf(str("key"), g.allocatedAt, existing.records, g.steps, ctx.today, g.endedAt);
      if (!p.allocated) return { error: "That gift is not allocated yet. Allocate it first." };
      if (!p.next) return { error: "Every step of that gift is already taken." };
      return { value: { records: [...existing.records, { key: str("key"), kind: p.next.kind, id: p.next.id, at, by }] }, message: `${p.next.label} taken.` };
    }
    case "prg-reject": {
      const g = ctx.gift(str("key"));
      if (!g) return { error: "That gift was not found, or it is not assigned to a partner." };
      const p = progressOf(str("key"), g.allocatedAt, existing.records, g.steps, ctx.today, g.endedAt);
      if (p.next?.id !== "review") return { error: "Only a gift waiting for its review can be rejected." };
      const last = g.steps.phases.at(-1);
      const reason = str("reason").trim().replace(/\s+/g, " ").slice(0, 300);
      if (reason === "") return { error: "Say why the work is rejected, so the partner knows what to put right." };
      return { value: { records: [...existing.records, { key: str("key"), kind: "reject", id: "review", at, by, reason }] }, message: last ? `Sent back to the partner: ${last.label}.` : "Sent back to the partner." };
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
      const open = keys.filter((k) => { const g = ctx.gift(k); return !g || !progressOf(k, g.allocatedAt, existing.records, g.steps, ctx.today, g.endedAt).complete; }).length;
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
