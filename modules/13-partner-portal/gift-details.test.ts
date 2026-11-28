/**
 * gift-details.test.ts
 *
 * What it does: tests what a partner may know about a gift (DECISIONS 259): the facts for a one-off gift and a recurring plan, the tribute from the start, the delivery phases and the answer-by day, and above all that nothing about a donor or any money is carried.
 * Invented gifts. These tests double as examples. Who calls it: vitest. Depends on: gift-details.ts.
 */
import { describe, expect, it } from "vitest";
import { giftDetails } from "./gift-details";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
import type { FrameworkTemplate } from "../02-project-rules/categories";
import type { Assignment } from "../08-assignment/assignment";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: "T-SECRET-REF", paidDate: "2026-10-05", supporterId: "DONOR-777", supporterName: "Private Donor Name", group: "Secret Group", itemId: "I11", itemName: "Small Pump", amount: 30, lineTotal: 90, currency: "GBP", quantity: 1,
  intention: "In memory of", cause: "Water", tribute: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "water", status: "ready", ...over,
}) as WorkOrder;
const fw = { id: "wf", name: "Pump", unitsPerBeneficiary: 1, unit: "pump", cycle: "one_off", reportType: "r", assign: "auto", confirmDays: 5, stages: [{ id: "survey", label: "Survey the site", days: 7 }, { id: "build", label: "Build the pump", days: 21 }] } as unknown as FrameworkTemplate;
const asg = (key: string, parts = 1): Assignment => ({ key, partnerId: "p1", giftProjectId: "g1", itemId: "I11", parts, how: "auto", at: "2026-11-02T09:00:00Z", batch: 1 });
const run = (assignments: Assignment[], workOrders: WorkOrder[]) => giftDetails({ assignments, workOrders, frameworks: [fw] });

describe("how long a partner has to complete a gift (decision 315)", () => {
  it("adds up the phase days, and gives the last day once the gift is allocated", () => {
    const before = run([asg("G1")], [wo("G1")])["G1"]!;
    expect(before.completeWithin).toBe(28); // 7 days to survey and 21 to build
    expect(before.completeBy).toBeUndefined(); // not allocated yet
    const after = giftDetails({ assignments: [asg("G1")], workOrders: [wo("G1")], frameworks: [fw], allocations: [{ key: "G1", at: "2026-11-10T08:00:00Z" }] })["G1"]!;
    expect(after.completeBy).toBe("2026-12-08");
  });
});

describe("what a partner may know about a gift", () => {
  it("describes a one-off gift: the facts, the tribute from the start, what delivering it involves, and when to answer by", () => {
    const d = run([asg("G1", 2)], [wo("G1", { tribute: "For my late mother, Aisha" })])["G1"]!;
    expect(d).toMatchObject({ reference: "G1", recurring: false, units: 2, cause: "Water", intention: "In memory of", tribute: "For my late mother, Aisha", review: true, feedback: true });
    expect(d.phases).toEqual([{ label: "Survey the site", days: 7 }, { label: "Build the pump", days: 21 }]);
    expect(d.answerBy).toBe("2026-11-07"); // assigned 2 Nov, the workflow gives 5 days
    expect(d.planned).toBeUndefined();
  });

  it("describes a recurring plan by joining its payments: how many are planned and made, the first tribute given", () => {
    const orders = [wo("L2", { subscriptionId: "S9", instalmentCount: "12", paidDate: "2026-10-05", tribute: "" }), wo("L3", { subscriptionId: "S9", instalmentCount: "12", paidDate: "2026-11-05", tribute: "In loving memory" }), wo("OTHER", { subscriptionId: "S1", tribute: "Not this plan" })];
    const d = run([asg("sub:S9")], orders)["sub:S9"]!;
    expect(d).toMatchObject({ recurring: true, planned: 12, paid: 2, tribute: "In loving memory" });
  });

  it("uses the CRM's own count of payments made when it gives one, and 3 days when the workflow has none", () => {
    const d = giftDetails({ assignments: [asg("sub:S9")], workOrders: [wo("L2", { subscriptionId: "S9", planPaid: 5, frameworkId: "" })], frameworks: [fw] })["sub:S9"]!;
    expect(d.paid).toBe(5);
    expect(d.answerBy).toBe("2026-11-05");
    expect(d.phases).toEqual([]);
  });

  it("never carries the donor or any money, whatever the work order holds", () => {
    const all = JSON.stringify(run([asg("G1")], [wo("G1", { tribute: "A tribute" })]));
    for (const secret of ["Private Donor Name", "DONOR-777", "Secret Group", "T-SECRET-REF", "GBP"]) expect(all).not.toContain(secret);
    expect(all).not.toMatch(/amount|lineTotal|price|currency|supporter/i);
    expect(Object.keys(run([asg("G1")], [wo("G1")])["G1"]!).sort()).toEqual(["answerBy", "cause", "completeWithin", "feedback", "intention", "phases", "recurring", "reference", "review", "tribute", "units"]);
  });

  it("still describes a gift whose work order is missing, with empty facts", () => {
    expect(run([asg("GONE")], [])["GONE"]).toMatchObject({ cause: "", intention: "", tribute: "", phases: [], recurring: false });
  });
});
