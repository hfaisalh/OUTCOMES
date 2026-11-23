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
  it("has the titles of the workflow chart", () => {
    expect(Object.values(STAGE_TITLES)).toEqual(["Gift", "Work order", "Assignment", "Confirmation", "Allocation", "Review", "Report", "Complete", "Feedback"]);
  });
  it("is at Gift with nothing to move it on when its item has no workflow, and has no stage when excluded", () => {
    expect(at({ hasWorkflow: false })).toEqual({ stage: "gift", note: "Choose a workflow for its item" });
    expect(at({ kind: "excluded" }).stage).toBeNull();
    expect(at({ placement: "n/a" }).stage).toBeNull();
  });
  it("is released as each payment arrives for a living workflow: waiting is Assignment, placed is Allocation", () => {
    expect(at({}).stage).toBe("assignment");
    expect(at({ placement: "placed", where: "Orphan at Partner A" })).toEqual({ stage: "allocation", note: "Orphan at Partner A" });
  });
  it("stays at Work order, funding, until a transactional gift is fully paid", () => {
    expect(at({ holdUntilPaid: true, paid: 4, planned: 10 })).toEqual({ stage: "work-order", note: "Funding, 4 of 10 paid" });
    expect(at({ holdUntilPaid: true, paid: 4, planned: null }).note).toBe("Funding, 4 of ? paid");
    expect(at({ holdUntilPaid: true, paid: 10, planned: 10 }).stage).toBe("assignment"); // fully paid, so released
    expect(at({ holdUntilPaid: true, kind: "one_off", paid: 1, planned: null }).stage).toBe("assignment"); // a one-off is paid in full
  });
  it("parks a paused or cancelled plan where it is, and a manual one at Work order", () => {
    expect(at({ planStatus: "paused" })).toMatchObject({ stage: "work-order", note: "Plan paused, parked until payments resume" });
    expect(at({ planStatus: "cancelled" })).toEqual({ stage: "gift", note: "Plan cancelled, parked" });
    expect(at({ placement: "manual" })).toEqual({ stage: "work-order", note: "Units are set manually" });
  });
});
