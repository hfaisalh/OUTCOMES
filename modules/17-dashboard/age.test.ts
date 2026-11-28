/** age.test.ts: the age against stage measure, with invented gifts. Examples of the rules in age.ts. */
import { describe, expect, it } from "vitest";
import { ageScatter, bandLabel, bandOf, stageOf, toneOf } from "./age";
import type { GiftLife } from "./trends";

const g = (key: string, paidAt: string, more: Partial<GiftLife> = {}): GiftLife => ({ key, itemId: "I1", paidAt, ...more });
const TODAY = "2026-11-28";

describe("age against stage", () => {
  it("takes the stage from the furthest step", () => {
    expect(stageOf(g("a", "2026-11-01"))).toBe(0);
    expect(stageOf(g("a", "2026-11-01", { assignedAt: "2026-11-02" }))).toBe(1);
    expect(stageOf(g("a", "2026-11-01", { assignedAt: "x", confirmedAt: "y", allocatedAt: "z", completedAt: "2026-11-20" }))).toBe(5);
  });
  it("reads age in quarters of the target, and over it", () => {
    expect([0, 22, 23, 45, 68, 90, 91].map((d) => bandOf(d, 90))).toEqual([0, 0, 1, 2, 3, 3, 4]);
    expect(bandLabel(1, 90)).toBe("23 to 44 days");
    expect(bandLabel(4, 90)).toBe("Over 90 days");
  });
  it("calls a gift on pace, behind, past target or completed late", () => {
    expect(toneOf(0, 0)).toBe("ok");
    expect(toneOf(1, 2)).toBe("behind"); // half the target gone and only Assigned
    expect(toneOf(3, 3)).toBe("ok");
    expect(toneOf(4, 4)).toBe("over");
    expect(toneOf(5, 4)).toBe("late");
  });
  it("counts gifts in each stage and band", () => {
    const gifts = [
      g("1", "2026-11-20"), // 8 days old, Paid: on pace
      g("2", "2026-09-01", { assignedAt: "2026-09-02" }), // 88 days, Assigned: behind
      g("3", "2026-06-01", { assignedAt: "x" }), // far over target, not complete
      g("4", "2026-06-01", { completedAt: "2026-10-30" }), // took 151 days: completed late
    ];
    const r = ageScatter(gifts, TODAY, 90);
    expect(r.total).toBe(4);
    expect(r.byTone).toEqual({ ok: 1, behind: 1, over: 1, late: 1 });
    expect(r.cells.find((c) => c.stage === 5 && c.band === 4)?.count).toBe(1);
  });
});
