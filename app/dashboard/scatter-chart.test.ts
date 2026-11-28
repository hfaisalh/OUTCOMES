/** scatter-chart.test.ts: the age against stage chart, with invented gifts. Each bubble opens its gifts (decision 312). */
import { describe, expect, it } from "vitest";
import { scatterHtml } from "./scatter-chart";

const g = (key: string, paidAt: string, more = {}) => ({ key, itemId: "I", paidAt, ...more });
describe("scatterHtml", () => {
  it("draws one clickable bubble for each stage and age that holds gifts, with its number", () => {
    const html = scatterHtml([g("a", "2026-11-20"), g("b", "2026-11-21"), g("c", "2026-06-01", { assignedAt: "x" })], "2026-11-28", 90);
    expect(html).toContain('data-scatter="0|0"'); // two new gifts, paid and young
    expect(html).toContain('data-scatter="1|4"'); // one assigned gift far past the target
    expect(html).toMatch(/aria-label="Open the 2 gifts: Paid, 0 to 22 days"/);
    expect(html).toContain("View as a table");
  });
  it("counts apart the gifts it cannot place: not started and ongoing (decision 314)", () => {
    const html = scatterHtml([g("a", "2026-11-20"), g("b", "2026-11-20", { startAt: null }), g("c", "2026-11-20", { ongoing: true })], "2026-11-28", 90);
    expect(html).toContain("1 not started (waiting for full payment)");
    expect(html).toContain("1 ongoing");
  });
  it("says so when there are no gifts", () => {
    expect(scatterHtml([], "2026-11-28", 90)).toContain("No gifts yet");
  });
});
