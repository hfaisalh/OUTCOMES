/**
 * codebook.test.ts
 *
 * What it does: tests codebook.ts against samples/sf-meta-sample.csv and
 * samples/sf-upload-sample.csv (invented data). Tests double as examples.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCodeBook, decodeLines } from "./codebook";
import { readGiftExport, splitAllGifts } from "./gifts";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const meta = read("sf-meta-sample.csv");
const { codeBook, problems } = buildCodeBook(meta);

describe("buildCodeBook", () => {
  it("reads designations and outcome activities by ID", () => {
    expect(problems).toEqual([]);
    expect(codeBook.designations.get("6gdTw000000DemoGEN")).toBe("GENERAL AID");
    expect(codeBook.outcomeActivities.get("9OATw000002DemoOSP")).toBe("Orphan Sponsorship Where Most Needed");
  });

  it("uses the Id column to the right of each name, not the first Id column", () => {
    expect(codeBook.designations.size).toBe(5);
    expect(codeBook.outcomeActivities.size).toBe(8);
  });

  it("reports a missing column", () => {
    const r = buildCodeBook("a,b\n1,2\n");
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/no "Unique Gift Designation" column/);
  });

  it("keeps the first name and reports a problem when an ID has two names", () => {
    const csv = "Unique Outcome Activity Name,Id,Unique Gift Designation,Id\nOne,X1,,\nTwo,X1,,\n";
    const r = buildCodeBook(csv);
    expect(r.codeBook.outcomeActivities.get("X1")).toBe("One");
    expect(r.problems.some((p) => /two names/.test(p))).toBe(true);
  });
});

describe("decodeLines", () => {
  const { gifts } = readGiftExport(read("sf-upload-sample.csv"));
  const { lines } = splitAllGifts(gifts);

  it("decodes every line of the sample batch with no issues", () => {
    const result = decodeLines(lines, codeBook);
    expect(result.issues).toEqual([]);
    expect(result.lines).toHaveLength(9);
    expect(result.lines[0]).toMatchObject({
      giftReference: "EVO-900-001",
      designationName: "ON - SP ORPHAN",
      outcomeActivityName: "Orphan Sponsorship Where Most Needed",
    });
  });

  it("leaves the name empty and reports an issue for an unknown ID", () => {
    const bad = [{ ...lines[0]!, outcomeActivityId: "9OAUnknown" }];
    const r = decodeLines(bad, codeBook);
    expect(r.lines[0]?.outcomeActivityName).toBe("");
    expect(r.lines[0]?.designationName).toBe("ON - SP ORPHAN");
    expect(r.issues[0]?.message).toMatch(/not in the code book/);
  });

  it("reports an empty ID separately", () => {
    const r = decodeLines([{ ...lines[0]!, designationId: "" }], codeBook);
    expect(r.issues[0]?.message).toMatch(/No Designation ID/);
  });
});
