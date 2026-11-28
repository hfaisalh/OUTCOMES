/**
 * sweep.ts
 *
 * What it does: the daily sweep (DECISIONS 326): looks at every gift waiting for a partner's answer and every phase waiting to be done, and works out which partners to remind, which to tell they are late, and which unanswered gifts to move to another partner.
 * Who calls it: the server and demo (the auto-run request, and the scheduled job), through applySweep. Depends on: rules.ts, messages.ts and the confirmation and assignment rules. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 * Data flow: waiting gifts and due phases (built by the caller from the records) + the settings -> new messages and the gifts to move -> applySweep returns the updated answers, assignments and inbox.
 *
 * Rules:
 * - Rule: one reminder for each partner and deadline, not one for each gift: "3 gifts to accept or refuse are due by 02/12/26". The message key holds the deadline, so the same reminder is never left twice.
 * - Rule: a reminder goes out when a deadline is exactly the days set away (0 means on the day). A late notice goes out each day a partner has something late, one message for all of it.
 * - Rule: an unanswered gift moves only when its workflow sets a number of days (moveAfterDays) and it is that many days past its deadline. Only the gifts still unanswered move: a gift the partner accepted stays, even in the same batch.
 * - Rule: a move is a refusal in the partner's name, "No answer within N days", recorded by Automation, so the history is kept and the same partner is not chosen again; the gift is taken back from the partner and goes through Assignment again.
 */

import { reject, type Confirmations } from "../11-confirmation/confirmation.js";
import { unassign, type Assignments } from "../08-assignment/assignment.js";
import { autoRulesOf, type AutoRules } from "./rules.js";
import { addMessages, dueMessage, movedMessage, type NewMessage, type PartnerMessage } from "./messages.js";

export interface WaitingGift { key: string; partnerId: string; due: string; lateDays: number; moveAfterDays?: number }
export interface DuePhase { key: string; partnerId: string; due: string; lateDays: number }
export interface SweepInput { today: string; rules: AutoRules; waiting: WaitingGift[]; phases: DuePhase[] }
export interface SweepResult { messages: NewMessage[]; moves: { key: string; partnerId: string; days: number }[] }

const DAY = 86400000;
const daysUntil = (today: string, due: string): number => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);

export function sweep(i: SweepInput): SweepResult {
  const messages: NewMessage[] = [];
  const moves: SweepResult["moves"] = [];
  const moved = new Set<string>();
  // The moves come first, so a gift that is moving is not also reminded about.
  for (const w of i.waiting) if (w.moveAfterDays !== undefined && w.lateDays >= w.moveAfterDays) { moves.push({ key: w.key, partnerId: w.partnerId, days: w.moveAfterDays }); moved.add(w.key); }
  const byPartner = new Map<string, Map<string, number>>();
  for (const m of moves) { const p = byPartner.get(m.partnerId) ?? new Map<string, number>(); p.set(String(m.days), (p.get(String(m.days)) ?? 0) + 1); byPartner.set(m.partnerId, p); }
  for (const [partnerId, days] of byPartner) for (const [d, n] of days) messages.push(movedMessage(partnerId, n, Number(d), i.today));
  if (!i.rules.remind) return { messages, moves };
  const remind = (what: "answer" | "phase", list: { key: string; partnerId: string; due: string; lateDays: number }[]): void => {
    const soon = new Map<string, number>(); // partner|due -> gifts
    const late = new Map<string, number>(); // partner -> gifts
    for (const g of list.filter((x) => !moved.has(x.key))) {
      if (g.lateDays > 0) late.set(g.partnerId, (late.get(g.partnerId) ?? 0) + 1);
      else if (daysUntil(i.today, g.due) === i.rules.remindBefore) soon.set(`${g.partnerId}|${g.due}`, (soon.get(`${g.partnerId}|${g.due}`) ?? 0) + 1);
    }
    for (const [k, n] of soon) { const [p, due] = k.split("|") as [string, string]; messages.push(dueMessage("reminder", p, what, n, due, i.today)); }
    if (i.rules.remindLate) for (const [p, n] of late) messages.push(dueMessage("late", p, what, n, "", i.today));
  };
  remind("answer", i.waiting);
  remind("phase", i.phases);
  return { messages, moves };
}

// --- Applying the sweep to the records ---
export interface SweepState { confirmations: Confirmations; assignments: Assignments; messages: PartnerMessage[] }
export function applySweep(state: SweepState, input: SweepInput, at: string): { value: SweepState; reminded: number; moved: number } {
  const r = sweep({ ...input, rules: autoRulesOf(input.rules) });
  let { confirmations, assignments } = state;
  let moved = 0;
  for (const m of r.moves) {
    const a = assignments.records.find((x) => x.key === m.key);
    const done = reject(confirmations, a, "Automation", `No answer within ${m.days} day${m.days === 1 ? "" : "s"} of the deadline`, at);
    if ("error" in done) continue;
    const back = unassign(assignments, m.key);
    if ("error" in back) continue;
    confirmations = done.value; assignments = back.value; moved++;
  }
  const added = addMessages(state.messages, r.messages);
  return { value: { confirmations, assignments, messages: added.value }, reminded: r.messages.filter((m) => m.kind !== "moved").length, moved };
}
