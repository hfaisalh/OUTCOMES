/**
 * template.test.ts
 *
 * What it does: tests template.ts. The key promise: a file that follows the template matches every
 * column and imports with no issues, for a generic source and for the Salesforce preset.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";
import { readLookups } from "./lookups";
import { getPreset } from "./presets";
import { runImport } from "./pipeline";
import { newSetup } from "./setup";
import { expectedColumns, templateCsv } from "./template";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const TODAY = "2026-11-18";

describe("generic template", () => {
  it("lists the required columns first and includes all 8 classification fields", () => {
    const cols = expectedColumns();
    expect(cols.slice(0, 2).map((c) => c.field).sort()).toEqual(["receivedDate", "reference"]);
    expect(cols.filter((c) => c.group === "classification").map((c) => c.label).sort()).toEqual(
      ["Channel", "Frequency", "Merchant", "Method", "Mode", "Platform", "Settlement", "Type"],
    );
  });

  it("uses line columns, not a lines column", () => {
    const fields = expectedColumns().map((c) => c.field);
    expect(fields).toContain("lineOutcome");
    expect(fields).not.toContain("linesData");
  });

  it("matches every column of its own template and imports with no issues", () => {
    const { headers, records } = toRecords(parseCsv(templateCsv()));
    expect(records).toHaveLength(1);
    expect(headers).toHaveLength(expectedColumns().length);
    const setup = newSetup("Template", headers);
    expect(Object.values(setup.mapping).filter((a) => a.action !== "field")).toEqual([]);
    expect(runImport(records, setup, { today: TODAY }).issues).toEqual([]);
  });

  it("uses an organisation's own wording as column names", () => {
    const cols = expectedColumns({ labels: { supporterId: "Client number" } });
    expect(cols.find((c) => c.field === "supporterId")?.column).toBe("Client number");
  });
});

describe("Salesforce template", () => {
  const preset = getPreset("salesforce")!;

  it("uses Salesforce column names, requires the lines column and leaves out line-per-row columns", () => {
    const cols = expectedColumns({ preset });
    expect(cols.find((c) => c.field === "reference")?.column).toBe("Legacy_Reference_No__c");
    expect(cols.find((c) => c.field === "linesData")).toMatchObject({ required: true, column: "GiftTranxDesignationInfo__c" });
    expect(cols.some((c) => c.group === "line")).toBe(false);
  });

  it("matches every column of its own template and imports with no issues", () => {
    const { headers, records } = toRecords(parseCsv(templateCsv({ preset })));
    const setup = newSetup("Template", headers, "salesforce");
    setup.lookups = readLookups(read("sf-meta-sample.csv"), preset).lookups;
    expect(Object.values(setup.mapping).filter((a) => a.action !== "field")).toEqual([]);
    expect(runImport(records, setup, { today: TODAY }).issues).toEqual([]);
  });
});
