/**
 * export-adapter.test.ts
 *
 * What it does: tests the export adapter on invented sample files (samples/export-*.csv), and
 * checks the result flows through the normal feed reader. These tests double as examples.
 * Who calls it: vitest.
 * Depends on: export-adapter.ts, Module 1's csv.ts, Module 1c's feed.ts.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "../01-data-mapping/csv";
import { MWF_CRM_CONFIG, readFeed } from "../01c-crm-connector/feed";
import { adaptExports, adaptFiles, classifyExport, toFeedDate } from "./export-adapter";

const load = (name: string) => toRecords(parseCsv(readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8"))).records;
const adapt = () => adaptExports(load("export-donation-lines-sample.csv"), load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"));
const byLine = (id: string) => adapt().rows.find((r) => r["line_id"] === id)!;

describe("toFeedDate", () => {
  it("turns the CRM's dd/mm/yyyy hh:mm into the feed format", () => {
    expect(toFeedDate("02/11/2026 10:15")).toBe("2026-11-02 10:15:00");
    expect(toFeedDate("31/10/2026 21:29")).toBe("2026-10-31 21:29:00");
  });
  it("passes an ISO date through and rejects non-dates", () => {
    expect(toFeedDate("2026-11-02 10:15:00")).toBe("2026-11-02 10:15:00");
    expect(toFeedDate("31/02/2026 10:00")).toBe("");
    expect(toFeedDate("soon")).toBe("");
  });
});

describe("adaptExports", () => {
  it("makes one feed row per donation line", () => {
    expect(adapt().rows).toHaveLength(7);
  });

  it("takes the feedback trigger from the catalogue by item code", () => {
    expect(byLine("9001")["item_feedback"]).toBe("2"); // Feedback report
    expect(byLine("9004")["item_feedback"]).toBe("1"); // Acknowledgement only
  });

  it("joins plan limits: a limited plan gives its count, until cancelled gives none", () => {
    expect(byLine("9001")["instalment_count"]).toBe("12");
    expect(byLine("9005")["instalment_count"]).toBe("");
  });

  it("treats Subscription ID 0 as a one-off and keeps the instalment number only for recurring", () => {
    const water = byLine("9003");
    expect(water["subscription_id"]).toBe("");
    expect(water["is_recurring"]).toBe("0");
    expect(water["instalment_number"]).toBe("");
    expect(byLine("9002")["instalment_number"]).toBe("2");
  });

  it("joins the billing first and last name into a display name and sends no contact columns", () => {
    const row = byLine("9001");
    expect(row["supporter_name"]).toBe("Sample Supporter A");
    expect(Object.keys(row).some((k) => /email|phone|address|card/i.test(k))).toBe(false);
  });

  it("reports an item code missing from the catalogue once, and does not flag it", () => {
    const result = adapt();
    expect(byLine("9007")["item_feedback"]).toBe("");
    expect(result.issues.filter((i) => i.code === "item_not_in_catalogue")).toHaveLength(1);
  });

  it("counts a recurring line with no plan row", () => {
    expect(adapt().counts.recurringWithoutPlan).toBe(1); // line 9006, plan 509 is not in the plans file
  });

  it("with no plan row, a Monthly line is until cancelled, and a limited line takes its count from Frequency", () => {
    const lines = load("export-donation-lines-sample.csv");
    const noPlans = adaptExports(lines, load("export-catalogue-sample.csv"), []);
    expect(noPlans.counts.recurringCountUnknown).toBe(2); // 9005 and 9006 are Period Recurring, and the sample has no Frequency column
    const withFrequency = adaptExports(lines.map((l) => (l["Line ID"] === "9006" ? { ...l, Frequency: "6" } : l)), load("export-catalogue-sample.csv"), []);
    expect(withFrequency.rows.find((r) => r["line_id"] === "9006")!["instalment_count"]).toBe("6");
    expect(withFrequency.counts.recurringCountUnknown).toBe(1);
    expect(noPlans.issues.some((i) => i.code === "recurring_count_unknown")).toBe(true);
  });

  it("reports blank order references once, with a count, and still makes the rows", () => {
    const lines = load("export-donation-lines-sample.csv").map((l, i) => (i < 3 ? { ...l, "Order Reference": "" } : l));
    const r = adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"));
    expect(r.rows).toHaveLength(7);
    const notes = r.issues.filter((i) => i.code === "missing_order_reference");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.message).toContain("3 of 7 lines");
  });

  it("falls back to the catalogue when the item has exactly one limited plan length", () => {
    const lines = load("export-donation-lines-sample.csv").map((l) => (l["Line ID"] === "9006" ? { ...l, "Item Code": "MWF-ORP-001" } : l));
    const r = adaptExports(lines, load("export-catalogue-sample.csv"), []);
    expect(r.rows.find((x) => x["line_id"] === "9006")!["instalment_count"]).toBe("12");
    expect(r.issues.some((i) => i.code === "recurring_count_guessed")).toBe(true); // a catalogue count is reported as a guess
    // Two different limited lengths on one item is ambiguous, so it stays unknown.
    const ambiguous = [...load("export-catalogue-sample.csv"), { "Item SKU": "MWF-ORP-001", "Feedback type": "Feedback report", Instalments: "6", "Continues until cancelled": "No" }];
    expect(adaptExports(lines, ambiguous, []).rows.find((x) => x["line_id"] === "9006")!["instalment_count"]).toBe("");
  });

  it("raises one issue when the catalogue disagrees about an item, and keeps the report", () => {
    const cat = [...load("export-catalogue-sample.csv"), { "Item SKU": "MWF-GEN-001", "Feedback type": "Feedback report" }];
    const result = adaptExports(load("export-donation-lines-sample.csv"), cat, load("export-recurring-plans-sample.csv"));
    expect(result.issues.some((i) => i.code === "catalogue_conflict")).toBe(true);
    expect(result.rows.find((r) => r["line_id"] === "9004")!["item_feedback"]).toBe("2");
  });

  it("says plainly when a needed column is missing", () => {
    const result = adaptExports([{ "Line ID": "1" }], load("export-catalogue-sample.csv"), []);
    expect(result.rows).toHaveLength(0);
    expect(result.issues[0]?.code).toBe("missing_column");
  });
});

describe("through the normal feed reader", () => {
  it("gives work-order candidates for the feedback items, with Indefinitely where no count is known", () => {
    const feed = readFeed(adapt().rows, MWF_CRM_CONFIG);
    expect(feed.skipped).toHaveLength(0);
    const needs = feed.lines.filter((l) => l.needsFeedback).map((l) => l.lineId);
    expect(needs).toEqual(["9001", "9002", "9003", "9005", "9006"]);
    expect(feed.lines.find((l) => l.lineId === "9001")!.instalmentCount).toBe("12");
    expect(feed.lines.find((l) => l.lineId === "9005")!.instalmentCount).toBe("Indefinitely");
    expect(feed.lines.find((l) => l.lineId === "9006")!.instalmentCount).toBe("Indefinitely");
    expect(feed.lines.find((l) => l.lineId === "9003")!.instalmentCount).toBe("");
    expect(feed.issues).toHaveLength(0);
  });
});

describe("picking the files", () => {
  const lines = load("export-donation-lines-sample.csv");
  const catalogue = load("export-catalogue-sample.csv");
  const plans = load("export-recurring-plans-sample.csv");

  it("recognises each file by its columns, whatever it is called", () => {
    expect(classifyExport(lines)).toBe("lines");
    expect(classifyExport(catalogue)).toBe("catalogue");
    expect(classifyExport(plans)).toBe("plans");
    expect(classifyExport(adapt().rows)).toBe("feed");
    expect(classifyExport([{ Something: "else" }])).toBe("unknown");
  });

  it("takes the files in any order", () => {
    const a = adaptFiles([plans, lines, catalogue]);
    expect(a.rows).toHaveLength(7);
    expect(a.counts.feedbackLines).toBe(adapt().counts.feedbackLines);
  });

  it("works without the plans file", () => {
    expect(adaptFiles([lines, catalogue]).rows).toHaveLength(7);
  });

  it("asks for the missing file in plain words", () => {
    const r = adaptFiles([lines]);
    expect(r.rows).toHaveLength(0);
    expect(r.issues[0]?.message).toContain("Catalogue items");
  });

  it("uses a ready feed file as it is", () => {
    const feed = adapt().rows;
    expect(adaptFiles([feed]).rows).toHaveLength(feed.length);
  });
});
