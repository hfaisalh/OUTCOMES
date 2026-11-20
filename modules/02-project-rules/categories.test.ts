/**
 * categories.test.ts
 *
 * What it does: tests categories.ts. Doubles as examples of adding categories, sorting items into
 * them and suggesting a category. Invented names only.
 * Who calls it: `npm test`. Depends on: categories.ts.
 */

import { describe, expect, it } from "vitest";
import { acceptSuggestions, addCategory, assignItem, groupItems, isCurrentCategory, missingFramework, removeCategory, renameCategory, setKeywords, suggestAll, suggestCategory, unitsForCommitment, unitsForSinglePayment, updateFramework, type Category } from "./categories";

const make = (): Category[] => {
  let c: Category[] = [];
  c = addCategory(c, "Sponsorship", "quarterly").value;
  c = addCategory(c, "Water", "on_delivery").value;
  return setKeywords(c, "sponsorship", "orphan, hifz, sponsorship");
};

describe("adding and renaming", () => {
  it("makes an id from the name, starts the framework from the cycle, and uses the name as a keyword", () => {
    const c = addCategory([], "Orphan Care", "monthly").value[0] as Category;
    expect([c.id, c.framework.cycle, c.keywords]).toEqual(["orphan-care", "monthly", ["orphan", "care"]]);
  });
  it("refuses an empty name and a repeated name", () => {
    expect(addCategory([], "  ").error).toBe("Give the category a name.");
    expect(addCategory(make(), "water").error).toBe('There is already a category called "water".');
    expect(renameCategory(make(), "water", "Sponsorship").error).toContain("already");
  });
  it("renames without changing the id, so saved items stay linked", () => {
    const r = renameCategory(make(), "water", "Water and Wells").value;
    expect(r.find((c) => c.id === "water")?.name).toBe("Water and Wells");
  });
});

describe("sorting items", () => {
  it("puts an item in a category, moves it, and sends it back with an empty id", () => {
    let m = assignItem({}, make(), "I11", "water");
    expect(m).toEqual({ I11: "water" });
    m = assignItem(m, make(), "I11", "sponsorship");
    expect(m).toEqual({ I11: "sponsorship" });
    expect(assignItem(m, make(), "I11", "")).toEqual({});
  });
  it("ignores a category that does not exist", () => {
    expect(assignItem({ I1: "water" }, make(), "I1", "ghost")).toEqual({ I1: "water" });
  });
  it("removing a category sends its items back to unsorted", () => {
    const r = removeCategory(make(), { I1: "water", I2: "sponsorship" }, "water");
    expect([r.categories.length, r.map]).toEqual([1, { I2: "sponsorship" }]);
  });
  it("groups items by category and lists the unsorted", () => {
    const g = groupItems([{ id: "I1", name: "a" }, { id: "I2", name: "b" }], { I1: "water" }, make());
    expect([g.byCategory["water"]?.length, g.unsorted.map((i) => i.id)]).toEqual([1, ["I2"]]);
  });
});

describe("suggesting", () => {
  it("suggests by whole word, longest keyword wins, a tie suggests nothing", () => {
    const c = make();
    expect(suggestCategory("Hifz Sponsorship Monthly", c)).toBe("sponsorship");
    expect(suggestCategory("Flood Relief Appeal", c)).toBe("");
    const tie = setKeywords(setKeywords(c, "water", "pump"), "sponsorship", "hifz");
    expect(suggestCategory("Hifz Pump", tie)).toBe("");
  });
  it("suggests for unsorted items only, and accepting never changes what is sorted", () => {
    const c = setKeywords(make(), "water", "water, pump");
    const s = suggestAll([{ id: "I1", name: "Water Pump" }, { id: "I2", name: "Orphan Monthly" }], { I2: "water" }, c);
    expect(s).toEqual({ I1: "water" });
    expect(acceptSuggestions({ I2: "water" }, { I1: "water", I2: "sponsorship" })).toEqual({ I2: "water", I1: "water" });
  });
});

describe("the framework", () => {
  it("is changed part by part and reminds when unit, report type or the instalment rule is missing", () => {
    let c = make();
    expect(missingFramework(c[0] as Category)).toHaveLength(3);
    c = updateFramework(c, "sponsorship", { unit: "child", reportType: "Quarterly child update", instalment: "per_period" });
    expect(missingFramework(c[0] as Category)).toEqual([]);
    expect(c[0]?.framework.cycle).toBe("quarterly");
  });
  it("recognises the current shape and rejects an older saved one", () => {
    expect(isCurrentCategory(make()[0])).toBe(true);
    expect(isCurrentCategory({ id: "x", name: "X", defaultCycle: "monthly" })).toBe(false);
  });
});

describe("how an instalment counts (DECISIONS 52, 58)", () => {
  it("per period: each instalment is its parts, and a single payment is the plan's periods", () => {
    expect(unitsForCommitment("per_period", { parts: 1, paid: 4, planned: 12 })).toEqual({ units: 4, target: 12, complete: false });
    expect(unitsForCommitment("per_period", { parts: 3, paid: 12, planned: 12 })).toEqual({ units: 36, target: 36, complete: true });
    expect(unitsForCommitment("per_period", { parts: 1, paid: 7, planned: null })).toEqual({ units: 7, target: null, complete: false });
    expect(unitsForSinglePayment("per_period", 1, 12)).toBe(12);
    expect(unitsForSinglePayment("per_period", 3, 12)).toBe(36);
  });

  it("share of whole: each instalment is a share, complete only when all are paid, a single payment is 1 whole", () => {
    expect(unitsForCommitment("share_of_whole", { parts: 1, paid: 4, planned: 10 })).toEqual({ units: 0.4, target: 1, complete: false });
    expect(unitsForCommitment("share_of_whole", { parts: 1, paid: 10, planned: 10 })).toEqual({ units: 1, target: 1, complete: true });
    expect(unitsForCommitment("share_of_whole", { parts: 2, paid: 5, planned: 10 }).units).toBe(1);
    expect(unitsForCommitment("share_of_whole", { parts: 1, paid: 3, planned: null })).toEqual({ units: 0, target: null, complete: false });
    expect(unitsForSinglePayment("share_of_whole", 1, 10)).toBe(1);
  });

  it("is a reminder when not set, and a saved setup with a wrong value is not understood", () => {
    const c = addCategory([], "Pumps").value[0] as Category;
    expect(missingFramework(c)).toContain("how an instalment counts");
    expect(missingFramework({ ...c, framework: { ...c.framework, unit: "pump", reportType: "r", instalment: "share_of_whole" } })).toEqual([]);
    expect(isCurrentCategory({ ...c, framework: { ...c.framework, instalment: "sometimes" } })).toBe(false);
    expect(isCurrentCategory(c)).toBe(true); // a setup saved before the setting existed still loads
  });
});
