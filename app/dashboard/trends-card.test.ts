/**
 * trends-card.test.ts
 *
 * What it does: tests the line chart and the trends part of the Dashboard (DECISIONS 304): the axis, gaps, the end of each line, the hover and table view, the change tiles with their words, the controls and the empty state. Invented numbers.
 * Who calls it: vitest. Depends on: line-chart.ts, trends-card.ts and trends-data.ts.
 */
import { describe, expect, it } from "vitest";
import { improvements, lastMonths, monthlyTrends } from "../../modules/17-dashboard/trends";
import { lineChartHtml, niceMax } from "./line-chart";
import { trendsData, type TrendsData } from "./trends-data";
import { noTrendsView, trendsHtml } from "./trends-card";
import type { View } from "../shared/pages";

describe("the line chart", () => {
  const months = ["Sep 26", "Oct 26", "Nov 26"];
  it("rounds the top of the axis to a clean number", () => {
    expect([niceMax(0), niceMax(7), niceMax(23), niceMax(48), niceMax(0.7), niceMax(180)]).toEqual([1, 10, 25, 50, 1, 200]);
  });
  it("draws a 2px line, a dot with a surface ring at its end with the value, a hover line and tooltip for each month, and a table view", () => {
    const html = lineChartHtml({ id: "a", title: "Score", months, series: [{ name: "Score", color: "#2a78d6", values: [20, 40, 55] }], unit: "%", max: 100 });
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('stroke="#fff" stroke-width="2"'); // the ring
    expect(html).toContain(">55%<");
    expect(html.match(/class="lc-hit"/g)).toHaveLength(3);
    expect(html).toContain("<title>Nov 26: Score 55%</title>");
    expect(html).toContain("View as a table");
    expect(html).not.toContain("lc-legend"); // one line needs no legend
  });
  it("breaks the line at a gap instead of drawing a zero, and says no data in the tooltip", () => {
    const html = lineChartHtml({ id: "b", title: "Days", months, series: [{ name: "Answer", color: "#eb6834", values: [3, null, 2] }], unit: " days" });
    expect(html).toContain("Oct 26: Answer no data");
    expect(html.match(/ M/g)?.length).toBeGreaterThanOrEqual(1); // two pieces of line
  });
  it("gives two or more lines a legend with their names, and text escaped", () => {
    const html = lineChartHtml({ id: "c", title: "Flow <x>", months, series: [{ name: "In", color: "#2a78d6", values: [1, 2, 3] }, { name: "Done", color: "#1baf7a", values: [0, 1, 2] }] });
    expect(html).toContain("lc-legend");
    expect(html).toContain(">Done<");
    expect(html).toContain("Flow &lt;x&gt;");
  });
  it("labels the end of a line only where the labels do not sit on top of each other", () => {
    const html = lineChartHtml({ id: "e", title: "Close", months, series: [{ name: "A", color: "#2a78d6", values: [2, 2, 2] }, { name: "B", color: "#eb6834", values: [2, 2, 2.1] }, { name: "C", color: "#1baf7a", values: [30, 30, 30] }], unit: " days" });
    expect((html.match(/class="lc-end"/g) ?? []).length).toBe(2); // A and B end together: one label; C is far away
  });
  it("says there is nothing to show yet when there is no figure at all", () => {
    expect(lineChartHtml({ id: "d", title: "Empty", months, series: [{ name: "x", color: "#000", values: [null, null, null] }] })).toContain("Nothing to show yet");
  });
});

describe("the trends part of the Dashboard", () => {
  const months = lastMonths("2026-11-30", 6);
  const lives = [{ key: "a", itemId: "I1", paidAt: "2026-08-02", assignedAt: "2026-08-03T00:00:00Z", answeredAt: "2026-08-05T00:00:00Z", confirmedAt: "2026-08-05T00:00:00Z", answerDays: 3, allocatedAt: "2026-08-06T00:00:00Z", completedAt: "2026-11-10T00:00:00Z", deliveredAt: "2026-10-10T00:00:00Z" }];
  const points = monthlyTrends(lives, months);
  const data: TrendsData = { points, improvements: improvements(points), benefits: [{ id: "I1", name: "Orphan <care>" }], partners: [{ id: "p1", name: "Alpha <Trust>" }, { id: "p2", name: "Beta Trust" }], byPartner: [{ id: "p1", name: "Alpha <Trust>", gifts: 5, points, improvements: improvements(points) }, { id: "p2", name: "Beta Trust", gifts: 9, points, improvements: improvements(points) }], gifts: 1 };
  it("leads with the change tiles, each with its words, then the four charts", () => {
    const html = trendsHtml(data, noTrendsView());
    expect(html).toContain("Is delivery improving?");
    expect(html.indexOf("tr-tile")).toBeLessThan(html.indexOf("Fulfilment score</h3>"));
    expect(html.match(/class="dash-card dash-line"/g)).toHaveLength(5); // the four, and the one comparing partners
    expect(html).toMatch(/Better|Worse|No change|No earlier month/);
  });
  it("has a benefit list and a range with names, the chosen ones marked, and escapes names", () => {
    const html = trendsHtml(data, { ...noTrendsView(), benefit: "I1", months: 6 });
    expect(html).toContain('id="tr-benefit" aria-label="Benefit"');
    expect(html).toContain('<option value="I1" selected>Orphan &lt;care&gt;</option>');
    expect(html).toContain('data-n="6" aria-pressed="true"');
    expect(html).toContain('data-n="12" aria-pressed="false"');
  });
  it("compares partners: a list to choose the partner and the measure, one line for each partner, and a table, names escaped", () => {
    const html = trendsHtml(data, { ...noTrendsView(), metric: "answer" });
    expect(html).toContain('id="tr-partner" aria-label="Partner"');
    expect(html).toContain('<option value="p1">Alpha &lt;Trust&gt;</option>');
    expect(html).toContain('id="tr-metric" aria-label="Measure"');
    expect(html).toContain('<option value="answer" selected>Time for a partner to answer</option>');
    expect(html).toContain("Time for a partner to answer, by partner");
    expect(html).toContain("Fewer days is better.");
    expect(html).toContain("lc-legend");
    expect(html.indexOf('scope="row">Beta Trust</th>')).toBeLessThan(html.indexOf('scope="row">Alpha &lt;Trust&gt;</th>')); // the table lists the busiest first
  });
  it("says there are no partners yet when no gift is assigned", () => {
    expect(trendsHtml({ ...data, byPartner: [], partners: [] }, noTrendsView())).toContain("No gift has been assigned to a partner yet");
  });
  it("is calm when there are no gifts yet", () => {
    const html = trendsHtml({ ...data, gifts: 0 }, noTrendsView());
    expect(html).toContain("No gifts to chart yet");
    expect(html).not.toContain("dash-line");
  });
});

describe("the dates gathered from a View", () => {
  it("gives twelve months and five measures for an empty organisation, and a benefit filter that finds nothing", () => {
    const d = trendsData({ workOrders: [], review: [], today: "2026-11-28" } as unknown as View);
    expect(d.points).toHaveLength(12);
    expect(d.improvements).toHaveLength(5);
    expect(d.gifts).toBe(0);
    expect(trendsData({ workOrders: [], review: [], today: "2026-11-28" } as unknown as View, "nope", 6).points).toHaveLength(6);
  });
});
