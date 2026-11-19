/**
 * feed.test.ts
 *
 * What it does: tests feed.ts on the invented CRM sample (samples/crm-feed-sample.csv). The tests
 * double as examples of what the feed should look like.
 */

import { describe, expect, it } from "vitest";
import { readFeed } from "./feed";
import { firstRow, sampleRows } from "./sample";

describe("readFeed on the sample", () => {
  const r = readFeed(sampleRows());

  it("keeps paid, live lines and says why the others were left out", () => {
    expect(r.lines.map((l) => l.lineId)).toEqual(["L001", "L002", "L003", "L004", "L008"]);
    expect(r.skipped).toEqual([
      { row: 5, lineId: "L005", reason: "not_paid" },
      { row: 6, lineId: "L006", reason: "deleted" },
      { row: 7, lineId: "L007", reason: "superseded" },
    ]);
    expect(r.issues).toEqual([]);
  });

  it("reads the item-level trigger", () => {
    expect(r.lines.filter((l) => l.needsFeedback).map((l) => l.lineId)).toEqual(["L001", "L002", "L004", "L008"]);
  });

  it("takes the instalment count from the CRM item, Indefinitely when recurring has none, blank for one-off", () => {
    const by = Object.fromEntries(r.lines.map((l) => [l.lineId, l.instalmentCount]));
    expect(by).toEqual({ L001: "12", L002: "", L003: "", L004: "Indefinitely", L008: "" });
  });

  it("keeps the day only from the paid time", () => {
    expect(r.lines[0]?.paidDate).toBe("2026-11-02");
  });
});

describe("readFeed problems", () => {
  const base = firstRow();

  it("reports a missing trigger column once and treats nothing as needing feedback", () => {
    const { needs_feedback: _drop, ...noTrigger } = base;
    const r = readFeed([noTrigger]);
    expect(r.issues.map((i) => i.code)).toEqual(["trigger_column_missing"]);
    expect(r.lines[0]?.needsFeedback).toBe(false);
  });

  it("follows a different trigger column name and yes values", () => {
    const row = { ...base, fb: "Required" };
    const r = readFeed([row], { triggerColumn: "fb", yesValues: ["required"], paidValues: ["paid"] });
    expect(r.lines[0]?.needsFeedback).toBe(true);
  });

  it("leaves out a row with no line id", () => {
    const r = readFeed([{ ...base, line_id: "" }]);
    expect(r.lines).toEqual([]);
    expect(r.issues.map((i) => i.code)).toEqual(["missing_line_id"]);
  });

  it("flags a bad date, a bad amount and a missing reference without dropping the line", () => {
    const r = readFeed([{ ...base, paid_at: "02/11/2026", amount: "abc", transaction_ref: "" }]);
    expect(r.lines).toHaveLength(1);
    expect(r.issues.map((i) => i.code).sort()).toEqual(["bad_amount", "bad_date", "missing_transaction_ref"]);
  });
});
