/**
 * progress.test.ts
 *
 * What it does: tests the Progress rules (DECISIONS 232) on invented gifts: the order of steps, when a phase is due and late, taking a step back, and closing a batch only when every gift in it is complete. These tests double as examples.
 * Who calls it: vitest. Depends on: progress.ts.
 */
import { describe, expect, it } from "vitest";
import { applyProgressAction, deliveryFlags, emptyProgress, isClosed, progressOf, stepsOf, type ProgressContext, type Steps } from "./progress";

const steps: Steps = { phases: [{ id: "check", label: "Basic check", days: 14 }, { id: "photo", label: "Photo update", days: 30 }], review: true, feedback: true };
const ALLOCATED = "2026-11-01T09:00:00Z";

describe("the steps of a gift", () => {
  it("run phases, then review, report, complete and feedback, leaving out review and feedback when the workflow does not ask", () => {
    expect(stepsOf(steps).map((s) => s.id)).toEqual(["check", "photo", "review", "report", "complete", "feedback"]);
    expect(stepsOf({ phases: [], review: false, feedback: false }).map((s) => s.id)).toEqual(["report", "complete"]);
  });
  it("has no progress until the gift is placed", () => {
    const p = progressOf("sub:S1", undefined, [], steps, "2026-11-26");
    expect(p.allocated).toBe(false);
    expect(p.next).toBeUndefined();
  });
});

describe("what is next, due and late", () => {
  it("starts with the first phase, due its days after placing, and late when past it", () => {
    const early = progressOf("sub:S1", ALLOCATED, [], steps, "2026-11-10");
    expect(early.next).toMatchObject({ id: "check", due: "2026-11-15", lateDays: 0 });
    expect(progressOf("sub:S1", ALLOCATED, [], steps, "2026-11-20").next).toMatchObject({ id: "check", lateDays: 5 });
  });
  it("counts the next phase from when the one before was taken, and says where the gift stands", () => {
    const recs = [{ key: "sub:S1", kind: "phase" as const, id: "check", at: "2026-11-10T00:00:00Z", by: "Sam" }];
    const p = progressOf("sub:S1", ALLOCATED, recs, steps, "2026-11-26");
    expect(p.next).toMatchObject({ id: "photo", due: "2026-12-10" });
    expect(p.stage).toBe("allocation"); // still with the partner
    const all = [...recs, ...["photo", "review"].map((id, i) => ({ key: "sub:S1", kind: (id === "photo" ? "phase" : "stage") as "phase" | "stage", id, at: `2026-11-1${i + 1}T00:00:00Z`, by: "Sam" }))];
    expect(progressOf("sub:S1", ALLOCATED, all, steps, "2026-11-26")).toMatchObject({ stage: "review", complete: false });
  });
});

