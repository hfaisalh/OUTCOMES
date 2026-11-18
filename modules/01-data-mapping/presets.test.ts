/**
 * presets.test.ts
 *
 * What it does: tests the Salesforce preset and the lookup list reader against the invented
 * samples. Everything specific to Salesforce is tested here, not in the generic core.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";
import { readLookups } from "./lookups";
import { getPreset, PRESETS } from "./presets";
import { salesforcePreset } from "./presets/salesforce";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");

describe("preset registry", () => {
  it("finds a preset by ID and returns null for none or unknown", () => {
    expect(getPreset("salesforce")).toBe(salesforcePreset);
    expect(getPreset(null)).toBeNull();
    expect(getPreset("nope")).toBeNull();
    expect(PRESETS.map((p) => p.id)).toContain("salesforce");
  });
});

describe("Salesforce lines column", () => {
  const { records } = toRecords(parseCsv(read("sf-upload-sample.csv")));
  const parse = salesforcePreset.parseLinesColumn!;

  it("turns a one-line gift into one line with IDs", () => {
    const r = parse(records[0]!["GiftTranxDesignationInfo__c"]!);
    expect(r.problems).toEqual([]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ amount: 120, quantity: 1, outcomeId: "9OATw000002DemoOSP", fundId: "6gdTw000000DemoSPO", intention: "Sadqah" });
  });

  it("turns a two-line gift into two lines that add up", () => {
    const r = parse(records[4]!["GiftTranxDesignationInfo__c"]!);
    expect(r.lines).toHaveLength(2);
    expect(r.lines.reduce((sum, l) => sum + (l.amount ?? 0), 0)).toBe(850);
  });

  it("reports empty or broken JSON instead of throwing", () => {
    expect(parse("").problems[0]).toMatch(/No designation lines/);
    expect(parse("{oops").problems[0]).toMatch(/not valid JSON/);
    expect(parse("{}").problems[0]).toMatch(/no allTrnxDesignations/);
  });
});

describe("lookup lists", () => {
  it("reads the Salesforce code book layout: each Id sits right of its name column", () => {
    const r = readLookups(read("sf-meta-sample.csv"), salesforcePreset);
    expect(r.problems).toEqual([]);
    expect(r.lookups.funds["6gdTw000000DemoGEN"]).toBe("GENERAL AID");
    expect(r.lookups.outcomes["9OATw000002DemoOSP"]).toBe("Orphan Sponsorship Where Most Needed");
    expect(Object.keys(r.lookups.funds)).toHaveLength(5);
    expect(Object.keys(r.lookups.outcomes)).toHaveLength(8);
  });

  it("reads the generic Type, Name, ID list without a preset", () => {
    const r = readLookups("Type,Name,ID\nFund,General fund,F1\nOutcome,Orphan sponsorship,O1\n");
    expect(r.problems).toEqual([]);
    expect(r.lookups).toEqual({ funds: { F1: "General fund" }, outcomes: { O1: "Orphan sponsorship" } });
  });

  it("reports a bad type, a missing ID, and a list with the wrong columns", () => {
    const r = readLookups("Type,Name,ID\nThing,x,1\nFund,,2\n");
    expect(r.problems).toEqual(['Row 2: Type "Thing" is not Fund or Outcome', "Row 3: Name and ID are both needed"]);
    expect(readLookups("a,b\n1,2\n").problems[0]).toMatch(/needs the columns Type, Name and ID/);
  });

  it("keeps the first name and reports a problem when a Salesforce ID has two names", () => {
    const csv = "Unique Outcome Activity Name,Id,Unique Gift Designation,Id\nOne,X1,,\nTwo,X1,,\n";
    const r = readLookups(csv, salesforcePreset);
    expect(r.lookups.outcomes["X1"]).toBe("One");
    expect(r.problems.some((p) => /two names/.test(p))).toBe(true);
  });
});
