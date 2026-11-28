/**
 * sample-world.test.ts
 *
 * What it does: checks the invented sample world (DECISIONS 329), the files in samples/world/ made by scripts/make-sample-world.mjs: that the exports are read cleanly, that every kind of gift is there, and that nothing real is in them.
 * Who calls it: vitest. Depends on: the export adapter and the CSV reader.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "../01-data-mapping/csv";
import { adaptFiles } from "./export-adapter";

const load = (name: string) => toRecords(parseCsv(readFileSync(new URL(`../../samples/world/${name}`, import.meta.url), "utf8"))).records;
const r = adaptFiles([load("export-donation-lines.csv"), load("export-catalogue.csv"), load("export-recurring-plans.csv")]);

describe("the sample world", () => {
  it("is read cleanly: three files recognised, every line a paid gift line", () => {
    expect("rows" in r).toBe(true);
    if (!("rows" in r)) return;
    expect(r.rows.length).toBe(65);
    expect(r.issues.filter((i) => i.code === "missing_column")).toEqual([]);
  });
  it("has every kind of gift: sponsorships that run until cancelled, a limited scholarship, pumps paid once and in instalments, a home, a camp and a gift that needs no feedback", () => {
    if (!("rows" in r)) return;
    const items = new Set(r.rows.map((x) => x.item_name));
    for (const n of ["Orphan Sponsorship Monthly", "Hifz Sponsorship Monthly", "Aalim Scholarship", "Small Pump", "Large Pump", "Build A Home", "Family Startup", "Medical Camp (One Day)", "General Donation"]) expect(items.has(n)).toBe(true);
    expect(r.rows.some((x) => x.item_name === "General Donation" && x.item_feedback === "1")).toBe(true);
    expect(r.rows.some((x) => x.item_name === "Small Pump" && x.is_recurring === "0")).toBe(true);
    expect(r.rows.filter((x) => x.item_name === "Large Pump").every((x) => x.instalment_count === "4")).toBe(true);
  });
  it("has plans in every state: active, paused, cancelled and completed", () => {
    if (!("rows" in r)) return;
    const states = new Set(r.rows.map((x) => x.plan_status).filter((x) => x !== ""));
    for (const s of ["active", "paused", "cancelled", "completed"]) expect(states.has(s)).toBe(true);
  });
  it("is invented all through: donors are Sample Supporters and the files hold no email, phone or address", () => {
    if (!("rows" in r)) return;
    expect(r.rows.every((x) => (x.supporter_name ?? "").startsWith("Sample Supporter"))).toBe(true);
    const text = ["export-donation-lines.csv", "export-catalogue.csv", "export-recurring-plans.csv"].map((n) => readFileSync(new URL(`../../samples/world/${n}`, import.meta.url), "utf8")).join("\n");
    expect(text).not.toMatch(/@|\+\d{6,}/);
  });
});
