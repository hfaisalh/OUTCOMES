/**
 * costs.test.ts
 *
 * What it does: tests the partner cost rules (DECISIONS 280): reading what is typed, adding, correcting and removing only a partner's own costs, and totals that never mix currencies. Invented partners and amounts.
 * Who calls it: vitest. Depends on: costs.ts.
 */
import { describe, expect, it } from "vitest";
import { addCost, applyCostAction, COST_CATEGORIES, costRows, emptyCosts, ownCosts, removeCost, setCost, totalText } from "./costs";

const AT = "2026-11-28T10:00:00Z";
const good = { date: "2026-11-20", category: "Marketing", amount: "1,250.50", currency: "gbp", projectId: "g1", note: "  Flyers   for the drive " };
const add = (s = emptyCosts(), partner = "p1", raw: Record<string, unknown> = good) => {
  const r = addCost(s, partner, raw, COST_CATEGORIES, ["g1"], "Amina (Alpha Trust)", AT);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("adding a cost", () => {
  it("cleans what was typed and gives it a permanent ID", () => {
    const r = add();
    expect(r.id).toBe("PC-0001");
    expect(r.value.records[0]).toEqual({ id: "PC-0001", partnerId: "p1", date: "2026-11-20", category: "Marketing", amount: 1250.5, currency: "GBP", projectId: "g1", note: "Flyers for the drive", by: "Amina (Alpha Trust)", at: AT });
    expect(add(r.value).id).toBe("PC-0002");
  });
  it.each([
    [{ date: "20/11/2026" }, "date"], [{ date: "2026-02-30" }, "date"], [{ category: "Fun" }, "category"], [{ amount: "0" }, "amount"], [{ amount: "-5" }, "amount"],
    [{ amount: "12.345" }, "amount"], [{ amount: "abc" }, "amount"], [{ amount: "" }, "amount"], [{ currency: "pounds" }, "currency"], [{ projectId: "g9" }, "project"],
  ])("refuses %j in plain words", (bad, word) => {
    const r = addCost(emptyCosts(), "p1", { ...good, ...bad }, COST_CATEGORIES, ["g1"], "x", AT);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error.toLowerCase()).toContain(word);
  });
  it("accepts a cost for the partner's work in general (no project)", () => {
    expect(add(emptyCosts(), "p1", { ...good, projectId: "" }).value.records[0]?.projectId).toBe("");
  });
});

describe("correcting and removing", () => {
  it("changes only the partner's own cost, keeping its ID and partner", () => {
    const s = add().value;
    const r = setCost(s, "p1", "PC-0001", { ...good, amount: "900" }, COST_CATEGORIES, ["g1"], "Amina", "2026-11-29T00:00:00Z");
    if ("error" in r) throw new Error(r.error);
    expect(r.value.records[0]).toMatchObject({ id: "PC-0001", partnerId: "p1", amount: 900, at: "2026-11-29T00:00:00Z" });
  });
  it("never touches another partner's cost, and says it was not found", () => {
    const s = add().value;
    expect(setCost(s, "p2", "PC-0001", good, COST_CATEGORIES, ["g1"], "x", AT)).toEqual({ error: "That cost was not found." });
    expect(removeCost(s, "p2", "PC-0001")).toEqual({ error: "That cost was not found." });
    expect(removeCost(s, "p1", "PC-0001")).toMatchObject({ value: { records: [] } });
  });
  it("is reached through one request that says what happened, and ignores other requests", () => {
    const r = applyCostAction(emptyCosts(), "p1", { action: "cost-add", ...good }, COST_CATEGORIES, ["g1"], "x", AT);
    expect(r).toMatchObject({ message: "Cost recorded.", id: "PC-0001" });
    expect(applyCostAction(emptyCosts(), "p1", { action: "ben-add" }, COST_CATEGORIES, [], "x", AT)).toBeNull();
  });
});

describe("reporting", () => {
  let s = emptyCosts();
  for (const [partner, category, amount, currency, date] of [["p1", "Marketing", "100", "GBP", "2026-11-02"], ["p1", "Media", "50.25", "GBP", "2026-11-09"], ["p1", "Marketing", "9000", "PKR", "2026-12-01"], ["p2", "Marketing", "10", "GBP", "2026-11-03"]]) s = add(s, partner, { ...good, projectId: "", category, amount, currency, date }).value;
  it("gives only a partner's own costs", () => {
    expect(ownCosts(s, "p2")).toHaveLength(1);
  });
  it("adds up by category with one total for each currency, never mixing them, biggest first", () => {
    const rows = costRows(s.records, "category");
    expect(rows[0]).toEqual({ key: "Marketing", count: 3, totals: [{ currency: "PKR", amount: 9000 }, { currency: "GBP", amount: 110 }] });
    expect(rows.find((r) => r.key === "Media")?.totals).toEqual([{ currency: "GBP", amount: 50.25 }]);
  });
  it("adds up by partner and by month", () => {
    expect(costRows(s.records, "partner").map((r) => [r.key, r.count])).toEqual([["p1", 3], ["p2", 1]]);
    expect(costRows(s.records, "month").map((r) => r.key).sort()).toEqual(["2026-11", "2026-12"]);
  });
  it("writes a total as text, a figure for each currency", () => {
    expect(totalText(s.records)).toBe("PKR 9,000.00 · GBP 160.25");
    expect(totalText([])).toBe("None");
  });
});
