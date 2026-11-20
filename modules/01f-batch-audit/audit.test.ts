/**
 * audit.test.ts
 *
 * What it does: tests the batch audit on invented lines. The tests double as examples of what an
 * audit reports and, as important, what it does not.
 */

import { describe, expect, it } from "vitest";
import type { FeedLine } from "../01c-crm-connector/feed";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { auditFeed, coverageOf } from "./audit";

const line = (id: string, over: Partial<FeedLine> = {}): FeedLine => ({
  row: 1, lineId: id, transactionRef: `T${id}`, paidDate: "2026-06-10", supporterId: "D1", supporterName: "Sample", group: "", channel: "", merchant: "", method: "",
  itemId: "I1", itemName: "Water Pump", amount: 100, quantity: 1, bundleQty: 1, periodCount: 0, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", planStatus: "", planNextDue: "", planPaid: null, needsFeedback: true, legacyUpload: false, supporterKind: "individual", credits: [], ...over,
});
const order = (id: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key: id, lineId: id, transactionRef: `T${id}`, paidDate: "2026-06-10", supporterId: "D1", supporterName: "Sample", group: "", itemId: "I1", itemName: "Water Pump", amount: 100,
  quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "", status: "unrouted", ...over,
});

describe("auditFeed", () => {
  it("counts new lines that need feedback as added, and ignores new lines that do not", () => {
    const r = auditFeed([line("1"), line("2", { needsFeedback: false })], [], { complete: true });
    expect(r.counts.added).toBe(1);
    expect(r.addedSample).toEqual(["1"]);
  });

  it("reports a changed amount, a changed supporter and a moved item, and leaves the rest unchanged", () => {
    const stored = [order("1"), order("2"), order("3"), order("4")];
    const feed = [line("1", { amount: 90 }), line("2", { supporterId: "D9" }), line("3", { itemId: "I2", itemName: "Well" }), line("4")];
    const r = auditFeed(feed, stored, { complete: true });
    expect(r.counts).toMatchObject({ changed: 2, moved: 1, unchanged: 1, added: 0 });
    expect(r.findings.find((f) => f.key === "3")?.kind).toBe("moved");
  });

  it("reports an item that no longer needs feedback", () => {
    expect(auditFeed([line("1", { needsFeedback: false })], [order("1")], { complete: true }).counts.no_longer_needs_feedback).toBe(1);
  });

  it("reports a removed line only inside the dates the feed covers", () => {
    const stored = [order("1"), order("2", { paidDate: "2026-12-01" })]; // 2 is outside the feed's dates
    const feed = [line("9", { paidDate: "2026-06-01" }), line("8", { paidDate: "2026-06-30" })];
    const r = auditFeed(feed, stored, { complete: true });
    expect(r.counts.removed).toBe(1);
    expect(r.findings.map((f) => f.key)).toEqual(["1"]);
  });

  it("does not judge missing lines when the feed is not complete", () => {
    expect(auditFeed([line("9")], [order("1")], { complete: false }).counts.removed).toBe(0);
  });

  it("works out the dates a feed covers", () => {
    expect(coverageOf([line("1", { paidDate: "2026-03-01" }), line("2", { paidDate: "2026-09-30" }), line("3", { paidDate: "" })])).toEqual({ from: "2026-03-01", to: "2026-09-30" });
    expect(coverageOf([])).toEqual({ from: "", to: "" });
  });
});

describe("legacy uploads (DECISIONS 55)", () => {
  it("ignores a legacy upload's date when working out what the feed covers", () => {
    expect(coverageOf([line("1", { paidDate: "2026-02-01" }), line("2", { paidDate: "2026-10-31" }), line("3", { paidDate: "2026-12-31", legacyUpload: true })])).toEqual({ from: "2026-02-01", to: "2026-10-31" });
  });
});
