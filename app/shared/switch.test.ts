/**
 * switch.test.ts
 *
 * What it does: tests the one on/off switch (DECISIONS 285) and that every Priority control uses it, so they look and behave the same.
 * Who calls it: vitest. Depends on: switch.ts and the pages that draw a Priority control.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister } from "../../modules/07-beneficiaries/beneficiaries";
import { registerFormHtml } from "../beneficiaries/register-form";
import { rulesPage } from "../setup/rules-page";
import { switchHtml } from "./switch";
import type { View } from "./pages";

describe("the on/off switch", () => {
  it("is a real checkbox with role switch, a visible label, and the data attributes of its handler", () => {
    const html = switchHtml({ label: "Priority", on: true, attrs: 'data-gift-priority="o1"', hint: "Goes first" });
    expect(html).toBe('<label class="tg" title="Goes first"><input type="checkbox" role="switch" class="tg-in" checked data-gift-priority="o1"><span class="tg-track" aria-hidden="true"><i></i></span><span class="tg-text">Priority</span></label>');
  });
  it("keeps the label for a screen reader when compact, and can be disabled", () => {
    const html = switchHtml({ label: "Priority for <b>", on: false, compact: true, disabled: true });
    expect(html).toContain('aria-label="Priority for &lt;b&gt;"');
    expect(html).not.toContain("tg-text");
    expect(html).toContain(" disabled");
    expect(html).not.toContain(" checked");
  });
  it("is how the beneficiary form shows Priority, keeping the id its save reads", () => {
    let r = emptyRegister();
    const x = addBeneficiary(r, "person", { name: "Amina Khan", priority: true }, true, "2026-11-01");
    if ("error" in x) throw new Error(x.error);
    r = x.value;
    const html = registerFormHtml(r.records[0]!, r.records[0]!.id, "person", r.records, "", [], [], []);
    expect(html).toMatch(/role="switch" class="tg-in" id="rg-priority" checked/);
    expect(html).not.toContain('type="checkbox" id="rg-priority"');
  });
  it("is how the Automation rules page shows its Priority and other on/off settings", () => {
    const html = rulesPage({ graceDays: 15, requireRef: false, frameworks: [{ id: "w", name: "Orphan", unit: "child", cycle: "monthly", reportType: "x", unitsPerBeneficiary: 3 }], giftProjects: [], projects: [] } as unknown as View);
    expect(html.match(/role="switch"/g)?.length).toBeGreaterThanOrEqual(3); // urgent, reassign, require ID
    expect(html).not.toMatch(/<input type="checkbox" data-wf-flag/);
  });
});
