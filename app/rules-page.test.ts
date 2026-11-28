/**
 * rules-page.test.ts
 *
 * What it does: tests the Automation rules page (DECISIONS 283): every group of rules is there with its source, and the settings beside them use the data attributes the one change handler already understands. Invented workflows.
 * Who calls it: vitest. Depends on: rules-page.ts.
 */
import { describe, expect, it } from "vitest";
import { rulesPage } from "./rules-page";
import type { View } from "./pages";

const v = (over: Record<string, unknown> = {}) => ({ graceDays: 30, requireRef: true, frameworks: [{ id: "wf-orphan", name: "Orphan <care>", assign: "auto", confirmDays: 5, urgent: false, unit: "child", cycle: "monthly", reportType: "x", unitsPerBeneficiary: 3 }], giftProjects: [{ id: "g1", name: "Aghosh", enrolAuto: true }, { id: "g2", name: "Water" }], projects: [{ id: "p1", name: "Alpha Trust", batchSize: 25 }], ...over }) as unknown as View;

describe("the Automation rules page", () => {
  const html = rulesPage(v());
  it("lists every group of rules in order, each rule with its source", () => {
    for (const t of ["Assigning a gift to a partner", "Confirmation by the partner", "Allocating a gift", "The waiting list and enrolment", "Releasing a place"]) expect(html).toContain(t);
    expect(html.indexOf("Assigning")).toBeLessThan(html.indexOf("Allocating"));
    expect(html).toContain('<span class="ru-src">DECISIONS 183</span>');
    expect(html).toContain("a beneficiary marked Priority");
  });
  it("carries the live numbers in the rules", () => {
    expect(html).toContain("30 days after it was due");
    expect(html).toContain("switched on");
  });
  it("puts the settings beside the rules, with the attributes the one change handler already understands", () => {
    expect(html).toContain('data-wf-assign="wf-orphan"');
    expect(html).toContain('<option value="auto" selected>Automatically</option>');
    expect(html).toContain('data-wf-flag="urgent" data-wf="wf-orphan"');
    expect(html).toContain('data-wf-confirm="days" data-wf="wf-orphan" value="5"');
    expect(html).toContain('data-require-ref="1" checked');
    expect(html).toContain('data-grace="1" value="30"');
  });
  it("escapes names, shows enrol automatically by project and a partner's own batch size", () => {
    expect(html).toContain("Orphan &lt;care&gt;");
    expect(html).toContain('<span>Aghosh</span><span class="pill ready">On</span>');
    expect(html).toContain('<span>Water</span><span class="pill ">Off</span>');
    expect(html).toContain("Alpha Trust 25");
  });
  it("is calm with no workflow and no project", () => {
    const empty = rulesPage(v({ frameworks: [], giftProjects: [] }));
    expect(empty).toContain("No workflow yet.");
    expect(empty).toContain("No project yet.");
  });
});
