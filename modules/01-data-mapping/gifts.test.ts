/**
 * gifts.test.ts
 *
 * What it does: tests gifts.ts against samples/sf-upload-sample.csv (invented data).
 * The sample holds 8 gifts: a centre-booked gift, a recurring sponsorship,
 * a two-line gift, a missing reference and a bad date.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readGiftExport, splitAllGifts, splitDesignationLines } from "./gifts";

const sample = readFileSync(new URL("../../samples/sf-upload-sample.csv", import.meta.url), "utf8");
const { gifts } = readGiftExport(sample);

describe("readGiftExport", () => {
  it("reads 8 gifts from the sample", () => {
    expect(gifts).toHaveLength(8);
    expect(gifts[0]?.["Legacy_Reference_No__c"]).toBe("EVO-900-001");
  });
});

describe("splitDesignationLines", () => {
  it("turns a one-line gift into one order line", () => {
    const { lines, issues } = splitDesignationLines(gifts[0]!);
    expect(issues).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      giftReference: "EVO-900-001",
      lineNumber: 1,
      amount: 120,
      quantity: 1,
      outcomeActivityId: "9OATw000002DemoOSP",
      intention: "Sadqah",
    });
  });

  it("turns a two-line gift into two numbered lines", () => {
    const { lines } = splitDesignationLines(gifts[4]!);
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(850);
  });

  it("keeps a gift that has no reference (reported later by the issue check)", () => {
    const { lines } = splitDesignationLines({ ...gifts[2]!, Legacy_Reference_No__c: "" });
    expect(lines[0]?.giftReference).toBe("");
  });

  it("reports empty or broken JSON instead of throwing", () => {
    const empty = splitDesignationLines({ Legacy_Reference_No__c: "X-1", GiftTranxDesignationInfo__c: "" });
    expect(empty.lines).toEqual([]);
    expect(empty.issues[0]?.message).toMatch(/No designation lines/);

    const broken = splitDesignationLines({ Legacy_Reference_No__c: "X-2", GiftTranxDesignationInfo__c: "{oops" });
    expect(broken.lines).toEqual([]);
    expect(broken.issues[0]?.message).toMatch(/not valid JSON/);
  });

  it("reports a list that is missing from the JSON", () => {
    const r = splitDesignationLines({ Legacy_Reference_No__c: "X-3", GiftTranxDesignationInfo__c: "{}" });
    expect(r.issues[0]?.message).toMatch(/no allTrnxDesignations/);
  });

  it("reports when Designation Count disagrees with the lines found", () => {
    const r = splitDesignationLines({ ...gifts[0]!, "Designation Count": "3" });
    expect(r.lines).toHaveLength(1);
    expect(r.issues[0]?.message).toMatch(/says 3 but 1 lines/);
  });
});

describe("splitAllGifts", () => {
  it("gives 9 lines for the 8 sample gifts and no issues", () => {
    const { lines, issues } = splitAllGifts(gifts);
    expect(lines).toHaveLength(9);
    expect(issues).toEqual([]);
  });
});
