/**
 * parts.test.ts
 *
 * What it does: tests the check of each payment against the prices an item really sells at, learned from the gifts and the catalogue (DECISIONS 127), and the
 * choices a person makes for a gift. Invented data. These tests double as examples. Who calls it: vitest. Depends on: parts.ts, commitments.ts and catch-up.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { setParts, setPeriods } from "./catch-up";
import { buildCommitments } from "./commitments";
import { applyPrices, choosePrice, emptyBook, judgePayment, priceTable, setManual, unitPrice, type PriceBook } from "./parts";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-08-10 10:00:00", supporterId: "D1", supporterName: "Sample", group: "", itemId: "ORP", itemName: "Orphan Sponsorship",
  amount: 35, quantity: 1, intention: "", subscriptionId: `S${key}`, instalmentNumber: "1", instalmentCount: "", categoryId: "c", frameworkId: "shared", status: "ready", ...over,
});
const oneOff = (key: string, over: Partial<WorkOrder> = {}) => wo(key, { subscriptionId: "", instalmentNumber: "", instalmentCount: "", ...over });
// Five gifts at 35, five at 40 (a newer price), and some at other prices.
const many = (price: number, n: number, from = 0, over: Partial<WorkOrder> = {}) => Array.from({ length: n }, (_, i) => wo(`p${price}-${from + i}`, { amount: price, ...over }));
const base = (): WorkOrder[] => [...many(35, 5), ...many(40, 4, 0, { paidDate: "2026-11-01 10:00:00" })];

describe("the unit price of a payment", () => {
  it("is the payment divided by its bundle size and by the months a single payment covers", () => {
    expect(unitPrice(wo("a", { amount: 35 }))).toBe(35);
    expect(unitPrice(wo("a", { amount: 105, bundleQty: 3 }))).toBe(35); // a bundle of 3 at 105
    expect(unitPrice(oneOff("a", { amount: 480, periodCount: 12 }))).toBe(40); // a year at once
    expect(unitPrice(oneOff("a", { amount: 1440, bundleQty: 3, periodCount: 12 }))).toBe(40);
    expect(unitPrice(oneOff("a", { amount: 420 }))).toBe(420); // months not given: one month
    expect(unitPrice(oneOff("a", { amount: 420, periodsFixed: 12 }))).toBe(35); // a person's months win
  });
});

describe("the prices an item has sold at", () => {
  it("counts gifts and payments at each price, with the first and last dates", () => {
    const t = priceTable([...base(), wo("x", { subscriptionId: "SX", amount: 35, paidDate: "2026-09-10 10:00:00" }), wo("y", { subscriptionId: "SX", amount: 35, paidDate: "2026-10-10 10:00:00", instalmentNumber: "2" })], emptyBook());
    const p35 = t.find((e) => e.price === 35)!;
    expect(p35).toMatchObject({ gifts: 6, payments: 7, first: "2026-08-10", last: "2026-10-10", valid: true });
    expect(t.find((e) => e.price === 40)).toMatchObject({ gifts: 4, valid: true }); // seen on 3 or more gifts: valid, so a price change is found by itself
  });
  it("makes a price valid when it is in the catalogue, accepted, or seen often, and unusual otherwise or when rejected", () => {
    const orders = [...base(), wo("odd1", { amount: 70 }), wo("odd2", { amount: 70 })];
    expect(priceTable(orders, emptyBook()).find((e) => e.price === 70)).toMatchObject({ gifts: 2, valid: false, kind: "unusual" }); // two gifts is not enough, and 70 is 2 x 35
    const cat: PriceBook = { ...emptyBook(), catalogue: { ORP: [35, 40, 70] } };
    expect(priceTable(orders, cat).find((e) => e.price === 70)).toMatchObject({ valid: true, inCatalogue: true });
    expect(priceTable(orders, choosePrice(emptyBook(), "ORP", 70, "accept")).find((e) => e.price === 70)).toMatchObject({ valid: true, accepted: true });
    expect(priceTable(orders, choosePrice(emptyBook(), "ORP", 35, "reject")).find((e) => e.price === 35)).toMatchObject({ valid: false, rejected: true });
    // a catalogue price that no gift has used yet is still listed
    expect(priceTable(orders, { ...emptyBook(), catalogue: { ORP: [45] } }).find((e) => e.price === 45)).toMatchObject({ gifts: 0, inCatalogue: true, valid: true });
    // legacy and excluded payments are not counted
    expect(priceTable([wo("l", { legacyUpload: true }), wo("e", { status: "excluded" })], emptyBook())).toEqual([]);
  });
});

describe("judging a payment", () => {
  const t = priceTable(base(), emptyBook());
  it("is normal at a valid price, whichever price list it came from", () => {
    expect(judgePayment(wo("a", { amount: 35 }), t)).toEqual({ ok: true });
    expect(judgePayment(wo("a", { amount: 40 }), t)).toEqual({ ok: true });
    expect(judgePayment(wo("a", { amount: 120, bundleQty: 3 }), t)).toEqual({ ok: true }); // 3 parts at 40
    expect(judgePayment(oneOff("a", { amount: 480, periodCount: 12 }), t)).toEqual({ ok: true }); // a year at 40
    expect(judgePayment(oneOff("a", { amount: 420, periodCount: 12 }), t)).toEqual({ ok: true }); // a year at 35, an older price still valid
  });
  it("is custom when the price is a whole multiple or a fraction of a normal price, even 70, and says why", () => {
    const v = judgePayment(wo("a", { amount: 70 }), t);
    expect(v).toMatchObject({ ok: false, valid: [35, 40] });
    expect(!v.ok && v.reason).toBe("A custom amount: 2 times a normal price (35). 70 a part a month. Prices seen for this item: 35, 40");
    const half = judgePayment(wo("a", { amount: 17.5 }), t);
    expect(!half.ok && half.reason).toContain("a half of a normal price (35)");
    expect(judgePayment(wo("a", { amount: 105 }), t).ok).toBe(false); // 3 x 35, entered as an amount with no bundle
  });
  it("treats a price that is an earlier or newer catalogue price as the going price, without flagging it (DECISIONS 128)", () => {
    // an item sold at 42, then 48 now: neither is a multiple of the other, so a gift at the old price is not custom
    const history = [...many(48, 5), wo("old", { amount: 42, subscriptionId: "SOLD", itemId: "ORP" })];
    const table = priceTable(history, emptyBook());
    expect(table.find((e) => e.price === 42)).toMatchObject({ gifts: 1, valid: false, kind: "assumed" });
    expect(judgePayment(wo("a", { amount: 42 }), table)).toEqual({ ok: true });
    expect(applyPrices(history, emptyBook())).toEqual([]); // nothing is marked
    // the same with a catalogue that already lists only the new price
    expect(judgePayment(wo("a", { amount: 42 }), priceTable([wo("old", { amount: 42, subscriptionId: "SOLD" })], { ...emptyBook(), catalogue: { ORP: [48] } }))).toEqual({ ok: true });
    // a price 1 gift at 37 (not a multiple or a fraction of 35 or 40) is assumed too
    expect(judgePayment(wo("a", { amount: 37 }), t)).toEqual({ ok: true });
  });
  it("has nothing to compare an item with no normal price against, so it flags nothing", () => {
    expect(judgePayment(wo("a", { itemId: "NEW", amount: 999 }), t)).toEqual({ ok: true });
  });
  it("suggests the months for a single payment that has none, when it is a whole multiple of a normal price", () => {
    const v = judgePayment(oneOff("a", { amount: 480 }), t); // paid once, no months: 480 / 40 = 12, and 12 x 40 is a multiple
    expect(v).toMatchObject({ ok: false, months: 12 });
    expect(judgePayment(oneOff("a", { amount: 37 }), t)).toEqual({ ok: true }); // 37 is not a multiple or a simple fraction of 35 or 40, so it is assumed
  });
});

describe("marking payments", () => {
  it("marks a payment at an unusual price, and takes the mark off when the price becomes valid", () => {
    const orders = [...base(), wo("odd", { amount: 70, subscriptionId: "SODD" })];
    const marked = applyPrices(orders, emptyBook());
    expect(marked).toHaveLength(1);
    expect(marked[0]).toMatchObject({ key: "odd" });
    expect(marked[0]?.partsManual).toContain("A custom amount: 2 times a normal price (35). 70 a part a month");
    // accept the price: the mark goes
    const after = orders.map((w) => marked.find((m) => m.key === w.key) ?? w);
    const cleared = applyPrices(after, choosePrice(emptyBook(), "ORP", 70, "accept"));
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.partsManual).toBeUndefined();
    // rejecting a price that was normal marks its gifts
    const rejected = applyPrices(base(), choosePrice(emptyBook(), "ORP", 35, "reject"));
    expect(rejected).toHaveLength(5);
    expect(rejected.every((w) => w.partsManual !== undefined)).toBe(true);
  });
  it("finds a price change by itself: a new price is the going price at once, not flagged", () => {
    const early = [...many(35, 5), wo("n1", { amount: 40 })];
    expect(applyPrices(early, emptyBook())).toEqual([]); // 40 is not a multiple or a fraction of 35
  });
  it("leaves alone a legacy upload, an excluded payment, a person's parts and a person's mark", () => {
    const orders = [...base(), wo("l", { amount: 70, legacyUpload: true }), wo("e", { amount: 70, status: "excluded" }), wo("f", { amount: 70, partsFixed: 2 }), wo("m", { amount: 70, partsByPerson: true, partsManual: "Marked by a person" })];
    expect(applyPrices(orders, emptyBook())).toEqual([]);
  });
});

describe("what a person decides for a gift", () => {
  const sub = (key: string, n: number, over: Partial<WorkOrder> = {}) => wo(key, { subscriptionId: "SD", instalmentNumber: String(n), amount: 70, paidDate: `2026-0${n}-10 10:00:00`, ...over });
  it("a gift stays manual until every payment has its parts, then it is no longer manual and its parts count", () => {
    const marked = applyPrices([...base(), sub("a", 1), sub("b", 2), sub("c", 3)], emptyBook()).filter((w) => w.subscriptionId === "SD");
    expect(marked.every((w) => w.partsManual !== undefined)).toBe(true);
    expect(buildCommitments(marked).commitments[0]?.manual).toContain("A custom amount");
    const one = marked.map((w, i) => (i === 0 ? { ...w, partsFixed: 2 } : w));
    expect(buildCommitments(one).commitments[0]?.manual).toContain("A custom amount"); // the other payments still carry the mark
    const all = marked.map((w) => ({ ...w, partsFixed: 2 }));
    const c = buildCommitments(all).commitments[0]!;
    expect(c.manual).toBe("");
    expect(c.partsPerInstalment).toBe(2);
  });
  it("a payment that arrives later takes what the person decided, instead of being marked custom again", () => {
    const decided = [sub("a", 1), sub("b", 2)].map((w) => ({ ...w, partsFixed: 2 }));
    const next = applyPrices([...base(), ...decided, sub("c", 3)], emptyBook());
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ key: "c", partsFixed: 2 });
    const other = applyPrices([...base(), ...decided, sub("d", 4, { amount: 140 })], emptyBook());
    expect(other[0]?.partsManual).toContain("A custom amount: 4 times a normal price (35)"); // a different amount is its own question
  });
  it("a payment that arrives later takes a manual mark a person made", () => {
    const marked = (setManual(wo("a", { subscriptionId: "SM", amount: 35 }), true) as { order: WorkOrder }).order;
    const next = applyPrices([...base(), marked, wo("b", { subscriptionId: "SM", amount: 35, instalmentNumber: "2" })], emptyBook());
    expect(next.find((w) => w.key === "b")).toMatchObject({ partsManual: "Marked by a person", partsByPerson: true });
  });
  it("a person can mark a payment manual and take the mark back, and choose parts, reset them, and set the months", () => {
    const m = (setManual(wo("a"), true) as { order: WorkOrder }).order;
    expect(m).toMatchObject({ partsManual: "Marked by a person", partsByPerson: true });
    expect((setManual(m, false) as { order: WorkOrder }).order.partsManual).toBeUndefined();
    expect(setManual(wo("a", { status: "excluded" }), true)).toHaveProperty("error");
    const chosen = (setParts(wo("a", { amount: 70, partsManual: "x" }), 2) as { order: WorkOrder }).order;
    expect(chosen.partsFixed).toBe(2);
    expect((setParts(chosen, 0) as { order: WorkOrder }).order.partsFixed).toBeUndefined();
    expect(setParts(chosen, 21)).toHaveProperty("error");
    const year = (setPeriods(oneOff("y", { amount: 480 }), 12) as { order: WorkOrder }).order;
    expect(year.periodsFixed).toBe(12);
    expect(judgePayment(year, priceTable(base(), emptyBook()))).toEqual({ ok: true }); // 480 over 12 months is 40 a part
    expect(setPeriods(year, 40)).toHaveProperty("error");
  });
});

describe("choosing a price", () => {
  it("accepts, rejects and clears a price for an item, replacing an earlier choice", () => {
    let b = choosePrice(emptyBook(), "ORP", 70, "accept");
    expect(b.accepted).toEqual([{ itemId: "ORP", price: 70 }]);
    b = choosePrice(b, "ORP", 70, "reject");
    expect(b).toMatchObject({ accepted: [], rejected: [{ itemId: "ORP", price: 70 }] });
    expect(choosePrice(b, "ORP", 70, "clear")).toMatchObject({ accepted: [], rejected: [] });
  });
});
