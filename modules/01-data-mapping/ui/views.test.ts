/**
 * views.test.ts
 *
 * What it does: checks the HTML text the page draws (views.ts) for the invented sample, so the
 * auto-match summary and the expected-format guide are covered without a browser.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCodeBook } from "../codebook";
import { readGiftExport } from "../gifts";
import { newSetup, runImportWithSetup, findUnmappedValues } from "../setup";
import { guideView, mappingView, resultsView, valuesView, type Model } from "./views";

const read = (name: string) => readFileSync(new URL(`../../../samples/${name}`, import.meta.url), "utf8");
const { headers, gifts } = readGiftExport(read("sf-upload-sample.csv"));
const { codeBook } = buildCodeBook(read("sf-meta-sample.csv"));
const setup = newSetup("Sample upload", headers);
const result = runImportWithSetup(gifts, setup, codeBook);
const model: Model = {
  headers, rawGifts: gifts, codeBook, setup, result,
  unmapped: findUnmappedValues(result.gifts, setup), sel: null, valueField: "frequency", issueFilter: "all",
};

describe("page views", () => {
  it("shows the expected format guide, open before a file is loaded", () => {
    expect(guideView({ ...model, setup: null })).toContain("<details class=\"card\" open>");
    expect(guideView(model)).not.toContain(" open>");
    expect(guideView(model)).toContain("Legacy_Reference_No__c");
    expect(guideView(model)).toContain("Required");
  });

  it("says how many columns matched automatically", () => {
    expect(mappingView(model)).toMatch(/Matched \d+ of 64 columns automatically/);
  });

  it("shows all 8 classification fields and the value mapping", () => {
    const html = mappingView(model);
    for (const label of ["Channel", "Platform", "Merchant", "Type", "Method", "Mode", "Frequency", "Settlement"]) expect(html).toContain(`>${label}</span>`);
    expect(valuesView(model)).toContain("One-off");
  });

  it("shows the results counts and escapes text", () => {
    expect(resultsView(model)).toContain("<b>8</b><span>gifts</span>");
    expect(mappingView({ ...model, setup: { ...setup, sourceName: '<b>"x"</b>' } })).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  });
});
