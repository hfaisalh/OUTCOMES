/**
 * old-site.test.ts
 *
 * What it does: tests how a carried-over plan is told what it already paid on the previous website (DECISIONS 269): the payments that belong to it, the opening order, the dates read by site, an ambiguous match that is never guessed, and plans it must leave alone.
 * Invented donors and plans. These tests double as examples. Who calls it: vitest. Depends on: old-site.ts.
 */
import { describe, expect, it } from "vitest";
import { matchOldSite } from "./old-site";

const plan = (over: Record<string, string> = {}): Record<string, string> => ({ "Plan ID": "247", Site: "USA", "Donor ID": "2642", Currency: "USD", "Amount per instalment (native)": "84", Started: "02/24/2026 19:56", "In the CRM since": "11/24/2026 14:10", "Legacy plan": "Yes", ...over });
const order = (id: string, paid: string, over: Record<string, string> = {}): Record<string, string> => ({ "Legacy ID": id, Status: "Paid", "Paid date": paid, Recurring: "Yes", Currency: "USD", "Amount (native)": "84", "CRM donor ID": "2642", Site: "USA", ...over });
// The USA site writes month/day/year: the opening order on 24 Feb, then a renewal on the 24th of each month to October.
const usa = [order("1", "02/24/2026 19:56", { Recurring: "No" }), ...["03", "04", "05", "06", "07", "08", "09", "10"].map((m, i) => order(`${i + 2}`, `${m}/24/2026 21:00`))];

describe("what a carried-over plan already paid on the old site", () => {
  it("counts the opening order and every renewal, with the dates and the total, reading the USA's month/day/year", () => {
    expect(matchOldSite([plan()], usa).get("247")).toEqual({ match: "found", count: 9, first: "2026-02-24", last: "2026-10-24", total: 756, opening: true });
  });

  it("reads a UK plan's day/month/year, so the same text means a different day", () => {
    const uk = [order("1", "24/02/2026 19:56", { Recurring: "No", Site: "UK", Currency: "GBP" }), order("2", "24/03/2026 21:00", { Site: "UK", Currency: "GBP" })];
    const p = plan({ Site: "UK", Currency: "GBP", Started: "24/02/2026 19:56", "In the CRM since": "24/11/2026 14:10" });
    expect(matchOldSite([p], uk).get("247")).toMatchObject({ count: 2, first: "2026-02-24", last: "2026-03-24" });
  });

  it("leaves out orders of another donor, amount, currency or site, unpaid orders, and orders outside the plan's dates", () => {
    const others = [order("x1", "03/24/2026 21:00", { "CRM donor ID": "9999" }), order("x2", "03/24/2026 21:00", { "Amount (native)": "50" }), order("x3", "03/24/2026 21:00", { Currency: "GBP" }), order("x4", "03/24/2026 21:00", { Site: "UK" }), order("x5", "03/24/2026 21:00", { Status: "Failed" }), order("x6", "01/10/2026 21:00"), order("x7", "12/24/2026 21:00")];
    expect(matchOldSite([plan()], others).has("247")).toBe(false); // none of them belong: no summary at all
    expect(matchOldSite([plan()], [...others, ...usa]).get("247")?.count).toBe(9);
  });

  it("counts only one opening order, the earliest within a day of the start, and not a renewal-looking gift on another day", () => {
    const extra = [order("o2", "02/24/2026 20:30", { Recurring: "No" }), order("o3", "03/05/2026 10:00", { Recurring: "No" })];
    expect(matchOldSite([plan()], [...usa, ...extra]).get("247")?.count).toBe(9);
  });

  it("says ambiguous, and counts nothing, when the same donor has two carried-over plans of the same amount", () => {
    const two = [plan(), plan({ "Plan ID": "248" })];
    for (const id of ["247", "248"]) expect(matchOldSite(two, usa).get(id)).toEqual({ match: "ambiguous", count: 0, first: "", last: "", total: 0, opening: false });
  });

  it("leaves a plan that was not carried over alone, by the Legacy plan column or, with none, the archive gateway reference", () => {
    expect(matchOldSite([plan({ "Legacy plan": "No" })], usa).size).toBe(0);
    const noColumn = ({ "Legacy plan": _l, ...rest }: Record<string, string>) => rest;
    expect(matchOldSite([noColumn(plan())], usa).size).toBe(0);
    expect(matchOldSite([{ ...noColumn(plan()), "Gateway reference": "archive:s2:1" }], usa).get("247")?.count).toBe(9);
  });

  it("does nothing without a legacy file, a donor, or a readable start date", () => {
    expect(matchOldSite([plan()], []).size).toBe(0);
    expect(matchOldSite([plan({ "Donor ID": "" })], usa).size).toBe(0);
    expect(matchOldSite([plan({ Started: "soon" })], usa).size).toBe(0);
  });
});