describe("the requests the page makes", () => {
  const ctx: ProgressContext = {
    today: "2026-11-26",
    gift: (k) => (k === "sub:S1" || k === "sub:S2" ? { allocatedAt: ALLOCATED, steps } : k === "sub:S3" ? { allocatedAt: undefined, steps } : undefined),
    batchKeys: (p, b) => (p === "trust" && b === 1 ? ["sub:S1", "sub:S2"] : []),
    batchOf: (k) => (k === "sub:S1" || k === "sub:S2" ? { partnerId: "trust", batch: 1 } : undefined),
  };
  const take = (p: ReturnType<typeof emptyProgress>, key: string, n: number) => { let cur = p; for (let i = 0; i < n; i++) { const r = applyProgressAction(ctx, cur, { action: "prg-next", key }, "Sam", `2026-11-2${i}T00:00:00Z`); if (!r || "error" in r) throw new Error(JSON.stringify(r)); cur = r.value; } return cur; };
  it("takes the next step, refuses an unplaced or unknown gift, and takes the latest step back", () => {
    const one = take(emptyProgress(), "sub:S1", 1);
    expect(one.records[0]).toMatchObject({ kind: "phase", id: "check" });
    expect(applyProgressAction(ctx, one, { action: "prg-next", key: "sub:S3" }, "Sam", "x")).toEqual({ error: "That gift is not allocated yet. Allocate it first." });
    expect(applyProgressAction(ctx, one, { action: "prg-next", key: "nope" }, "Sam", "x")).toMatchObject({ error: expect.any(String) });
    const undone = applyProgressAction(ctx, one, { action: "prg-undo", key: "sub:S1" }, "Sam", "x");
    expect(undone && "value" in undone && undone.value.records).toHaveLength(0);
    expect(applyProgressAction(ctx, emptyProgress(), { action: "prg-undo", key: "sub:S1" }, "Sam", "x")).toMatchObject({ error: expect.any(String) });
  });
  it("closes a batch only when every gift in it is complete, and opens it again", () => {
    const partway = take(take(emptyProgress(), "sub:S1", 5), "sub:S2", 2); // S1 reached complete, S2 has two phases done
    expect(applyProgressAction(ctx, partway, { action: "prg-close-batch", partnerId: "trust", batch: 1 }, "Sam", "x")).toEqual({ error: "1 of its 2 gifts is not complete yet. A batch closes when every gift in it is complete." });
    const done = take(partway, "sub:S2", 3);
    const closed = applyProgressAction(ctx, done, { action: "prg-close-batch", partnerId: "trust", batch: 1 }, "Sam", "2026-12-01T00:00:00Z");
    if (!closed || "error" in closed) throw new Error(JSON.stringify(closed));
    expect(isClosed(closed.value.records, "trust", 1)).toBe(true);
    expect(applyProgressAction(ctx, closed.value, { action: "prg-close-batch", partnerId: "trust", batch: 1 }, "Sam", "x")).toEqual({ error: "That batch is already closed." });
    expect(applyProgressAction(ctx, closed.value, { action: "prg-undo", key: "sub:S1" }, "Sam", "x")).toEqual({ error: "That gift is in a closed batch. Open the batch again before taking a step back." });
    const reopened = applyProgressAction(ctx, closed.value, { action: "prg-open-batch", partnerId: "trust", batch: 1 }, "Sam", "2026-12-02T00:00:00Z");
    expect(reopened && "value" in reopened && isClosed(reopened.value.records, "trust", 1)).toBe(false);
    expect(applyProgressAction(ctx, emptyProgress(), { action: "prg-close-batch", partnerId: "trust", batch: 9 }, "Sam", "x")).toEqual({ error: "That batch was not found." });
  });
  it("ignores a request that is not about progress", () => {
    expect(applyProgressAction(ctx, emptyProgress(), { action: "asg-run" }, "Sam", "x")).toBeNull();
  });
});

describe("the context built from the app's records", () => {
  it("reads when a gift was placed (live records only), its workflow's steps, and the gifts in a batch", async () => {
    const { progressContext, stepsFor } = await import("./context");
    const fw = { id: "wf", name: "W", unitsPerBeneficiary: 1, unit: "x", cycle: "monthly", reportType: "r", approve: false, stages: [{ id: "check", label: "Check", days: 7, needs: [], photo: false, canPause: true, tell: "" }] } as never;
    const ctx = progressContext({
      assignments: [{ key: "sub:S1", partnerId: "trust", at: "2026-11-01T00:00:00Z" }, { key: "sub:S2", partnerId: "trust", at: "2026-11-02T00:00:00Z" }],
      allocations: [{ key: "sub:S1", at: "2026-11-05T00:00:00Z" }, { key: "sub:S1", at: "2026-10-30T00:00:00Z", to: "2026-11-04" }],
      frameworkOf: () => "wf", frameworks: [fw], sizeOf: () => 10, today: "2026-11-26",
    });
    expect(ctx.gift("sub:S1")?.allocatedAt).toBe("2026-11-05T00:00:00Z"); // the ended allocation does not count
    expect(ctx.gift("sub:S2")?.allocatedAt).toBeUndefined();
    expect(ctx.gift("sub:S1")?.steps).toMatchObject({ review: false, feedback: true, phases: [{ id: "check", days: 7 }] });
    expect(ctx.gift("other")).toBeUndefined();
    expect(ctx.batchKeys("trust", 1)).toEqual(["sub:S1", "sub:S2"]);
    expect(stepsFor(undefined)).toEqual({ phases: [], review: true, feedback: true });
  });
});

