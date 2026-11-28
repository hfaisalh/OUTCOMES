/**
 * dashboard-page.test.ts
 *
 * What it does: tests the Dashboard (DECISIONS 301): the pieces (ring, donut, figure tile), the page from its figures, and the figures gathered from an empty View. Invented numbers.
 * Who calls it: vitest. Depends on: dash-charts.ts, dashboard-page.ts and dashboard-data.ts.
 */
import { describe, expect, it } from "vitest";
import { byAgeBand, fulfilmentScore, journey } from "../../modules/17-dashboard/facts";
import { dashboardData } from "./dashboard-data";
import { dashboardHtml } from "./dashboard-page";
import { CATEGORICAL, donutHtml, kpiHtml, NEUTRAL, ORDINAL, paint, ringHtml } from "./dash-charts";
import type { DashData } from "./dashboard-data";
import type { View } from "../shared/pages";

const counts = { paymentsIn30: 18, gifts: 298, assigned: 298, confirmed: 290, lateAnswers: 3, allocated: 250, delivered: 5, lateDelivery: 21, complete: 3 };
const stages = journey(counts);
const data = (over: Partial<DashData> = {}): DashData => ({
  stages, score: fulfilmentScore(stages), counts, review: { under: 4, sentBack: 2, reviewed: 6, rejections: 2 }, value: "£88,187", recurringActive: 271, plansStopped: 27, needAttention: 54, unallocated: 40, beneficiaries: 300, enrolled: 300, waiting: 12, needDetails: 54,
  funding: [{ label: "Not funded yet", value: 148 }, { label: "Partly funded", value: 123 }, { label: "Fully funded", value: 29 }], fully: 29, unfunded: 148, partlyFunded: 123, partnersActive: 6, batchesWaiting: 4, costs: "GBP 10.00", costCount: 1,
  benefits: [],
  splits: { funding: [{ label: "Not funded yet", value: 148 }, { label: "Partly funded", value: 123 }, { label: "Fully funded", value: 29 }], clusters: [{ label: "Lahore <home>", value: 20 }, { label: "Other", value: 3 }], ages: byAgeBand(["2016-01-01", ""], "2026-11-28"), where: [{ label: "Complete", value: 3 }], plans: [{ label: "Active", value: 5 }], partners: [] },
  ...over });

