/**
 * mapping.test.ts
 *
 * What it does: tests mapping.ts: automatic matching of columns to generic fields, with and
 * without a source preset, and applying a mapping to a row. Invented data only.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";
import { FIELDS } from "./fields";
import { applyMapping, suggestMapping } from "./mapping";
import { salesforcePreset } from "./presets/salesforce";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const sf = toRecords(parseCsv(read("sf-upload-sample.csv")));
const flat = toRecords(parseCsv(read("generic-flat-sample.csv")));
const sfMapping = suggestMapping(sf.headers, salesforcePreset);

describe("suggestMapping with the Salesforce preset", () => {
  it("maps known Salesforce columns exactly", () => {
    expect(sfMapping["Legacy_Reference_No__c"]).toEqual({ action: "field", field: "reference" });
    expect(sfMapping["Affiliation__c"]).toEqual({ action: "field", field: "group" });
    expect(sfMapping["Type__c"]).toEqual({ action: "field", field: "supporterType" });
    expect(sfMapping["GiftTranxDesignationInfo__c"]).toEqual({ action: "field", field: "linesData" });
  });

  it("fills the classification fields that fit and leaves the rest without a column", () => {
    expect(sfMapping["Channel__c"]).toEqual({ action: "field", field: "channel" });
    expect(sfMapping["PaymentMethod"]).toEqual({ action: "field", field: "method" });
    expect(sfMapping["Donation_Type__c"]).toEqual({ action: "field", field: "frequency" });
    expect(sfMapping["Bank_Account__r.Name"]).toEqual({ action: "field", field: "settlement" });
    const mapped = new Set(Object.values(sfMapping).flatMap((a) => (a.action === "field" ? [a.field] : [])));
    for (const blank of ["platform", "merchant", "type", "mode"]) expect(mapped.has(blank)).toBe(false);
  });

  it("drops contact and bank columns with a reason", () => {
    expect(sfMapping["Email"]).toMatchObject({ action: "drop" });
    expect(sfMapping["Cheque_Sort_Code__c"]).toEqual({ action: "drop", reason: "Bank detail, never stored" });
  });

  it("prefers the exact column over a name match", () => {
    const m = suggestMapping(["Type__c", "Type"], salesforcePreset);
    expect(m["Type__c"]).toEqual({ action: "field", field: "supporterType" });
    expect(m["Type"]).toEqual({ action: "field", field: "type", confidence: "likely" });
  });
});

describe("suggestMapping without a preset (another organisation's file)", () => {
  const m = suggestMapping(flat.headers);

  it("matches the invented file's own column names by name, marked as likely", () => {
    expect(m["Ref"]).toEqual({ action: "field", field: "reference", confidence: "likely" });
    expect(m["Date"]).toEqual({ action: "field", field: "receivedDate", confidence: "likely" });
    expect(m["Supporter ID"]).toEqual({ action: "field", field: "supporterId", confidence: "likely" });
    expect(m["Branch"]).toEqual({ action: "field", field: "group", confidence: "likely" });
    expect(m["Fund"]).toEqual({ action: "field", field: "lineFund", confidence: "likely" });
    expect(m["Outcome"]).toEqual({ action: "field", field: "lineOutcome", confidence: "likely" });
    expect(m["Payment method"]).toEqual({ action: "field", field: "method", confidence: "likely" });
    expect(m["Frequency"]).toEqual({ action: "field", field: "frequency", confidence: "likely" });
  });

  it("matches every column of the file, and drops the contact column", () => {
    expect(Object.values(m).filter((a) => a.action === "unmapped")).toEqual([]);
    expect(m["Email"]).toMatchObject({ action: "drop" });
  });

  it("matches other sheet headers, ignoring case and punctuation", () => {
    const x = suggestMapping(["PAY METH", "Donor ID", "deposit_to", "Number of Instalments", "E-mail Address", "Post Code"]);
    expect(x["PAY METH"]).toEqual({ action: "field", field: "method", confidence: "likely" });
    expect(x["Donor ID"]).toEqual({ action: "field", field: "supporterId", confidence: "likely" });
    expect(x["deposit_to"]).toEqual({ action: "field", field: "settlement", confidence: "likely" });
    expect(x["Number of Instalments"]).toEqual({ action: "field", field: "instalmentCount", confidence: "likely" });
    expect(x["E-mail Address"]).toMatchObject({ action: "drop" });
    expect(x["Post Code"]).toMatchObject({ action: "drop" });
  });

  it("does not guess from partial names, and suggests only the first of two columns for a field", () => {
    expect(suggestMapping(["Payment Reference Notes"])["Payment Reference Notes"]).toEqual({ action: "unmapped" });
    expect(suggestMapping(["Channel", "channel"])["channel"]).toEqual({ action: "unmapped" });
  });
});

describe("applyMapping", () => {
  it("gives every field, blank when nothing fits", () => {
    const tx = applyMapping(sf.records[0]!, sfMapping);
    expect(Object.keys(tx).sort()).toEqual(FIELDS.map((f) => f.key).sort());
    for (const blank of ["platform", "merchant", "mode", "type"]) expect(tx[blank]).toBe("");
  });

  it("copies mapped values", () => {
    const tx = applyMapping(sf.records[0]!, sfMapping);
    expect(tx).toMatchObject({ reference: "EVO-900-001", channel: "Card Machine", frequency: "Donation", supporterType: "Community Centre" });
  });

  it("never copies contact details", () => {
    const tx = applyMapping({ ...sf.records[0]!, Email: "x@example.test", Street: "1 Test Road" }, sfMapping);
    expect(Object.values(tx)).not.toContain("x@example.test");
    expect(Object.values(tx)).not.toContain("1 Test Road");
  });

  it("sets a commitment with no instalment count to Indefinitely, and leaves a one-off blank", () => {
    expect(applyMapping(sf.records[3]!, sfMapping)["instalmentCount"]).toBe("Indefinitely");
    expect(applyMapping(sf.records[5]!, sfMapping)["instalmentCount"]).toBe("Indefinitely");
    expect(applyMapping(sf.records[0]!, sfMapping)["instalmentCount"]).toBe("");
  });

  it("keeps a real instalment count when a source maps one", () => {
    const m = { ...sfMapping, Instalments: { action: "field", field: "instalmentCount" } } as const;
    expect(applyMapping({ ...sf.records[5]!, Instalments: "12" }, m)["instalmentCount"]).toBe("12");
  });

  it("takes the first non-empty value when two columns feed one field", () => {
    const m = { A: { action: "field", field: "channel" }, B: { action: "field", field: "channel" } } as const;
    expect(applyMapping({ A: "", B: "Web" }, m)["channel"]).toBe("Web");
    expect(applyMapping({ A: "Bank", B: "Web" }, m)["channel"]).toBe("Bank");
  });
});
