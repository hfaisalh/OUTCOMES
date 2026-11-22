/**
 * parts.test.ts
 *
 * What it does: tests parts from the price of one part, with a price history and custom amounts for manual allocation (DECISIONS 112, 113).
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: parts.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { applyPartPrices, derivePartsFor, priceAt, setManual, type PartPrice } from "./parts";

const PRICES: PartPrice[] = [{ from: "2000-01-01", price: 35 }, { from: "2027-01-01", price: 40 }];
const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-08-10 10:00:00", supporterId: "D1", supporterName: "Sample", group: "", itemId: "I1", itemName: "Orphan Sponsorship",
  amount: 35, quantity: 1, intention: "", subscriptionId: "S1", instalmentNumber: "1", instalmentCount: "", categoryId: "c", frameworkId: "shared", status: "ready", ...over,
});
const pricesOf = (id: string): PartPrice[] => (id === "shared" ? PRICES : []);

describe("the price of one part", () => {
  it("is the latest price that has started by the date", () => {
    expect(priceAt(PRICES, "2026-12-31")).toBe(35);
    expect(priceAt(PRICES, "2027-01-01")).toBe(40);
    expect(priceAt(PRICES, "1999-01-01")).toBeNull();
    expect(priceAt([], "2026-01-01")).toBeNull();
  });
});

describe("parts of a payment", () => {
  it("is the payment divided by the price: 35 is 1 part, 70 is 2, 105 is 3", () => {
    expect(derivePartsFor(wo("a", { amount: 35 }), PRICES, "2026-08-10")).toEqual({ parts: 1 });
    expect(derivePartsFor(wo("a", { amount: 70 }), PRICES, "2026-08-10")).toEqual({ parts: 2 });
    expect(derivePartsFor(wo("a", { amount: 35, quantity: 3 }), PRICES, "2026-08-10")).toEqual({ parts: 3 }); // the line total is what counts
  });
  it("keeps a bundle as it is, and never takes parts from the amount for it", () => {
    expect(derivePartsFor(wo("a", { amount: 480, bundleQty: 3 }), PRICES, "2026-08-10")).toEqual({ parts: 3 });
  });
  it("divides a single payment that covers several months by those months too", () => {
    const year = wo("a", { subscriptionId: "", instalmentNumber: "", instalmentCount: "", amount: 420, periodCount: 12 });
    expect(derivePartsFor(year, PRICES, "2026-08-10")).toEqual({ parts: 1 }); // 35 x 12 months is one part for a year
    expect(derivePartsFor({ ...year, amount: 840 }, PRICES, "2026-08-10")).toEqual({ parts: 2 });
  });
  it("marks a payment that is not a clean multiple as custom, with the reason, and never guesses", () => {
    expect(derivePartsFor(wo("a", { amount: 40 }), PRICES, "2026-08-10")).toEqual({ manual: "40 is not a whole number of 35 parts" });
    expect(derivePartsFor(wo("a", { amount: 50 }), PRICES, "2026-08-10")).toHaveProperty("manual");
    expect(derivePartsFor(wo("a", { amount: 10 }), PRICES, "2026-08-10")).toHaveProperty("manual"); // less than one part
    expect(derivePartsFor(wo("a"), PRICES, "1999-01-01")).toEqual({ manual: "No price for a part had started by 1999-01-01" });
  });
  it("uses the price in force on the gift's first payment, so a price change affects new gifts only", () => {
    // an existing subscriber who started in 2026 keeps paying 35 after the price becomes 40: still 1 part
    const old = [wo("p1", { paidDate: "2026-12-10 10:00:00" }), wo("p2", { paidDate: "2027-02-10 10:00:00", instalmentNumber: "2" })];
    const done = applyPartPrices(old, pricesOf);
    expect(done.map((w) => w.partsAuto)).toEqual([1, 1]);
    // a new subscriber from 2027 at 35 is not a clean multiple of 40: custom
    const fresh = [wo("n1", { subscriptionId: "S2", paidDate: "2027-02-10 10:00:00" })];
    expect(applyPartPrices(fresh, pricesOf)[0]?.partsManual).toBe("35 is not a whole number of 40 parts");
    // and at 80 it is 2 parts
    expect(applyPartPrices([wo("n2", { subscriptionId: "S3", paidDate: "2027-02-10 10:00:00", amount: 80 })], pricesOf)[0]?.partsAuto).toBe(2);
  });
});

describe("applying part prices to work orders", () => {
  it("leaves alone a framework with no price, a legacy upload, an excluded one, and one a person has set", () => {
    const orders = [wo("a", { frameworkId: "other" }), wo("b", { legacyUpload: true }), wo("c", { status: "excluded" }), wo("d", { partsFixed: 2 }), wo("e", { partsByPerson: true, partsManual: "Marked by a person" })];
    expect(applyPartPrices(orders, pricesOf)).toEqual([]);
  });
  it("keeps parts once worked out, even when the price list changes after", () => {
    const first = applyPartPrices([wo("a", { amount: 35 })], pricesOf);
    expect(first[0]?.partsAuto).toBe(1);
    const again = applyPartPrices(first, () => [{ from: "2000-01-01", price: 10 }]);
    expect(again).toEqual([]); // already has its parts
  });
  it("looks at a manual one again when a price is added, and clears the mark", () => {
    const noPrice = applyPartPrices([wo("a", { amount: 70 })], (id) => (id === "shared" ? [{ from: "2030-01-01", price: 35 }] : []));
    expect(noPrice[0]?.partsManual).toContain("No price");
    const later = applyPartPrices(noPrice, pricesOf);
    expect(later[0]).toMatchObject({ partsAuto: 2 });
    expect(later[0]?.partsManual).toBeUndefined();
  });
});

describe("marking a gift manual by hand", () => {
  it("marks a payment manual and takes the mark back", () => {
    const marked = (setManual(wo("a", { partsAuto: 1 }), true) as { order: WorkOrder }).order;
    expect(marked).toMatchObject({ partsManual: "Marked by a person", partsByPerson: true });
    expect(marked.partsAuto).toBeUndefined();
    const back = (setManual(marked, false) as { order: WorkOrder }).order;
    expect(back.partsManual).toBeUndefined();
    expect(applyPartPrices([back], pricesOf)[0]?.partsAuto).toBe(1); // the price decides again
    expect(setManual(wo("a", { status: "excluded" }), true)).toHaveProperty("error");
  });
});
