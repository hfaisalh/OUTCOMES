/**
 * pipeline.test.ts
 *
 * What it does: tests pipeline.ts (runImport): the Salesforce sample, a generic file from another
 * organisation, and changed data for each issue. The tests double as examples.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";
import { readLookups } from "./lookups";
import { getPreset } from "./presets";
import { isValidIsoDate, runImport } from "./pipeline";
import { newSetup, type Setup } from "./setup";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const TODAY = "2026-11-18";
const sf = toRecords(parseCsv(read("sf-upload-sample.csv")));
const flat = toRecords(parseCsv(read("generic-flat-sample.csv")));

function sfSetup(): Setup {
  const s = newSetup("Sample upload", sf.headers, "salesforce");
  s.lookups = readLookups(read("sf-meta-sample.csv"), getPreset("salesforce")).lookups;
  return s;
}
const run = (rows: Record<string, string>[], setup = sfSetup()) => runImport(rows, setup, { today: TODAY });
const codes = (r: ReturnType<typeof run>) => r.issues.map((i) => i.code);

describe("isValidIsoDate", () => {
  it("accepts real days in YYYY-MM-DD form only", () => {
    expect(isValidIsoDate("2026-11-07")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("04-Nov-2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("Salesforce sample", () => {
  const r = run(sf.records);

  it("keeps every transaction and line, even the ones with issues", () => {
    expect(r.transactions).toHaveLength(8);
    expect(r.lines).toHaveLength(9);
  });

  it("decodes every line to names", () => {
    expect(r.lines[0]).toMatchObject({ reference: "EVO-900-001", fundName: "ON - SP ORPHAN", outcomeName: "Orphan Sponsorship Where Most Needed" });
  });

  it("flags the missing reference and both bad dates, and nothing else", () => {
    expect(r.issues.filter((i) => i.code === "missing_reference").map((i) => i.row)).toEqual([9]);
    expect(r.issues.filter((i) => i.code === "bad_date").map((i) => i.row)).toEqual([8, 9]);
    expect(r.issues).toHaveLength(3);
  });
});

describe("Salesforce sample with changed data", () => {
  it("flags a duplicate reference and points to the first row", () => {
    const r = run([sf.records[0]!, { ...sf.records[1]!, Legacy_Reference_No__c: "EVO-900-001" }]);
    expect(r.issues.find((i) => i.code === "duplicate_reference")).toMatchObject({ row: 3, message: "Order reference EVO-900-001 already used on row 2" });
  });

  it("flags a missing supporter ID with the organisation's own wording", () => {
    const r = run([{ ...sf.records[2]!, DonorId: "" }]);
    expect(r.issues.find((i) => i.code === "missing_supporter")?.message).toBe("No Donor ID (Salesforce)");
  });

  it("flags lines that do not add up to the total, unless the upload holds feedback items only", () => {
    const changed = [{ ...sf.records[4]!, GiftAmount: "900" }];
    expect(run(changed).issues.find((i) => i.code === "amount_mismatch")?.message).toBe("Lines add up to 850 but the total is 900");
    const partial = { ...sfSetup(), feedbackItemsOnly: true };
    expect(codes(run(changed, partial))).not.toContain("amount_mismatch");
  });

  it("flags an ID that is not in the lookup list, with its line number", () => {
    const json = '{"allTrnxDesignations":[{"Amount":120,"Unit_Price__c":120,"Quantity__c":1,"Gift_Designation__c":"6gdTw000000DemoSPO","Outcome_Activity__c":"9OANope"}]}';
    const r = run([{ ...sf.records[0]!, GiftTranxDesignationInfo__c: json }]);
    expect(r.issues.find((i) => i.code === "unknown_id")).toMatchObject({ row: 2, lineNumber: 1, message: "Outcome Activity ID 9OANope is not in the lookup list" });
  });

  it("flags broken JSON and keeps the transaction", () => {
    const r = run([{ ...sf.records[0]!, GiftTranxDesignationInfo__c: "{oops" }]);
    expect(codes(r)).toContain("line_problem");
    expect(r.transactions).toHaveLength(1);
  });

  it("flags a line count that disagrees with the lines found", () => {
    const r = run([{ ...sf.records[0]!, "Designation Count": "3" }]);
    expect(r.issues.find((i) => i.code === "line_problem")?.message).toBe("Line count says 3 but 1 lines were found");
  });

  it("flags a received date in the future", () => {
    const r = run([{ ...sf.records[0]!, GiftReceivedDate: "2029-04-01" }]);
    expect(r.issues.find((i) => i.code === "future_date")?.message).toMatch(/2029-04-01 is in the future/);
  });
});

describe("commitment dates", () => {
  // records[3] is the recurring sample (start 2026-11-15, no end), records[5] the custom commitment
  it("accepts a start date with no end date, and a valid end date after the start", () => {
    expect(run([sf.records[3]!, sf.records[5]!]).issues).toEqual([]);
    expect(run([{ ...sf.records[3]!, ExpectedEndDate: "2027-11-15" }]).issues).toEqual([]);
  });
  it("flags a missing start date, a bad end date and an end before the start", () => {
    expect(codes(run([{ ...sf.records[3]!, EffectiveStartDate: "" }]))).toEqual(["missing_start_date"]);
    expect(run([{ ...sf.records[3]!, ExpectedEndDate: "next year" }]).issues[0]?.message).toMatch(/end date/);
    expect(codes(run([{ ...sf.records[3]!, ExpectedEndDate: "2026-10-01" }]))).toEqual(["end_before_start"]);
  });
  it("does not check commitment dates on a one-off", () => {
    expect(run([{ ...sf.records[0]!, ExpectedEndDate: "garbage" }]).issues).toEqual([]);
  });
});

describe("another organisation's file (no preset, one row per line)", () => {
  const setup = (): Setup => {
    const s = newSetup("Other charity", flat.headers);
    s.layout = "one-row-per-line";
    s.requiredFields = ["reference", "receivedDate", "supporterId", "lineOutcome"];
    return s;
  };
  const r = run(flat.records, setup());

  it("groups rows with the same reference into one transaction with two lines", () => {
    expect(r.transactions).toHaveLength(6);
    expect(r.lines).toHaveLength(7);
    expect(r.lines.filter((l) => l.reference === "R-003").map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(r.lines.find((l) => l.reference === "R-003" && l.lineNumber === 2)).toMatchObject({ amount: 50, quantity: 2, unitPrice: 25, fundName: "General fund" });
  });

  it("needs no lookup list because the file carries names", () => {
    expect(r.lines[0]).toMatchObject({ fundName: "General fund", outcomeName: "Orphan sponsorship" });
  });

  it("flags the row with no outcome, the row with no reference and the bad date, and nothing else", () => {
    expect(r.issues.map((i) => [i.row, i.code])).toEqual([
      [6, "unknown_id"],
      [7, "missing_reference"],
      [8, "bad_date"],
    ]);
    expect(r.issues[0]?.message).toBe("No Outcome name on this line");
  });

  it("never carries the contact column into a transaction", () => {
    expect(JSON.stringify(r.transactions)).not.toContain("example.test");
  });

  it("flags rows of one transaction that disagree", () => {
    const rows = [flat.records[2]!, { ...flat.records[3]!, "Supporter ID": "S-999" }];
    expect(codes(run(rows, setup()))).toContain("inconsistent_rows");
  });

  it("does not check totals against lines for a source with one amount column", () => {
    expect(codes(r)).not.toContain("amount_mismatch");
  });
});

describe("layouts", () => {
  it("with one line per transaction, a repeated reference is a duplicate, not a second line", () => {
    const s = newSetup("x", flat.headers);
    expect(codes(run([flat.records[2]!, flat.records[3]!], s))).toContain("duplicate_reference");
  });

  it("reports a lines column when the source has no reader for it", () => {
    const s = { ...newSetup("x", flat.headers), layout: "lines-column" as const };
    expect(run([flat.records[0]!], s).issues[0]).toMatchObject({ code: "line_problem" });
  });

  it("reports a blank required custom field", () => {
    const s = newSetup("x", flat.headers);
    s.customFields = [{ key: "staffCheck", label: "Staff check", kind: "manual", type: "text", required: true, defaultValue: "", privacy: "normal" }];
    expect(run(flat.records.slice(0, 1), s).issues.map((i) => i.message)).toContain("Staff check is required and is blank");
  });
});
