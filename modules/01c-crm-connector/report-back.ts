/**
 * report-back.ts
 *
 * What it does: builds the small message OUTCOMES sends back to the CRM, so the CRM's donor portal
 * and communications can show delivery status and feedback reports (DECISIONS 30).
 * Who calls it: the report-back step of the pick-up job and Module 7 (donor feedback).
 * Depends on: work-orders.ts (pure functions, no database, no screen).
 *
 * Rule: only status and a report link go back. Never money, never contact details, never child data.
 */

import type { WorkOrder, WorkOrderStatus } from "./work-orders.js";

// The only stages the CRM is told about. "unrouted" and "ready" are internal to OUTCOMES.
export const REPORTABLE: WorkOrderStatus[] = ["in_progress", "delivered", "reported"];

export interface ReportBackItem {
  workOrderKey: string;
  transactionRef: string;
  lineId: string;
  supporterId: string; // the CRM's own donor id, so the CRM can find the donor
  status: WorkOrderStatus;
  reportUrl: string; // "" until a report exists
  updatedAt: string; // ISO timestamp
}

export interface ReportBackUpdate {
  workOrder: WorkOrder;
  reportUrl?: string;
}

export interface ReportBackResult {
  items: ReportBackItem[];
  problems: string[];
}

/**
 * Rules: skip work orders that are not at a reportable stage. A report link must be https. A
 * "reported" work order must have a link, or it is not sent and a problem is listed.
 */
export function buildReportBack(updates: ReportBackUpdate[], now: string): ReportBackResult {
  const items: ReportBackItem[] = [];
  const problems: string[] = [];
  for (const { workOrder: w, reportUrl = "" } of updates) {
    if (!REPORTABLE.includes(w.status)) continue;
    if (reportUrl !== "" && !/^https:\/\//i.test(reportUrl)) {
      problems.push(`${w.key}: the report link must start with https://, so it was not sent.`);
      continue;
    }
    if (w.status === "reported" && reportUrl === "") {
      problems.push(`${w.key}: marked reported but has no report link, so it was not sent.`);
      continue;
    }
    items.push({ workOrderKey: w.key, transactionRef: w.transactionRef, lineId: w.lineId, supporterId: w.supporterId, status: w.status, reportUrl, updatedAt: now });
  }
  return { items, problems };
}
