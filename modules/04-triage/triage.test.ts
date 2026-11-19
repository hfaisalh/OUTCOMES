/**
 * triage.test.ts
 *
 * What it does: tests the Needs attention list on invented work orders and review items.
 */

import { describe, expect, it } from "vitest";
import type { ReviewItem, WorkOrder } from "../01c-crm-connector/work-orders";
import { applyDecision, buildAttention } from "./triage";

const order = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: "T", paidDate: "2026-06-10", supporterId: "D1", supporterName: "Sample Donor", group: "", itemId: "I1", itemName: "Water Pump", amount: 100, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "", status: "unrouted", ...over,
});
const review = (key: string, reason: ReviewItem["reason"] = "changed"): ReviewItem => ({ key, reason, message: "The amount changed." });
const input = (over = {}) => ({ workOrders: [], review: [], notes: [], marks: {}, ...over });

describe("buildAttention", () => {
  it("makes one entry per unrouted item, with how many work orders wait", () => {
    const a = buildAttention(input({ workOrders: [order("T:1"), order("T:2"), order("T:3", { itemId: "I2", itemName: "Well" }), order("T:4", { status: "ready", categoryId: "c" })] }));
    expect(a.map((i) => [i.id, i.count])).toEqual([["unrouted:I1", 2], ["unrouted:I2", 1]]);
  });

  it("clears an unrouted entry by itself once its work orders are routed", () => {
    expect(buildAttention(input({ workOrders: [order("T:1", { status: "ready", categoryId: "c" })] }))).toEqual([]);
  });

  it("lists import problems once each, and held changes with their work order", () => {
    const a = buildAttention(input({ notes: ["1 line has a bad date.", "1 line has a bad date."], review: [review("T:1")], workOrders: [order("T:1")] }));
    expect(a.filter((i) => i.kind === "import")).toHaveLength(1);
    const changed = a.find((i) => i.kind === "changed")!;
    expect(changed.detail).toContain("Water Pump");
    expect(changed.title).toContain("Changed in the CRM");
  });

  it("puts reviewed entries last, with the note, and keeps them reviewed", () => {
    const base = input({ review: [review("T:1"), review("T:2", "missing_from_feed")], workOrders: [order("T:1"), order("T:2")] });
    const marks = applyDecision({}, "changed:T:1", "review", "2026-11-19T10:00:00Z", "Checked with the CRM team");
    const a = buildAttention({ ...base, marks });
    expect(a.map((i) => [i.id, i.status])).toEqual([["unrouted:I1", "open"], ["missing_from_feed:T:2", "open"], ["changed:T:1", "reviewed"]]);
    expect(a.at(-1)?.note).toBe("Checked with the CRM team");
  });

  it("reopens an entry", () => {
    const marks = applyDecision(applyDecision({}, "x", "review", "t", "n"), "x", "reopen", "t", "");
    expect(marks).toEqual({});
  });

  it("never lets an unrouted entry be marked reviewed", () => {
    const a = buildAttention(input({ workOrders: [order("T:1")], marks: { "unrouted:I1": { at: "t", note: "" } } }));
    expect(a[0]?.status).toBe("open");
  });
});

describe("the lines behind each entry (DECISIONS 48)", () => {
  const w = (key: string, over: Record<string, unknown> = {}) => ({ key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-06-10 10:00:00", supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId: "I1", itemName: "Water Pump", amount: 100, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "", status: "unrouted", ...over }) as never;

  it("lists the unrouted lines under the item, capped, with the full count", () => {
    const many = Array.from({ length: 40 }, (_, i) => w(String(i + 1)));
    const e = buildAttention({ workOrders: many, review: [], notes: [], marks: {} })[0]!;
    expect(e.count).toBe(40);
    expect(e.lines).toHaveLength(25);
    expect(e.lines?.[0]).toMatchObject({ key: "1", ref: "T1", paidDate: "2026-06-10", instalment: "One-off" });
  });

  it("shows the saved and current values for a change, and the work order it is about", () => {
    const e = buildAttention({ workOrders: [w("7", { status: "ready", instalmentNumber: "2", instalmentCount: "12" })], review: [{ key: "7", reason: "changed", message: "m", was: "amount 100", now: "amount 90" }], notes: [], marks: {} })[0]!;
    expect([e.workOrderKey, e.was, e.now, e.lines?.[0]?.instalment]).toEqual(["7", "amount 100", "amount 90", "2 of 12"]);
  });
});
