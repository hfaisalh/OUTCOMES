/**
 * stage.ts
 *
 * What it does: works out which stage of its workflow a gift is in now (DECISIONS 141, 142), from what is known about it: whether it has a workflow, whether it is funded, and whether it
 * has been placed in an outcome. The stages follow the workflow chart, named as states for the gift list: Gift, WO created, Assigned, Confirmed, Allocated, Reviewed, Reported, Completed, Feedback.
 * Who calls it: the Gifts list and window (app/gifts-page.ts). Depends on: nothing. Pure functions: no database, no screen, so they can be ported to Apex.
 *
 * Rules:
 * - A gift with no workflow is still at Gift: there is nothing to move it on. An excluded payment has no stage.
 * - A gift that is paused or cancelled is parked where it is, and says so.
 * - A gift whose workflow releases only when fully paid stays at Work order, funding, until every payment is in. Other gifts are released as each payment arrives.
 * - A released gift not yet placed is at Assignment: waiting for a partner, or, once Assignment has given it one, assigned to that partner and waiting for a place (DECISIONS 176). A gift placed in an outcome or an open place is at Allocation.
 * - Confirmation, Review, Report, Complete and Feedback need the partner side, which is not built yet, so nothing is put there for now.
 */

export type GiftStage = "gift" | "work-order" | "assignment" | "confirmation" | "allocation" | "review" | "report" | "complete" | "feedback";

// Rule (DECISIONS 142): the gift list uses short state names, so they do not overflow. The workflow chart uses the action names (Work order, Assignment, Confirmation, Allocation, Review, Report, Complete, Feedback).
export const STAGE_TITLES: Record<GiftStage, string> = {
  gift: "Gift", "work-order": "WO created", assignment: "Assigned", confirmation: "Confirmed", allocation: "Allocated", review: "Reviewed", report: "Reported", complete: "Completed", feedback: "Feedback",
};

export interface StageInput {
  kind: "recurring" | "one_off" | "unlinked" | "excluded";
  hasWorkflow: boolean;
  holdUntilPaid: boolean; // the workflow releases only when fully paid
  planStatus: string; // the CRM plan's status, "" when unknown
  paid: number; // real payments held
  planned: number | null; // payments planned, null when not known or without end
  placement: "placed" | "waiting" | "manual" | "none" | "n/a"; // where the allocation stands today
  where: string; // for a placed gift, a short account of where, for example "Orphan at Partner A"
  assignedTo?: string; // the partner it was assigned to (DECISIONS 176), when it has one and is not placed yet
}

export interface StageResult { stage: GiftStage | null; note: string }

export function giftStage(i: StageInput): StageResult {
  if (i.kind === "excluded" || i.placement === "n/a") return { stage: null, note: "" };
  if (!i.hasWorkflow) return { stage: "gift", note: "Choose a workflow for its item" };
  if (i.planStatus === "cancelled") return { stage: "gift", note: "Plan cancelled, parked" };
  // Rule (DECISIONS 189): a plan the CRM has completed holds no place, like a paused or cancelled one, so it is not called Assigned.
  if (i.planStatus === "completed" && i.placement !== "placed") return { stage: "work-order", note: "Plan completed, it holds no place" };
  if (i.placement === "manual") return { stage: "work-order", note: "Units are set manually" };
  if (i.planStatus === "paused") return { stage: "work-order", note: "Plan paused, parked until payments resume" };
  // Rule: a gift that waits to be fully paid is funding until every payment is in. A one-off payment is already in full.
  if (i.holdUntilPaid && i.kind !== "one_off" && (i.planned === null || i.paid < i.planned)) {
    return { stage: "work-order", note: `Funding, ${i.paid} of ${i.planned ?? "?"} paid` };
  }
  if (i.placement === "placed") return { stage: "allocation", note: i.where };
  // Rule (DECISIONS 189): Assigned means a partner has been given. A released gift with no partner yet is still at WO created.
  if (i.placement === "waiting") return i.assignedTo ? { stage: "assignment", note: `Assigned to ${i.assignedTo}, waiting for a place` } : { stage: "work-order", note: "Released, waiting for a partner" };
  return { stage: "gift", note: "" };
}
