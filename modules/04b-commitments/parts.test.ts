/**
 * parts.test.ts
 *
 * What it does: tests the gifts that need a person (DECISIONS 129): only gifts of the CRM's Custom Amount item are managed by hand, and no price is ever checked.
 * Also the choices a person makes for a gift. Invented data. These tests double as examples. Who calls it: vitest. Depends on: parts.ts, commitments.ts and catch-up.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { setParts, setPeriods } from "./catch-up";
import { buildCommitments } from "./commitments";
import { CUSTOM_AMOUNT_REASON, markCustomAmounts, setManual } from "./parts";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-08-10 10:00:00", supporterId: "D1", supporterName: "Sample", group: "", itemId: "ORP", itemName: "Orphan Sponsorship",
  amount: 35, quantity: 1, intention: "", subscriptionId: `S${key}`, instalmentNumber: "1", instalmentCount: "", categoryId: "c", frameworkId: "f", status: "ready", ...over,
});

describe("custom amount gifts", () => {
  it("marks a gift of the Custom Amount item for manual allocation, and nothing else", () => {
    const orders = [wo("a", { customAmount: true, itemName: "Custom Amount" }), wo("b"), wo("c", { amount: 70 }), wo("d", { amount: 42 })];
    const changed = markCustomAmounts(orders);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ key: "a", partsManual: CUSTOM_AMOUNT_REASON });
  });
  it("never looks at the price: the same item at 35, 40, 42, 48 or 70 is a unit, whatever the catalogue says today", () => {
    const orders = [35, 40, 42, 48, 70, 17.5, 480].map((amount, i) => wo(`p${i}`, { amount }));
    expect(markCustomAmounts(orders)).toEqual([]);
    // so a plan at the old price of 42 is a normal gift after the catalogue moved to 48
    expect(buildCommitments([wo("old", { amount: 42, subscriptionId: "SOLD", instalmentCount: "10" })]).commitments[0]?.manual).toBe("");
  });
  it("takes the mark off a gift that is no longer of that item, and clears marks an older rule made", () => {
    const stale = wo("a", { partsManual: "A custom amount: 2 times a normal price (35)", partsAuto: 1 });
    const cleared = markCustomAmounts([stale]);
    expect(cleared[0]?.partsManual).toBeUndefined();
    expect(cleared[0]?.partsAuto).toBeUndefined();
    expect(markCustomAmounts([wo("a", { customAmount: true, partsManual: CUSTOM_AMOUNT_REASON })])).toEqual([]); // already marked: nothing to do
  });
  it("leaves alone a legacy upload, an excluded payment, a person's parts and a person's mark", () => {
    const orders = [wo("l", { customAmount: true, legacyUpload: true }), wo("e", { customAmount: true, status: "excluded" }), wo("f", { customAmount: true, partsFixed: 2 }), wo("m", { customAmount: true, partsByPerson: true, partsManual: "Marked by a person" })];
    expect(markCustomAmounts(orders)).toEqual([]);
  });
  it("shows the gift as manual in its commitment, so automatic allocation skips it", () => {
    const marked = markCustomAmounts([wo("a", { customAmount: true })]).map((w) => w);
    expect(buildCommitments(marked).commitments[0]?.manual).toBe(CUSTOM_AMOUNT_REASON);
  });
});

describe("what a person decides for a gift", () => {
  const sub = (key: string, n: number, over: Partial<WorkOrder> = {}) => wo(key, { subscriptionId: "SD", instalmentNumber: String(n), amount: 70, customAmount: true, paidDate: `2026-0${n}-10 10:00:00`, ...over });
  it("a gift stays manual until every payment has its parts, then it is no longer manual and its parts count", () => {
    const marked = markCustomAmounts([sub("a", 1), sub("b", 2), sub("c", 3)]).map((w) => w);
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
    const next = markCustomAmounts([...decided, sub("c", 3)]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ key: "c", partsFixed: 2 });
    expect(markCustomAmounts([...decided, sub("d", 4, { amount: 90 })])[0]?.partsManual).toContain("A custom amount"); // a different amount is its own question
  });
  it("a payment that arrives later takes a manual mark a person made", () => {
    const marked = (setManual(wo("a", { subscriptionId: "SM" }), true) as { order: WorkOrder }).order;
    const next = markCustomAmounts([marked, wo("b", { subscriptionId: "SM", instalmentNumber: "2" })]);
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
    const year = (setPeriods(wo("y", { subscriptionId: "", instalmentNumber: "", instalmentCount: "", amount: 480 }), 12) as { order: WorkOrder }).order;
    expect(year.periodsFixed).toBe(12);
    expect(setPeriods(year, 40)).toHaveProperty("error");
  });
});
