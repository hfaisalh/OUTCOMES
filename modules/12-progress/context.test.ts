/**
 * context.test.ts
 *
 * What it does: tests what the Progress rules are told about a living gift (DECISIONS 319): a completed plan finishes its loop, any other ended allocation leaves the gift unallocated. Invented data.
 * Who calls it: vitest. Depends on: context.ts.
 */
import { describe, expect, it } from "vitest";
import { progressContext } from "./context";

describe("a living gift's end (decision 319)", () => {
  const living = { id: "w", name: "Sponsorship", unit: "orphan", cycle: "monthly" as const, reportType: "U", unitsPerBeneficiary: 1, instalment: "per_period" as const };
  const input = (allocations: { key: string; at: string; to?: string; endReason?: string }[]) => ({ assignments: [{ key: "sub:S1", partnerId: "p1", at: "2026-10-01T00:00:00Z", batch: 1 }], allocations, frameworkOf: () => "w", frameworks: [living], sizeOf: () => 10, today: "2027-02-01" });
  it("keeps the allocation date and gets an end date when the plan was completed", () => {
    const g = progressContext(input([{ key: "sub:S1", at: "2026-11-01T00:00:00Z", to: "2027-01-15T00:00:00Z", endReason: "completed" }])).gift("sub:S1");
    expect(g?.allocatedAt).toBe("2026-11-01T00:00:00Z");
    expect(g?.endedAt).toBe("2027-01-15T00:00:00Z");
    expect(g?.steps.loop).toEqual({ everyDays: 30 });
  });
  it("leaves the gift unallocated when its allocation ended for any other reason", () => {
    const g = progressContext(input([{ key: "sub:S1", at: "2026-11-01T00:00:00Z", to: "2027-01-15T00:00:00Z", endReason: "paused" }])).gift("sub:S1");
    expect(g?.allocatedAt).toBeUndefined();
    expect(g?.endedAt).toBeUndefined();
  });
});
