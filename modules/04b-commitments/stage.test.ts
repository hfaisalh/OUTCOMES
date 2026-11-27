/**
 * stage.test.ts
 *
 * What it does: tests which stage a gift is in (DECISIONS 141). Invented data. These tests double as examples. Who calls it: vitest. Depends on: stage.ts.
 */

import { describe, expect, it } from "vitest";
import { giftStage, STAGE_TITLES, type StageInput } from "./stage";

const base: StageInput = { kind: "recurring", hasWorkflow: true, holdUntilPaid: false, planStatus: "active", paid: 3, planned: 12, placement: "waiting", where: "" };
const at = (over: Partial<StageInput>) => giftStage({ ...base, ...over });

describe("which stage a gift is in", () => {
  it("has short state names for the gift list", () => {
    expect(Object.values(STAGE_TITLES)).toEqual(["Gift", "WO created", "Assigned", "Confirmed", "Allocated", "Reviewed", "Reported", "Completed", "Feedback"]);
  });
  it("is at Gift with nothing to move it on when its item has no workflow, and has no stage when excluded", () => {
    expect(at({ hasWorkflow: false })).toEqual({ stage: "gift", note: "Choose a workflow for its item" });
    expect(at({ kind: "excluded" }).stage).toBeNull();
    expect(at({ placement: "n/a" }).stage).toBeNull();
  });
  it("is released as each payment arrives for a living workflow: waiting for a partner is WO created, assigned is Assigned, placed is Allocation (DECISIONS 189)", () => {
    expect(at({})).toEqual({ stage: "work-order", note: "Released, waiting for a partner" }); // no partner yet: not called Assigned
    expect(at({ assignedTo: "Sample Trust" })).toEqual({ stage: "assignment", note: "Assigned to Sample Trust, waiting to be allocated" });
    expect(at({ placement: "placed", where: "Orphan at Partner A" })).toEqual({ stage: "allocation", note: "Orphan at Partner A" });
  });
  it("stays at Work order, funding, until a transactional gift is fully paid", () => {
    expect(at({ holdUntilPaid: true, paid: 4, planned: 10 })).toEqual({ stage: "work-order", note: "Funding, 4 of 10 paid" });
    expect(at({ holdUntilPaid: true, paid: 4, planned: null }).note).toBe("Funding, 4 of ? paid");
    expect(at({ holdUntilPaid: true, paid: 10, planned: 10 }).note).toBe("Released, waiting for a partner"); // fully paid, so released: it now waits for a partner
    expect(at({ holdUntilPaid: true, kind: "one_off", paid: 1, planned: null }).note).toBe("Released, waiting for a partner"); // a one-off is paid in full
    expect(at({ holdUntilPaid: true, paid: 10, planned: 10, assignedTo: "Sample Trust" }).stage).toBe("assignment");
  });
  it("does not call a completed plan assigned: it holds no allocation (DECISIONS 189)", () => {
    expect(at({ planStatus: "completed" })).toEqual({ stage: "work-order", note: "Plan completed, it holds no allocation" });
    expect(at({ planStatus: "completed", assignedTo: "Sample Trust" }).stage).toBe("work-order"); // even if a partner was recorded before it completed
  });
  it("parks a paused or cancelled plan where it is, and a manual one at Work order", () => {
    expect(at({ planStatus: "paused" })).toMatchObject({ stage: "work-order", note: "Plan paused, parked until payments resume" });
    expect(at({ planStatus: "cancelled" })).toEqual({ stage: "gift", note: "Plan cancelled, parked" });
    expect(at({ placement: "manual" })).toEqual({ stage: "work-order", note: "Units are set manually" });
  });
});