describe("a living gift loops in rounds (decision 319)", () => {
  const living: Steps = { ...steps, loop: { everyDays: 30 } };
  const rec = (id: string, at: string, kind: "phase" | "stage" = "stage") => ({ key: "sub:S1", kind, id, at, by: "T" });
  const phases = [rec("check", "2026-11-05T09:00:00Z", "phase"), rec("photo", "2026-11-20T09:00:00Z", "phase"), rec("review", "2026-11-21T09:00:00Z")];
  it("goes through the phases and review once, then reports, and a round complete counts as complete", () => {
    const first = progressOf("sub:S1", ALLOCATED, [...phases, rec("report", "2026-11-22T09:00:00Z")], living, "2026-11-23");
    expect(first.next?.id).toBe("complete");
    expect(first.complete).toBe(false);
    const done = progressOf("sub:S1", ALLOCATED, [...phases, rec("report", "2026-11-22T09:00:00Z"), rec("complete", "2026-11-23T09:00:00Z")], living, "2026-11-24");
    expect(done.complete).toBe(true);
    expect(done.ongoing).toBe(true);
  });
  it("falls due again the cycle after the last Complete, and says which round it is in", () => {
    const records = [...phases, rec("report", "2026-11-22T09:00:00Z"), rec("complete", "2026-11-23T09:00:00Z")];
    const next = progressOf("sub:S1", ALLOCATED, records, living, "2026-12-30");
    expect(next.round).toBe(2);
    expect(next.next).toMatchObject({ id: "report", due: "2026-12-23", lateDays: 7 });
    expect(next.next?.label).toContain("round 2");
  });
  it("ends the loop and moves on to feedback when its plan was completed", () => {
    const records = [...phases, rec("report", "2026-11-22T09:00:00Z"), rec("complete", "2026-11-23T09:00:00Z")];
    const p = progressOf("sub:S1", ALLOCATED, records, living, "2027-02-01", "2027-01-15T00:00:00Z");
    expect(p.ongoing).toBe(false);
    expect(p.next?.id).toBe("feedback");
  });
  it("ends the loop when the months set for reporting have passed", () => {
    const records = [...phases, rec("report", "2026-11-22T09:00:00Z"), rec("complete", "2026-11-23T09:00:00Z")];
    const p = progressOf("sub:S1", ALLOCATED, records, { ...living, loop: { everyDays: 30, months: 3 } }, "2027-03-01");
    expect(p.ongoing).toBe(false);
    expect(progressOf("sub:S1", ALLOCATED, records, { ...living, loop: { everyDays: 30, months: 3 } }, "2027-01-01").ongoing).toBe(true);
  });
  it("falls back to before allocation when the allocation ends, and starts afresh when allocated again", () => {
    const records = [...phases, rec("report", "2026-11-22T09:00:00Z"), rec("complete", "2026-11-23T09:00:00Z")];
    expect(progressOf("sub:S1", undefined, records, living, "2026-12-01").allocated).toBe(false);
    const again = progressOf("sub:S1", "2026-12-10T09:00:00Z", records, living, "2026-12-11");
    expect(again.complete).toBe(false); // the old steps were for the old allocation
    expect(again.next?.id).toBe("check");
  });
});