describe("the pieces", () => {
  it("draws a ring with its words for a screen reader, and a dash when there is nothing to measure", () => {
    expect(ringHtml(61)).toContain('aria-label="61 percent"');
    expect(ringHtml(61)).toContain(">61%<");
    expect(ringHtml(null)).toContain('aria-label="No data yet"');
    expect(ringHtml(null)).not.toContain("stroke-dasharray");
  });
  it("draws a donut with a 2px gap between parts, the number beside each name, a summary and a table view, text escaped", () => {
    const html = donutHtml({ title: "By cluster", centre: "23", centreLabel: "enrolled", parts: paint([{ label: "Lahore <home>", value: 20 }, { label: "Other", value: 3 }], "categorical") });
    expect(html).toContain("Lahore &lt;home&gt;");
    expect(html).toContain('<b class="dash-lval">20</b>');
    expect(html).toContain("View as a table");
    expect(html).toContain('aria-label="By cluster: Lahore &lt;home&gt; 20, Other 3"');
    expect(html.match(/stroke-dasharray="/g)).toHaveLength(2);
    expect(html).toContain("87%"); // the share in the table
  });
  it("draws an empty donut calmly, and a single part with no gap", () => {
    expect(donutHtml({ title: "By age", centre: "0", centreLabel: "beneficiaries", parts: [{ label: "Under 6", value: 0, color: "#000" }] })).toContain("nothing to show yet");
    expect(donutHtml({ title: "X", centre: "5", centreLabel: "n", parts: [{ label: "A", value: 5, color: "#000" }] })).toContain('stroke-dasharray="100.00 0.00"');
  });
  it("colours ordered parts light to dark in one hue, unordered parts by fixed hue order, and Other and not-known grey", () => {
    const ordered = paint([{ label: "a", value: 1 }, { label: "b", value: 1 }, { label: "c", value: 1 }, { label: "Age not known", value: 1 }], "ordered");
    expect(ordered[0]?.color).toBe(ORDINAL[0]);
    expect(ordered[2]?.color).toBe(ORDINAL[5]);
    expect(ordered[3]?.color).toBe(NEUTRAL);
    const cat = paint([{ label: "x", value: 1 }, { label: "Other", value: 1 }, { label: "y", value: 1 }], "categorical");
    expect([cat[0]?.color, cat[1]?.color, cat[2]?.color]).toEqual([CATEGORICAL[0], NEUTRAL, CATEGORICAL[1]]); // grey does not use up a hue
  });
  it("draws a figure tile that is a button to its page, with a status pill that has an icon and words", () => {
    const html = kpiHtml({ label: "Needs attention", value: "54", sub: "to look at", icon: "shield", hue: 7, page: "attention", pill: { text: "Review", tone: "bad" } });
    expect(html).toContain('<button type="button" class="dash-kpi dash-link" data-page="attention">');
    expect(html).toContain("dash-pill-bad");
    expect(html).toContain("<svg");
    expect(html).toContain(">54<");
    expect(kpiHtml({ label: "A", value: "1", icon: "gift" })).toContain('<div class="dash-kpi">'); // no page, no button
  });
});

describe("the Dashboard page", () => {
  const html = dashboardHtml(data());
  it("leads with the journey: a score and six stages that link to their pages, with late counts in words", () => {
    expect(html.indexOf("Gift journey")).toBeLessThan(html.indexOf("Gifts</h2>"));
    expect(html).toContain("fulfilment score");
    expect(html.match(/class="dash-stage dash-link"/g)).toHaveLength(6);
    for (const p of ["assignment", "confirmation", "allocate", "progress"]) expect(html).toContain(`data-page="${p}"`);
    expect(html).toContain("21 late");
    expect(html).toContain("3 late");
    expect(html).toContain("in the last 30 days");
  });
  it("groups the figures by what they are about and draws six splits", () => {
    for (const g of ["Gifts</h2>", "Beneficiaries</h2>", "Partners and delivery</h2>", "How it divides"]) expect(html).toContain(g);
    expect(html.match(/class="dash-card dash-donut"/g)).toHaveLength(6);
    expect(html).toContain("49% of 300");
    expect(html).toContain("Review");
  });
  it("says there is nothing yet, rather than showing 0%, when no stage has data", () => {
    const none = dashboardHtml(data({ stages: journey({ ...counts, gifts: 0, assigned: 0, confirmed: 0, allocated: 0, lateAnswers: 0, lateDelivery: 0, delivered: 0, complete: 0 }), score: null }));
    expect(none).toContain("Nothing has reached the first stage yet");
    expect(none).toContain("no data yet");
  });
});

describe("the figures gathered from a View", () => {
  it("are all zero and calm for an empty organisation", () => {
    const d = dashboardData({ workOrders: [], review: [], today: "2026-11-28" } as unknown as View);
    expect(d.score).toBeNull();
    expect(d.counts.gifts).toBe(0);
    expect(d.beneficiaries).toBe(0);
    expect(d.splits.funding.map((p) => p.value)).toEqual([0, 0, 0]);
    expect(d.stages).toHaveLength(6);
    expect(() => dashboardHtml(d)).not.toThrow();
  });
});

describe("benefits in the journey (DECISIONS 302)", () => {
  const b = (itemId: string, name: string, gifts: number, c: Partial<typeof counts> = {}) => {
    const k = { ...counts, gifts, assigned: gifts, confirmed: gifts, allocated: Math.floor(gifts / 2), delivered: 1, complete: 0, lateAnswers: 0, lateDelivery: 2, ...c };
    return { itemId, name, gifts, share: 0, counts: k, stages: journey(k), late: k.lateAnswers + k.lateDelivery, icon: "<svg></svg>", value: "\u00A310" };
  };
  it("shows each benefit's share as ranked bars with the count and the percentage, and folds the tail into one bar", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...b(`I${i}`, `Benefit <${i}>`, 100 - i * 5), share: 10 }));
    const html = dashboardHtml(data({ benefits: many }));
    expect(html).toContain("Share of gifts by benefit");
    expect(html).toContain("Benefit &lt;0&gt;");
    expect(html.match(/<li><span class="dash-bname">/g)).toHaveLength(9); // eight bars and "2 other benefits"
    expect(html).toContain("2 other benefits");
  });
  it("tables each benefit's own journey, with the count in the tooltip, a dash for a stage with nothing before it, and late in words", () => {
    const html = dashboardHtml(data({ benefits: [b("I1", "Orphan Sponsorship", 40), b("I2", "Water Pump", 0)] }));
    expect(html).toContain("Each benefit's journey");
    expect(html).toContain('title="20 of 40"'); // allocated of confirmed? 20 of 40
    expect(html).toContain("2 late");
    expect(html).toContain('title="Nothing to measure yet"');
  });
  it("says so calmly when no gift is routed to a benefit yet", () => {
    expect(dashboardHtml(data({ benefits: [] }))).toContain("No gift has been routed to a benefit yet");
  });
});

describe("review tiles (decision 323)", () => {
  it("shows what is under review, what was sent back, and what passed with the share sent back", () => {
    const html = dashboardHtml(data());
    expect(html).toContain("Under review");
    expect(html).toContain("waiting for MWF to review");
    expect(html).toContain("with the partner to put right");
    expect(html).toContain("passed review, 25% of reviews sent back"); // 2 rejections of 8 decisions
  });
});
