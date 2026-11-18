/**
 * setup.test.ts
 *
 * What it does: tests setup.ts: new setups (with and without a preset), calculated and manual
 * fields, value maps, values still to be mapped, and saving and loading. Invented data only.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";
import { applyMapping } from "./mapping";
import { runImport } from "./pipeline";
import { applySetupToTransaction, computeRule, findUnmappedValues, loadSetup, newSetup, saveSetup, type Setup } from "./setup";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const sf = toRecords(parseCsv(read("sf-upload-sample.csv")));

// An example setup: Frequency value map, a calculated "at event" field and a manual required field.
function exampleSetup(): Setup {
  const setup = newSetup("Sample upload", sf.headers, "salesforce");
  setup.valueMaps = { frequency: { Donation: "One-off", "Recurring Donation": "Recurring" } };
  setup.customFields = [
    {
      key: "atEvent", label: "Taken at event", kind: "calculated", type: "text", required: false, defaultValue: "", privacy: "normal",
      rule: { type: "starts_with", from: "reference", prefix: "EVO-", yes: "Yes", no: "No" },
    },
    { key: "staffCheck", label: "Staff check", kind: "manual", type: "text", required: true, defaultValue: "", privacy: "normal" },
  ];
  return setup;
}

describe("newSetup", () => {
  it("takes layout, required fields, wording and mapping from a preset", () => {
    const s = exampleSetup();
    expect(s).toMatchObject({ version: 2, presetId: "salesforce", layout: "lines-column", feedbackItemsOnly: false });
    expect(s.requiredFields).toContain("supporterId");
    expect(s.labels["supporterId"]).toBe("Donor ID (Salesforce)");
    expect(s.mapping["Legacy_Reference_No__c"]).toEqual({ action: "field", field: "reference" });
  });

  it("is generic without a preset: one line per transaction, a small required list, no wording", () => {
    const s = newSetup("Other", ["Ref", "Date"]);
    expect(s).toMatchObject({ presetId: null, layout: "one-line-per-transaction", requiredFields: ["reference", "receivedDate"], labels: {} });
    expect(s.masterValues["frequency"]).toEqual(["One-off", "Recurring", "Instalment"]);
  });
});

describe("computeRule", () => {
  const values = { a: "Hello", b: "", c: "World", ref: "evo-1" };
  it("copies a field", () => expect(computeRule({ type: "copy", from: "a" }, values)).toBe("Hello"));
  it("joins fields and skips blanks", () => expect(computeRule({ type: "concat", from: ["a", "b", "c"], separator: " - " }, values)).toBe("Hello - World"));
  it("checks a prefix ignoring case", () => expect(computeRule({ type: "starts_with", from: "ref", prefix: "EVO-", yes: "Y", no: "N" }, values)).toBe("Y"));
  it("swaps listed values and uses the fallback for others", () => {
    const rule = { type: "value_map", from: "a", map: { hello: "Hi" }, otherwise: "?" } as const;
    expect(computeRule(rule, values)).toBe("Hi");
    expect(computeRule(rule, { ...values, a: "Other" })).toBe("?");
  });
});

describe("applySetupToTransaction", () => {
  const setup = exampleSetup();
  const result = runImport(sf.records, setup, { today: "2026-11-18" });

  it("replaces raw values with master values and leaves unlisted ones", () => {
    expect(result.transactions[0]?.["frequency"]).toBe("One-off");
    expect(result.transactions[3]?.["frequency"]).toBe("Recurring");
    expect(result.transactions[5]?.["frequency"]).toBe("Custom Commitment"); // not mapped yet
  });

  it("fills a calculated field from its rule", () => {
    expect(result.transactions[0]?.["atEvent"]).toBe("Yes");
    expect(applySetupToTransaction({ reference: "WEB-1" }, setup)["atEvent"]).toBe("No");
  });

  it("starts a manual field at its default", () => {
    const withDefault = { ...setup, customFields: [{ ...setup.customFields[1]!, defaultValue: "Pending" }] };
    expect(applySetupToTransaction({}, withDefault)["staffCheck"]).toBe("Pending");
  });

  it("reports a blank required field on every transaction without blocking", () => {
    const missing = result.issues.filter((i) => i.code === "missing_required");
    expect(missing).toHaveLength(8);
    expect(missing[0]).toMatchObject({ row: 2, message: "Staff check is required and is blank" });
    expect(result.transactions).toHaveLength(8);
  });
});

describe("findUnmappedValues", () => {
  it("lists values with no master value, counted, and ignores mapped or master values", () => {
    const setup = exampleSetup();
    const { transactions } = runImport(sf.records, setup, { today: "2026-11-18" });
    const unmapped = findUnmappedValues(transactions, setup);
    expect(unmapped).toContainEqual({ field: "frequency", value: "Custom Commitment", count: 1 });
    expect(unmapped.some((u) => u.field === "frequency" && (u.value === "One-off" || u.value === "Donation"))).toBe(false);
    expect(unmapped.some((u) => u.field === "channel" && u.value === "Card Machine")).toBe(true);
  });

  it("treats a value that is already a master value as mapped", () => {
    const unmapped = findUnmappedValues([{ frequency: "Recurring" }, { frequency: "Weekly" }], newSetup("x", []));
    expect(unmapped).toEqual([{ field: "frequency", value: "Weekly", count: 1 }]);
  });
});

describe("saveSetup and loadSetup", () => {
  it("round trips a setup, including lookups and wording", () => {
    const setup = exampleSetup();
    setup.lookups = { funds: { F1: "General fund" }, outcomes: { O1: "Orphan sponsorship" } };
    const loaded = loadSetup(saveSetup(setup));
    expect(loaded.problems).toEqual([]);
    expect(loaded.setup).toEqual(setup);
  });

  it("rejects text that is not JSON and an old setup version", () => {
    expect(loadSetup("{oops").setup).toBeNull();
    expect(loadSetup('{"version":1}').problems[0]).toBe("Unknown setup version");
  });

  it("rejects a damaged setup and says why", () => {
    const base = exampleSetup();
    const cases: [object, RegExp][] = [
      [{ ...base, version: 3 }, /Unknown setup version/],
      [{ ...base, sourceName: " " }, /no source name/],
      [{ ...base, layout: "sideways" }, /unknown lines layout/],
      [{ ...base, presetId: "nope" }, /preset that is not known/],
      [{ ...base, feedbackItemsOnly: "yes" }, /feedback items only/],
      [{ ...base, requiredFields: ["nope"] }, /Required field "nope"/],
      [{ ...base, labels: { nope: "x" } }, /label is set for "nope"/],
      [{ ...base, lookups: { funds: { a: 1 }, outcomes: {} } }, /lookup list "funds" is not valid/],
      [{ ...base, customFields: [{ ...base.customFields[0]!, key: "reference" }] }, /clashes with a standard field/],
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
    expect(applySetupToTransaction({ reference: "EVO-1", channel: "Bank" }, setup)["eventLabel"]).toBe("Yes / Bank");
  });

  it("keeps the mapping suggestions when a transaction is mapped", () => {
    expect(applyMapping(sf.records[0]!, exampleSetup().mapping)["reference"]).toBe("EVO-900-001");
  });
});
