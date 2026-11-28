/** age.test.ts: the age against stage measure, with invented gifts. Examples of the rules in age.ts (decision 316). */
import { describe, expect, it } from "vitest";
import { ageOf, ageScatter, bandLabel, bandOf, stageOf, toneOf } from "./age";
import type { GiftLife } from "./trends";

const g = (key: string, paidAt: string, more: Partial<GiftLife> = {}): GiftLife => ({ key, itemId: "I1", paidAt, ...more });
const TODAY = "2026-11-28";

describe("age against stage", () => {
  it("takes the stage from the furthest step", () => {
    expect(stageOf(g("a", "2026-11-01"))).toBe(0);
    expect(stageOf(g("a", "2026-11-01", { assignedAt: "2026-11-02" }))).toBe(1);
    expect(stageOf(g("a", "2026-11-01", { assignedAt: "x", confirmedAt: "y", allocatedAt: "z", completedAt: "2026-11-20" }))).toBe(5);
  });
  it("reads age in quarters of the time, and over it", () => {
    expect([0, 22, 23, 45, 68, 90, 91].map((d) => bandOf(d, 90))).toEqual([0, 0, 1, 2, 3, 3, 4]);
    expect(bandLabel(1, 90)).toBe("23 to 44 days");
    expect(bandLabel(4, 90)).toBe("Over 90 days");
  });
  it("calls a gift on pace, behind, past target or fulfilled late, towards its own fulfilled stage", () => {
    expect(toneOf(0, 0)).toBe("ok");
    expect(toneOf(1, 2)).toBe("behind"); // half the time gone and only Assigned
    expect(toneOf(3, 3)).toBe("ok");
    expect(toneOf(4, 4)).toBe("over");
    expect(toneOf(5, 4)).toBe("late");
    expect(toneOf(3, 4, 3)).toBe("late"); // a sponsorship fulfilled at Allocated, but after its time
    expect(toneOf(1, 3, 3)).toBe("behind"); // three quarters gone, only Assigned, and Allocated is the goal
  });
  it("stops the clock when the gift is fulfilled, at the stage its workflow names", () => {
    const sponsorship = g("s", "2026-06-01", { assignedAt: "x", confirmedAt: "x", allocatedAt: "x", fulfilledStage: 3, fulfilledAt: "2026-06-20" });
    expect(ageOf(sponsorship, TODAY)).toBe(19); // fulfilled at allocation, so it does not keep ageing
    expect(ageOf(g("b", "2026-06-01", { assignedAt: "x" }), TODAY)).toBe(180);
  });
  it("starts the clock at the journey start, and counts a gift not started apart", () => {
    expect(ageOf(g("a", "2026-06-01", { startAt: "2026-11-18" }), TODAY)).toBe(10);
    const r = ageScatter([g("a", "2026-11-20"), g("n", "2026-11-20", { startAt: null })], TODAY, 90);
    expect(r.total).toBe(1);
    expect(r.notStarted).toBe(1);
  });
  it("counts gifts in each stage and band, with the benefit's own time", () => {
    const gifts = [
      g("1", "2026-11-20"), // 8 days old, Paid: on pace
      g("2", "2026-09-01", { assignedAt: "2026-09-02" }), // 88 days, Assigned: behind
      g("3", "2026-06-01", { assignedAt: "x" }), // far over, not fulfilled
      g("4", "2026-06-01", { completedAt: "2026-10-30", fulfilledAt: "2026-10-30" }), // took 151 days: fulfilled late
      g("5", "2026-11-01", { assignedAt: "x", targetDays: 30 }), // 27 days of a 30 day time: Assigned, behind
    ];
    const r = ageScatter(gifts, TODAY, 90);
    expect(r.total).toBe(5);
    expect(r.byTone).toEqual({ ok: 1, behind: 2, over: 1, late: 1 });
    expect(r.target).toBeNull(); // the gifts have different times
    expect(r.cells.find((c) => c.stage === 5 && c.band === 4)?.count).toBe(1);
  });
});
