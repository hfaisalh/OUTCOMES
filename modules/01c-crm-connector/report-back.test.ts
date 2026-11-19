/**
 * report-back.test.ts
 *
 * What it does: tests report-back.ts. Only status and a report link go back to the CRM.
 */

import { describe, expect, it } from "vitest";
import { readFeed } from "./feed";
import { sampleRows } from "./sample";
import { buildReportBack } from "./report-back";
import { planWorkOrders, type WorkOrder } from "./work-orders";

const made = planWorkOrders(readFeed(sampleRows()).lines, [], { usesFrameworks: true, frameworkByItem: { I10: "orphan" } }).created;
const withStatus = (i: number, status: WorkOrder["status"]): WorkOrder => ({ ...(made[i] as WorkOrder), status });
const NOW = "2026-11-19T09:00:00Z";

describe("buildReportBack", () => {
  it("sends only reportable stages", () => {
    const r = buildReportBack([{ workOrder: made[0] as WorkOrder }, { workOrder: withStatus(0, "delivered") }], NOW);
    expect(r.items.map((i) => i.status)).toEqual(["delivered"]);
  });

  it("carries ids, status and the report link, and nothing else", () => {
    const r = buildReportBack([{ workOrder: withStatus(0, "reported"), reportUrl: "https://reports.example.org/r/1" }], NOW);
    expect(Object.keys(r.items[0] ?? {}).sort()).toEqual(["lineId", "reportUrl", "status", "supporterId", "transactionRef", "updatedAt", "workOrderKey"]);
  });

  it("refuses a link that is not https and a reported order with no link", () => {
    const r = buildReportBack([{ workOrder: withStatus(0, "reported"), reportUrl: "http://x.example.org" }, { workOrder: withStatus(1, "reported") }], NOW);
    expect(r.items).toEqual([]);
    expect(r.problems).toHaveLength(2);
  });
});
