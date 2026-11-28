/**
 * list-frames.test.ts
 *
 * What it does: tests that every list gets the same frame (DECISIONS 208): a bare table is wrapped, a table in an existing wrapper uses that wrapper, a table without a heading row or inside another table is left alone,
 * and running it twice changes nothing. Invented markup. These tests double as examples. Who calls it: vitest. Depends on: list-frames.ts.
 */

import { describe, expect, it } from "vitest";
import { frameLists } from "./list-frames";

const list = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";

describe("frameLists", () => {
  it("wraps a bare list in a frame", () => {
    expect(frameLists(`<h2>T</h2>${list}<p>x</p>`)).toBe(`<h2>T</h2><div class="listframe">${list}</div><p>x</p>`);
  });
  it("uses the wrapper a list already has as its frame, and keeps its other classes", () => {
    expect(frameLists(`<div class="tablewrap regwrap">${list}</div>`)).toBe(`<div class="tablewrap regwrap listframe">${list}</div>`);
    expect(frameLists(`<div class="twrap">\n  ${list}</div>`)).toBe(`<div class="twrap listframe">\n  ${list}</div>`);
  });
  it("frames each list on a page on its own", () => {
    expect(frameLists(list + list).match(/class="listframe"/g)).toHaveLength(2);
  });
  it("leaves alone a table with no heading row, and a table inside another table", () => {
    const facts = "<table><tr><th>Name</th><td>x</td></tr></table>";
    expect(frameLists(facts)).toBe(facts);
    const nested = `<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>${list}</td></tr></tbody></table>`;
    expect(frameLists(nested)).toBe(`<div class="listframe">${nested}</div>`);
  });
  it("changes nothing when run twice", () => {
    const once = frameLists(`${list}<div class="tablewrap">${list}</div>`);
    expect(frameLists(once)).toBe(once);
  });
  it("returns text with no table as it was", () => {
    expect(frameLists("<p>none</p>")).toBe("<p>none</p>");
  });
});
