/**
 * frameworks.test.ts
 *
 * What it does: tests frameworks.ts. The tests double as examples of how items are sorted into
 * frameworks. Names are invented.
 */

import { describe, expect, it } from "vitest";
import {
  acceptSuggestions, addCategory, addFramework, groupFrameworks, removeCategory, setCategory, assignItem, groupItems, missingRules, removeFramework, renameFramework,
  setKeywords, suggestAll, suggestFramework, updateRules, type Category, type Framework,
} from "./frameworks";

const base = (): Framework[] => {
  let f: Framework[] = [];
  for (const n of ["Orphan Sponsorship", "Hifz", "Water", "Animal Sacrifice"]) f = addFramework(f, n).value;
  f = setKeywords(f, "water", "water, well, pump");
  f = setKeywords(f, "animal-sacrifice", "sacrifice, qurbani, udhiya");
  return f;
};

describe("addFramework", () => {
  it("makes an id from the name and uses the name as keywords", () => {
    const f = addFramework([], "Orphan Sponsorship").value[0] as Framework;
    expect([f.id, f.keywords]).toEqual(["orphan-sponsorship", ["orphan", "sponsorship"]]);
  });
  it("refuses an empty name and a repeated name", () => {
    expect(addFramework([], "  ").error).toContain("name");
    expect(addFramework(base(), "hifz").error).toContain("already");
  });
  it("keeps ids unique even when two names make the same id", () => {
    const f = addFramework(addFramework([], "Hifz!").value, "Hifz?").value;
    expect(f.map((x) => x.id)).toEqual(["hifz", "hifz-2"]);
  });
});

describe("renaming and removing", () => {
  it("renames without changing the id", () => {
    const r = renameFramework(base(), "water", "Clean Water").value.find((f) => f.id === "water");
    expect(r?.name).toBe("Clean Water");
  });
  it("sends the items of a removed framework back to unrouted", () => {
    const r = removeFramework(base(), { I1: "water", I2: "hifz" }, "water");
    expect(r.map).toEqual({ I2: "hifz" });
    expect(r.frameworks.some((f) => f.id === "water")).toBe(false);
  });
});

describe("assignItem", () => {
  const fw = base();
  it("puts an item in a framework, moves it, and sends it back", () => {
    let m = assignItem({}, fw, "I1", "water");
    expect(m).toEqual({ I1: "water" });
    m = assignItem(m, fw, "I1", "hifz");
    expect(m).toEqual({ I1: "hifz" });
    expect(assignItem(m, fw, "I1", "")).toEqual({});
  });
  it("ignores an unknown framework and does not change the input", () => {
    const m = { I1: "water" };
    expect(assignItem(m, fw, "I1", "nope")).toBe(m);
    assignItem(m, fw, "I2", "hifz");
    expect(m).toEqual({ I1: "water" });
  });
});

describe("suggestions", () => {
  const fw = base();
  it("suggests from whole words in the item name", () => {
    expect(suggestFramework("Orphan Sponsorship Monthly", fw)).toBe("orphan-sponsorship");
    expect(suggestFramework("Water Pump", fw)).toBe("water");
    expect(suggestFramework("Qurbani 2026", fw)).toBe("animal-sacrifice");
  });
  it("does not match part of a word", () => {
    expect(suggestFramework("Waterproof Tent", fw)).toBe("");
  });
  it("suggests nothing for an unknown item and for a tie", () => {
    expect(suggestFramework("General Donation", fw)).toBe("");
    expect(suggestFramework("Hifz Pump", fw)).toBe(""); // hifz and pump are both 4 letters
  });
  it("suggests only for items not yet sorted, and accepting leaves sorted items alone", () => {
    const items = [{ id: "I1", name: "Water Pump" }, { id: "I2", name: "Hifz Class" }, { id: "I3", name: "Mystery" }];
    const s = suggestAll(items, { I2: "orphan-sponsorship" }, fw);
    expect(s).toEqual({ I1: "water" });
    expect(acceptSuggestions({ I2: "orphan-sponsorship" }, { I1: "water", I2: "hifz" })).toEqual({ I2: "orphan-sponsorship", I1: "water" });
  });
});

describe("groupItems and rules", () => {
  it("groups sorted items and lists the rest as unsorted", () => {
    const fw = base();
    const g = groupItems([{ id: "I1", name: "a" }, { id: "I2", name: "b" }], { I1: "water" }, fw);
    expect(g.byFramework["water"]?.map((i) => i.id)).toEqual(["I1"]);
    expect(g.unsorted.map((i) => i.id)).toEqual(["I2"]);
  });
  it("lists what a framework still lacks", () => {
    const fw = base();
    expect(missingRules(fw[0] as Framework)).toHaveLength(2);
    const done = updateRules(fw, "hifz", { unit: "student", reportType: "Term report" })[1] as Framework;
    expect(missingRules(done)).toEqual([]);
  });
});

describe("categories", () => {
  const cats = (): Category[] => {
    let c: Category[] = [];
    c = addCategory(c, "Sponsorship", "quarterly").value;
    c = addCategory(c, "Transactional").value;
    return c;
  };

  it("makes ids, refuses empty and repeated names", () => {
    expect(cats().map((c) => c.id)).toEqual(["sponsorship", "transactional"]);
    expect(addCategory(cats(), " ").error).toContain("name");
    expect(addCategory(cats(), "sponsorship").error).toContain("already");
  });

  it("starts a new framework with its category's feedback cycle", () => {
    const [sp, tr] = cats() as [Category, Category];
    const f = addFramework(addFramework([], "Hifz", sp).value, "Water", tr).value;
    expect(f.map((x) => [x.categoryId, x.rules.cycle])).toEqual([["sponsorship", "quarterly"], ["transactional", "on_delivery"]]);
  });

  it("groups frameworks by category, loose ones last", () => {
    const [sp] = cats() as [Category];
    const f = addFramework(addFramework([], "Hifz", sp).value, "Misc").value;
    const g = groupFrameworks(f, cats());
    expect(g.map((x) => [x.category?.id ?? null, x.frameworks.map((y) => y.id)])).toEqual([["sponsorship", ["hifz"]], ["transactional", []], [null, ["misc"]]]);
  });

  it("moves a framework to another category, and ignores an unknown one", () => {
    const f = addFramework([], "Hifz").value;
    expect(setCategory(f, cats(), "hifz", "sponsorship")[0]?.categoryId).toBe("sponsorship");
    expect(setCategory(f, cats(), "hifz", "nope")[0]?.categoryId).toBe("");
  });

  it("keeps the frameworks when a category is removed", () => {
    const [sp] = cats() as [Category];
    const f = addFramework([], "Hifz", sp).value;
    const r = removeCategory(cats(), f, "sponsorship");
    expect(r.categories.map((c) => c.id)).toEqual(["transactional"]);
    expect(r.frameworks[0]?.categoryId).toBe("");
  });
});
