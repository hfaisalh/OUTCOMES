/**
 * feed.test.ts
 *
 * What it does: tests feed.ts on the invented CRM sample (samples/crm-feed-sample.csv). The tests
 * double as examples of what the feed should look like.
 */

import { summariseIssues } from "./feed";
import { describe, expect, it } from "vitest";
import { currentFeedConfig, MWF_CRM_CONFIG, readFeed } from "./feed";
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

  it("reads the CRM trigger: item_feedback 2 is Feedback report, 1 is Acknowledgement only", () => {
    expect(MWF_CRM_CONFIG).toMatchObject({ triggerColumn: "item_feedback", yesValues: ["2"] });
    expect(readFeed([{ ...firstRow(), item_feedback: "1" }]).lines[0]?.needsFeedback).toBe(false);
    expect(readFeed([{ ...firstRow(), item_feedback: "2" }]).lines[0]?.needsFeedback).toBe(true);
  });

  it("reads the item-level trigger", () => {
    expect(r.lines.filter((l) => l.needsFeedback).map((l) => l.lineId)).toEqual(["L001", "L002", "L004", "L008"]);
  });

  it("takes the instalment count from the line (price and frequency are not set on the item), Indefinitely when recurring has none, blank for one-off", () => {
    const by = Object.fromEntries(r.lines.map((l) => [l.lineId, l.instalmentCount]));
    expect(by).toEqual({ L001: "12", L002: "", L003: "", L004: "Indefinitely", L008: "" });
  });

  it("a plan with no limit is Indefinitely, and a one-off stays blank even if a count is sent", () => {
    const plan = readFeed([{ ...firstRow(), is_recurring: "1", instalment_count: "" }]).lines[0];
    expect(plan?.instalmentCount).toBe("Indefinitely");
    const once = readFeed([{ ...firstRow(), is_recurring: "0", subscription_id: "", instalment_count: "12" }]).lines[0];
    expect(once?.instalmentCount).toBe("");
  });

  it("keeps the day only from the paid time", () => {
    expect(r.lines[0]?.paidDate).toBe("2026-11-02");
  });
});

describe("readFeed problems", () => {
  const base = firstRow();

  it("reports a missing trigger column once and treats nothing as needing feedback", () => {
    const { item_feedback: _drop, ...noTrigger } = base;
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

describe("an older saved setup", () => {
  it("with the first guess (needs_feedback) moves to the real CRM settings and keeps its paid values", () => {
    const old = { triggerColumn: "needs_feedback", yesValues: ["1", "yes", "true", "y"], paidValues: ["paid", "settled"] };
    expect(currentFeedConfig(old)).toEqual({ ...MWF_CRM_CONFIG, paidValues: ["paid", "settled"] });
  });

  it("leaves any other saved setting alone", () => {
    const own = { triggerColumn: "fb", yesValues: ["required"], paidValues: ["paid"] };
    expect(currentFeedConfig(own)).toBe(own);
  });
});

describe("summariseIssues", () => {
  const issue = (code: "missing_transaction_ref" | "bad_date", row: number) => ({ row, lineId: `L${row}`, code, message: `m${row}` });
  it("gives one sentence per kind with a count, most common first", () => {
    const out = summariseIssues([issue("bad_date", 1), ...Array.from({ length: 5787 }, (_, i) => issue("missing_transaction_ref", i + 2))]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("5787 lines have no transaction_ref");
    expect(out[1]).toBe("1 line has a paid_at that is missing or not a real date.");
  });
  it("says nothing when there are no issues", () => {
    expect(summariseIssues([])).toEqual([]);
  });
});
