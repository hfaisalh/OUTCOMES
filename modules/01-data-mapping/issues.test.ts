/**
 * issues.test.ts
 *
 * What it does: tests issues.ts against the invented samples. The sample batch holds
 * 8 gifts, including a missing reference and bad dates, so the tests double as examples.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCodeBook } from "./codebook";
import { readGiftExport } from "./gifts";
import { isValidIsoDate, runImport } from "./issues";
import { suggestMapping } from "./mapping";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const { headers, gifts: raw } = readGiftExport(read("sf-upload-sample.csv"));
const { codeBook } = buildCodeBook(read("sf-meta-sample.csv"));
const result = runImport(raw, suggestMapping(headers), codeBook);

describe("isValidIsoDate", () => {
  it("accepts real days in YYYY-MM-DD form only", () => {
    expect(isValidIsoDate("2026-11-07")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("04-Nov-2026")).toBe(false);
    expect(isValidIsoDate("not a date")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("runImport on the sample batch", () => {
  it("keeps every gift and line, even the ones with issues", () => {
    expect(result.gifts).toHaveLength(8);
    expect(result.lines).toHaveLength(9);
  });

  it("flags the gift with no reference", () => {
    const issue = result.issues.find((i) => i.code === "missing_reference");
    expect(issue?.row).toBe(9);
  });

  it("flags both bad dates", () => {
    const rows = result.issues.filter((i) => i.code === "bad_date").map((i) => i.row);
    expect(rows).toEqual([8, 9]);
  });

  it("reports nothing else for the sample", () => {
    const others = result.issues.filter((i) => i.code !== "missing_reference" && i.code !== "bad_date");
    expect(others).toEqual([]);
  });
});

describe("runImport on changed data", () => {
  const mapping = suggestMapping(headers);

  it("flags a duplicate reference and points to the first row", () => {
    const twice = [raw[0]!, { ...raw[1]!, Legacy_Reference_No__c: "EVO-900-001" }];
    const r = runImport(twice, mapping, codeBook);
    const dup = r.issues.find((i) => i.code === "duplicate_reference");
    expect(dup).toMatchObject({ row: 3, message: "Order reference EVO-900-001 already used on row 2" });
  });

  it("flags a missing donor ID", () => {
    const r = runImport([{ ...raw[2]!, DonorId: "" }], mapping, codeBook);
    expect(r.issues.map((i) => i.code)).toContain("missing_donor");
  });

  it("flags lines that do not add up to the gift amount", () => {
    const r = runImport([{ ...raw[4]!, GiftAmount: "900" }], mapping, codeBook);
    expect(r.issues.find((i) => i.code === "amount_mismatch")?.message).toMatch(/add up to 850 but the gift amount is 900/);
  });

  it("flags an unknown Outcome Activity ID with its line number", () => {
    const json = '{"allTrnxDesignations":[{"Amount":120,"Unit_Price__c":120,"Quantity__c":1,"Gift_Designation__c":"6gdTw000000DemoSPO","Outcome_Activity__c":"9OANope"}]}';
    const r = runImport([{ ...raw[0]!, GiftTranxDesignationInfo__c: json }], mapping, codeBook);
    expect(r.issues.find((i) => i.code === "unknown_id")).toMatchObject({ row: 2, lineNumber: 1 });
  });

  it("flags broken designation JSON and keeps the gift", () => {
    const r = runImport([{ ...raw[0]!, GiftTranxDesignationInfo__c: "{oops" }], mapping, codeBook);
    expect(r.issues.some((i) => i.code === "line_problem")).toBe(true);
    expect(r.gifts).toHaveLength(1);
  });
});
