/**
 * history.test.ts
 *
 * What it does: tests the allocation history (DECISIONS 186) on invented allocations: a gift that held one child, was paused, and later held another; a child sponsored by several gifts over time; a gift
 * spread over two children; newest first; and the counts. These tests double as examples. Who calls it: vitest. Depends on: history.ts.
 */

import { describe, expect, it } from "vitest";
import { countOfEnrolment, countOfGift, historyOfEnrolment, historyOfGift } from "./history";
import type { Allocation } from "./allocation";

const p = (key: string, enrolmentId: string, at: string, over: Partial<Allocation> = {}): Allocation => ({ key, kind: "beneficiary", enrolmentId, outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 3, how: "auto", at: `${at}T10:00:00Z`, ...over });
const records: Allocation[] = [
  p("sub:1", "EN-1", "2026-01-10", { to: "2026-04-01", endReason: "paused" }), // gift 1 held Amina, then its plan paused
  p("sub:1", "EN-2", "2026-06-01"), // and when it ran again it was given Bilal, since Amina had been taken
  p("sub:2", "EN-1", "2026-04-15", { to: "2026-09-30", endReason: "cancelled" }), // gift 2 took Amina in April, and its plan was cancelled
  p("sub:3", "EN-1", "2026-10-05"), // gift 3 holds Amina now
  p("G9", "EN-3", "2026-05-05", { parts: 2 }), p("G9", "EN-4", "2026-05-05", { parts: 1 }), // a gift spread over two children
  { key: "G7", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "", itemId: "I11", parts: 1, how: "auto", at: "2026-03-03T10:00:00Z" },
];

describe("the history of a gift", () => {
  it("lists every child a gift has held, newest first, with when it started, when and why it ended, and now for the one it holds", () => {
    const rows = historyOfGift(records, "sub:1");
    expect(rows.map((r) => [r.enrolmentId, r.from, r.to, r.why, r.holds])).toEqual([
      ["EN-2", "2026-06-01", "", "", true],
      ["EN-1", "2026-01-10", "2026-04-01", "The plan was paused", false],
    ]);
  });
  it("shows a gift spread over several children as one row each, with the units each took", () => {
    expect(historyOfGift(records, "G9").map((r) => [r.enrolmentId, r.units])).toEqual([["EN-3", 2], ["EN-4", 1]]);
  });
  it("shows an outcome the gift created", () => {
    expect(historyOfGift(records, "G7")).toEqual([expect.objectContaining({ outcomeRef: "OUT-0001", enrolmentId: "", holds: true })]);
  });
  it("has nothing for a gift that was never placed", () => {
    expect(historyOfGift(records, "sub:99")).toEqual([]);
  });
});

describe("the history of a child's place", () => {
  it("lists every gift that has sponsored it, newest first, with why each ended", () => {
    const rows = historyOfEnrolment(records, "EN-1");
    expect(rows.map((r) => [r.key, r.from, r.to, r.why])).toEqual([
      ["sub:3", "2026-10-05", "", ""],
      ["sub:2", "2026-04-15", "2026-09-30", "The plan was cancelled"],
      ["sub:1", "2026-01-10", "2026-04-01", "The plan was paused"],
    ]);
  });
  it("does not list an outcome, and has nothing for a place never filled", () => {
    expect(historyOfEnrolment(records, "")).toEqual([]);
    expect(historyOfEnrolment(records, "EN-99")).toEqual([]);
  });
});

describe("the counts", () => {
  it("counts the records of a gift and of a place, for the buttons", () => {
    expect(countOfGift(records, "sub:1")).toBe(2);
    expect(countOfEnrolment(records, "EN-1")).toBe(3);
    expect(countOfGift(records, "nope")).toBe(0);
  });
});
