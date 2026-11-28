/**
 * run.ts
 *
 * What it does: the sweep applied to a whole set of records (DECISIONS 326): from the work orders, partners, workflows and the records of assignments, answers, allocations and steps, it works out where every gift stands, runs the sweep and returns the new answers, assignments and inbox messages. The one place the server and the demo both call.
 * Who calls it: the server (modules/00-platform/outcomes-handler.ts, auto-sweep) and the demo (app/main.ts). Depends on: the assignment, progress and confirmation rules and sweep.ts. Pure: no database, no screen.
 */

import type { WorkOrder } from "../01c-crm-connector/work-orders.js";
import type { FrameworkTemplate } from "../02-project-rules/categories.js";
import type { OutcomeType } from "../05-outcomes/outcome-types.js";
import type { GiftProject, Project } from "../06-projects/projects.js";
import { assignables, contextFrom, type Assignments } from "../08-assignment/assignment.js";
import { batchSizeOf } from "../08-assignment/batches.js";
import { prioritySet } from "../08-assignment/priority-gifts.js";
import type { Allocations } from "../09-allocation/allocation.js";
import type { Confirmations } from "../11-confirmation/confirmation.js";
import { standings } from "../12-progress/context.js";
import type { Progress } from "../12-progress/progress.js";
import type { PartnerMessage } from "./messages.js";
import { sweepInput } from "./input.js";
import { autoRulesOf, type AutoRules } from "./rules.js";
import { applySweep } from "./sweep.js";

export interface SweepRecords {
  workOrders: WorkOrder[]; partners: Project[]; giftProjects: GiftProject[]; frameworks: FrameworkTemplate[]; outcomeTypes: OutcomeType[];
  assignments: Assignments; confirmations: Confirmations; allocations: Allocations; progress: Progress; messages: PartnerMessage[];
  priorityGifts?: string[]; rules?: Partial<AutoRules>;
}

export function sweepRecords(r: SweepRecords, at: string): { assignments: Assignments; confirmations: Confirmations; messages: PartnerMessage[]; reminded: number; moved: number } {
  const today = at.slice(0, 10);
  const actx = contextFrom({ urgent: prioritySet(r.priorityGifts), workOrders: r.workOrders, partners: r.partners, giftProjects: r.giftProjects, frameworks: r.frameworks, outcomeTypes: r.outcomeTypes, today, now: at });
  const fwOf = new Map(assignables(actx).map((u) => [u.key, u.w.frameworkId ?? ""]));
  const stand = standings({ assignments: r.assignments.records, allocations: r.allocations.records, frameworkOf: (k) => fwOf.get(k) ?? "", frameworks: r.frameworks, sizeOf: (id) => batchSizeOf(r.partners.find((x) => x.id === id)), today }, r.progress.records);
  const input = sweepInput({ today, rules: autoRulesOf(r.rules), assignments: r.assignments.records, confirmations: r.confirmations.records, frameworks: r.frameworks, frameworkOf: (k) => fwOf.get(k) ?? "", standings: stand });
  const done = applySweep({ confirmations: r.confirmations, assignments: r.assignments, messages: r.messages }, input, at);
  return { ...done.value, reminded: done.reminded, moved: done.moved };
}
