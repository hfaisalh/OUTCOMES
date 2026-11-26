/**
 * progress.test.ts
 *
 * What it does: tests the Progress rules (DECISIONS 232) on invented gifts: the order of steps, when a phase is due and late, taking a step back, and closing a batch only when every gift in it is complete. These tests double as examples.
 * Who calls it: vitest. Depends on: progress.ts.
 */
import { describe, expect, it } from "vitest";
import { applyProgressAction, emptyProgress, isClosed, progressOf, stepsOf, type ProgressContext, type Steps } from "./progress";

const steps: Steps = { phases: [{ id: "check", label: "Basic check", days: 14 }, { id: "photo", label: "Photo update", days: 30 }], review: true, feedback: true };
const PLACED = "2026-11-01T09:00:00Z";

describe("the steps of a gift", () => {
  it("run phases, then review, report, complete and feedback, leaving out review and feedback when the workflow does not ask", () => {
    expect(stepsOf(steps).map((s) => s.id)).toEqual(["check", "photo", "review", "report", "complete", "feedback"]);
    expect(stepsOf({ phases: [], review: false, feedback: false }).map((s) => s.id)).toEqual(["report", "complete"]);
  });
  it("has no progress until the gift is placed", () => {
    const p = progressOf("sub:S1", undefined, [], steps, "2026-11-26");
    expect(p.placed).toBe(false);
    expect(p.next).toBeUndefined();
  });
});

describe("what is next, due and late", () => {
  it("starts with the first phase, due its days after placing, and late when past it", () => {
    const early = progressOf("sub:S1", PLACED, [], steps, "2026-11-10");
    expect(early.next).toMatchObject({ id: "check", due: "2026-11-15", lateDays: 0 });
    expect(progressOf("sub:S1", PLACED, [], steps, "2026-11-20").next).toMatchObject({ id: "check", lateDays: 5 });
  });
  it("counts the next phase from when the one before was taken, and says where the gift stands", () => {
    const recs = [{ key: "sub:S1", kind: "phase" as const, id: "check", at: "2026-11-10T00:00:00Z", by: "Sam" }];
    const p = progressOf("sub:S1", PLACED, recs, steps, "2026-11-26");
    expect(p.next).toMatchObject({ id: "photo", due: "2026-12-10" });
    expect(p.stage).toBe("allocation"); // still with the partner
    const all = [...recs, ...["photo", "review"].map((id, i) => ({ key: "sub:S1", kind: (id === "photo" ? "phase" : "stage") as "phase" | "stage", id, at: `2026-11-1${i + 1}T00:00:00Z`, by: "Sam" }))];
    expect(progressOf("sub:S1", PLACED, all, steps, "2026-11-26")).toMatchObject({ stage: "review", complete: false });
  });
});

describe("the requests the page makes", () => {
  const ctx: ProgressContext = {
    today: "2026-11-26",
    gift: (k) => (k === "sub:S1" || k === "sub:S2" ? { placedAt: PLACED, steps } : k === "sub:S3" ? { placedAt: undefined, steps } : undefined),
    batchKeys: (p, b) => (p === "trust" && b === 1 ? ["sub:S1", "sub:S2"] : []),
    batchOf: (k) => (k === "sub:S1" || k === "sub:S2" ? { partnerId: "trust", batch: 1 } : undefined),
  };
  const take = (p: ReturnType<typeof emptyProgress>, key: string, n: number) => { let cur = p; for (let i = 0; i < n; i++) { const r = applyProgressAction(ctx, cur, { action: "prg-next", key }, "Sam", `2026-11-2${i}T00:00:00Z`); if (!r || "error" in r) throw new Error(JSON.stringify(r)); cur = r.value; } return cur; };
  it("takes the next step, refuses an unplaced or unknown gift, and takes the latest step back", () => {
    const one = take(emptyProgress(), "sub:S1", 1);
    expect(one.records[0]).toMatchObject({ kind: "phase", id: "check" });
    expect(applyProgressAction(ctx, one, { action: "prg-next", key: "sub:S3" }, "Sam", "x")).toEqual({ error: "That gift is not placed yet. Allocate it first." });
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
      placements: [{ key: "sub:S1", at: "2026-11-05T00:00:00Z" }, { key: "sub:S1", at: "2026-10-30T00:00:00Z", to: "2026-11-04" }],
      frameworkOf: () => "wf", frameworks: [fw], sizeOf: () => 10, today: "2026-11-26",
    });
    expect(ctx.gift("sub:S1")?.placedAt).toBe("2026-11-05T00:00:00Z"); // the ended placement does not count
    expect(ctx.gift("sub:S2")?.placedAt).toBeUndefined();
    expect(ctx.gift("sub:S1")?.steps).toMatchObject({ review: false, feedback: true, phases: [{ id: "check", days: 7 }] });
    expect(ctx.gift("other")).toBeUndefined();
    expect(ctx.batchKeys("trust", 1)).toEqual(["sub:S1", "sub:S2"]);
    expect(stepsFor(undefined)).toEqual({ phases: [], review: true, feedback: true });
  });
});
