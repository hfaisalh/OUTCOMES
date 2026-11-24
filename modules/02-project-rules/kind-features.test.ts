/**
 * kind-features.test.ts
 *
 * What it does: tests the features of each kind of benefit (DECISIONS 146): the defaults, changing a description, a property or a field, resetting a kind, and refusing what is not known.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: kind-features.ts.
 */

import { describe, expect, it } from "vitest";
import { KINDS } from "./benefits";
import { applyKindAction, checkDuplicate, defaultFeatures, featuresOf, isCustomised, resetKind, setProp, type SavedFeatures } from "./kind-features";

const ok = (r: { value: SavedFeatures } | { error: string } | null): SavedFeatures => { if (!r || "error" in r) throw new Error(r ? r.error : "not a kind request"); return r.value; };

describe("the features of a kind", () => {
  it("gives every one of the six kinds a description, properties and a profile of fields, each with its own id", () => {
    for (const k of KINDS) {
      const d = defaultFeatures(k.id);
      expect(d.what).toContain(k.what);
      expect(d.fields.length).toBeGreaterThanOrEqual(2);
      expect(new Set(d.fields.map((x) => x.id)).size).toBe(d.fields.length);
    }
    expect(defaultFeatures("build").props).toMatchObject({ location: true, sensitive: false, receiver: "household", first: "gift" });
    expect(defaultFeatures("person").props).toMatchObject({ sensitive: true, receiver: "person", first: "beneficiary" });
    expect(defaultFeatures("distribution").props.receiver).toBe("list");
    expect(defaultFeatures("waqf").props.receiver).toBe("none"); // a mosque or other asset has no beneficiary
    expect(defaultFeatures("build").fields.map((x) => x.label)).toContain("GPS location");
  });
  it("reads an older saved setting: group is a household, institution is none, and who comes first comes from the defaults", () => {
    const old = { build: { ...defaultFeatures("build"), props: { location: true, sensitive: false, eligibility: false, onBehalf: false, receiver: "group" } }, waqf: { ...defaultFeatures("waqf"), props: { location: true, sensitive: false, eligibility: false, onBehalf: false, receiver: "institution" } } } as unknown as SavedFeatures;
    expect(featuresOf(old, "build").props).toMatchObject({ receiver: "household", first: "gift" });
    expect(featuresOf(old, "waqf").props.receiver).toBe("none");
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
    s = ok(applyKindAction(s, { action: "kf-prop", kind: "build", prop: "receiver", value: "none" }));
    s = ok(applyKindAction(s, { action: "kf-prop", kind: "build", prop: "first", value: "beneficiary" }));
    s = ok(applyKindAction(s, { action: "kf-field-add", kind: "build", label: "Contractor", type: "text" }));
    expect(featuresOf(s, "build").what).toBe("A made thing.");
    expect(featuresOf(s, "build").props.receiver).toBe("none");
    expect(featuresOf(s, "build").props.first).toBe("beneficiary");
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
    expect(setProp({}, "build", "first", "nobody")).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-add", kind: "build", label: " ", type: "text" })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-add", kind: "build", label: "Thing", type: "hologram" })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-set", kind: "build", fieldId: "nope", required: true })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-field-move", kind: "build", fieldId: "nope", by: 1 })).toHaveProperty("error");
  });
  it("is not a kind request when the action is something else", () => {
    expect(applyKindAction({}, { action: "item-icon" })).toBeNull();
  });
});

