/**
 * catch-up.test.ts
 *
 * What it does: tests how a payment that covers more than one instalment is spotted, which months it fills, and how it changes the counts. Invented data.
 * These tests double as examples. Who calls it: vitest. Depends on: catch-up.ts, commitments.ts, gifts.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import { buildCommitments } from "./commitments";
import { coverage, fillMonths, setCovers, setLooked, setParts, suggestCatchUps, suggestPartFixes } from "./catch-up";
import { giftRows } from "./gifts";
import { giftDetailHtml } from "../../app/gifts-page";
import type { View } from "../../app/pages";

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
    expect(s[0]?.reason).toBe("70 is 2 times the usual 35");
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
  it("shows parts that differ as resolved, not hidden, once a catch-up is applied, and the gift stops needing a look", () => {
    const raw = [inst(1, "2026-08-11", 35, { quantity: 2 }), inst(2, "2026-09-11"), inst(3, "2026-10-11")];
    expect(giftRows(raw, raw)[0]?.notes.some((n) => n.text === "Parts differ between instalments" && !n.resolved)).toBe(true);
    const fixed = [{ ...raw[0]!, covers: 2 }, ...raw.slice(1)];
    const row = giftRows(fixed, fixed)[0]!;
    expect(row.notes).toEqual([{ text: "Parts differ between instalments", title: "Resolved: a payment was marked as covering more than one instalment.", resolved: true }]);
    expect(row.needsLook).toBe(false);
  });
  it("lets a person check what is left, which holds until the notes change", () => {
    const gap = [inst(1, "2026-08-11"), inst(3, "2026-10-11"), inst(4, "2026-11-11")];
    const open = giftRows(gap, gap)[0]!;
    expect(open.needsLook).toBe(true);
    expect(open.lookSignature).toBe("Missing instalment 2");
    const checked = gap.map((w, i) => (i === 0 ? (setLooked(w, open.lookSignature) as { order: WorkOrder }).order : w));
    const done = giftRows(checked, checked)[0]!;
    expect(done.checked).toBe(true);
    expect(done.needsLook).toBe(false);
    expect(done.notes.every((n) => n.resolved)).toBe(true);
    // a new problem (another missing instalment) makes the notes differ, so it is open again
    const more = [...checked, inst(6, "2027-01-11")];
    expect(giftRows(more, more)[0]?.needsLook).toBe(true);
    // and the check can be taken back
    expect((setLooked(checked[0]!, "") as { order: WorkOrder }).order.looked).toBeUndefined();
  });
  it("walks subscription 83: a catch-up and two quantities that look wrong are each suggested, and applying them resolves the note without a manual check", () => {
    const sub83 = [inst(1, "2026-08-11", 35, { quantity: 2 }), inst(2, "2026-09-11", 35), inst(3, "2026-10-11", 17.5, { quantity: 2 }), inst(4, "2026-11-11", 17.5, { quantity: 2 })];
    // the line totals are 70, 35, 35 and 35
    const row = giftRows(sub83, sub83)[0]!;
    expect(row.catchUps.map((x) => x.key)).toEqual(["L1"]);
    expect(row.partFixes.map((x) => [x.key, x.parts])).toEqual([["L3", 1], ["L4", 1]]);
    expect(row.needsLook).toBe(true);
    // apply them
    const done = sub83.map((w) => (w.key === "L1" ? { ...w, covers: 2 } : w.key === "L3" || w.key === "L4" ? (setParts(w, 1) as { order: WorkOrder }).order : w));
    const after = giftRows(done, done)[0]!;
    expect(after.catchUps).toEqual([]);
    expect(after.partFixes).toEqual([]);
    expect(after.notes.every((n) => n.resolved)).toBe(true);
    expect(after.needsLook).toBe(false);
    expect(after.paid).toBe(5);
    expect(after.adjustments).toEqual(["Payment T1 marked as covering 2 instalments", "Payment T3 set to 1 part (the CRM says 2)", "Payment T4 set to 1 part (the CRM says 2)"]);
    expect(giftRows(sub83, sub83)[0]?.adjustments).toEqual([]); // untouched data shows none
    // saying the CRM is right keeps the quantity and stops the suggestion
    expect(suggestPartFixes([sub83[0]!, sub83[1]!, (setParts(sub83[2]!, 2) as { order: WorkOrder }).order, sub83[3]!]).map((x) => x.key)).toEqual(["L4"]);
  });
  it("keeps the log of manual changes in its own small window, opened by an info button", () => {
    const done = [{ ...inst(1, "2026-08-11", 35, { quantity: 2 }), covers: 2 }, inst(2, "2026-09-11"), inst(3, "2026-10-11")];
    const v = { workOrders: done, review: [], categories: [], frameworks: [], today: "2026-11-22" } as unknown as View;
    const closed = giftDetailHtml(v, "S1", false);
    expect(closed).toContain('data-gift-log="open"');
    expect(closed).not.toContain("Changed by hand here. The CRM does not know");
    const open = giftDetailHtml(v, "S1", true);
    expect(open).toContain("Changed by hand here. The CRM does not know");
    expect(open).toContain("marked as covering 2 instalments");
  });
  it("shows values with the currency symbol (DECISIONS 95)", () => {
    const done = [inst(1, "2026-08-11", 35, { currency: "GBP" }), inst(2, "2026-09-11", 35, { currency: "GBP" })];
    const v = { workOrders: done, review: [], categories: [], frameworks: [], today: "2026-11-22" } as unknown as View;
    const html = giftDetailHtml(v, "S1", false);
    expect(html).toContain("\u00A370"); // the gift total
    expect(html).toContain("\u00A335"); // a payment
    expect(giftDetailHtml({ ...v, workOrders: done.map((w) => ({ ...w, currency: "XYZ" })) } as View, "S1")).toContain("XYZ 70");
    expect(giftDetailHtml({ ...v, workOrders: done.map((w) => ({ ...w, currency: undefined })) } as View, "S1")).toContain(">70<"); // none given, none shown
  });
  it("shows the IDs of the outcome and the allocation in the gift window (DECISIONS 105)", () => {
    const done = [inst(1, "2026-08-11"), inst(2, "2026-09-11")];
    const v = { workOrders: done, review: [], categories: [], today: "2026-11-22",
      frameworks: [{ id: "f", name: "F", unit: "orphan", cycle: "monthly", reports: [], instalment: "per_period", unitsPerBeneficiary: 1 }],
      outcomes: [{ id: "o1", name: "Ali", type: "orphan", cohort: "", frameworkId: "f", active: true, ref: "ORP-0007", outcomeTypeId: "orphan" }],
      allocations: [{ commitmentKey: "S1", outcomeId: "o1", parts: 1, how: "auto", at: "t", ref: "AL-0012" }] } as unknown as View;
    const html = giftDetailHtml({ ...v, workOrders: done.map((w) => ({ ...w, frameworkId: "f" })) } as View, "S1");
    expect(html).toContain("ORP-0007");
    expect(html).toContain("Allocation AL-0012");
  });
});
