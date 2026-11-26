/**
 * workflow-flowchart.test.ts
 *
 * What it does: tests the flow chart of a workflow (DECISIONS 136): it describes the rules only, shows the one decision when release waits for full payment, and carries rule icons.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: workflow-flowchart.ts and the starting outcome types.
 */

import { describe, expect, it } from "vitest";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import { flowChart } from "./workflow-flowchart";

const fw = (over: Partial<FrameworkTemplate> = {}): FrameworkTemplate => ({ id: "w", name: "Orphan sponsorship", unit: "orphan", cycle: "quarterly", reportType: "Quarterly orphan update", instalment: "per_period", unitsPerBeneficiary: 3, ...over });
const text = (svg: string): string => svg.replace(/<title>.*?<\/title>/g, "").replace(/<[^>]*>/g, " ");

describe("the flow chart", () => {
  const titles = ["Gift", "Work order", "Assignment", "Confirmation", "Allocation", "Review", "Report", "Complete", "Feedback"];
  const stageTitles = (svg: string): string[] => [...svg.matchAll(/<text [^>]*class="fc-t">([^<]*)<\/text>/g)].map((m) => m[1] as string);
  it("carries only the nine titles, in order: everything else is a decision in the panel below", () => {
    const svg = flowChart(fw(), undefined, 1);
    expect(stageTitles(svg)).toEqual(titles);
    for (const w of ["by a person", "automatic", "3 days", "units", "MWF approves", "on a cycle", "Gift paid", "Fully paid"]) expect(text(svg)).not.toContain(w); // no decision shown in a box
    expect(svg).not.toContain("fc-group"); // the outcome profile sections are in the Allocation panel, not drawn in the chart
  });
  it("is the same chart whatever the workflow's rules are, since the rules are decisions", () => {
    expect(stageTitles(flowChart(fw({ instalment: "share_of_whole", unitsPerBeneficiary: 1, assign: "auto", confirmDays: 9, approve: false }), undefined, 1))).toEqual(titles);
  });
  it("draws a rectangle for a stage and a diamond for a process, with the reject branches going back", () => {
    const svg = flowChart(fw(), undefined, 1);
    expect((svg.match(/ L[^"]*Z"/g) ?? []).length).toBe(3); // assignment, confirmation and review
    expect(svg).toContain("Reject: reassign");
    expect(svg).toContain("Reject: back to the partner");
    expect((svg.match(/<title>Approved<\/title>/g) ?? []).length).toBe(2); // a green circled tick on each approved arrow
    expect((svg.match(/<title>Rejected<\/title>/g) ?? []).length).toBe(2); // a red circled cross on each rejected return
    expect(svg).not.toContain('rx="20"'); // no ovals
  });
  it("makes each stage open its panel, and marks the open one", () => {
    const svg = flowChart(fw(), undefined, 4);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(svg).toContain(`data-wf-stage="${n}"`);
    expect((svg.match(/class="fc-node[^"]*\bon\b/g) ?? []).length).toBe(1);
    expect(svg).toContain("Rule: how it is assigned to a partner");
    expect(svg).toContain("Rule: MWF approves before the donor sees the data");
    expect(svg).toContain("Rule: the partner approves or rejects the batch");
    expect(svg).toContain("Feedback from the donor");
  });
});
