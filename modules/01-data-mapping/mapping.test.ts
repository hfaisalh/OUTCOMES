/**
 * mapping.test.ts
 *
 * What it does: tests mapping.ts and standard-fields.ts against samples/sf-upload-sample.csv
 * (invented data). Tests double as examples.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyMapping, suggestMapping } from "./mapping";
import { readGiftExport } from "./gifts";
import { STANDARD_FIELDS } from "./standard-fields";

const sample = readFileSync(new URL("../../samples/sf-upload-sample.csv", import.meta.url), "utf8");
const { headers, gifts } = readGiftExport(sample);
const mapping = suggestMapping(headers);

describe("suggestMapping", () => {
  it("suggests standard fields for known Salesforce columns", () => {
    expect(mapping["Legacy_Reference_No__c"]).toEqual({ action: "field", field: "orderReference" });
    expect(mapping["Affiliation__c"]).toEqual({ action: "field", field: "centre" });
    expect(mapping["Type__c"]).toEqual({ action: "field", field: "accountType" });
  });

  it("fills the classification fields that fit and leaves the rest without a column", () => {
    expect(mapping["Channel__c"]).toEqual({ action: "field", field: "channel" });
    expect(mapping["PaymentMethod"]).toEqual({ action: "field", field: "method" });
    expect(mapping["Donation_Type__c"]).toEqual({ action: "field", field: "frequency" });
    expect(mapping["Bank_Account__r.Name"]).toEqual({ action: "field", field: "settlement" });
    const mapped = new Set(Object.values(mapping).flatMap((a) => (a.action === "field" ? [a.field] : [])));
    for (const blank of ["platform", "merchant", "type", "mode"]) expect(mapped.has(blank)).toBe(false);
  });

  it("drops contact and bank columns with a reason", () => {
    expect(mapping["Email"]).toMatchObject({ action: "drop" });
    expect(mapping["Street"]).toMatchObject({ action: "drop" });
    expect(mapping["Cheque_Sort_Code__c"]).toEqual({ action: "drop", reason: "Bank detail, never stored" });
  });

  it("matches ignoring case and spaces, and leaves unknown columns unmapped", () => {
    const m = suggestMapping([" channel__c ", "Something_New__c"]);
    expect(m[" channel__c "]).toEqual({ action: "field", field: "channel" });
    expect(m["Something_New__c"]).toEqual({ action: "unmapped" });
  });

  it("suggests only the first column when two fit one field", () => {
    const m = suggestMapping(["Channel__c", "channel__c"]);
    expect(m["channel__c"]).toEqual({ action: "unmapped" });
  });
});

describe("applyMapping", () => {
  it("gives every standard field, blank when nothing fits", () => {
    const std = applyMapping(gifts[0]!, mapping);
    expect(Object.keys(std).sort()).toEqual(STANDARD_FIELDS.map((f) => f.key).sort());
    expect(std["platform"]).toBe("");
    expect(std["merchant"]).toBe("");
    expect(std["mode"]).toBe("");
    expect(std["type"]).toBe("");
  });

  it("copies mapped values", () => {
    const std = applyMapping(gifts[0]!, mapping);
    expect(std["orderReference"]).toBe("EVO-900-001");
    expect(std["channel"]).toBe("Card Machine");
    expect(std["frequency"]).toBe("Donation");
    expect(std["accountType"]).toBe("Community Centre");
  });

  it("never copies contact details", () => {
    const std = applyMapping({ ...gifts[0]!, Email: "x@example.test", Street: "1 Test Road" }, mapping);
    expect(Object.values(std)).not.toContain("x@example.test");
    expect(Object.values(std)).not.toContain("1 Test Road");
  });

  it("sets a commitment with no instalment count to Indefinitely", () => {
    expect(applyMapping(gifts[3]!, mapping)["instalmentCount"]).toBe("Indefinitely"); // recurring
    expect(applyMapping(gifts[5]!, mapping)["instalmentCount"]).toBe("Indefinitely"); // custom commitment
  });

  it("leaves the instalment count blank on a one-off gift", () => {
    expect(applyMapping(gifts[0]!, mapping)["instalmentCount"]).toBe("");
  });

  it("keeps a real instalment count when a source maps one", () => {
    const m = { ...mapping, Instalments: { action: "field", field: "instalmentCount" } } as const;
    expect(applyMapping({ ...gifts[5]!, Instalments: "12" }, m)["instalmentCount"]).toBe("12");
  });

  it("takes the first non-empty value when two columns feed one field", () => {
    const m = { A: { action: "field", field: "channel" }, B: { action: "field", field: "channel" } } as const;
    expect(applyMapping({ A: "", B: "Web" }, m)["channel"]).toBe("Web");
    expect(applyMapping({ A: "Bank", B: "Web" }, m)["channel"]).toBe("Bank");
  });
});
