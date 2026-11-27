/**
 * site-chip.test.ts
 *
 * What it does: tests the country code chip (DECISIONS 261): a known site shows its code with its name and currency in the tooltip, a new site shows its code, a missing site is a quiet dash (or nothing in the badge form), and text is escaped.
 * Who calls it: vitest. Depends on: site-chip.ts.
 */
import { describe, expect, it } from "vitest";
import { siteBadge, siteChip } from "./site-chip";

describe("the country code chip", () => {
  it("spells out a known site in the tooltip, with the currency it was paid in", () => {
    expect(siteChip("GB", "GBP")).toBe('<span class="site" title="United Kingdom, paid in GBP">GB</span>');
    expect(siteChip("NO")).toBe('<span class="site" title="Norway">NO</span>');
  });
  it("shows a site it does not know yet by its code, escaped", () => {
    expect(siteChip("CA", "CAD")).toBe('<span class="site" title="CA, paid in CAD">CA</span>');
    expect(siteChip("<B>")).toContain("&lt;B&gt;");
  });
  it("shows a quiet dash for no site, or nothing at all in the badge form", () => {
    expect(siteChip("")).toContain("No site given");
    expect(siteBadge("")).toBe("");
    expect(siteBadge(undefined)).toBe("");
    expect(siteBadge("US", "USD")).toBe(`${siteChip("US", "USD")} `);
  });
});
