/**
 * gift-details.ts
 *
 * What it does: what a partner may know about a gift assigned to it, so it can decide whether to accept (DECISIONS 259): what the gift is, how big, one-off or recurring, the cause and intention, the tribute, what delivering it involves (the workflow's phases and days) and the last day to answer.
 * Who calls it: the server (modules/00-platform/partner-handler.ts), which gives the result to the partner's slice (scope.ts). Depends on: the work order type, the assignment record, the workflow's steps (modules 2, 8, 11, 12). Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: nothing about the donor is ever included: no name, ID, group, contact or order reference. Nor any money: no amount, price or cost (agreed with Faisal).
 * - Rule: the tribute is shown from the start, since it is part of what the partner is asked to deliver (Faisal).
 * - Rule: the gift is found from its assignment key. A recurring plan is "sub:" and its subscription id, joining every payment of the plan. Anything else is one work order.
 * - Rule: the facts are read from the earliest payment of the plan. The tribute is the first one given. How many payments are made so far is counted from the work orders, or taken from the plan when the CRM says.
 * - Rule: the days to answer are the workflow's (3 when it has none), counted from the day the gift was assigned.
 */

import type { WorkOrder } from "../01c-crm-connector/work-orders.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import { confirmDaysOf } from "../02-project-rules/workflows.js";
import type { Assignment } from "../08-assignment/assignment.js";
import { addDays } from "../11-confirmation/confirmation.js";
import { stepsFor } from "../12-progress/context.js";
import { journeyStart, type ItemTimelines } from "../02-project-rules/timeline.js";

export interface GiftDetail {
  reference: string; // the gift's own key (a CRM line or plan id), for the partner to quote back to MWF
  recurring: boolean;
  units: number; // the units of the benefit this gift asks the partner to deliver
  planned?: number; // a recurring plan: how many payments it is for, when the CRM says
  paid?: number; // a recurring plan: how many payments so far
  cause: string;
  intention: string;
  tribute: string;
  phases: { label: string; days: number }[]; // what delivering it involves, in order
  review: boolean; // MWF reviews the work before it is reported
  feedback: boolean; // the donor is asked for feedback
  answerBy: string; // YYYY-MM-DD, the last day to accept or refuse
  completeWithin: number; // the days the delivery phases add up to, counted from allocation (DECISIONS 315)
  completeBy?: string; // YYYY-MM-DD, the journey start (or allocation date) plus those days. Absent until known
}

export interface GiftDetailInput { assignments: Assignment[]; workOrders: WorkOrder[]; frameworks: FrameworkTemplate[]; allocations?: { key: string; at: string }[]; itemTimelines?: ItemTimelines }

export function giftDetails(i: GiftDetailInput): Record<string, GiftDetail> {
  const out: Record<string, GiftDetail> = {};
  for (const a of i.assignments) {
    const recurring = a.key.startsWith("sub:");
    const group = i.workOrders.filter((w) => (recurring ? w.subscriptionId === a.key.slice(4) : w.key === a.key)).sort((x, y) => x.paidDate.localeCompare(y.paidDate));
    const first = group[0];
    const fw = i.frameworks.find((f) => f.id === first?.frameworkId);
    const steps = stepsFor(fw);
    // Rule (DECISIONS 315): a partner is told how long it has to complete a gift: the days of its phases in all, and the last day once the gift is allocated (the earliest allocation of it).
    // Rule (DECISIONS 316): when the benefit sets its days to fulfil, they count from the start of the gift's journey; otherwise the days of the phases count from allocation.
    const own = first ? i.itemTimelines?.[first.itemId]?.days : undefined;
    const planN = (first?.instalmentCount ?? "") === "" ? 1 : /^indefinite/i.test(first?.instalmentCount ?? "") ? "open" as const : Number(first?.instalmentCount) > 0 ? Number(first?.instalmentCount) : null;
    const began = own ? journeyStart(fw?.instalment, { paid: group.map((w) => w.paidDate.slice(0, 10)), planned: planN }) : null;
    const completeWithin = own ?? steps.phases.reduce((t, p) => t + p.days, 0);
    const allocatedAt = (i.allocations ?? []).filter((r) => r.key === a.key).map((r) => r.at.slice(0, 10)).sort()[0];
    const planned = recurring ? Number(first?.instalmentCount) : NaN;
    out[a.key] = {
      reference: a.key, recurring, units: a.parts,
      ...(recurring && planned > 0 ? { planned } : {}),
      ...(recurring ? { paid: first?.planPaid ?? group.length } : {}),
      cause: first?.cause ?? "", intention: first?.intention ?? "", tribute: group.find((w) => (w.tribute ?? "") !== "")?.tribute ?? "",
      phases: steps.phases.map((p) => ({ label: p.label, days: p.days })), review: steps.review, feedback: steps.feedback,
      completeWithin, ...(own && began ? { completeBy: addDays(began, own) } : !own && allocatedAt && completeWithin > 0 ? { completeBy: addDays(allocatedAt, completeWithin) } : {}),
      answerBy: addDays(a.at.slice(0, 10), fw ? confirmDaysOf(fw) : 3),
    };
  }
  return out;
}
