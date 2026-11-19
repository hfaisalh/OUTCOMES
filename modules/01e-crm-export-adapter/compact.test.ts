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
import { packFeed, unpackFeed } from "./compact";

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
