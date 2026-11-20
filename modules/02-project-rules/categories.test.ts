/**
 * categories.test.ts
 *
 * What it does: tests categories.ts. Doubles as examples of adding categories, sorting items into
 * them and suggesting a category. Invented names only.
 * Who calls it: `npm test`. Depends on: categories.ts.
 */

import { describe, expect, it } from "vitest";
import { acceptSuggestions, addCategory, addFramework, allocationShape, assignItem, duplicateFramework, frameworkByItem, groupItems, isCurrentCategory, isFrameworkTemplate, migrateSetup, missingFramework, removeCategory, removeFramework, renameCategory, renameFramework, resolveFrameworkId, setCategoryFramework, setItemFramework, setKeywords, suggestAll, suggestCategory, unitsForCommitment, unitsForSinglePayment, updateTemplate, type Category, type FrameworkTemplate, type Setup } from "./categories";

const make = (): Category[] => {
  let c: Category[] = [];
  c = addCategory(c, "Sponsorship", "shared").value;
  c = addCategory(c, "Water", "once").value;
  return setKeywords(c, "sponsorship", "orphan, hifz, sponsorship");
};

describe("adding and renaming", () => {
  it("makes an id from the name, starts with the given framework id, and uses the name as a keyword", () => {
    const c = addCategory([], "Orphan Care", "shared").value[0] as Category;
    expect([c.id, c.frameworkId, c.keywords]).toEqual(["orphan-care", "shared", ["orphan", "care"]]);
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

describe("framework templates (DECISIONS 59)", () => {
  const two = (): FrameworkTemplate[] => {
    let f: FrameworkTemplate[] = [];
    f = addFramework(f, "Sponsorship: shared parts", "quarterly").value;
    f = addFramework(f, "Sponsorship: whole", "quarterly").value;
    return updateTemplate(updateTemplate(f, "sponsorship-shared-parts", { unitsPerBeneficiary: 3, instalment: "per_period", unit: "child", reportType: "Quarterly update" }), "sponsorship-whole", { instalment: "per_period", unit: "student", reportType: "Quarterly update" });
  };
  const setup = (): Setup => ({
    categories: [{ id: "sponsorship", name: "Sponsorship", keywords: [], frameworkId: "sponsorship-shared-parts" }, { id: "water", name: "Water", keywords: [], frameworkId: "" }],
    itemMap: { ORP: "sponsorship", HIFZ: "sponsorship", PUMP: "water" },
    frameworks: two(),
    itemFramework: { HIFZ: "sponsorship-whole" },
  });

  it("adds, renames and duplicates templates with unique names and ids", () => {
    const f = two();
    expect(f.map((x) => x.id)).toEqual(["sponsorship-shared-parts", "sponsorship-whole"]);
    expect(addFramework(f, "sponsorship: WHOLE").error).toContain("already");
    expect(renameFramework(f, "sponsorship-whole", "Sponsorship: shared parts").error).toContain("already");
    const copy = duplicateFramework(f, "sponsorship-shared-parts").value;
    expect(copy[2]).toMatchObject({ name: "Sponsorship: shared parts (copy)", unitsPerBeneficiary: 3 });
    expect(copy[2]?.id).not.toBe("sponsorship-shared-parts");
  });

  it("keeps units per beneficiary a whole number of 1 or more", () => {
    const f = two();
    expect(updateTemplate(f, "sponsorship-whole", { unitsPerBeneficiary: 0 })[1]?.unitsPerBeneficiary).toBe(1);
    expect(updateTemplate(f, "sponsorship-whole", { unitsPerBeneficiary: 2.5 })[1]?.unitsPerBeneficiary).toBe(1);
    expect(updateTemplate(f, "sponsorship-whole", { unitsPerBeneficiary: 4 })[1]?.unitsPerBeneficiary).toBe(4);
  });

  it("applies an item's own framework, otherwise its category's, otherwise none", () => {
    const s = setup();
    expect(resolveFrameworkId(s, "ORP")).toBe("sponsorship-shared-parts"); // follows the category
    expect(resolveFrameworkId(s, "HIFZ")).toBe("sponsorship-whole"); // its own
    expect(resolveFrameworkId(s, "PUMP")).toBe(""); // category has none yet
    expect(frameworkByItem(s)).toEqual({ ORP: "sponsorship-shared-parts", HIFZ: "sponsorship-whole" });
  });

  it("sets a category default and an item override, ignoring a template that does not exist, and clears an override", () => {
    const s = setup();
    expect(setCategoryFramework(s.categories, s.frameworks, "water", "sponsorship-whole")[1]?.frameworkId).toBe("sponsorship-whole");
    expect(setCategoryFramework(s.categories, s.frameworks, "water", "nope")[1]?.frameworkId).toBe("");
    expect(setItemFramework({}, s.frameworks, "PUMP", "sponsorship-whole")).toEqual({ PUMP: "sponsorship-whole" });
    expect(setItemFramework({}, s.frameworks, "PUMP", "nope")).toEqual({});
    expect(setItemFramework({ PUMP: "sponsorship-whole" }, s.frameworks, "PUMP", "")).toEqual({});
  });

  it("will not remove a template something uses, and says where", () => {
    const s = setup();
    expect(removeFramework(s, "sponsorship-shared-parts").error).toContain("Sponsorship");
    expect(removeFramework(s, "sponsorship-whole").error).toContain("1 item");
    expect(removeFramework({ ...s, itemFramework: {} }, "sponsorship-whole").value.frameworks.map((f) => f.id)).toEqual(["sponsorship-shared-parts"]);
  });

  it("migrates a setup with a framework inside each category, sharing identical ones, and leaves a current setup alone", () => {
    const legacy = { unit: "child", cycle: "quarterly" as const, reportType: "Q", instalment: "per_period" as const };
    const old = {
      categories: [
        { id: "a", name: "Sponsorship", keywords: [], framework: legacy },
        { id: "b", name: "Water", keywords: [], framework: { unit: "", cycle: "on_delivery" as const, reportType: "" } },
        { id: "c", name: "B2B", keywords: [], framework: { unit: "", cycle: "on_delivery" as const, reportType: "" } },
      ] as unknown as Category[],
      itemMap: { X: "a" },
    };
    const m = migrateSetup(old);
    expect(m.frameworks.map((f) => f.name)).toEqual(["Sponsorship", "Water"]); // B2B has the same framework as Water, so they share one
    expect(m.categories.map((c) => c.frameworkId)).toEqual(["sponsorship", "water", "water"]);
    expect(m.categories.every((c) => c.framework === undefined)).toBe(true);
    expect(m.frameworks[0]).toMatchObject({ unit: "child", instalment: "per_period", unitsPerBeneficiary: 1 });
    expect(migrateSetup(m)).toEqual(m); // safe to run again
  });

  it("recognises current and legacy categories and valid templates", () => {
    expect(isCurrentCategory(make()[0])).toBe(true);
    expect(isCurrentCategory({ id: "x", name: "X", keywords: [], framework: { unit: "", cycle: "monthly", reportType: "" } })).toBe(true);
    expect(isCurrentCategory({ id: "x", name: "X", defaultCycle: "monthly" })).toBe(false);
    expect(isFrameworkTemplate(two()[0])).toBe(true);
    expect(isFrameworkTemplate({ ...two()[0], unitsPerBeneficiary: 0 })).toBe(false);
    expect(isFrameworkTemplate({ ...two()[0], instalment: "sometimes" })).toBe(false);
  });

  it("splits units into dedicated beneficiaries and a shared remainder", () => {
    expect(allocationShape(3, 3)).toEqual({ dedicated: 1, shared: 0 });
    expect(allocationShape(1, 3)).toEqual({ dedicated: 0, shared: 1 });
    expect(allocationShape(4, 3)).toEqual({ dedicated: 1, shared: 1 });
    expect(allocationShape(2, 1)).toEqual({ dedicated: 2, shared: 0 });
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

  it("is a reminder when not set", () => {
    const f = addFramework([], "Pumps").value[0] as FrameworkTemplate;
    expect(missingFramework(f)).toEqual(["what one delivery is (unit)", "report type", "how an instalment counts"]);
    expect(missingFramework({ ...f, unit: "pump", reportType: "r", instalment: "share_of_whole" })).toEqual([]);
  });
});
