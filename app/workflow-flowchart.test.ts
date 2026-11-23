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
  it("goes from gift paid to work orders, then assigned for implementation with the partner's stages, then the report", () => {
    const svg = flowChart(fw({ stages }), undefined, 1);
    const words = text(svg);
    expect(words.indexOf("Gift paid")).toBeLessThan(words.indexOf("order units &amp; shares"));
    expect(words.indexOf("order units &amp; shares")).toBeLessThan(words.indexOf("Assigned for implementation"));
    expect(words.indexOf("Assigned for implementation")).toBeLessThan(words.indexOf("Report"));
    expect(svg).toContain("7 days");
    expect(svg).toContain("30 days");
    expect(svg).toContain("Assigned for implementation, by suggestion");
    expect(flowChart(fw({ stages, assign: "auto" }), undefined, 1)).toContain("Assigned for implementation, automatic");
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
  it("makes each part open its stage, marks the open one, and shows which stage tells the donor", () => {
    const svg = flowChart(fw({ stages }), undefined, 2);
    for (const n of [1, 2, 3]) expect(svg).toContain(`data-wf-stage="${n}"`);
    expect((svg.match(/class="fc-node[^"]*\bon\b/g) ?? []).length).toBe(2); // both of the partner's stages are stage 2
    expect(svg).toContain("Tells the donor");
    expect(svg).toContain("Rule: how it is assigned to a partner");
  });
  it("shows one plain box when no implementation stages are set, and counts tasks in the last step", () => {
    expect(text(flowChart(fw(), undefined, 1))).toContain("Assigned for");
    expect(flowChart(fw({ tasks: [{ id: "a", label: "Check", afterMonths: 3, photo: false }] }), undefined, 3)).toContain("1 task,");
    expect(flowChart(fw(), undefined, 3)).toContain(">Report<");
  });
});
