/** timeline.test.ts: the days to fulfil a benefit and when a journey starts, with invented payment dates (decision 316). */
import { describe, expect, it } from "vitest";
import { daysOf, journeyStart, setItemTimeline } from "./timeline";

describe("item timeline", () => {
  it("uses the item's own days, else the default", () => {
    expect(daysOf({ P1: { days: 45 } }, "P1")).toBe(45);
    expect(daysOf({}, "P1")).toBe(90);
    expect(daysOf({}, "P1", 60)).toBe(60);
  });
  it("sets and clears the days, and refuses a number that makes no sense", () => {
    expect(setItemTimeline({}, "P1", "days", "30")).toEqual({ value: { P1: { days: 30 } } });
    expect(setItemTimeline({ P1: { days: 30 } }, "P1", "days", "")).toEqual({ value: {} });
    expect("error" in setItemTimeline({}, "P1", "days", "0.5")).toBe(true);
    expect("error" in setItemTimeline({}, "P1", "days", "99999")).toBe(true);
    expect("error" in setItemTimeline({}, "P1", "start", "30")).toBe(true);
  });
  it("a single payment starts the day it is paid, whatever the workflow", () => {
    expect(journeyStart("share_of_whole", { paid: ["2026-10-01"], planned: 1 })).toBe("2026-10-01");
  });
  it("a workflow that releases only when fully paid starts at the last payment, any other at the first", () => {
    const g = { paid: ["2026-08-01", "2026-09-01"], planned: 3 as const };
    expect(journeyStart("per_period", g)).toBe("2026-08-01");
    expect(journeyStart("share_of_whole", g)).toBeNull(); // 2 of 3 paid
    expect(journeyStart("share_of_whole", { paid: [...g.paid, "2026-10-01"], planned: 3 })).toBe("2026-10-01");
    expect(journeyStart("share_of_whole", { paid: g.paid, planned: "open" })).toBeNull(); // never paid in full
  });
});
