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
import { adaptExports, adaptFiles, classifyExport, customAmountItems, toFeedDate } from "./export-adapter";

const load = (name: string) => toRecords(parseCsv(readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8"))).records;
const adapt = () => adaptExports(load("export-donation-lines-sample.csv"), load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv"));
const byLine = (id: string) => adapt().rows.find((r) => r["line_id"] === id)!;

describe("toFeedDate", () => {
  it("turns the CRM's dd/mm/yyyy hh:mm into the feed format", () => {
    expect(toFeedDate("02/11/2026 10:15")).toBe("2026-11-02 10:15:00");
    expect(toFeedDate("31/10/2026 21:29")).toBe("2026-10-31 21:29:00");
  });
  it("reads the USA site's mm/dd/yyyy when told so, and never guesses: a date the wrong way round is rejected (DECISIONS 262)", () => {
    expect(toFeedDate("11/27/2026 17:08", "mdy")).toBe("2026-11-27 17:08:00");
    expect(toFeedDate("12/05/2026 09:00", "mdy")).toBe("2026-12-05 09:00:00"); // 5 December
    expect(toFeedDate("12/05/2026 09:00", "dmy")).toBe("2026-05-12 09:00:00"); // the same text on the UK site is 12 May
    expect(toFeedDate("27/11/2026 17:08", "mdy")).toBe(""); // a 27th month: reported as a bad date, never swapped
    expect(toFeedDate("11/27/2026 17:08")).toBe(""); // and with no site, day/month/year as before
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

  it("carries the currency the line was paid in, never converted (DECISIONS 81)", () => {
    expect(byLine("9001")["currency"]).toBe("GBP");
    expect(byLine("9007")["currency"]).toBe("USD"); // paid in dollars, so it stays USD
    const noCurrency = load("export-donation-lines-sample.csv").map(({ Currency: _drop, ...rest }) => rest);
    const rows = adaptExports(noCurrency, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv")).rows;
    expect(rows.every((r) => r["currency"] === "")).toBe(true); // unknown: left blank
  });

  it("carries the donor's tribute from the Tribute column, trimmed, and leaves it blank when the export has none (DECISIONS 247)", () => {
    const lines = load("export-donation-lines-sample.csv").map((r, i) => (i === 0 ? { ...r, Tribute: "  In loving memory of Hajra Begum " } : r));
    const rows = adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv")).rows;
    expect(rows[0]!["tribute"]).toBe("In loving memory of Hajra Begum");
    expect(readFeed(rows.slice(0, 1), MWF_CRM_CONFIG).lines[0]?.tribute).toBe("In loving memory of Hajra Begum");
    expect(byLine("9001")["tribute"]).toBe(""); // the sample export has no Tribute column
  });

  it("gives every gift a country code: the CRM's Site column wins, else the currency says, and it reaches the feed (DECISIONS 261)", () => {
    const lines = load("export-donation-lines-sample.csv").map((r, i) => (i === 0 ? { ...r, Site: "USA", Currency: "GBP" } : i === 1 ? { ...r, Site: "", Currency: "NOK" } : i === 2 ? { ...r, Site: "Norway", Currency: "" } : r));
    const rows = adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv")).rows;
    expect(rows.slice(0, 3).map((r) => r["site"])).toEqual(["US", "NO", "NO"]); // the site wins over the currency; no site falls back to the currency
    expect(readFeed(rows.slice(0, 1), MWF_CRM_CONFIG).lines[0]?.site).toBe("US");
    const none = adaptExports(load("export-donation-lines-sample.csv").map(({ Currency: _c, ...rest }) => rest), load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv")).rows;
    expect(none.every((r) => r["site"] === "")).toBe(true); // no site and no currency: no guess
  });

  it("reads each line's dates by its site, so UK day/month/year and USA month/day/year can share one file (DECISIONS 262)", () => {
    const lines = load("export-donation-lines-sample.csv").map((r, i) => (i === 0 ? { ...r, Site: "USA", Currency: "USD", "Payment Date": "11/27/2026 17:08" } : i === 1 ? { ...r, Site: "UK", Currency: "GBP", "Payment Date": "23/01/2026 18:25" } : i === 2 ? { ...r, Site: "USA", Currency: "USD", "Payment Date": "27/11/2026 17:08" } : r));
    const result = adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv"));
    expect(result.rows[0]!["paid_at"]).toBe("2026-11-27 17:08:00");
    expect(result.rows[1]!["paid_at"]).toBe("2026-01-23 18:25:00");
    expect(result.rows[2]!["paid_at"]).toBe(""); // a USA line written day/month is not guessed
    expect(result.issues.some((i) => i.code === "bad_date" && i.message.startsWith("1 line"))).toBe(true);
  });

  it("reads a plan's next due date by the plan's site too", () => {
    const plans = load("export-recurring-plans-sample.csv");
    const planId = plans[0]!["Plan ID"]!;
    const withNext = (site: string) => plans.map((p, i) => (i === 0 ? { ...p, Site: site, "Next due": "12/05/2026" } : p));
    const lines = load("export-donation-lines-sample.csv");
    const sub = lines.find((l) => l["Subscription ID"] === planId);
    const nextOf = (site: string) => adaptExports(lines, load("export-catalogue-sample.csv"), withNext(site), load("export-catalogue-prices-sample.csv")).rows.find((r) => r["subscription_id"] === planId)?.["plan_next_due"];
    expect(sub).toBeDefined();
    expect(nextOf("UK")).toBe("2026-05-12");
    expect(nextOf("USA")).toBe("2026-12-05");
  });

  it("marks a plan carried over from the old website: by its Legacy plan column, else by an archive gateway reference (DECISIONS 264)", () => {
    const plans = load("export-recurring-plans-sample.csv");
    const planId = plans[0]!["Plan ID"]!;
    const lines = load("export-donation-lines-sample.csv");
    const carriedOf = (rows: Record<string, string>[]) => adaptExports(lines, load("export-catalogue-sample.csv"), rows, load("export-catalogue-prices-sample.csv")).rows.find((r) => r["subscription_id"] === planId)?.["plan_carried_over"];
    expect(carriedOf(plans)).toBe(""); // the sample has neither column: a plan with no archive reference is a new plan
    expect(carriedOf(plans.map((p, i) => (i === 0 ? { ...p, "Legacy plan": "Yes" } : { ...p, "Legacy plan": "No" })))).toBe("1");
    expect(carriedOf(plans.map((p) => ({ ...p, "Legacy plan": "No", "Gateway reference": "archive:s2:1" })))).toBe(""); // the column, when there, decides
    expect(carriedOf(plans.map((p, i) => (i === 0 ? { ...p, "Gateway reference": "archive:136936" } : p)))).toBe("1"); // no column: the CRM's archive stamp
    const feedRow = adaptExports(lines, load("export-catalogue-sample.csv"), plans.map((p, i) => (i === 0 ? { ...p, "Legacy plan": "Yes" } : p)), load("export-catalogue-prices-sample.csv")).rows.find((r) => r["subscription_id"] === planId)!;
    expect(readFeed([feedRow], MWF_CRM_CONFIG).lines[0]?.carriedOver).toBe(true);
  });

  it("tells a carried-over plan what it paid on the old site when the Legacy donations file is loaded with the others, and reaches the feed (DECISIONS 269)", () => {
    const plans = load("export-recurring-plans-sample.csv");
    const planId = plans[0]!["Plan ID"]!;
    const withPlan = plans.map((p, i) => (i === 0 ? { ...p, "Legacy plan": "Yes", "Donor ID": "55", Site: "UK", Currency: "GBP", "Amount per instalment (native)": "20", Started: "01/03/2026 10:00", "In the CRM since": "01/09/2026 10:00" } : p));
    const legacy = ["01/03/2026 10:00", "01/04/2026 10:00", "01/05/2026 10:00"].map((d, i) => ({ "Legacy ID": `${i}`, Status: "Paid", "Paid date": d, Recurring: i === 0 ? "No" : "Yes", Currency: "GBP", "Amount (native)": "20", "CRM donor ID": "55", Site: "UK" }));
    const result = adaptFiles([load("export-donation-lines-sample.csv"), load("export-catalogue-sample.csv"), withPlan, load("export-catalogue-prices-sample.csv"), legacy]);
    expect(result.used).toContain("legacy");
    const row = result.rows.find((r) => r["subscription_id"] === planId)!;
    expect([row["plan_prior_match"], row["plan_prior_count"], row["plan_prior_first"], row["plan_prior_last"], row["plan_prior_total"], row["plan_prior_opening"]]).toEqual(["found", "3", "2026-03-01", "2026-05-01", "60", "1"]);
    expect(readFeed([row], MWF_CRM_CONFIG).lines[0]?.prior).toEqual({ match: "found", count: 3, first: "2026-03-01", last: "2026-05-01", total: 60, opening: true });
    const without = adaptFiles([load("export-donation-lines-sample.csv"), load("export-catalogue-sample.csv"), withPlan, load("export-catalogue-prices-sample.csv")]);
    expect(without.rows.find((r) => r["subscription_id"] === planId)!["plan_prior_match"]).toBe(""); // no legacy file: no history, as before
  });

  it("keeps the CRM's line total beside the unit price, never working it out (DECISIONS 83)", () => {
    expect(byLine("9004")["amount"]).toBe("20"); // the price of one unit
    expect(byLine("9004")["quantity"]).toBe("2");
    expect(byLine("9004")["line_total"]).toBe("40"); // the CRM's Total Amount for the whole line
    const noTotal = load("export-donation-lines-sample.csv").map(({ "Total Amount": _drop, ...rest }) => rest);
    const rows = adaptExports(noTotal, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv")).rows;
    expect(rows.every((r) => r["line_total"] === "")).toBe(true); // no column: left blank, not calculated
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

  it("counts a guessed or unknown instalment count only for lines that need feedback", () => {
    const lines = load("export-donation-lines-sample.csv").map((l) => (l["Line ID"] === "9006" ? { ...l, "Item Code": "MWF-GEN-001" } : l)); // an acknowledgement-only item
    const r = adaptExports(lines, load("export-catalogue-sample.csv"), []);
    expect(r.counts.recurringCountUnknown).toBe(1); // only 9005 is counted, 9006 needs no work order
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

describe("opening orders (DECISIONS 56)", () => {
  const lines: Record<string, string>[] = load("export-donation-lines-sample.csv").map((l) => ({ ...l, "Donation ID": "" }));
  const plans = [...load("export-recurring-plans-sample.csv"), { "Plan ID": "700", "Plan status": "active", "Instalments planned": "10", "Until cancelled": "No", "Opening order ID": "5535" }];
  const orphan = { ...(lines.find((l) => l["Line ID"] === "9001") as Record<string, string>), "Line ID": "9100", "Subscription ID": "", "Order Reference": "ARCHIVE-SUB-12", "Donation ID": "5535", Period: "Monthly" };

  it("links a recurring line with no subscription id to the plan whose opening order it is, with that plan's count", () => {
    const r = adaptExports([...lines, orphan], load("export-catalogue-sample.csv"), plans);
    const row = r.rows.find((x) => x["line_id"] === "9100")!;
    expect([row["subscription_id"], row["instalment_count"]]).toEqual(["700", "10"]);
    expect(r.info?.some((n) => n.includes("linked to that plan"))).toBe(true);
    expect(r.issues.some((i) => /linked/.test(i.message))).toBe(false); // done on purpose, not a problem to review
  });

  it("shows the Donation ID as the reference when the Order Reference is blank, and says so once", () => {
    const blank = { ...orphan, "Order Reference": "", "Donation ID": "5535" };
    const r = adaptExports([...lines, blank], load("export-catalogue-sample.csv"), plans);
    expect(r.rows.find((x) => x["line_id"] === "9100")!["transaction_ref"]).toBe("Donation 5535");
    expect(r.info?.some((n) => n.includes("Donation ID is shown as the reference"))).toBe(true);
  });

  it("does not guess when two plans share the opening order, or two lines share the donation", () => {
    const twoPlans = [...plans, { "Plan ID": "701", "Plan status": "active", "Instalments planned": "10", "Until cancelled": "No", "Opening order ID": "5535" }];
    expect(adaptExports([...lines, orphan], load("export-catalogue-sample.csv"), twoPlans).rows.find((x) => x["line_id"] === "9100")!["subscription_id"]).toBe("");
    const twin = { ...orphan, "Line ID": "9101" };
    expect(adaptExports([...lines, orphan, twin], load("export-catalogue-sample.csv"), plans).rows.find((x) => x["line_id"] === "9100")!["subscription_id"]).toBe("");
  });

  it("never links a one-off line", () => {
    const oneOff = { ...orphan, Period: "One-time" };
    expect(adaptExports([...lines, oneOff], load("export-catalogue-sample.csv"), plans).rows.find((x) => x["line_id"] === "9100")!["subscription_id"]).toBe("");
  });
});

describe("bundles and parts (DECISIONS 51)", () => {
  it("gives a line its bundle quantity from the Catalogue prices file, and none when it has no bundle", () => {
    expect(byLine("9002")["bundle_qty"]).toBe("3"); // bought as "Sponsor an Orphan"
    expect(byLine("9001")["bundle_qty"]).toBe("");
  });
  it("says so once when there is no prices file, and counts the bundle as 1 part", () => {
    const r = adaptExports(load("export-donation-lines-sample.csv"), load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"));
    expect(r.rows.find((x) => x["line_id"] === "9002")!["bundle_qty"]).toBe("");
    expect(r.issues.filter((i) => i.code === "bundle_without_prices")).toHaveLength(1);
  });
  it("reports a bundle name the prices file does not know", () => {
    const lines = load("export-donation-lines-sample.csv").map((l) => (l["Line ID"] === "9001" ? { ...l, "Item Bundle": "Mystery Pack" } : l));
    const r = adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv"));
    expect(r.issues.some((i) => i.code === "bundle_not_in_catalogue")).toBe(true);
  });
  it("reaches the feed lines and work orders as parts", () => {
    const feed = readFeed(adapt().rows, MWF_CRM_CONFIG);
    expect(feed.lines.find((l) => l.lineId === "9002")!.bundleQty).toBe(3);
    expect(feed.lines.find((l) => l.lineId === "9001")!.bundleQty).toBe(1);
  });
  it("recognises the Catalogue prices file by its columns", () => {
    expect(classifyExport(load("export-catalogue-prices-sample.csv"))).toBe("prices");
    expect(adaptFiles([load("export-donation-lines-sample.csv"), load("export-catalogue-prices-sample.csv"), load("export-catalogue-sample.csv")]).rows.find((x) => x["line_id"] === "9002")!["bundle_qty"]).toBe("3");
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

describe("months a one-off payment covers (DECISIONS 64)", () => {
  const oneOff = (over: Record<string, string>) => {
    const lines = load("export-donation-lines-sample.csv").map((l) => (l["Line ID"] === "9001" ? { ...l, Period: "One-time", "Subscription ID": "0", "Instalment no": "", ...over } : l));
    return adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), load("export-catalogue-prices-sample.csv")).rows.find((x) => x["line_id"] === "9001")!;
  };
  it("gives a single payment the length of the item's instalment plan for its bundle", () => {
    expect(oneOff({ "Item Bundle": "Sponsor an Orphan" })["period_count"]).toBe("12");
  });
  it("works the months out from the single payment and one instalment when the file gives no payment count, as for an item that also continues until cancelled (DECISIONS 195)", () => {
    const lines = load("export-donation-lines-sample.csv").map((l) => (l["Line ID"] === "9001" ? { ...l, Period: "One-time", "Subscription ID": "0", "Instalment no": "", "Item Bundle": "" } : l));
    const prices = [...load("export-catalogue-prices-sample.csv"), { "Item SKU": "MWF-ORP-001", Bundle: "", Quantity: "1", "Way of giving": "Instalments", "Each payment": "40", Payments: "" }];
    expect(adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), prices).rows.find((x) => x["line_id"] === "9001")!["period_count"]).toBe("12");
    // The real export's shape for an item that continues until cancelled: the catalogue says "covers 12 months" itself (invented item and prices).
    const real = [...load("export-catalogue-prices-sample.csv"), { "Item SKU": "MWF-ORP-001", Bundle: "", Quantity: "1", "Way of giving": "Monthly until cancelled", "Each payment": "33", Payments: "", "In words": "GBP 33.00 a month until cancelled" }];
    const withWords = real.map((r) => (r["Way of giving"] === "Single payment" && r["Item SKU"] === "MWF-ORP-001" && r["Bundle"] === "" ? { ...r, "Each payment": "390", "In words": "GBP 390.00 once (covers 12 months)" } : r));
    expect(adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), withWords).rows.find((x) => x["line_id"] === "9001")!["period_count"]).toBe("12"); // 390 / 33 is not whole, the words say 12
    const odd = [...load("export-catalogue-prices-sample.csv"), { "Item SKU": "MWF-ORP-001", Bundle: "", Quantity: "1", "Way of giving": "Instalments", "Each payment": "70", Payments: "" }];
    expect(adaptExports(lines, load("export-catalogue-sample.csv"), load("export-recurring-plans-sample.csv"), odd).rows.find((x) => x["line_id"] === "9001")!["period_count"]).toBe(""); // 480 does not divide by 70
  });
  it("leaves it blank when the bundle has no instalment plan, and for a recurring line", () => {
    expect(oneOff({ "Item Bundle": "" })["period_count"]).toBe("");
    expect(byLine("9002")["period_count"]).toBe("");
  });
});

describe("custom amount items (DECISIONS 129)", () => {
  const cat = (sku: string, price: string) => ({ "Item SKU": sku, Item: sku, "Feedback type": "Feedback report", "Price GBP": price });
  it("finds the items whose catalogue price is not a figure, such as Donor chooses the amount", () => {
    const items = customAmountItems([cat("WMN", "Donor chooses the amount"), cat("ORP", "480"), cat("PMP", "1,200"), cat("ODD", ""), cat("OTH", "Price on request")]);
    expect([...items]).toEqual(["WMN"]); // a figure, a figure with a comma, blank, or other text are not custom amount items
  });
  it("reads any price column, whatever the currency", () => {
    expect(customAmountItems([{ "Item SKU": "WMN", "Price USD": "Donor chooses the amount" }]).has("WMN")).toBe(true);
  });
  it("marks the feed lines of a custom amount item, and no others", () => {
    const lines = [
      { "Line ID": "1", "Item Name": "Custom Amount", "Item Code": "WMN", "Order Reference": "A", "Payment Date": "2026-06-01 10:00:00", "Order Status": "Paid", "Donor ID": "D1", "Item Cost": "50", "Order Quantity": "1", Currency: "GBP" },
      { "Line ID": "2", "Item Name": "Orphan", "Item Code": "ORP", "Order Reference": "B", "Payment Date": "2026-06-01 10:00:00", "Order Status": "Paid", "Donor ID": "D2", "Item Cost": "35", "Order Quantity": "1", Currency: "GBP" },
    ];
    const catalogue = [{ "Item SKU": "WMN", Item: "Custom Amount", "Feedback type": "Feedback report", "Price GBP": "Donor chooses the amount" }, { "Item SKU": "ORP", Item: "Orphan", "Feedback type": "Feedback report", "Price GBP": "35" }];
    const r = adaptExports(lines, catalogue, [], []);
    expect(r.rows.find((x) => x["line_id"] === "1")?.["custom_amount"]).toBe("1");
    expect(r.rows.find((x) => x["line_id"] === "2")?.["custom_amount"]).toBe("");
  });
});
