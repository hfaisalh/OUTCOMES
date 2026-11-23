/**
 * kind-features.test.ts
 *
 * What it does: tests the features of each kind of benefit (DECISIONS 146): the defaults, changing a description, a property or a field, resetting a kind, and refusing what is not known.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: kind-features.ts.
 */

import { describe, expect, it } from "vitest";
import { KINDS } from "./benefits";
import { applyKindAction, defaultFeatures, featuresOf, isCustomised, resetKind, setProp, type SavedFeatures } from "./kind-features";

const ok = (r: { value: SavedFeatures } | { error: string } | null): SavedFeatures => { if (!r || "error" in r) throw new Error(r ? r.error : "not a kind request"); return r.value; };

describe("the features of a kind", () => {
  it("gives every one of the six kinds a description, properties and a profile of fields, each with its own id", () => {
    for (const k of KINDS) {
      const d = defaultFeatures(k.id);
      expect(d.what).toContain(k.what);
      expect(d.fields.length).toBeGreaterThanOrEqual(2);
      expect(new Set(d.fields.map((x) => x.id)).size).toBe(d.fields.length);
    }
    expect(defaultFeatures("build").props).toMatchObject({ location: true, sensitive: false, receiver: "group" });
    expect(defaultFeatures("person").props).toMatchObject({ sensitive: true, receiver: "person" });
    expect(defaultFeatures("build").fields.map((x) => x.label)).toContain("GPS location");
  });
  it("uses the defaults until a person changes a kind, and saves only the kinds that changed", () => {
    expect(featuresOf({}, "build")).toEqual(defaultFeatures("build"));
    const saved = ok(applyKindAction({}, { action: "kf-prop", kind: "build", prop: "sensitive", value: true }));
    expect(Object.keys(saved)).toEqual(["build"]);
    expect(featuresOf(saved, "build").props.sensitive).toBe(true);
    expect(featuresOf(saved, "person")).toEqual(defaultFeatures("person")); // the others stay as they were
    expect(isCustomised(saved, "build")).toBe(true);
    expect(isCustomised(saved, "person")).toBe(false);
  });
  it("changes the description, who receives, and the fields: add, change, move and remove", () => {
    let s: SavedFeatures = {};
    s = ok(applyKindAction(s, { action: "kf-what", kind: "build", what: "A made thing." }));
    s = ok(applyKindAction(s, { action: "kf-prop", kind: "build", prop: "receiver", value: "institution" }));
    s = ok(applyKindAction(s, { action: "kf-field-add", kind: "build", label: "Contractor", type: "text" }));
    expect(featuresOf(s, "build").what).toBe("A made thing.");
    expect(featuresOf(s, "build").props.receiver).toBe("institution");
    const added = featuresOf(s, "build").fields.at(-1)!;
    expect(added).toMatchObject({ id: "contractor", label: "Contractor", type: "text", required: false, inReport: false });
    s = ok(applyKindAction(s, { action: "kf-field-set", kind: "build", fieldId: "contractor", required: true, inReport: true, label: "Main contractor" }));
    expect(featuresOf(s, "build").fields.at(-1)).toMatchObject({ label: "Main contractor", required: true, inReport: true });
    s = ok(applyKindAction(s, { action: "kf-field-set", kind: "build", fieldId: "contractor", type: "choice", options: "A, B, ,C" }));
    expect(featuresOf(s, "build").fields.at(-1)).toMatchObject({ type: "choice", options: ["A", "B", "C"] });
    s = ok(applyKindAction(s, { action: "kf-field-move", kind: "build", fieldId: "contractor", by: -1 }));
    const labels = featuresOf(s, "build").fields.map((x) => x.id);
    expect(labels.indexOf("contractor")).toBe(labels.length - 2);
    s = ok(applyKindAction(s, { action: "kf-field-remove", kind: "build", fieldId: "contractor" }));
    expect(featuresOf(s, "build").fields.map((x) => x.id)).not.toContain("contractor");
  });
  it("resets a kind to its defaults, and leaves the others alone", () => {
    let s = ok(applyKindAction({}, { action: "kf-prop", kind: "build", prop: "onBehalf", value: true }));
    s = ok(applyKindAction(s, { action: "kf-prop", kind: "person", prop: "eligibility", value: true }));
    const r = resetKind(s, "build");
    expect("value" in r && Object.keys(r.value)).toEqual(["person"]);
    expect(applyKindAction(s, { action: "kf-reset", kind: "person" })).toHaveProperty("value");
  });
  it("refuses an unknown kind, property, value, field or field type, and a field with no name", () => {
    expect(applyKindAction({}, { action: "kf-prop", kind: "microfinance", prop: "location", value: true })).toEqual({ error: "That type was not found." });
    expect(setProp({}, "build", "bogus", true)).toHaveProperty("error");
    expect(setProp({}, "build", "location", "yes")).toHaveProperty("error");
    expect(setProp({}, "build", "receiver", "alien")).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-add", kind: "build", label: " ", type: "text" })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-add", kind: "build", label: "Thing", type: "hologram" })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-set", kind: "build", fieldId: "nope", required: true })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-move", kind: "build", fieldId: "nope", by: 1 })).toHaveProperty("error");
  });
  it("is not a kind request when the action is something else", () => {
    expect(applyKindAction({}, { action: "item-icon" })).toBeNull();
  });
});
