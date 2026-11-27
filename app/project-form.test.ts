/**
 * project-form.test.ts
 *
 * What it does: tests the project form (DECISIONS 76, 154): the CRM names, the benefits a project offers, and the vendors in their priority order with arrows to change it, and that
 * names from the CRM are never trusted as HTML. Invented data. These tests double as examples. Who calls it: vitest. Depends on: project-form.ts.
 */

import { describe, expect, it } from "vitest";
import { projectFormHtml } from "./project-form";

const partners = [{ id: "a", name: "Aghosh" }, { id: "b", name: "Backup Trust" }, { id: "c", name: "Contractor" }] as never;
const ctx = { crmNames: [{ name: "Dadyal Orphan Complex", gifts: 4 }], partners, items: [{ id: "I1", name: "Orphan Sponsorship" }, { id: "I2", name: "Bricks" }] };

describe("projectFormHtml", () => {
  it("asks for the benefits the project offers, ticking the ones it has, and says none ticked offers any", () => {
    const html = projectFormHtml({ name: "Dadyal", itemIds: ["I2"] }, "dadyal", ctx);
    expect(html).toContain("Benefits offered");
    expect(html).toMatch(/class="pr-item" value="I2" checked/);
    expect(html).not.toMatch(/class="pr-item" value="I1" checked/);
    expect(html).toContain("With none ticked, it offers any");
  });
  it("has an Enrol automatically tick that shows what the project has (DECISIONS 246)", () => {
    expect(projectFormHtml({ name: "Dadyal", enrolAuto: true }, "dadyal", ctx)).toMatch(/id="pr-enrolauto" checked/);
    expect(projectFormHtml({ name: "Dadyal" }, "dadyal", ctx)).not.toMatch(/id="pr-enrolauto" checked/);
  });
  it("lists the project's vendors first, in their priority order, then the other partners, each with arrows", () => {
    const html = projectFormHtml({ name: "Dadyal", partnerIds: ["c", "a"] }, "dadyal", ctx);
    const order = [...html.matchAll(/class="pr-partner" value="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["c", "a", "b"]); // its own two in order, then the rest
    expect(html).toMatch(/class="pr-partner" value="c" checked/);
    expect(html).not.toMatch(/class="pr-partner" value="b" checked/);
    expect((html.match(/data-pj="vup"/g) ?? []).length).toBe(3);
    expect((html.match(/data-pj="vdown"/g) ?? []).length).toBe(3);
    expect(html).toContain("in the order shown");
  });
  it("never trusts a name as HTML", () => {
    const html = projectFormHtml({ name: "<img src=x onerror=alert(1)>" }, "x", { ...ctx, items: [{ id: "I9", name: "<script>x</script>" }] });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>x");
  });
});
