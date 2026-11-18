/**
 * template.test.ts
 *
 * What it does: tests template.ts and the auto-matching in mapping.ts. The key promise:
 * a file that follows the template matches every column and imports with no issues.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCodeBook } from "./codebook";
import { readGiftExport } from "./gifts";
import { runImport } from "./issues";
import { suggestMapping } from "./mapping";
import { expectedColumns, templateCsv } from "./template";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const { codeBook } = buildCodeBook(read("sf-meta-sample.csv"));

describe("template", () => {
  it("lists the required columns first", () => {
    const cols = expectedColumns();
    expect(cols.slice(0, 4).map((c) => c.field).sort()).toEqual(["designationLines", "donorId", "orderReference", "receivedDate"]);
    expect(cols.slice(0, 4).every((c) => c.required)).toBe(true);
  });

  it("includes all 8 classification fields", () => {
    const names = expectedColumns().filter((c) => c.group === "classification").map((c) => c.label);
    expect(names.sort()).toEqual(["Channel", "Frequency", "Merchant", "Method", "Mode", "Platform", "Settlement", "Type"]);
  });

  it("gives a header row and one example row with the same number of cells", () => {
    const { headers, gifts } = readGiftExport(templateCsv());
    expect(gifts).toHaveLength(1);
    expect(headers).toHaveLength(expectedColumns().length);
  });

  it("matches every column of its own template and imports with no issues", () => {
    const { headers, gifts } = readGiftExport(templateCsv());
    const mapping = suggestMapping(headers);
    expect(Object.values(mapping).filter((a) => a.action !== "field")).toEqual([]);
    expect(runImport(gifts, mapping, codeBook).issues).toEqual([]);
  });
});

describe("auto-matching by name", () => {
  it("matches other MWF sheet headers as likely, ignoring case and punctuation", () => {
    const m = suggestMapping(["PAY METH", "Bank Ref", "Donor ID", "deposit_to", "Number of Instalments"]);
    expect(m["PAY METH"]).toEqual({ action: "field", field: "method", confidence: "likely" });
    expect(m["Donor ID"]).toEqual({ action: "field", field: "donorId", confidence: "likely" });
    expect(m["deposit_to"]).toEqual({ action: "field", field: "settlement", confidence: "likely" });
    expect(m["Number of Instalments"]).toEqual({ action: "field", field: "instalmentCount", confidence: "likely" });
    expect(m["Bank Ref"]).toEqual({ action: "unmapped" }); // not guessed
  });

  it("drops contact columns under other names", () => {
    const m = suggestMapping(["E-mail Address", "Post Code", "Mobile", "First Name"]);
    for (const c of Object.keys(m)) expect(m[c]).toMatchObject({ action: "drop" });
  });

  it("prefers the exact Salesforce name over a name match", () => {
    const m = suggestMapping(["Type__c", "Type"]);
    expect(m["Type__c"]).toEqual({ action: "field", field: "accountType" });
    expect(m["Type"]).toEqual({ action: "field", field: "type", confidence: "likely" });
  });

  it("does not guess with partial names", () => {
    expect(suggestMapping(["Payment Reference Notes"])["Payment Reference Notes"]).toEqual({ action: "unmapped" });
  });
});
