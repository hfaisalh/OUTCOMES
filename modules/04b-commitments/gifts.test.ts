/**
 * gifts.test.ts
 *
 * What it does: tests how work orders become gifts for the one list, on invented data. These tests double as examples.
 * Who calls it: vitest. Depends on: gifts.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { giftRows } from "./gifts";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-06-10 10:00:00", supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId: "I1", itemName: "Orphan Sponsorship",
  amount: 40, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "c1", status: "ready", ...over,
});
const inst = (key: string, n: number, date: string, over: Partial<WorkOrder> = {}) => wo(key, { subscriptionId: "S1", instalmentNumber: String(n), instalmentCount: "12", paidDate: `${date} 10:00:00`, ...over });

describe("giftRows", () => {
  it("puts a subscription's payments in one row, with paid of planned and its dates", () => {
    const all = [inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01"), inst("3", 3, "2026-08-01")];
    const rows = giftRows(all, all);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "S1", kind: "recurring", allocationKey: "S1", paid: 3, planned: 12, firstPaid: "2026-06-01", lastPaid: "2026-08-01", needsLook: false });
    expect(rows[0]?.payments.map((w) => w.key)).toEqual(["1", "2", "3"]);
  });
  it("shows a single payment as its own row, allocated under its own key", () => {
    const one = wo("9", { periodCount: 12, bundleQty: 3 });
    const rows = giftRows([one], [one]);
    expect(rows[0]).toMatchObject({ key: "once-9", kind: "one_off", allocationKey: "once-9", parts: 3, paid: 1, periodCount: 12 });
  });
  it("shows a row when any of its payments is in the list, but carries all of its payments and its true totals", () => {
    const all = [inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01"), inst("3", 3, "2026-08-01")];
    const rows = giftRows([all[1]!], all); // the filters kept only one payment
    expect(rows).toHaveLength(1);
    expect(rows[0]?.paid).toBe(3);
    expect(rows[0]?.payments).toHaveLength(3);
  });
  it("flags a gift that needs a look, and lists those first", () => {
    const gap = [inst("1", 1, "2026-06-01"), inst("3", 3, "2026-08-01")];
    const fine = [wo("9", { paidDate: "2026-09-01 10:00:00" })];
    const rows = giftRows([...gap, ...fine], [...gap, ...fine]);
    expect(rows.map((r) => r.key)).toEqual(["S1", "once-9"]);
    expect(rows[0]).toMatchObject({ needsLook: true });
    expect(rows[0]?.notes.map((n) => n.text)).toContain("Missing instalment 2");
  });
  it("shows a recurring line with no subscription on its own, flagged, with the commitments it may belong to", () => {
    const all = [inst("1", 1, "2026-06-01"), wo("5", { instalmentCount: "12", paidDate: "2026-06-03 10:00:00" })];
    const row = giftRows(all, all).find((r) => r.kind === "unlinked")!;
    expect(row).toMatchObject({ key: "line-5", allocationKey: "", needsLook: true });
    expect(row.suggestions[0]).toMatchObject({ subscriptionId: "S1", daysApart: 2 });
    expect(row.notes[0]?.text).toContain("no subscription");
  });
  it("shows an excluded payment on its own so it can be restored, and leaves it out of the gift it was in", () => {
    const all = [inst("1", 1, "2026-06-01"), inst("2", 2, "2026-07-01", { status: "excluded" })];
    const live = giftRows(all.filter((w) => w.status !== "excluded"), all);
    expect(live[0]?.paid).toBe(1);
    const excluded = giftRows(all.filter((w) => w.status === "excluded"), all);
    expect(excluded[0]).toMatchObject({ kind: "excluded", key: "x-2", allocationKey: "" });
  });
  it("flags a payment waiting for a category and a payment held for review, and carries the donor's project", () => {
    const all = [inst("1", 1, "2026-06-01", { status: "unrouted", projectName: "Aghosh" })];
    const row = giftRows(all, all, new Set(["1"]))[0]!;
    expect(row).toMatchObject({ unrouted: true, inReview: true, projectName: "Aghosh" });
  });
  it("keeps a legacy opening out of the counts and the dates, and says so", () => {
    const all = [inst("0", 1, "2026-10-31", { legacyUpload: true }), inst("1", 2, "2026-07-01")];
    const row = giftRows(all, all)[0]!;
    expect(row.paid).toBe(1);
    expect(row.firstPaid).toBe("2026-07-01");
    expect(row.notes.map((n) => n.text)).toContain("Legacy opening");
    expect(row.payments).toHaveLength(2); // but it is still listed under its gift
  });
});
