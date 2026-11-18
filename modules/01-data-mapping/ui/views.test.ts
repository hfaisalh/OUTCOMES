/**
 * views.test.ts
 *
 * What it does: checks the HTML text the page draws (views.ts) for the invented samples, so the
 * auto-match summary, the expected-format guide and the organisation's own wording are covered
 * without a browser.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "../csv";
import { readLookups } from "../lookups";
import { runImport } from "../pipeline";
import { getPreset } from "../presets";
import { findUnmappedValues, newSetup } from "../setup";
import { guideView, mappingView, resultsView, valuesView, type Model } from "./views";

const read = (name: string) => readFileSync(new URL(`../../../samples/${name}`, import.meta.url), "utf8");

function modelFor(file: string, presetId: string | null, setupEdit: (s: ReturnType<typeof newSetup>) => void = () => {}): Model {
  const { headers, records } = toRecords(parseCsv(read(file)));
  const setup = newSetup("Sample", headers, presetId);
  if (presetId) setup.lookups = readLookups(read("sf-meta-sample.csv"), getPreset(presetId)).lookups;
  setupEdit(setup);
  const result = runImport(records, setup, { today: "2026-11-18" });
  return { headers, rows: records, setup, result, unmapped: findUnmappedValues(result.transactions, setup), sel: null, valueField: "frequency", issueFilter: "all" };
}

const sf = modelFor("sf-upload-sample.csv", "salesforce");
const flat = modelFor("generic-flat-sample.csv", null, (s) => { s.layout = "one-row-per-line"; });

describe("page views", () => {
  it("shows the expected format guide, open before a file is loaded", () => {
    expect(guideView({ ...sf, headers: [] })).toContain('<details class="card" open>');
    expect(guideView(sf)).not.toContain(" open>");
    expect(guideView(sf)).toContain("Legacy_Reference_No__c");
    expect(guideView(sf)).toContain("Required");
  });

  it("says how many columns matched automatically", () => {
    expect(mappingView(sf)).toMatch(/Matched \d+ of 64 columns automatically/);
    expect(mappingView(flat)).toMatch(/Matched 15 of 15 columns automatically \(14 mapped, 14 by name, please check, 1 dropped\)/);
  });

  it("shows all 8 classification fields and the value mapping", () => {
    const html = mappingView(sf);
    for (const label of ["Channel", "Platform", "Merchant", "Type", "Method", "Mode", "Frequency", "Settlement"]) expect(html).toContain(`>${label}</span>`);
    expect(valuesView(sf)).toContain("One-off");
  });

  it("uses the organisation's own wording and marks required fields", () => {
    expect(mappingView(sf)).toContain("Donor ID (Salesforce) *");
    expect(mappingView(flat)).toContain("Supporter ID");
  });

  it("shows the line fields that fit the layout", () => {
    expect(mappingView(sf)).toContain("Lines, in one column");
    expect(mappingView(sf)).not.toContain("Lines, one per row");
    expect(mappingView(flat)).toContain("Lines, one per row");
    expect(mappingView(flat)).not.toContain("Lines, in one column");
  });

  it("shows the results counts and escapes text", () => {
    expect(resultsView(sf)).toContain("<b>8</b><span>transactions</span>");
    expect(resultsView(flat)).toContain("<b>6</b><span>transactions</span>");
    expect(mappingView({ ...sf, setup: { ...sf.setup, sourceName: '<b>"x"</b>' } })).toContain("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  });
});
