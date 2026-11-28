/**
 * dashboard.test.ts
 *
 * What it does: tests the partner's own dashboard figures (DECISIONS 327) on invented gifts: what is to answer and late, what is late in delivery, sent back, the quality shares, and the points for the age chart. Examples of the rules in dashboard.ts.
 * Who calls it: vitest. Depends on: dashboard.ts.
 */
import { describe, expect, it } from "vitest";
import { partnerDash } from "./dashboard";
import type { PartnerSlice } from "./scope";

const TODAY = "2026-12-10";
const asg = (key: string, at: string) => ({ key, partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto" as const, at: `${at}T00:00:00Z`, batch: 1 });
const detail = (key: string, answerBy: string, over = {}) => ({ reference: key, recurring: false, units: 1, cause: "", intention: "", tribute: "", phases: [{ id: "check", label: "Basic check", days: 10 }, { id: "photo", label: "Photo update", days: 20 }], review: true, feedback: true, answerBy, completeWithin: 30, ...over });
const conf = (key: string, at: string) => ({ key, partnerId: "p1", answer: "confirmed" as const, at: `${at}T00:00:00Z`, by: "P", reason: "" });
const alloc = (key: string, at: string) => ({ key, kind: "outcome" as const, enrolmentId: "", outcomeRef: `OUT-${key}`, giftProjectId: "g1", itemId: "S", parts: 1, how: "auto" as const, at: `${at}T00:00:00Z` });
const rec = (key: string, kind: "phase" | "stage" | "reject", id: string, at: string, reason?: string) => ({ key, kind, id, at: `${at}T00:00:00Z`, by: "T", ...(reason ? { reason } : {}) });

const slice = (): PartnerSlice => ({
  partner: { id: "p1", name: "Alpha" }, giftProjects: [{ id: "g1", name: "Homes", itemIds: [], clusters: [] }], beneficiaries: [], enrolments: [],
  assignments: [asg("late-answer", "2026-11-20"), asg("ontime-answer", "2026-12-08"), asg("slow", "2026-11-01"), asg("back", "2026-10-01"), asg("done", "2026-09-01")],
  confirmations: [conf("slow", "2026-11-02"), conf("back", "2026-10-02"), conf("done", "2026-09-02")],
  progress: [
    rec("slow", "phase", "check", "2026-11-05"), // due 11/11 (allocated 11/01 + 10 days): on time. photo due 20 days after: 25/11, still not done: late
    rec("back", "phase", "check", "2026-10-05"), rec("back", "phase", "photo", "2026-10-20"), rec("back", "reject", "review", "2026-12-01", "The photo is blurred"),
    rec("done", "phase", "check", "2026-09-05"), rec("done", "phase", "photo", "2026-09-25"), rec("done", "stage", "review", "2026-09-26"), rec("done", "stage", "complete", "2026-09-28"),
  ] as never,
  allocations: [alloc("slow", "2026-11-01"), alloc("back", "2026-10-01"), alloc("done", "2026-09-01")] as never,
  itemNames: { S: "Orphan Sponsorship Monthly" },
  gifts: { "late-answer": detail("late-answer", "2026-11-23"), "ontime-answer": detail("ontime-answer", "2026-12-11"), slow: detail("slow", "2026-11-04"), back: detail("back", "2026-10-04"), done: detail("done", "2026-09-04") },
}) as unknown as PartnerSlice;

describe("the partner dashboard figures", () => {
  const d = partnerDash(slice(), TODAY);
  it("counts what is to answer, in delivery, sent back and complete, with what is late", () => {
    expect(d.counts).toMatchObject({ toAnswer: 2, lateAnswers: 1, inDelivery: 2, lateSteps: 1, sentBack: 1, complete: 1 });
  });
  it("lists what needs attention with the most late first, in words with the days", () => {
    expect(d.attention[0]).toMatchObject({ key: "late-answer", kind: "answer", lateDays: 17 }); // due 23/11, today 10/12
    expect(d.attention[1]).toMatchObject({ key: "slow", kind: "step", what: "Photo update", lateDays: 15 }); // due 25/11
    expect(d.attention.some((a) => a.key === "back" && a.kind === "sent-back")).toBe(true);
    expect(d.attention.some((a) => a.key === "ontime-answer" && a.lateDays === 0)).toBe(true); // due tomorrow: listed, not late
  });
  it("works out quality: right first time, answers on time, steps on time, and their average", () => {
    expect(d.quality.rightFirstTime).toBe(50); // one review passed, one rejection
    expect(d.quality.answersOnTime).toBe(100); // the three answers were all given the day after the gift was assigned, inside the days asked
    expect(d.quality.stepsOnTime).toBe(100); // every phase done was done by its due day
    expect(d.quality.score).toBe(83); // the average of 50, 100 and 100
  });
  it("gives each gift a point on the age chart, from the day it was assigned", () => {
    expect(d.lives).toHaveLength(5);
    const slow = d.lives.find((g) => g.key === "slow")!;
    expect(slow).toMatchObject({ startAt: "2026-11-01", assignedAt: "2026-11-01T00:00:00Z", targetDays: 30, fulfilledStage: 5 });
    expect(slow.allocatedAt).toBe("2026-11-01T00:00:00Z");
  });
  it("holds nothing about a donor, and is calm for a partner with no gifts", () => {
    expect(JSON.stringify(d)).not.toMatch(/supporter|donor name|amount/i);
    const empty = partnerDash({ ...slice(), assignments: [], confirmations: [], progress: [], allocations: [], gifts: {} }, TODAY);
    expect(empty.counts).toEqual({ toAnswer: 0, lateAnswers: 0, inDelivery: 0, lateSteps: 0, sentBack: 0, complete: 0 });
    expect(empty.quality.score).toBeNull();
  });
});
