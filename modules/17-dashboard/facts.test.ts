/**
 * facts.test.ts
 *
 * What it does: tests the Dashboard figures (DECISIONS 301): the journey, the fulfilment score, ages, funding levels and the folding of small parts into "Other". Invented counts.
 * Who calls it: vitest. Depends on: facts.ts.
 */
import { describe, expect, it } from "vitest";
import { ageOn, benefitShares, byAgeBand, fulfilmentScore, fundingLevels, journey, topParts, type JourneyCounts } from "./facts";

const counts = (over: Partial<JourneyCounts> = {}): JourneyCounts => ({ paymentsIn30: 12, gifts: 100, assigned: 80, confirmed: 60, lateAnswers: 5, allocated: 30, delivered: 15, lateDelivery: 2, complete: 6, ...over });

describe("the journey of a gift", () => {
  it("measures each stage against the one before it, with late counts and the page behind it", () => {
    const s = journey(counts());
    expect(s.map((x) => [x.id, x.pct, x.done, x.of, x.late])).toEqual([["in", null, 12, 0, 0], ["assigned", 80, 80, 100, 0], ["confirmed", 75, 60, 80, 5], ["allocated", 50, 30, 60, 0], ["delivered", 50, 15, 30, 2], ["complete", 20, 6, 30, 0]]);
    expect(s.find((x) => x.id === "confirmed")?.page).toBe("confirmation");
  });
  it("says nothing to measure (null) rather than 0% when there is nothing before a stage, and never goes over 100", () => {
    const s = journey(counts({ gifts: 0, assigned: 0, confirmed: 0, allocated: 0, delivered: 0, complete: 0, lateAnswers: 0, lateDelivery: 0 }));
    expect(s.every((x) => x.pct === null)).toBe(true);
    expect(journey(counts({ gifts: 10, assigned: 25 }))[1]?.pct).toBe(100);
  });
});

describe("the fulfilment score", () => {
  it("is the plain average of the stages that have data", () => {
    expect(fulfilmentScore(journey(counts()))).toBe(Math.round((80 + 75 + 50 + 50 + 20) / 5));
  });
  it("leaves out a stage with no data, and is null when none has any", () => {
    expect(fulfilmentScore(journey(counts({ gifts: 0 })))).toBe(Math.round((75 + 50 + 50 + 20) / 4)); // assigned has nothing to measure, so it is left out
    expect(fulfilmentScore(journey(counts({ gifts: 0, assigned: 0, confirmed: 0, allocated: 0 })))).toBeNull();
  });
});

describe("splits", () => {
  it("folds the smallest parts into Other and drops empty ones", () => {
    const p = topParts([{ label: "A", value: 5 }, { label: "B", value: 9 }, { label: "C", value: 1 }, { label: "D", value: 2 }, { label: "E", value: 0 }], 2);
    expect(p).toEqual([{ label: "B", value: 9 }, { label: "A", value: 5 }, { label: "Other", value: 3 }]);
    expect(topParts([{ label: "A", value: 1 }], 3)).toEqual([{ label: "A", value: 1 }]);
  });
  it("works out ages in whole years, and groups them in order", () => {
    expect(ageOn("2015-03-12", "2026-03-11")).toBe(10);
    expect(ageOn("2015-03-12", "2026-03-12")).toBe(11);
    expect(ageOn("nope", "2026-03-12")).toBeNull();
    expect(ageOn("2030-01-01", "2026-03-12")).toBeNull();
    const bands = byAgeBand(["2023-01-01", "2018-06-01", "2014-01-01", "2010-01-01", "2000-01-01", "", "2016-01-01"], "2026-11-28");
    expect(bands.map((b) => [b.label, b.value])).toEqual([["Under 6", 1], ["6 to 9", 1], ["10 to 13", 2], ["14 to 17", 1], ["18 and over", 1], ["Age not known", 1]]);
  });
  it("counts how funded each place is", () => {
    expect(fundingLevels([{ used: 0, capacity: 3 }, { used: 1, capacity: 3 }, { used: 3, capacity: 3 }, { used: 0, capacity: 3 }])).toEqual([{ label: "Not funded yet", value: 2 }, { label: "Partly funded", value: 1 }, { label: "Fully funded", value: 1 }]);
    expect(fundingLevels([])).toEqual([{ label: "Not funded yet", value: 0 }, { label: "Partly funded", value: 0 }, { label: "Fully funded", value: 0 }]);
  });
});

describe("each benefit's share (DECISIONS 302)", () => {
  it("gives each benefit its share of all gifts, the largest first then by name, with its own journey and late count", () => {
    const r = benefitShares([{ itemId: "B", name: "Water Pump", counts: counts({ gifts: 25, lateAnswers: 1, lateDelivery: 2 }) }, { itemId: "A", name: "Orphan Sponsorship", counts: counts({ gifts: 75 }) }, { itemId: "C", name: "Another", counts: counts({ gifts: 25 }) }]);
    expect(r.map((x) => [x.name, x.gifts, x.share])).toEqual([["Orphan Sponsorship", 75, 60], ["Another", 25, 20], ["Water Pump", 25, 20]]);
    expect(r[2]?.late).toBe(3);
    expect(r[0]?.stages).toHaveLength(6);
  });
  it("gives every benefit 0% when there are no gifts, and nothing for no benefits", () => {
    expect(benefitShares([{ itemId: "A", name: "A", counts: counts({ gifts: 0 }) }])[0]?.share).toBe(0);
    expect(benefitShares([])).toEqual([]);
  });
});
