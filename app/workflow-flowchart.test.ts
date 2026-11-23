/**
 * workflow-flowchart.test.ts
 *
 * What it does: tests the flow chart of a workflow (DECISIONS 136): it describes the rules only, shows the one decision when release waits for full payment, and carries rule icons.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: workflow-flowchart.ts and the starting outcome types.
 */

import { describe, expect, it } from "vitest";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import { starterOutcomeTypes } from "../modules/05-outcomes/outcome-types";
import { flowChart, flowNodes } from "./workflow-flowchart";

const fw = (over: Partial<FrameworkTemplate> = {}): FrameworkTemplate => ({ id: "w", name: "Orphan sponsorship", unit: "orphan", cycle: "quarterly", reportType: "Quarterly orphan update", instalment: "per_period", unitsPerBeneficiary: 3, ...over });
const text = (svg: string): string => svg.replace(/<title>.*?<\/title>/g, "").replace(/<[^>]*>/g, " ");

describe("the flow chart", () => {
  const types = starterOutcomeTypes();
  it("has the steps in order, one per stage, with the gift into units and shares first", () => {
    const nodes = flowNodes(fw(), { ...types[0]!, frameworkIds: ["w"] });
    expect(nodes.map((n) => n.stage)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(nodes[0]?.label).toBe("Gift into work|order units & shares");
    expect(nodes[2]).toMatchObject({ shape: "rect", rule: "release" }); // released as each payment arrives
    expect(nodes[3]?.label).toBe("Assigned to a|partner automatically");
  });
  it("has a decision only when release waits for full payment, with both branches labelled", () => {
    const once = flowChart(fw({ instalment: "share_of_whole", unitsPerBeneficiary: 1 }), undefined, 3);
    expect(once).toContain("Fully paid?");
    expect(once).toContain(">Yes<");
    expect(once).toContain(">No<");
    expect(once).toContain("Held as Funding");
    const monthly = flowChart(fw(), undefined, 1);
    expect(monthly).not.toContain("Fully paid?");
    expect(monthly).not.toContain(">No<");
  });
  it("describes rules only: no number of units, no donor, no kind of outcome", () => {
    const words = text(flowChart(fw({ unit: "pump", unitsPerBeneficiary: 3 }), { ...types[1]!, frameworkIds: ["w"] }, 1));
    expect(words).not.toMatch(/\b3\b|donor|pump|orphan/i);
  });
  it("marks the open stage, makes each step open its stage, and carries the rule icons", () => {
    const svg = flowChart(fw(), undefined, 4);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(svg).toContain(`data-wf-stage="${n}"`);
    expect(svg).toMatch(/class="fc-node on"/);
    expect((svg.match(/class="fc-node[^"]*\bon\b/g) ?? []).length).toBe(1);
    expect(svg).toContain("Rule: gift into work order units and shares");
    expect(svg).toContain("Rule: how it is assigned to a partner");
  });
  it("counts tasks in the last step, and says a task is singular when there is one", () => {
    const one = flowChart(fw({ tasks: [{ id: "a", label: "Check", afterMonths: 3, photo: false }] }), undefined, 6);
    expect(one).toContain("1 task,");
    expect(flowChart(fw(), undefined, 6)).toContain(">Report<");
  });
});
