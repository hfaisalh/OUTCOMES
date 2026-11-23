/**
 * workflow-flowchart.test.ts
 *
 * What it does: tests the flow chart of a workflow (DECISIONS 136): it describes the rules only, shows the one decision when release waits for full payment, and carries rule icons.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: workflow-flowchart.ts and the starting outcome types.
 */

import { describe, expect, it } from "vitest";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import { starterOutcomeTypes } from "../modules/05-outcomes/outcome-types";
import { flowChart } from "./workflow-flowchart";

const fw = (over: Partial<FrameworkTemplate> = {}): FrameworkTemplate => ({ id: "w", name: "Orphan sponsorship", unit: "orphan", cycle: "quarterly", reportType: "Quarterly orphan update", instalment: "per_period", unitsPerBeneficiary: 3, ...over });
const text = (svg: string): string => svg.replace(/<title>.*?<\/title>/g, "").replace(/<[^>]*>/g, " ");

describe("the flow chart", () => {
  const types = starterOutcomeTypes();
  const stages = [
    { id: "accepted", label: "Accepted by the partner", days: 7, needs: [], photo: false, canPause: true, tell: "" },
    { id: "delivered", label: "Delivered", days: 30, needs: ["Location"], photo: true, canPause: false, tell: "Your gift has been delivered." },
  ];
  it("goes from the gift to work order, assignment, confirm, allocation with its profile sections, review and the report", () => {
    const svg = flowChart(fw({ stages }), undefined, 1);
    const words = text(svg);
    const order = ["Gift", "Work order", "Assignment", "Confirm", "Allocation: outcome profile", "Accepted by", "Review", "Report", "Ends"].map((w) => words.indexOf(w));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // in this order
    expect(words).not.toContain("Gift paid"); // payments may still be coming in
    expect(svg).toContain("7 days");
    expect(svg).toContain("30 days");
    expect(svg).toContain("by a person");
    expect(flowChart(fw({ stages, assign: "auto" }), undefined, 1)).toContain("automatic");
    expect(flowChart(fw({ stages, confirmDays: 5 }), undefined, 3)).toContain("5 days");
    expect(flowChart(fw({ stages }), undefined, 5)).toContain("MWF approves");
    expect(flowChart(fw({ stages, approve: false }), undefined, 5)).toContain("no approval");
  });
  it("draws a rectangle for a stage and a diamond for a process, with the reject branches going back", () => {
    const svg = flowChart(fw({ stages }), undefined, 1);
    const diamonds = (svg.match(/<path d="M[\d. ]+ [\d. ]+ L[^"]*Z"/g) ?? []).length;
    expect(diamonds).toBe(3); // assignment, confirm and review
    expect(flowChart(fw({ instalment: "share_of_whole", unitsPerBeneficiary: 1, stages }), undefined, 1).match(/ L[^"]*Z"/g)?.length).toBe(4); // and fully paid
    expect(svg).toContain("Reject: reassign");
    expect(svg).toContain("Reject: back to the partner");
    expect((svg.match(/<title>Approved<\/title>/g) ?? []).length).toBe(2); // a tick on each approved arrow, not a word that a box could cover
    expect(svg).not.toContain(">Approve<");
    expect(svg).not.toContain('rx="20"'); // no ovals any more
  });
  it("has a decision only when release waits for full payment, with both branches labelled", () => {
    const once = flowChart(fw({ instalment: "share_of_whole", unitsPerBeneficiary: 1, stages }), undefined, 1);
    expect(once).toContain("Fully paid?");
    expect(once).toContain(">Yes<");
    expect(once).toContain(">No<");
    expect(once).toContain("Held as Funding");
    const monthly = flowChart(fw({ stages }), undefined, 1);
    expect(monthly).not.toContain("Fully paid?");
    expect(monthly).not.toContain(">No<");
  });
  it("describes rules only: no number of units, no donor, no kind of outcome", () => {
    const words = text(flowChart(fw({ unit: "pump", unitsPerBeneficiary: 3, stages: [] }), { ...types[1]!, frameworkIds: ["w"] }, 1)).replace(/\d+ days?/g, "");
    expect(words).not.toMatch(/\b3\b|donor|pump|orphan/i);
  });
  it("makes each part open its stage, marks the open one, and shows which section tells the donor", () => {
    const svg = flowChart(fw({ stages }), undefined, 4);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(svg).toContain(`data-wf-stage="${n}"`);
    expect((svg.match(/class="fc-node[^"]*\bon\b/g) ?? []).length).toBe(2); // both profile sections are the allocation stage
    expect(svg).toContain("Tells the donor");
    expect(svg).toContain("Rule: how it is assigned to a partner");
    expect(svg).toContain("Rule: MWF approves before the donor sees the data");
    expect(svg).toContain("Rule: the partner approves or rejects the batch");
  });
  it("shows one plain box when no sections are set, names a living and a transactional order, and counts checks", () => {
    expect(text(flowChart(fw(), undefined, 1))).toContain("Allocation: outcome profile");
    expect(flowChart(fw({ tasks: [{ id: "a", label: "Check", afterMonths: 3, photo: false }] }), undefined, 5)).toContain("1 check");
    expect(text(flowChart(fw(), undefined, 6))).toContain("on a cycle");
    expect(text(flowChart(fw({ instalment: "share_of_whole", unitsPerBeneficiary: 1 }), undefined, 6))).toContain("one, then closed");
  });
});
