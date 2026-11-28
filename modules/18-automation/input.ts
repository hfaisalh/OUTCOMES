/**
 * input.ts
 *
 * What it does: turns the records the app holds into what the sweep needs (DECISIONS 326), and works out the messages that follow an assignment run and a rejection at review. One place, so the server and the demo behave the same.
 * Who calls it: the server (modules/00-platform/outcomes-handler.ts) and the demo (app/main.ts). Depends on: the confirmation, workflow and progress rules, and messages.ts. Pure: no database, no screen.
 */

import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import { confirmDaysOf } from "../02-project-rules/workflows.js";
import type { Assignment } from "../08-assignment/assignment.js";
import { confirmationOf, DEFAULT_CONFIRM_DAYS, type Confirmation } from "../11-confirmation/confirmation.js";
import type { GiftStanding } from "../12-progress/context.js";
import { newBatchMessage, sentBackMessage, type NewMessage } from "./messages.js";
import type { AutoRules } from "./rules.js";
import type { SweepInput } from "./sweep.js";

// What the sweep looks at: each assignment still waiting for its answer (with its workflow's days to move it), and each phase a partner has next.
export function sweepInput(a: { today: string; rules: AutoRules; assignments: Assignment[]; confirmations: Confirmation[]; frameworks: FrameworkTemplate[]; frameworkOf: (key: string) => string; standings: GiftStanding[] }): SweepInput {
  const waiting = a.assignments.flatMap((x) => {
    const fw = a.frameworks.find((f) => f.id === a.frameworkOf(x.key));
    const st = confirmationOf(x, a.confirmations, fw ? confirmDaysOf(fw) : DEFAULT_CONFIRM_DAYS, a.today);
    return st.state === "waiting" ? [{ key: x.key, partnerId: x.partnerId, due: st.due, lateDays: st.lateDays, ...(fw?.moveAfterDays ? { moveAfterDays: fw.moveAfterDays } : {}) }] : [];
  });
  const phases = a.standings.flatMap((s) => (s.allocated && s.next?.kind === "phase" && s.next.due !== "" ? [{ key: s.key, partnerId: s.partnerId, due: s.next.due, lateDays: s.next.lateDays }] : []));
  return { today: a.today, rules: a.rules, waiting, phases };
}

// Rule: a partner is told when gifts are assigned to it: one message for each batch it received gifts in.
export function newBatchMessages(before: Assignment[], after: Assignment[], at: string): NewMessage[] {
  const had = new Set(before.map((x) => x.key));
  const fresh = after.filter((x) => !had.has(x.key));
  const by = new Map<string, { partnerId: string; batch: number | undefined; n: number }>();
  for (const x of fresh) { const k = `${x.partnerId}|${x.batch ?? 0}`; const e = by.get(k); by.set(k, { partnerId: x.partnerId, batch: x.batch, n: (e?.n ?? 0) + 1 }); }
  return [...by.values()].map((e) => newBatchMessage(e.partnerId, e.batch, e.n, at));
}

// Rule: a partner is told when MWF sends its work back: the reason, the phase to put right and the last day.
export function sentBackFor(a: { key: string; partnerId: string } | undefined, s: GiftStanding | undefined, benefit: string, at: string): NewMessage | undefined {
  if (!a || !s?.sentBack) return undefined;
  const phase = s.steps.find((x) => x.kind === "phase" && !x.done);
  return sentBackMessage(a.partnerId, benefit, s.sentBack.phase, s.sentBack.reason, phase?.due ?? "", at, a.key);
}
