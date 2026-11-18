/**
 * setup.test.ts
 *
 * What it does: tests setup.ts against the invented samples. Tests double as examples of
 * how a setup is built, applied, saved and loaded.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCodeBook } from "./codebook";
import { readGiftExport } from "./gifts";
import {
  applySetupToGift,
  computeRule,
  findUnmappedValues,
  loadSetup,
  newSetup,
  runImportWithSetup,
  saveSetup,
  type Setup,
} from "./setup";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const { headers, gifts: raw } = readGiftExport(read("sf-upload-sample.csv"));
const { codeBook } = buildCodeBook(read("sf-meta-sample.csv"));

// An example setup: Frequency value map, a calculated "at event" field and a manual required field.
function exampleSetup(): Setup {
  const setup = newSetup("Sample upload", headers);
  setup.valueMaps = { frequency: { Donation: "One-off", "Recurring Donation": "Recurring" } };
  setup.customFields = [
    {
      key: "atEvent",
      label: "Taken at event",
      kind: "calculated",
      type: "text",
      required: false,
      defaultValue: "",
      privacy: "normal",
      rule: { type: "starts_with", from: "orderReference", prefix: "EVO-", yes: "Yes", no: "No" },
    },
    { key: "staffCheck", label: "Staff check", kind: "manual", type: "text", required: true, defaultValue: "", privacy: "normal" },
  ];
  return setup;
}

describe("computeRule", () => {
  const values = { a: "Hello", b: "", c: "World", ref: "evo-1" };
  it("copies a field", () => expect(computeRule({ type: "copy", from: "a" }, values)).toBe("Hello"));
  it("joins fields and skips blanks", () =>
    expect(computeRule({ type: "concat", from: ["a", "b", "c"], separator: " - " }, values)).toBe("Hello - World"));
  it("checks a prefix ignoring case", () =>
    expect(computeRule({ type: "starts_with", from: "ref", prefix: "EVO-", yes: "Y", no: "N" }, values)).toBe("Y"));
  it("swaps listed values and uses the fallback for others", () => {
    const rule = { type: "value_map", from: "a", map: { hello: "Hi" }, otherwise: "?" } as const;
    expect(computeRule(rule, values)).toBe("Hi");
    expect(computeRule(rule, { ...values, a: "Other" })).toBe("?");
  });
});

describe("applySetupToGift", () => {
  const setup = exampleSetup();
  const result = runImportWithSetup(raw, setup, codeBook);

  it("replaces raw values with master values and leaves unlisted ones", () => {
    expect(result.gifts[0]?.["frequency"]).toBe("One-off");
    expect(result.gifts[3]?.["frequency"]).toBe("Recurring");
    expect(result.gifts[5]?.["frequency"]).toBe("Custom Commitment"); // not mapped yet
  });

  it("fills a calculated field from its rule", () => {
    expect(result.gifts[0]?.["atEvent"]).toBe("Yes");
    expect(applySetupToGift({ orderReference: "WEB-1" }, setup)["atEvent"]).toBe("No");
  });

  it("starts a manual field at its default", () => {
    expect(result.gifts[0]?.["staffCheck"]).toBe("");
    const withDefault = { ...setup, customFields: [{ ...setup.customFields[1]!, defaultValue: "Pending" }] };
    expect(applySetupToGift({}, withDefault)["staffCheck"]).toBe("Pending");
  });

  it("reports a blank required field on every gift without blocking", () => {
    const missing = result.issues.filter((i) => i.code === "missing_required");
    expect(missing).toHaveLength(8);
    expect(missing[0]).toMatchObject({ row: 2, message: "Staff check is required and is blank" });
    expect(result.gifts).toHaveLength(8);
    expect(result.lines).toHaveLength(9);
  });
});

describe("findUnmappedValues", () => {
  it("lists values with no master value, counted, and ignores values already mapped or master", () => {
    const setup = exampleSetup();
    const { gifts } = runImportWithSetup(raw, setup, codeBook);
    const unmapped = findUnmappedValues(gifts, setup);
    expect(unmapped).toContainEqual({ field: "frequency", value: "Custom Commitment", count: 1 });
    expect(unmapped.some((u) => u.field === "frequency" && (u.value === "One-off" || u.value === "Donation"))).toBe(false);
    expect(unmapped.some((u) => u.field === "channel" && u.value === "Card Machine")).toBe(true);
  });
});

describe("master values", () => {
  it("starts Frequency with One-off, Recurring and Instalment", () => {
    expect(newSetup("x", []).masterValues["frequency"]).toEqual(["One-off", "Recurring", "Instalment"]);
  });

  it("treats a value that is already a master value as mapped", () => {
    const setup = newSetup("x", []);
    const unmapped = findUnmappedValues([{ frequency: "Recurring" }, { frequency: "Weekly" }], setup);
    expect(unmapped).toEqual([{ field: "frequency", value: "Weekly", count: 1 }]);
  });
});

describe("saveSetup and loadSetup", () => {
  it("round trips a setup", () => {
    const setup = exampleSetup();
    const loaded = loadSetup(saveSetup(setup));
    expect(loaded.problems).toEqual([]);
    expect(loaded.setup).toEqual(setup);
  });

  it("rejects text that is not JSON", () => {
    expect(loadSetup("{oops").setup).toBeNull();
  });

  it("rejects a damaged setup and says why", () => {
    const base = exampleSetup();
    const cases: [Partial<Setup> | Record<string, unknown>, RegExp][] = [
      [{ ...base, version: 2 }, /Unknown setup version/],
      [{ ...base, sourceName: " " }, /no source name/],
      [{ ...base, customFields: [{ ...base.customFields[0]!, key: "orderReference" }] }, /clashes with a standard field/],
      [{ ...base, customFields: [base.customFields[0]!, base.customFields[0]!] }, /listed twice/],
      [{ ...base, customFields: [{ ...base.customFields[0]!, rule: undefined }] }, /has no rule/],
      [{ ...base, customFields: [{ ...base.customFields[1]!, rule: { type: "copy", from: "channel" } }] }, /must not have a rule/],
      [{ ...base, customFields: [{ ...base.customFields[0]!, rule: { type: "copy", from: "nope" } }] }, /not a standard field/],
      [{ ...base, mapping: { X: { action: "field", field: "nope" } } }, /not a standard field/],
      [{ ...base, valueMaps: { nope: {} } }, /not a known field/],
      [{ ...base, masterValues: { nope: ["x"] } }, /Master values are for "nope"/],
      [{ ...base, masterValues: { frequency: [1] } }, /must be a list of text/],
      [{ ...base, masterValues: undefined }, /no master values/],
    ];
    for (const [data, message] of cases) {
      const r = loadSetup(JSON.stringify(data));
      expect(r.setup).toBeNull();
      expect(r.problems.join(" | ")).toMatch(message);
    }
  });

  it("lets a later calculated field use an earlier custom field", () => {
    const setup = exampleSetup();
    setup.customFields.push({
      key: "eventLabel", label: "Event label", kind: "calculated", type: "text", required: false, defaultValue: "", privacy: "normal",
      rule: { type: "concat", from: ["atEvent", "channel"], separator: " / " },
    });
    expect(loadSetup(saveSetup(setup)).problems).toEqual([]);
    expect(applySetupToGift({ orderReference: "EVO-1", channel: "Bank" }, setup)["eventLabel"]).toBe("Yes / Bank");
  });
});
