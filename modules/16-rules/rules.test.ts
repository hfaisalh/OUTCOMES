/**
 * rules.test.ts
 *
 * What it does: tests that the list of automation rules (DECISIONS 283) carries the numbers in use now, and that every rule names the decision it comes from, so the list stays a faithful description.
 * Who calls it: vitest. Depends on: rules.ts.
 */
import { describe, expect, it } from "vitest";
import { automationRules, DEFAULT_GRACE_DAYS } from "./rules";

const all = (s = { graceDays: 15, requireRef: false }) => automationRules(s);

describe("the automation rules", () => {
  it("lists the sections in the order a gift travels", () => {
    expect(all().map((x) => x.id)).toEqual(["assign", "confirm", "allocate", "waiting", "release"]);
  });
  it("gives every rule its words and the decision it comes from", () => {
    for (const s of all()) for (const r of s.rules) { expect(r.text.length).toBeGreaterThan(20); expect(r.decision).toMatch(/^DECISIONS \d+/); }
  });
  it("carries the numbers in use now: grace days, the default batch size and confirm days, and a partner's own batch size", () => {
    const rules = (s: Parameters<typeof all>[0], id: string) => all(s).find((x) => x.id === id)!.rules.map((r) => r.text).join(" ");
    expect(rules({ graceDays: 15, requireRef: false }, "release")).toContain("15 days");
    expect(rules({ graceDays: 30, requireRef: false }, "release")).toContain("30 days");
    expect(rules({ graceDays: 15, requireRef: false }, "assign")).toContain("batches of 10");
    expect(rules({ graceDays: 15, requireRef: false, batchSize: 25 } as never, "assign")).toContain("batches of 25");
    expect(rules({ graceDays: 15, requireRef: false }, "confirm")).toContain("3 days");
    expect(DEFAULT_GRACE_DAYS).toBe(15);
  });
  it("says whether an ID is needed, as the setting is now", () => {
    const text = (on: boolean) => all({ graceDays: 15, requireRef: on }).find((x) => x.id === "allocate")!.rules.map((r) => r.text).join(" ");
    expect(text(true)).toContain("This is switched on.");
    expect(text(false)).toContain("A setting can require an ID.");
  });
  it("states the allocation order the code uses, priority included", () => {
    const order = all().find((x) => x.id === "allocate")!.rules.find((r) => r.text.startsWith("Which place"))!.text;
    expect(order.indexOf("own beneficiaries")).toBeLessThan(order.indexOf("Priority"));
    expect(order.indexOf("Priority")).toBeLessThan(order.indexOf("lowest fill"));
  });
});