describe("the bare minimum of a type (DECISIONS 148)", () => {
  it("starts every type with its own ID prefix, the fields that make a duplicate, and what happens when a beneficiary ends", () => {
    const all = KINDS.map((k) => defaultFeatures(k.id));
    expect(new Set(all.map((f) => f.prefix)).size).toBe(6); // no two share a prefix
    for (const f of all) {
      expect(f.duplicateOn.length).toBeGreaterThanOrEqual(1);
      expect(f.duplicateOn.every((id) => f.fields.some((x) => x.id === id))).toBe(true); // each is one of its own fields
    }
    expect(defaultFeatures("person")).toMatchObject({ prefix: "PRS", duplicateOn: ["full-name", "date-of-birth"], onEnd: "reallocate" });
    expect(defaultFeatures("build")).toMatchObject({ prefix: "BLD", duplicateOn: ["location"], onEnd: "unallocated" });
  });
  it("changes the prefix, cleaned up, never to one another type uses, and refuses a bad one", () => {
    const s = ok(applyKindAction({}, { action: "kf-prefix", kind: "build", prefix: " bld-2 " }));
    expect(featuresOf(s, "build").prefix).toBe("BLD2");
    expect(applyKindAction({}, { action: "kf-prefix", kind: "build", prefix: "prs" })).toEqual({ error: "Another type already uses PRS." });
    expect(applyKindAction({}, { action: "kf-prefix", kind: "build", prefix: "x" })).toHaveProperty("error");
    expect(applyKindAction({}, { action: "kf-prefix", kind: "build", prefix: "BLD" })).toHaveProperty("value"); // its own is fine
  });
  it("chooses the fields that make a duplicate: at least one, at most five, from its own fields", () => {
    let s = ok(applyKindAction({}, { action: "kf-dup", kind: "person", fieldId: "guardian-or-family", on: true }));
    expect(featuresOf(s, "person").duplicateOn).toEqual(["full-name", "date-of-birth", "guardian-or-family"]); // in the order of the fields
    s = ok(applyKindAction(s, { action: "kf-dup", kind: "person", fieldId: "full-name", on: false }));
    s = ok(applyKindAction(s, { action: "kf-dup", kind: "person", fieldId: "date-of-birth", on: false }));
    expect(applyKindAction(s, { action: "kf-dup", kind: "person", fieldId: "guardian-or-family", on: false })).toEqual({ error: "Choose at least one field that makes a duplicate." });
    expect(applyKindAction({}, { action: "kf-dup", kind: "person", fieldId: "nope", on: true })).toEqual({ error: "That field was not found." });
    // removing a field takes it out of the check, but not the last one
    const r = ok(applyKindAction({}, { action: "kf-field-remove", kind: "person", fieldId: "full-name" }));
    expect(featuresOf(r, "person").duplicateOn).toEqual(["date-of-birth"]);
    expect(applyKindAction(r, { action: "kf-field-remove", kind: "person", fieldId: "date-of-birth" })).toHaveProperty("error");
    const six = ok(applyKindAction({}, { action: "kf-what", kind: "person", what: "x" }));
    expect(applyKindAction(six, { action: "kf-onend", kind: "person", value: "unallocated" })).toHaveProperty("value");
    expect(applyKindAction({}, { action: "kf-onend", kind: "person", value: "delete" })).toHaveProperty("error");
  });
  it("blocks a duplicate beneficiary and names the one that exists, and asks for the missing fields first", () => {
    const f = defaultFeatures("person"); // a duplicate has the same name and date of birth
    const existing = [{ id: "PRS-0001", profile: { "full-name": "Amina Khan", "date-of-birth": "2015-03-02", "guardian-or-family": "Aunt" } }];
    expect(checkDuplicate(f, existing, { "full-name": " amina KHAN ", "date-of-birth": "2015-03-02" })).toEqual({ ok: false, reason: "duplicate", existingId: "PRS-0001", message: "Beneficiary already exists: PRS-0001." });
    expect(checkDuplicate(f, existing, { "full-name": "Amina Khan", "date-of-birth": "2016-01-01" })).toEqual({ ok: true }); // a different date of birth
    const missing = checkDuplicate(f, existing, { "full-name": "Amina Khan" });
    expect(missing).toMatchObject({ ok: false, reason: "incomplete", missing: ["date-of-birth"] });
    expect("message" in missing && missing.message).toContain("Date of birth");
    expect(checkDuplicate(f, [], { "full-name": "A", "date-of-birth": "2000-01-01" })).toEqual({ ok: true }); // nothing to match
  });
  it("gives a kind saved before these settings existed the defaults for them", () => {
    const old = { build: { what: "Mine", props: defaultFeatures("build").props, fields: defaultFeatures("build").fields } } as unknown as SavedFeatures;
    expect(featuresOf(old, "build")).toMatchObject({ what: "Mine", prefix: "BLD", duplicateOn: ["location"], onEnd: "unallocated" });
  });
});
