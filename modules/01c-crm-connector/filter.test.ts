/**
 * filter.test.ts
 *
 * What it does: tests the work order filter on invented work orders. These tests double as examples.
 * Who calls it: vitest. Depends on: filter.ts.
 */

import { describe, expect, it } from "vitest";
import { filterWorkOrders, isFiltering, NO_CRITERIA } from "./filter";
import type { WorkOrder } from "./work-orders";

const wo = (over: Partial<WorkOrder>): WorkOrder => ({ key: "1", lineId: "1", transactionRef: "MWFUK-1", paidDate: "2026-06-10 10:00:00", supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId: "I1", itemName: "Water Pump", amount: 10, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "c1", status: "ready", ...over });
const list = [
  wo({ key: "1" }),
  wo({ key: "2", itemId: "I2", itemName: "Orphan Sponsorship", subscriptionId: "55", instalmentNumber: "1", categoryId: "c2", paidDate: "2026-07-01 09:00:00", supporterName: "Another Person" }),
  wo({ key: "3", paidDate: "2026-08-15 09:00:00", transactionRef: "ARCHIVE-9", categoryId: "" }),
];
const keys = (c: Partial<typeof NO_CRITERIA>) => filterWorkOrders(list, { ...NO_CRITERIA, ...c }).map((w) => w.key);

describe("filterWorkOrders", () => {
  it("shows everything with no criteria", () => {
    expect(keys({})).toEqual(["1", "2", "3"]);
    expect(isFiltering(NO_CRITERIA)).toBe(false);
  });
  it("matches words in any order, ignoring case, across reference, supporter, item and ids", () => {
    expect(keys({ text: "archive" })).toEqual(["3"]);
    expect(keys({ text: "person another" })).toEqual(["2"]);
    expect(keys({ text: "pump d1" })).toEqual(["1", "3"]);
    expect(keys({ text: "55" })).toEqual(["2"]);
  });
  it("filters by item, category, and one-off or recurring", () => {
    expect(keys({ itemId: "I2" })).toEqual(["2"]);
    expect(keys({ categoryId: "c1" })).toEqual(["1"]);
    expect(keys({ kind: "recurring" })).toEqual(["2"]);
    expect(keys({ kind: "oneoff" })).toEqual(["1", "3"]);
  });
  it("filters by status", () => {
    expect(filterWorkOrders([wo({ key: "1" }), wo({ key: "2", status: "excluded" })], { ...NO_CRITERIA, status: "excluded" }).map((w) => w.key)).toEqual(["2"]);
  });
  it("filters by paid dates, both ends included", () => {
    expect(keys({ from: "2026-07-01" })).toEqual(["2", "3"]);
    expect(keys({ to: "2026-07-01" })).toEqual(["1", "2"]);
    expect(keys({ from: "2026-07-01", to: "2026-07-01" })).toEqual(["2"]);
  });
  it("needs every filled box to match", () => {
    expect(keys({ kind: "oneoff", text: "archive", itemId: "I1" })).toEqual(["3"]);
    expect(keys({ kind: "recurring", text: "archive" })).toEqual([]);
  });
});
