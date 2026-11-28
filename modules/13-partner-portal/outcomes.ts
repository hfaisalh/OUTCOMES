/**
 * outcomes.ts
 *
 * What it does: shows a partner how outcomes work for it (DECISIONS 251). Each gift assigned to the partner is one row that follows the journey: assigned, answered (confirm or refuse), allocated to a child or made into an outcome, then the delivery steps up to Complete. It also counts how many sit at each point.
 * Who calls it: app/portal/partner-outcomes.ts (the partner's screen). Depends on: the partner slice (scope.ts) and the stage words of module 12. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: where a gift stands is the furthest point it has reached: Refused (the partner said no), To answer, Confirmed, Allocated (a child or an outcome holds it), Complete (the Complete step is taken).
 * - Rule: a row never carries anything about the donor. It shows the benefit, the project, the batch, what the gift funds (a child's name or an outcome's ID), and the last step taken.
 * - Rule: the newest gifts come first.
 */

import { STAGE_LABELS, type StageId } from "../12-progress/progress.js";
import { addDays } from "../11-confirmation/confirmation.js";
import type { GiftDetail } from "./gift-details.js";
import type { PartnerSlice } from "./scope.js";

export type Standing = "refused" | "to-answer" | "confirmed" | "allocated" | "complete";
export const STANDING_LABEL: Record<Standing, string> = { refused: "Refused", "to-answer": "To answer", confirmed: "Confirmed", allocated: "Allocated", complete: "Complete" };

export interface PartnerOutcome {
  key: string;
  batch: number | undefined;
  benefit: string;
  project: string;
  funds: string; // the child's name or the outcome's ID, "" when not allocated yet
  standing: Standing;
  step: string; // the last step taken, "" when none
  reason: string; // why it was refused
  since: string; // YYYY-MM-DD
  detail: GiftDetail | undefined; // what the partner may know about the gift (gift-details.ts)
  sentBack?: { reason: string; phase: string; due: string }; // MWF rejected the work at review: why, the phase to put right, and the last day to do it (DECISIONS 321)
}

const words = (id: string): string => { const t = id.replace(/[-_]+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

export function partnerOutcomes(s: PartnerSlice): PartnerOutcome[] {
  const nameOfEnrolment = (id: string): string => { const e = s.enrolments.find((x) => x.id === id); return s.beneficiaries.find((b) => b.id === e?.beneficiaryId)?.name ?? ""; };
  return s.assignments.map((a): PartnerOutcome => {
    const answer = s.confirmations.find((c) => c.key === a.key);
    const held = s.allocations.filter((p) => p.key === a.key && p.to === undefined);
    const steps = s.progress.filter((r) => r.key === a.key && r.kind !== "batch" && r.kind !== "reject");
    // Rule (DECISIONS 321): a partner is told when MWF sent its work back, why, and the last day to put it right: the days of the last phase from the rejection. It is shown until a phase is done again after the rejection.
    const rej = s.progress.filter((r) => r.key === a.key && r.kind === "reject").sort((x, y) => y.at.localeCompare(x.at))[0];
    const lastPhase = s.gifts[a.key]?.phases.at(-1);
    const back = rej && !steps.some((r) => (r.kind === "phase" || r.id === "resubmit") && r.at > rej.at) ? { reason: rej.reason ?? "", phase: lastPhase?.label ?? "", due: lastPhase && lastPhase.days > 0 ? addDays(rej.at.slice(0, 10), lastPhase.days) : "" } : undefined;
    const last = steps[steps.length - 1];
    const standing: Standing = answer?.answer === "rejected" ? "refused" : steps.some((r) => r.kind === "stage" && r.id === "complete") ? "complete" : held.length > 0 ? "allocated" : answer ? "confirmed" : "to-answer";
    return {
      key: a.key, batch: a.batch, benefit: s.itemNames[a.itemId] ?? a.itemId, project: s.giftProjects.find((g) => g.id === a.giftProjectId)?.name ?? "",
      funds: held.map((p) => (p.kind === "beneficiary" ? nameOfEnrolment(p.enrolmentId) : p.outcomeRef)).filter((x) => x !== "").join(", "),
      standing, step: last ? (last.kind === "stage" ? STAGE_LABELS[last.id as StageId] ?? words(last.id) : words(last.id)) : "", reason: answer?.reason ?? "", since: a.at.slice(0, 10), detail: s.gifts[a.key], ...(back ? { sentBack: back } : {}),
    };
  }).sort((x, y) => y.since.localeCompare(x.since) || x.key.localeCompare(y.key));
}

// How many gifts stand at each point, for the journey strip.
export function pipeline(rows: PartnerOutcome[]): Record<Standing, number> {
  const n: Record<Standing, number> = { refused: 0, "to-answer": 0, confirmed: 0, allocated: 0, complete: 0 };
  for (const r of rows) n[r.standing]++;
  return n;
}
