/**
 * compact.test.ts
 *
 * What it does: tests packing and unpacking of feed rows for the server, on the invented samples.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "../01-data-mapping/csv";
import { readFeed, MWF_CRM_CONFIG } from "../01c-crm-connector/feed";
import { adaptExports } from "./export-adapter";
import { packFeed, SEND_COLUMNS, unpackFeed } from "./compact";

const load = (n: string) => toRecords(parseCsv(readFileSync(new URL(`../../samples/${n}`, import.meta.url), "utf8"))).records;
const rows = adaptExports(load("export-donation-lines-sample.csv"), load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv")).rows;

describe("packFeed and unpackFeed", () => {
  it("round-trips and gives the same work-order lines", () => {
    const back = unpackFeed(packFeed(rows));
    if ("error" in back) throw new Error(back.error);
    const a = readFeed(rows, MWF_CRM_CONFIG).lines.filter((l) => l.needsFeedback).map((l) => [l.lineId, l.itemId, l.supporterName, l.instalmentCount]);
    const b = readFeed(back.rows, MWF_CRM_CONFIG).lines.filter((l) => l.needsFeedback).map((l) => [l.lineId, l.itemId, l.supporterName, l.instalmentCount]);
    expect(b).toEqual(a);
  });

  it("sends no supporter name for a line that needs no feedback, and no channel, merchant or payment mode", () => {
    const packed = packFeed(rows);
    const nameAt = packed.columns.indexOf("supporter_name");
    const feedbackAt = packed.columns.indexOf("item_feedback");
    for (const r of packed.rows) if (r[feedbackAt] !== "2") expect(r[nameAt]).toBe("");
    expect(packed.rows.some((r) => r[feedbackAt] === "2" && r[nameAt] !== "")).toBe(true);
    expect(packed.columns).not.toContain("merchant");
    expect(packed.columns).not.toContain("channel");
  });

  it("carries the optional credit chain, and sends its names only for lines that need feedback", () => {
    const withChain = rows.map((r) => ({ ...r, supporter_kind: "group", credit_1_role: "agent", credit_1_id: "A1", credit_1_name: "Sample Rep", credit_2_role: "group", credit_2_id: "G1", credit_2_name: "Sample Branch" }));
    const back = unpackFeed(packFeed(withChain));
    if ("error" in back) throw new Error(back.error);
    const lines = readFeed(back.rows, MWF_CRM_CONFIG).lines;
    const needs = lines.find((l) => l.needsFeedback)!;
    expect(needs.supporterKind).toBe("group");
    expect(needs.credits.map((c) => c.name)).toEqual(["Sample Rep", "Sample Branch"]);
    const other = lines.find((l) => !l.needsFeedback)!;
    expect(other.credits.map((c) => [c.id, c.name])).toEqual([["A1", ""], ["G1", ""]]); // ids stay, names are not sent
  });

  it("is much smaller than plain objects", () => {
    expect(JSON.stringify(packFeed(rows)).length).toBeLessThan(JSON.stringify(rows).length);
  });

  it("refuses anything that is not a table of known columns", () => {
    expect("error" in unpackFeed(null)).toBe(true);
    expect("error" in unpackFeed({ columns: ["email"], rows: [["a@b"]] })).toBe(true);
    expect("error" in unpackFeed({ columns: ["line_id"], rows: [["1", "2"]] })).toBe(true);
    expect("error" in unpackFeed({ columns: ["line_id"], rows: [[1]] })).toBe(true);
  });
});

describe("what leaves the browser (DECISIONS 81, 83)", () => {
  it("keeps the currency and the line total, so work orders carry them", () => {
    expect(SEND_COLUMNS).toContain("currency");
    expect(SEND_COLUMNS).toContain("line_total");
    const packed = packFeed([{ line_id: "1", currency: "GBP", line_total: "70", amount: "35", quantity: "2" }]);
    const row = Object.fromEntries(packed.columns.map((c, i) => [c, packed.rows[0]?.[i]]));
    expect(row).toMatchObject({ currency: "GBP", line_total: "70", amount: "35" });
  });
});
