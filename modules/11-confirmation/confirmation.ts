/**
 * confirmation.ts
 *
 * What it does: Confirmation (DECISIONS 139, 202). After a gift is assigned to a partner, the partner has a number of days to say yes (confirm) or no (reject). This file holds the rules: when the answer is due, whether
 * the partner is waiting, confirmed, rejected or late, and what confirming or rejecting records.
 * Who calls it: the server (modules/00-platform/handlers.ts) and the demo (app/main.ts) through applyConfirmationAction, and the Confirmation page. Depends on: modules/09-placement/stock.ts (a partner with parked outcomes is confirmed for).
 * Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: the partner has `days` days from the day the gift was assigned to answer. The workflow sets the days, 3 when it does not.
 * - Rule: an answer belongs to one assignment to one partner. If the gift is reassigned (a different partner, or a later assignment), the old answer no longer counts and the new partner starts waiting.
 * - Rule: a partner that has not answered by the due day is late. It stays waiting, so it can still answer, but the list can show it.
 * - Rule: a rejection must say why, so MWF can pick another partner. The rejection is kept as history.
 * - Rule (DECISIONS 231): a partner that already holds a parked outcome ready for the gift's benefit has nothing to decide, so OUTCOMES confirms on its behalf, marked as such.
 * - Rule: a late answer is advised, not acted on. The list says how many days late, and a person decides whether to move the gift. Nothing is moved automatically.
 * - Nothing is changed in place: every function returns a new value.
 */

import { freeStock, usedStock, type StockItem } from "../09-placement/stock.js";

export const DEFAULT_CONFIRM_DAYS = 3;

export interface ConfirmAssignment { key: string; partnerId: string; at: string } // the parts of an assignment this module needs
export interface Confirmation {
  key: string; // the gift (assignment) it answers
  partnerId: string; // the partner that answered
  answer: "confirmed" | "rejected";
  at: string; // ISO time of the answer
  by: string; // who answered, a display name
  reason: string; // why, required for a rejection, "" for a confirmation
  onBehalf?: boolean; // OUTCOMES answered for the partner because it holds a parked outcome ready (DECISIONS 231)
}
export interface Confirmations { records: Confirmation[] }
export const emptyConfirmations = (): Confirmations => ({ records: [] });

export type ConfirmState = "waiting" | "confirmed" | "rejected";
export interface ConfirmStatus {
  state: ConfirmState;
  due: string; // YYYY-MM-DD, the last day to answer
  lateDays: number; // days past due while still waiting, else 0
  answeredAt: string; // "" while waiting
  reason: string; // the rejection reason, else ""
}

// Adds days to a YYYY-MM-DD date, in UTC so a clock change cannot move it.
export function addDays(day: string, days: number): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// The answer that counts for an assignment: the latest one given by the partner it is with, since it was assigned.
function answerFor(a: ConfirmAssignment, records: Confirmation[]): Confirmation | undefined {
  return records.filter((r) => r.key === a.key && r.partnerId === a.partnerId && r.at >= a.at).sort((x, y) => y.at.localeCompare(x.at))[0];
}

export function confirmationOf(a: ConfirmAssignment, records: Confirmation[], days: number, today: string): ConfirmStatus {
  const due = addDays(a.at, Math.max(0, days));
  const r = answerFor(a, records);
  if (r) return { state: r.answer, due, lateDays: 0, answeredAt: r.at, reason: r.reason };
  return { state: "waiting", due, lateDays: Math.max(0, daysBetween(due, today.slice(0, 10))), answeredAt: "", reason: "" };
}

export type ConfirmResult = { value: Confirmations } | { error: string };

// The partner says yes. A gift that is not assigned, or is already answered, cannot be confirmed again.
export function confirm(existing: Confirmations, a: ConfirmAssignment | undefined, by: string, at: string): ConfirmResult {
  if (!a) return { error: "That gift has not been assigned to a partner." };
  if (answerFor(a, existing.records)) return { error: "That gift has already been answered." };
  return { value: { records: [...existing.records, { key: a.key, partnerId: a.partnerId, answer: "confirmed", at, by, reason: "" }] } };
}

// The partner says no, and says why.
export function reject(existing: Confirmations, a: ConfirmAssignment | undefined, by: string, reason: string, at: string): ConfirmResult {
  if (!a) return { error: "That gift has not been assigned to a partner." };
  if (reason.trim() === "") return { error: "Say why the partner cannot take it, so another partner can be chosen." };
  if (answerFor(a, existing.records)) return { error: "That gift has already been answered." };
  return { value: { records: [...existing.records, { key: a.key, partnerId: a.partnerId, answer: "rejected", at, by, reason: reason.trim() }] } };
}

// ---- On the partner's behalf (DECISIONS 231) ----

// What the stock rule needs of an assignment, beyond the key and partner.
export interface StockAssignment extends ConfirmAssignment { itemId: string; giftProjectId: string }

/**
 * Rule: a partner holding a parked outcome ready for the benefit (in the gift's project) has nothing to decide, so each such assignment still waiting is confirmed for it.
 * Run after every change to assignments. `placed` are the placement records, so a parked outcome a gift already took is not counted twice.
 */
export function confirmOnBehalf(existing: Confirmations, assignments: StockAssignment[], stock: StockItem[], placed: { stockId?: string; to?: string }[], at: string): { value: Confirmations; added: number } {
  let records = existing.records;
  let added = 0;
  const taken = usedStock(placed);
  for (const a of assignments) {
    if (answerFor(a, records)) continue;
    if (!freeStock(stock, taken, a.partnerId, a.itemId, a.giftProjectId)) continue;
    records = [...records, { key: a.key, partnerId: a.partnerId, answer: "confirmed", at, by: "OUTCOMES, for the partner", reason: "", onBehalf: true }];
    added++;
  }
  return { value: { records }, added };
}

/**
 * The requests the Confirmation page makes, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about Confirmation.
 * cnf-confirm and cnf-reject carry the gift `key`; a rejection carries its `reason`. `by` is the display name of the person answering for the partner.
 */
export function applyConfirmationAction(existing: Confirmations, assignments: ConfirmAssignment[], body: Record<string, unknown>, by: string, at: string): ({ value: Confirmations; message?: string } | { error: string }) | null {
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");
  const a = assignments.find((x) => x.key === str("key"));
  switch (body["action"]) {
    case "cnf-confirm": { const r = confirm(existing, a, by, at); return "error" in r ? r : { value: r.value, message: "Confirmed." }; }
    case "cnf-reject": { const r = reject(existing, a, by, str("reason"), at); return "error" in r ? r : { value: r.value, message: "Rejected. Choose another partner for the gift in Assignment." }; }
    case "cnf-reset": return { value: emptyConfirmations(), message: "All answers were cleared." };
    default: return null;
  }
}
