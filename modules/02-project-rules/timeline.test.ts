/** timeline.test.ts: when a journey starts and whether it is ongoing, with invented payment dates. */
import { describe, expect, it } from "vitest";
import { defaultTimeline, isOngoing, journeyStart, setItemTimeline, timelineOf } from "./timeline";

describe("item timeline", () => {
  it("defaults from the workflow's instalment rule, and an item's own choice wins", () => {
    expect(defaultTimeline("share_of_whole")).toEqual({ start: "full", life: "delivery" });
    expect(defaultTimeline("per_period")).toEqual({ start: "first", life: "term" });
    expect(timelineOf({ P1: { life: "open" } }, "P1", "per_period")).toEqual({ start: "first", life: "open" });
  });
  it("a single payment starts the day it is paid", () => {
    expect(journeyStart({ start: "full", life: "delivery" }, { paid: ["2026-10-01"], planned: 1 })).toBe("2026-10-01");
  });
  it("starts at the first payment, or only when the plan is paid in full", () => {
    const g = { paid: ["2026-08-01", "2026-09-01"], planned: 3 as const };
    expect(journeyStart({ start: "first", life: "term" }, g)).toBe("2026-08-01");
    expect(journeyStart({ start: "full", life: "delivery" }, g)).toBeNull(); // 2 of 3 paid
    expect(journeyStart({ start: "full", life: "delivery" }, { paid: [...g.paid, "2026-10-01"], planned: 3 })).toBe("2026-10-01");
    expect(journeyStart({ start: "full", life: "delivery" }, { paid: g.paid, planned: "open" })).toBeNull(); // never paid in full
  });
  it("a recurring gift is ongoing unless its life is until delivered", () => {
    expect(isOngoing({ start: "first", life: "term" }, { paid: ["x"], planned: 12 })).toBe(true);
    expect(isOngoing({ start: "first", life: "delivery" }, { paid: ["x"], planned: 12 })).toBe(false);
    expect(isOngoing({ start: "first", life: "open" }, { paid: ["x"], planned: 1 })).toBe(false);
  });
  it("sets and clears one part, and drops an item with nothing left", () => {
    const a = setItemTimeline({}, "P1", "start", "full");
    expect(a).toEqual({ value: { P1: { start: "full" } } });
    expect(setItemTimeline((a as { value: never }).value, "P1", "start", "")).toEqual({ value: {} });
    expect("error" in setItemTimeline({}, "P1", "life", "forever")).toBe(true);
  });
});
