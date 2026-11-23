/**
 * benefits.test.ts
 *
 * What it does: tests the kinds of benefit (DECISIONS 143): the list, the suggestion from an item's name using the real catalogue names, and choosing a kind. Invented data otherwise.
 * These tests double as examples. Who calls it: vitest. Depends on: benefits.ts.
 */

import { describe, expect, it } from "vitest";
import { isKind, KINDS, kindLabel, kindOf, setItemKind, suggestKind } from "./benefits";

describe("kinds of benefit", () => {
  it("has six kinds, each with its words, and micro finance is not one yet", () => {
    expect(KINDS.map((k) => k.label)).toEqual(["Person(s)", "Activity", "Build", "Distribution", "Programme", "Waqf"]);
    expect(KINDS.every((k) => k.what && k.counted && k.proof && k.examples)).toBe(true);
    expect(isKind("microfinance")).toBe(false);
    expect(kindLabel("build")).toBe("Build");
    expect(kindLabel("nope")).toBe("");
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
  it("uses the chosen kind first, then the suggestion, then none", () => {
    expect(kindOf({ I1: "activity" }, "I1", "Small Pump")).toEqual({ kind: "activity", chosen: true });
    expect(kindOf({}, "I1", "Small Pump")).toEqual({ kind: "build", chosen: false });
    expect(kindOf({ I1: "bogus" }, "I1", "Small Pump")).toEqual({ kind: "build", chosen: false }); // an unknown saved kind is ignored
    expect(kindOf({}, "I1", "Mystery")).toEqual({ kind: "", chosen: false });
  });
  it("saves a chosen kind, takes it back with an empty one, and refuses an unknown kind or item", () => {
    const set = setItemKind({}, "I1", "build");
    expect("value" in set && set.value).toEqual({ I1: "build" });
    const back = setItemKind({ I1: "build", I2: "person" }, "I1", "");
    expect("value" in back && back.value).toEqual({ I2: "person" });
    expect(setItemKind({}, "I1", "microfinance")).toEqual({ error: "That kind was not found." });
    expect(setItemKind({}, "", "build")).toEqual({ error: "That item was not found." });
  });
});
