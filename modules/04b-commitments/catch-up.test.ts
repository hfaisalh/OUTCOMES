/**
 * catch-up.test.ts
 *
 * What it does: tests how a payment that covers more than one instalment is spotted, which months it fills, and how it changes the counts. Invented data.
 * These tests double as examples. Who calls it: vitest. Depends on: catch-up.ts, commitments.ts, gifts.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { buildCommitments } from "./commitments";
import { coverage, fillMonths, setCovers, suggestCatchUps } from "./catch-up";
import { giftRows } from "./gifts";

const inst = (n: number, date: string, amount = 35, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key: `L${n}`, lineId: `L${n}`, transactionRef: `T${n}`, paidDate: `${date} 10:00:00`, supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId: "I1", itemName: "Orphan Sponsorship",
  amount, quantity: 1, intention: "", subscriptionId: "S1", instalmentNumber: String(n), instalmentCount: "12", categoryId: "c1", status: "ready", ...over,
});

describe("catch-up payments", () => {
  it("suggests a payment worth twice the usual, and with no gap it covers the month before", () => {
    const all = [inst(1, "2026-08-11", 70), inst(2, "2026-09-11"), inst(3, "2026-10-11"), inst(4, "2026-11-11")];
    const s = suggestCatchUps(all);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ key: "L1", covers: 2, fills: ["2026-07"], usual: 35, value: 70 });
    expect(s[0]?.reason).toBe("70.00 is 2 times the usual 35.00");
  });
  it("fills a gap before the payment when there is one, nearest first", () => {
    const all = [inst(1, "2026-01-05"), inst(2, "2026-03-05", 70), inst(3, "2026-04-05"), inst(4, "2026-05-05")];
    expect(suggestCatchUps(all)[0]?.fills).toEqual(["2026-02"]);
    // two missed months: both gaps are filled before going back past the first payment
    const wide = [inst(1, "2026-01-05"), inst(2, "2026-04-05", 105), inst(3, "2026-05-05"), inst(4, "2026-06-05")];
    expect(suggestCatchUps(wide)[0]).toMatchObject({ covers: 3, fills: ["2026-02", "2026-03"] });
  });
  it("makes no suggestion for normal payments, with too few to know the usual value, or once a person has decided", () => {
    expect(suggestCatchUps([inst(1, "2026-08-11"), inst(2, "2026-09-11"), inst(3, "2026-10-11")])).toEqual([]);
    expect(suggestCatchUps([inst(1, "2026-08-11", 70), inst(2, "2026-09-11")])).toEqual([]);
    expect(suggestCatchUps([inst(1, "2026-08-11", 70, { covers: 1 }), inst(2, "2026-09-11"), inst(3, "2026-10-11")])).toEqual([]);
    expect(suggestCatchUps([inst(1, "2026-08-11", 52), inst(2, "2026-09-11"), inst(3, "2026-10-11")])).toEqual([]); // not a whole multiple
  });
  it("counts the months and instalments a catch-up covers, and the parts per instalment", () => {
    const all = [inst(1, "2026-08-11", 70, { quantity: 2, covers: 2 }), inst(2, "2026-09-11"), inst(3, "2026-10-11"), inst(4, "2026-11-11")];
    expect(coverage(all).months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    const c = buildCommitments(all).commitments[0]!;
    expect(c.paid).toBe(5);
    expect(c.partsPerInstalment).toBe(1);
    expect(c.partsVary).toBe(false); // the 2 parts on the first payment were 2 instalments of 1
    expect(c.paidMonths).toHaveLength(5);
  });
  it("is a note on the gift that needs a look, until it is decided", () => {
    const all = [inst(1, "2026-08-11", 70), inst(2, "2026-09-11"), inst(3, "2026-10-11")];
    const row = giftRows(all, all)[0]!;
    expect(row.needsLook).toBe(true);
    expect(row.catchUps).toHaveLength(1);
    expect(row.notes.some((n) => n.text === "Possible catch-up payment")).toBe(true);
    const decided = [{ ...all[0]!, covers: 2 }, ...all.slice(1)];
    expect(giftRows(decided, decided)[0]?.catchUps).toEqual([]);
  });
  it("fillMonths never fills a month that is already covered", () => {
    expect(fillMonths("2026-05", 2, new Set(["2026-03", "2026-04", "2026-05"]))).toEqual(["2026-01", "2026-02"]);
  });
  it("lets a person set 1 to 6 on an unstarted payment, and nothing else", () => {
    expect(setCovers(inst(1, "2026-08-11"), 2)).toMatchObject({ order: { covers: 2 } });
    expect(setCovers(inst(1, "2026-08-11"), 0)).toHaveProperty("error");
    expect(setCovers(inst(1, "2026-08-11"), 2.5)).toHaveProperty("error");
    expect(setCovers(inst(1, "2026-08-11", 35, { status: "excluded" }), 2)).toHaveProperty("error");
  });
});
