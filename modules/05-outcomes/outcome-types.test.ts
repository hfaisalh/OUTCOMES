/**
 * outcome-types.test.ts
 *
 * What it does: tests outcome types as configuration (DECISIONS 103): the starter types, adding a type and its fields, a framework belonging to one type,
 * the completeness of a profile, and the request handler. Invented data. These tests double as examples.
 * Who calls it: vitest. Depends on: outcome-types.ts.
 */

import { describe, expect, it } from "vitest";
import { addField, addOutcomeType, applyOutcomeTypeAction, completeness, moveField, removeField, removeOutcomeType, renameOutcomeType, setTypeFramework, starterOutcomeTypes, typeForFramework, updateField, type OutcomeType } from "./outcome-types";

const ok = (r: { types: OutcomeType[] } | { error: string } | null): OutcomeType[] => {
  if (!r || "error" in r) throw new Error(r ? r.error : "null");
  return r.types;
};

describe("outcome types", () => {
  it("starts with Child (picks an existing outcome, automatic) and Water pump (creates a draft outcome, suggested)", () => {
    const [child, pump] = starterOutcomeTypes();
    expect(child).toMatchObject({ id: "child", source: "pick_existing", assign: "auto" });
    expect(pump).toMatchObject({ id: "water-pump", source: "create_new", assign: "suggest" });
    expect(pump?.fields.map((f) => f.kind)).toEqual(expect.arrayContaining(["gps", "photo", "video", "number"]));
    expect(pump?.fields.filter((f) => f.required).map((f) => f.label)).toEqual(["Location"]); // a small minimum before a partner takes it
  });
  it("adds a type with a unique id, and refuses a blank or repeated name", () => {
    const t = ok(addOutcomeType(starterOutcomeTypes(), "House build"));
    expect(t[2]).toMatchObject({ id: "house-build", name: "House build", source: "create_new", assign: "suggest", fields: [] });
    expect(addOutcomeType(t, "house build")).toHaveProperty("error");
    expect(addOutcomeType(t, " ")).toHaveProperty("error");
    expect(ok(renameOutcomeType(t, "house-build", "House")).find((x) => x.id === "house-build")?.name).toBe("House");
  });
  it("cannot remove a type that outcomes use", () => {
    const t = starterOutcomeTypes();
    expect(removeOutcomeType(t, "child", ["child"])).toHaveProperty("error");
    expect(ok(removeOutcomeType(t, "child", [])).map((x) => x.id)).toEqual(["water-pump"]);
  });
  it("lets a framework belong to one type only: ticking it for another type takes it from the first", () => {
    let t = ok(setTypeFramework(starterOutcomeTypes(), "child", "sponsorship", true, ["sponsorship", "once"]));
    expect(typeForFramework(t, "sponsorship")?.id).toBe("child");
    t = ok(setTypeFramework(t, "water-pump", "sponsorship", true, ["sponsorship", "once"]));
    expect(typeForFramework(t, "sponsorship")?.id).toBe("water-pump");
    expect(t.find((x) => x.id === "child")?.frameworkIds).toEqual([]);
    expect(setTypeFramework(t, "child", "nope", true, ["sponsorship"])).toHaveProperty("error");
  });
  it("adds, changes, moves and removes profile fields", () => {
    let t = ok(addOutcomeType([], "Animals"));
    t = ok(addField(t, "animals", "Tag number", "text"));
    t = ok(addField(t, "animals", "Photo", "photo"));
    expect(t[0]?.fields.map((f) => f.id)).toEqual(["tag-number", "photo"]);
    expect(addField(t, "animals", "photo", "text")).toHaveProperty("error"); // same label
    expect(addField(t, "animals", "x", "nonsense" as never)).toHaveProperty("error");
    t = ok(updateField(t, "animals", "tag-number", { required: true, inReport: true }));
    expect(t[0]?.fields[0]).toMatchObject({ required: true, inReport: true });
    t = ok(moveField(t, "animals", "photo", -1));
    expect(t[0]?.fields.map((f) => f.id)).toEqual(["photo", "tag-number"]);
    t = ok(removeField(t, "animals", "photo"));
    expect(t[0]?.fields.map((f) => f.id)).toEqual(["tag-number"]);
  });
  it("says how complete a profile is, and whether the required minimum is there", () => {
    const pump = starterOutcomeTypes()[1] as OutcomeType;
    expect(completeness(pump, {})).toMatchObject({ filled: 0, total: pump.fields.length, missingRequired: ["Location"], ready: false });
    expect(completeness(pump, { location: "Tharparkar", notes: "x", "people-served": "40" })).toMatchObject({ filled: 3, ready: true });
    expect(completeness(pump, { location: "  " }).ready).toBe(false);
  });
  it("answers the requests the page makes, and ignores others", () => {
    const base = starterOutcomeTypes();
    expect(applyOutcomeTypeAction(base, [], [], { action: "something-else" })).toBeNull();
    const added = ok(applyOutcomeTypeAction(base, [], [], { action: "ot-add", name: "Furniture" }));
    expect(added.map((t) => t.id)).toContain("furniture");
    expect(ok(applyOutcomeTypeAction(added, [], [], { action: "ot-source", typeId: "furniture", source: "pick_existing" })).find((t) => t.id === "furniture")?.source).toBe("pick_existing");
    expect(applyOutcomeTypeAction(added, [], [], { action: "ot-source", typeId: "furniture", source: "weird" })).toHaveProperty("error");
    expect(applyOutcomeTypeAction(added, [], ["child"], { action: "ot-remove", typeId: "child" })).toHaveProperty("error");
    const withField = ok(applyOutcomeTypeAction(added, [], [], { action: "ot-field-add", typeId: "furniture", label: "Items", kind: "number" }));
    expect(ok(applyOutcomeTypeAction(withField, [], [], { action: "ot-field-set", typeId: "furniture", fieldId: "items", required: true })).find((t) => t.id === "furniture")?.fields[0]?.required).toBe(true);
  });
});
