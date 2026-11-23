/**
 * benefits.test.ts
 *
 * What it does: tests the kinds of benefit (DECISIONS 143): the list, the suggestion from an item's name using the real catalogue names, and choosing a kind. Invented data otherwise.
 * These tests double as examples. Who calls it: vitest. Depends on: benefits.ts.
 */

import { describe, expect, it } from "vitest";
import { kindOf, setItemKind, STANDARD_KINDS, suggestKind } from "./benefits";

describe("kinds of benefit", () => {
  it("has the six standard kinds as the starting set, and micro finance is not one", () => {
    expect([...STANDARD_KINDS]).toEqual(["person", "activity", "build", "distribution", "programme", "waqf"]);
  });
  it("suggests a kind from the item's name, with the real catalogue names", () => {
    const k = (n: string) => suggestKind(n);
    for (const n of ["Orphan Sponsorship", "Hifz Scholarship: Day Student", "Aalim Scholarship", "School Scholarship", "Uni Scholarship", "Rickshaw", "Trade Startup", "Family Startup"]) expect(k(n)).toBe("person");
    for (const n of ["Small Pump", "Large Pump", "Deep Solar Well", "Water Tanker", "Build A Home", "Build for Education", "Orphan Care Home"]) expect(k(n)).toBe("build");
    expect(k("Medical Camp (One Day)")).toBe("activity");
    expect(k("Animal Sacrifice")).toBe("distribution");
    expect(k("Qurbani Share")).toBe("distribution");
    expect(k("Waqf Property")).toBe("waqf");
    expect(k("Something unknown")).toBe("");
  });
  const known = ["person", "build", "activity", "mine"];
  it("uses the chosen kind first, then the suggestion if the organisation has that kind, then none", () => {
    expect(kindOf({ I1: "activity" }, "I1", "Small Pump", known)).toEqual({ kind: "activity", chosen: true });
    expect(kindOf({ I1: "mine" }, "I1", "Small Pump", known)).toEqual({ kind: "mine", chosen: true }); // a kind staff added
    expect(kindOf({}, "I1", "Small Pump", known)).toEqual({ kind: "build", chosen: false });
    expect(kindOf({ I1: "removed" }, "I1", "Small Pump", known)).toEqual({ kind: "build", chosen: false }); // a removed kind is ignored
    expect(kindOf({}, "I1", "Animal Sacrifice", known)).toEqual({ kind: "", chosen: false }); // distribution is not one of this organisation's kinds
    expect(kindOf({}, "I1", "Mystery", known)).toEqual({ kind: "", chosen: false });
  });
  it("saves a chosen kind, takes it back with an empty one, and refuses an unknown kind or item", () => {
    const set = setItemKind({}, "I1", "build", known);
    expect("value" in set && set.value).toEqual({ I1: "build" });
    const back = setItemKind({ I1: "build", I2: "person" }, "I1", "", known);
    expect("value" in back && back.value).toEqual({ I2: "person" });
    expect(setItemKind({}, "I1", "microfinance", known)).toEqual({ error: "That kind was not found." });
    expect(setItemKind({}, "", "build", known)).toEqual({ error: "That item was not found." });
  });
});
