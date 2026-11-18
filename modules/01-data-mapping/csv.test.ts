/**
 * csv.test.ts
 *
 * What it does: tests csv.ts. The tests double as examples of the CSV rules.
 * Uses invented text only.
 */

import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./csv";

describe("parseCsv", () => {
  it("reads plain cells", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps commas, doubled quotes and line breaks inside quoted cells", () => {
    const table = parseCsv('a,b\n"x, y","say ""hi""\nthere"\n');
    expect(table[1]).toEqual(["x, y", 'say "hi"\nthere']);
  });

  it("handles Windows line ends and a missing final line break", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("skips empty lines and a byte order mark", () => {
    expect(parseCsv("﻿a\n1\n\n")).toEqual([["a"], ["1"]]);
  });
});

describe("toRecords", () => {
  it("names each cell by its header", () => {
    const { records } = toRecords([["a", "b"], ["1", "2"]]);
    expect(records).toEqual([{ a: "1", b: "2" }]);
  });

  it("keeps repeated headers under numbered names", () => {
    const { headers, records } = toRecords([["Name", "Id", "Other", "Id"], ["x", "1", "y", "2"]]);
    expect(headers).toEqual(["Name", "Id", "Other", "Id (2)"]);
    expect(records[0]).toMatchObject({ Id: "1", "Id (2)": "2" });
  });

  it("fills missing trailing cells with empty text", () => {
    const { records } = toRecords([["a", "b"], ["1"]]);
    expect(records[0]).toEqual({ a: "1", b: "" });
  });
});
