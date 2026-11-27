/**
 * answer.ts
 *
 * What it does: lets a partner answer for itself (DECISIONS 254): accept or refuse one gift, or a whole batch at once, from its own screen. It hands the answer to the same Confirmation rule the staff screens use, but only ever with the gifts assigned to this partner, so a partner can never answer for another's.
 * Who calls it: the server (modules/00-platform/partner-handler.ts). Depends on: modules/11-confirmation/confirmation.ts. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a partner may only accept or refuse (single or batch). Clearing all answers (cnf-reset) is never open to it.
 * - Rule: only gifts assigned to this partner are known here, so a key that belongs to another partner is answered as "not assigned", the same as a key that does not exist.
 * - Rule: a refusal must say why (the Confirmation rule enforces it), so MWF can pick another partner.
 * - Rule: the answer records who gave it, the partner user's display name.
 */

import { applyConfirmationAction, type Confirmations } from "../11-confirmation/confirmation.js";
import type { Assignment } from "../08-assignment/assignment.js";

const ALLOWED = ["cnf-confirm", "cnf-reject", "cnf-confirm-batch", "cnf-reject-batch"];

export type AnswerResult = { value: Confirmations; message: string } | { error: string };

export function partnerAnswer(existing: Confirmations, assignments: Assignment[], partnerId: string, body: Record<string, unknown>, by: string, at: string): AnswerResult {
  if (typeof body["action"] !== "string" || !ALLOWED.includes(body["action"])) return { error: "That request is not open to a partner." };
  const mine = assignments.filter((a) => a.partnerId === partnerId);
  const r = applyConfirmationAction(existing, mine, body, by, at);
  if (!r) return { error: "That request is not understood." };
  if ("error" in r) return r;
  // The staff wording tells a person to go to Assignment. A partner is told what happens next, in its own words.
  const refused = body["action"] === "cnf-reject" || body["action"] === "cnf-reject-batch";
  return { value: r.value, message: refused ? "Refused. MWF will choose another partner for it." : (r.message ?? "Accepted.").replace(/^Confirmed/, "Accepted") };
}