describe("rejecting the work at review (decision 320)", () => {
  const rec = (id: string, at: string, kind: "phase" | "stage" = "phase") => ({ key: "sub:S1", kind, id, at, by: "T" });
  const upToReview = [rec("check", "2026-11-05T09:00:00Z"), rec("photo", "2026-11-20T09:00:00Z")];
  const ctx: ProgressContext = { today: "2026-11-25", gift: () => ({ allocatedAt: ALLOCATED, steps }), batchOf: () => undefined, batchKeys: () => [] };
  const reject = (records: typeof upToReview, reason = "The photo is blurred", c = ctx) => applyProgressAction(c, { records }, { action: "prg-reject", key: "sub:S1", reason }, "MWF", "2026-11-24T10:00:00Z");

  it("sends the work back to the partner: the last phase opens again, due its days after the rejection, with the reason kept", () => {
    const r = reject(upToReview) as { value: { records: typeof upToReview } };
    const p = progressOf("sub:S1", ALLOCATED, r.value.records, steps, "2026-11-25");
    expect(p.next).toMatchObject({ id: "photo", due: "2026-12-24" }); // 30 days after the rejection
    expect(p.steps.find((x) => x.id === "check")?.done).toBe(true); // earlier phases stay done
    expect(p.sentBack).toMatchObject({ reason: "The photo is blurred", phase: "Photo update" });
  });
  it("goes to review again once the partner has done the phase again", () => {
    const r = reject(upToReview) as { value: { records: typeof upToReview } };
    const again = [...r.value.records, rec("photo", "2026-11-25T09:00:00Z")];
    const p = progressOf("sub:S1", ALLOCATED, again, steps, "2026-11-26");
    expect(p.next?.id).toBe("review");
    expect(p.sentBack).toBeUndefined();
  });
  it("needs a reason and a gift waiting for review", () => {
    expect("error" in (reject(upToReview, "  ") as object)).toBe(true);
    expect("error" in (reject([rec("check", "2026-11-05T09:00:00Z")]) as object)).toBe(true); // not at review yet
  });
  it("with no phase to open, adds the step Put right by the partner before Review, until a person marks it (decision 322)", () => {
    const none: ProgressContext = { ...ctx, gift: () => ({ allocatedAt: ALLOCATED, steps: { phases: [], review: true, feedback: true } }) };
    const r = reject([], "The photo is blurred", none) as { value: { records: typeof upToReview } };
    const p = progressOf("sub:S1", ALLOCATED, r.value.records, { phases: [], review: true, feedback: true }, "2026-11-25");
    expect(p.next).toMatchObject({ id: "resubmit", label: "Put right by the partner" });
    expect(p.sentBack?.reason).toBe("The photo is blurred");
    const fixed = [...r.value.records, rec("resubmit", "2026-11-26T09:00:00Z", "stage")];
    const after = progressOf("sub:S1", ALLOCATED, fixed, { phases: [], review: true, feedback: true }, "2026-11-27");
    expect(after.next?.id).toBe("review");
    expect(after.sentBack).toBeUndefined();
  });
  it("taking back the latest step takes back a rejection", () => {
    const r = reject(upToReview) as { value: { records: typeof upToReview } };
    const undone = applyProgressAction(ctx, r.value, { action: "prg-undo", key: "sub:S1" }, "MWF", "2026-11-24T11:00:00Z") as { value: { records: unknown[] } };
    expect(undone.value.records).toHaveLength(2);
  });
});

describe("what the Dashboard counts from a gift (decision 324)", () => {
  const rec = (id: string, at: string, kind: "phase" | "stage" = "phase") => ({ key: "sub:S1", kind, id, at, by: "T" });
  it("is delivered when every phase is done, reviewable when the workflow asks for review, reviewed once it is taken", () => {
    const flags = (records: ReturnType<typeof rec>[]) => deliveryFlags(progressOf("sub:S1", ALLOCATED, records, steps, "2026-11-25"));
    expect(flags([rec("check", "2026-11-05T09:00:00Z")])).toEqual({ delivered: false, reviewable: false, reviewed: false });
    const phases = [rec("check", "2026-11-05T09:00:00Z"), rec("photo", "2026-11-20T09:00:00Z")];
    expect(flags(phases)).toEqual({ delivered: true, reviewable: true, reviewed: false });
    expect(flags([...phases, rec("review", "2026-11-21T09:00:00Z", "stage")])).toEqual({ delivered: true, reviewable: true, reviewed: true });
  });
  it("counts a workflow with no phases as delivered once allocated, and one that skips review as not reviewable", () => {
    expect(deliveryFlags(progressOf("k", ALLOCATED, [], { phases: [], review: false, feedback: false }, "2026-11-25"))).toEqual({ delivered: true, reviewable: false, reviewed: false });
    expect(deliveryFlags(progressOf("k", undefined, [], steps, "2026-11-25")).delivered).toBe(false);
  });
});
