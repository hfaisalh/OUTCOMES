/**
 * lines.test.ts
 *
 * What it does: tests lines.ts. The tests double as examples of how lines are built and how
 * fund and outcome names are filled in from lookup lists. Invented data only.
 */

import { describe, expect, it } from "vitest";
import { decodeLines, emptyLookups, finishLines, lineFromValues, toNumber } from "./lines";

describe("toNumber", () => {
  it("reads numbers from text and gives 0 for anything else", () => {
    expect(toNumber("1,250.50")).toBe(1250.5);
    expect(toNumber("")).toBe(0);
    expect(toNumber("abc")).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});

describe("lineFromValues", () => {
  it("builds a line from a row, using the total when there is no line amount", () => {
    const p = lineFromValues({ totalAmount: "40", lineQuantity: "", lineOutcome: "Orphan sponsorship", lineFund: "General fund" }, 3);
    expect(p).toMatchObject({ row: 3, amount: 40, quantity: 1, unitPrice: 40, outcomeName: "Orphan sponsorship", fundName: "General fund" });
  });

  it("prefers the line amount and works out the unit price from the quantity", () => {
    const p = lineFromValues({ lineAmount: "100", totalAmount: "999", lineQuantity: "4" }, 2);
    expect(p).toMatchObject({ amount: 100, quantity: 4, unitPrice: 25 });
  });
});

describe("finishLines", () => {
  it("numbers lines from 1 and fills every field", () => {
    const lines = finishLines("R-1", [{ row: 2, amount: 5 }, { row: 3 }]);
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(lines[1]).toMatchObject({ reference: "R-1", row: 3, amount: 0, fundName: "", outcomeName: "", intention: "" });
  });
});

describe("decodeLines", () => {
  const lookups = { funds: { F1: "General fund" }, outcomes: { O1: "Orphan sponsorship" } };
  const rules = { fund: { required: true, label: "Fund" }, outcome: { required: true, label: "Outcome" } };
  const line = (over: object) => finishLines("R-1", [{ row: 2, fundId: "F1", outcomeId: "O1", ...over }]);

  it("fills names from IDs", () => {
    const r = decodeLines(line({}), lookups, rules);
    expect(r.issues).toEqual([]);
    expect(r.lines[0]).toMatchObject({ fundName: "General fund", outcomeName: "Orphan sponsorship" });
  });

  it("keeps a name the source gave and needs no lookup for it", () => {
    const r = decodeLines(line({ fundId: "", fundName: "Water", outcomeId: "", outcomeName: "Hand pump" }), emptyLookups(), rules);
    expect(r.issues).toEqual([]);
    expect(r.lines[0]).toMatchObject({ fundName: "Water", outcomeName: "Hand pump" });
  });

  it("reports an unknown ID, with row and line number, and keeps the line", () => {
    const r = decodeLines(line({ outcomeId: "O9" }), lookups, rules);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.outcomeName).toBe("");
    expect(r.issues[0]).toMatchObject({ reference: "R-1", row: 2, lineNumber: 1, message: "Outcome ID O9 is not in the lookup list" });
  });

  it("reports a missing name and ID only where the field is required", () => {
    expect(decodeLines(line({ fundId: "" }), lookups, rules).issues[0]?.message).toBe("No Fund on this line");
    const relaxed = { ...rules, fund: { required: false, label: "Fund" } };
    expect(decodeLines(line({ fundId: "" }), lookups, relaxed).issues).toEqual([]);
  });

  it("does not treat object property names as IDs", () => {
    const r = decodeLines(line({ outcomeId: "constructor" }), lookups, rules);
    expect(r.issues[0]?.message).toMatch(/not in the lookup list/);
  });
});
