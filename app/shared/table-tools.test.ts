/**
 * table-tools.test.ts
 *
 * What it does: tests the rules behind the tools every list has (sorting, filtering by value). The examples use invented rows.
 * Who calls it: npm test. Depends on: app/shared/table-tools.ts.
 */
import { describe, expect, it } from "vitest";
import { compareCells, tidy, valuesOf, viewRows } from "./table-tools";

describe("sorting cells", () => {
  it("sorts numbers as numbers, ignoring pound signs and commas", () => {
    expect(["£1,200", "£95", "£300"].sort((a, b) => compareCells(a, b, "asc"))).toEqual(["£95", "£300", "£1,200"]);
  });
  it("sorts dates as dates, not as words", () => {
    expect(["03/11/26", "22/10/26", "01/01/27"].sort((a, b) => compareCells(a, b, "asc"))).toEqual(["22/10/26", "03/11/26", "01/01/27"]);
  });
  it("puts an empty cell last whichever way it is sorted", () => {
    expect(["", "b", "a"].sort((a, b) => compareCells(a, b, "asc"))).toEqual(["a", "b", ""]);
    expect(["", "b", "a"].sort((a, b) => compareCells(a, b, "desc"))).toEqual(["b", "a", ""]);
  });
  it("keeps words with numbers in natural order", () => {
    expect(["Batch 10", "Batch 9"].sort((a, b) => compareCells(a, b, "asc"))).toEqual(["Batch 9", "Batch 10"]);
  });
  it("tidies spaces", () => expect(tidy("  a \n  b ")).toBe("a b"));
});

describe("filtering by value", () => {
  const rows = [["Orphan Care", "Open"], ["Water", "Full"], ["Orphan Care", "Full"], ["Water", ""]];
  it("offers a column's values with counts, and none for a column with one value or too many", () => {
    expect(valuesOf(rows.map((r) => r[0]!))).toEqual([{ value: "Orphan Care", count: 2 }, { value: "Water", count: 2 }]);
    expect(valuesOf(["a", "a"])).toBeNull();
    expect(valuesOf(Array.from({ length: 30 }, (_, i) => `v${i}`))).toBeNull();
  });
  it("keeps rows in every ticked list, then sorts", () => {
    expect(viewRows(rows, { 0: ["Orphan Care"], 1: ["Full"] }, undefined)).toEqual([2]);
    expect(viewRows(rows, { 0: ["Water"] }, { col: 1, dir: "asc" })).toEqual([0 + 1, 3]);
  });
  it("shows everything when nothing is ticked", () => expect(viewRows(rows, { 0: [] }, undefined)).toEqual([0, 1, 2, 3]));
});
