/**
 * trends.test.ts
 *
 * What it does: tests the monthly trends (DECISIONS 304): the months, the state at each month's end, the medians of how fast steps were taken, on-time answers and what improved. Invented gifts and dates.
 * Who calls it: vitest. Depends on: trends.ts.
 */
import { describe, expect, it } from "vitest";
import { improvements, lastMonths, median, monthlyTrends, type GiftLife } from "./trends";

const life = (key: string, over: Partial<GiftLife> = {}): GiftLife => ({ key, itemId: "I1", paidAt: "2026-09-05", ...over });

describe("the months", () => {
  it("lists the last n months up to the current one, oldest first, with their first and last days", () => {
    const m = lastMonths("2026-11-28", 4);
    expect(m.map((x) => x.key)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(m[3]).toMatchObject({ label: "Nov 26", start: "2026-11-01", end: "2026-11-30" });
    expect(lastMonths("2026-02-10", 1)[0]?.end).toBe("2026-02-28");
  });
  it("crosses a year", () => {
    expect(lastMonths("2026-01-15", 3).map((x) => x.key)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("the median", () => {
  it("is the middle one, the mean of the two middle ones, and nothing for none", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("the monthly points", () => {
  const months = lastMonths("2026-11-30", 3); // Sep, Oct, Nov
  const lives = [
    life("a", { paidAt: "2026-09-05", assignedAt: "2026-09-08T10:00:00Z", answeredAt: "2026-09-10T10:00:00Z", confirmedAt: "2026-09-10T10:00:00Z", answerDays: 3, allocatedAt: "2026-09-12T10:00:00Z", deliveredAt: "2026-10-20T10:00:00Z", completedAt: "2026-11-02T10:00:00Z" }),
    life("b", { paidAt: "2026-10-03", assignedAt: "2026-10-04T10:00:00Z", answeredAt: "2026-10-12T10:00:00Z", confirmedAt: "2026-10-12T10:00:00Z", answerDays: 3, allocatedAt: "2026-10-13T10:00:00Z" }),
    life("c", { paidAt: "2026-11-10" }),
  ];
  const pts = monthlyTrends(lives, months);
  it("counts what came in and what was completed in each month, and the backlog at its end", () => {
    expect(pts.map((p) => [p.paidIn, p.completed, p.gifts, p.backlog])).toEqual([[1, 0, 1, 1], [1, 0, 2, 2], [1, 1, 3, 2]]);
  });
  it("works out the score at each month's end, which never changes when later months do", () => {
    // Sep: 1 gift, assigned, confirmed, allocated, nothing delivered or complete
    expect(pts[0]?.score).toBe(Math.round((100 + 100 + 100 + 0 + 0) / 5));
    expect(pts[0]?.score).not.toBeNull();
    expect(pts[2]?.score).not.toBe(pts[0]?.score);
  });
  it("takes the median days between steps for the gifts that took the step in that month, and leaves a gap where none did", () => {
    expect(pts[0]).toMatchObject({ daysToAssign: 3, daysToAnswer: 2, daysToAllocate: 2, daysToComplete: null });
    expect(pts[1]).toMatchObject({ daysToAssign: 1, daysToAnswer: 8, daysToAllocate: 1 });
    expect(pts[2]?.daysToComplete).toBe(51);
    expect(pts[2]?.daysToAssign).toBeNull();
  });
  it("counts answers within the days allowed as on time", () => {
    expect(pts[0]?.onTime).toBe(100);
    expect(pts[1]?.onTime).toBe(0);
    expect(pts[2]?.onTime).toBeNull();
  });
});

describe("what improved", () => {
  const months = lastMonths("2026-11-30", 3);
  const pt = (i: number, over: object) => ({ month: months[i]!, score: null, paidIn: 0, completed: 0, gifts: 0, backlog: 0, daysToAssign: null, daysToAnswer: null, daysToAllocate: null, daysToComplete: null, onTime: null, ...over });
  it("compares this month with the last month that has a figure, and says better or worse by whether higher or lower is good", () => {
    const r = improvements([pt(0, { score: 40, daysToAnswer: 5 }), pt(1, {}), pt(2, { score: 52, daysToAnswer: 3, completed: 4 })]);
    const get = (id: string) => r.find((x) => x.id === id)!;
    expect(get("score")).toMatchObject({ now: 52, before: 40, change: 12, direction: "better" });
    expect(get("answer")).toMatchObject({ now: 3, before: 5, change: -2, direction: "better" }); // fewer days is better
    expect(get("completed")).toMatchObject({ now: 4, before: 0, change: 4, direction: "better" });
    expect(get("onTime")).toMatchObject({ now: null, before: null, change: null, direction: "none" }); // no figure at all: no claim
  });
  it("calls a tiny change no change, and a slower answer worse", () => {
    const r = improvements([pt(0, { score: 50, daysToAnswer: 3 }), pt(1, { score: 50.2, daysToAnswer: 6 })]);
    expect(r.find((x) => x.id === "score")?.direction).toBe("same");
    expect(r.find((x) => x.id === "answer")?.direction).toBe("worse");
  });
});
