/**
 * home-page.test.ts
 *
 * What it does: tests the Home page and the setup guide (DECISIONS 328): the three doors, the one that is built, and the wizard's steps, their done marks and Back and Next. Invented data. These tests double as examples.
 * Who calls it: vitest. Depends on: home-page.ts, setup-guide.ts and setup-steps.ts.
 */
import { describe, expect, it } from "vitest";
import { homePage, noHomeUi } from "./home-page";
import { guideSteps } from "./setup-steps";
import type { View } from "../shared/pages";

const empty = (over: Partial<View> = {}): View => ({ workOrders: [], frameworks: [], giftProjects: [], projects: [], beneficiaries: { records: [], counters: {} }, assignments: { records: [] }, allocations: { records: [], counter: 0 }, ...over }) as unknown as View;
const full = (): View => empty({ workOrders: [{ key: "a", categoryId: "c" } as never], frameworks: [{ id: "wf", name: "W", assign: "auto", unit: "u", cycle: "on_delivery", reportType: "", unitsPerBeneficiary: 1 } as never], itemKinds: { I1: "person" }, projects: [{ id: "p" } as never], giftProjects: [{ id: "g", name: "G", partnerIds: ["p"] } as never], beneficiaries: { records: [{ id: "b" } as never], counters: {} }, assignments: { records: [{ key: "a" } as never] }, allocations: { records: [{ key: "a", kind: "outcome" } as never], counter: 1 } });

describe("the Home page", () => {
  it("shows three doors: Set up is open for use and the other two say they are coming next", () => {
    const html = homePage(empty(), noHomeUi());
    expect(html).toContain("<h1>Home</h1>");
    expect(html).toContain('data-door="setup"');
    expect(html).not.toContain('data-door="today"'); // not built yet: shown, but not a button
    expect(html).toContain("Work today");
    expect(html.match(/Coming next/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Start here");
    expect(html).toContain("0 of 8 steps done");
  });
  it("opens the setup guide only when its door is open", () => {
    expect(homePage(empty(), noHomeUi())).not.toContain('id="home-setup"');
    expect(homePage(empty(), { door: "setup", step: "" })).toContain('id="home-setup"');
  });
});

describe("the setup guide", () => {
  it("has eight steps in the order work is done, each with why, what to do and where", () => {
    const steps = guideSteps(empty());
    expect(steps.map((s) => s.id)).toEqual(["gifts", "workflows", "benefits", "partners", "projects", "beneficiaries", "rules", "try"]);
    for (const s of steps) { expect(s.why.length).toBeGreaterThan(40); expect(s.todo.length).toBeGreaterThanOrEqual(3); expect(s.page).not.toBe(""); }
  });
  it("ticks a step when the work is really there, and says what is found in words", () => {
    expect(guideSteps(empty()).every((s) => !s.done)).toBe(true);
    const all = guideSteps(full());
    expect(all.every((s) => s.done)).toBe(true);
    expect(all.find((s) => s.id === "partners")?.found).toBe("1 partner.");
  });
  it("starts at the first step not done, shows the one asked for, and moves with Back and Next", () => {
    const start = homePage(empty({ workOrders: [{ key: "a" } as never] }), { door: "setup", step: "" });
    expect(start).toContain("Step 2 of 8"); // gifts are in, so the guide opens on workflows
    const third = homePage(empty(), { door: "setup", step: "benefits" });
    expect(third).toContain("Step 3 of 8");
    expect(third).toContain('data-guide="workflows"'); // Back
    expect(third).toContain('data-guide="partners"'); // Next
    expect(third).toContain('data-page="benefits"');
    expect(homePage(empty(), { door: "setup", step: "gifts" })).toMatch(/data-guide="gifts" disabled>Back/);
  });
  it("tells a finished setup so, with a done mark and a word for each step (never colour alone)", () => {
    const html = homePage(full(), { door: "setup", step: "gifts" });
    expect(html).toContain("Everything is set up.");
    expect(html).toContain('<span class="sr-only">Done</span>');
    expect(html).toContain("8 of 8 steps done");
  });
});
