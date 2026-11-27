/**
 * site.test.ts
 *
 * What it does: tests how a gift's site becomes a country code (DECISIONS 261): the CRM's own site wins, usual spellings are understood, a new site is kept so it still flows, and with no site the currency is used.
 * These tests double as examples. Who calls it: vitest. Depends on: site.ts.
 */
import { describe, expect, it } from "vitest";
import { dateOrderOf, siteCode } from "./site";

describe("the country code of a gift", () => {
  it("understands the CRM's sites and their usual spellings", () => {
    expect(siteCode("UK", "GBP")).toBe("GB");
    expect(siteCode("USA", "USD")).toBe("US");
    expect(siteCode("Norway", "NOK")).toBe("NO");
    expect(siteCode(" united states ", "")).toBe("US");
    expect(siteCode("Great Britain", "")).toBe("GB");
  });
  it("lets the site win over the currency", () => {
    expect(siteCode("USA", "GBP")).toBe("US"); // a UK card paying on the US site is still a US gift
  });
  it("keeps a two letter code, and a site it does not know yet, so a new website needs no change", () => {
    expect(siteCode("ca", "CAD")).toBe("CA");
    expect(siteCode("Australia", "AUD")).toBe("AUSTRALIA");
    expect(siteCode("A very long new website name", "")).toBe("A VERY LONG");
    expect(siteCode("A very long new website name", "").length).toBeLessThanOrEqual(12);
  });
  it("works the site out from the currency when the export has none, and says nothing for a currency it does not know", () => {
    expect(siteCode("", "gbp")).toBe("GB");
    expect(siteCode("", "USD")).toBe("US");
    expect(siteCode("", "NOK")).toBe("NO");
    expect(siteCode("", "EUR")).toBe("");
    expect(siteCode("", "")).toBe("");
  });
});

describe("which way round the CRM writes a date (DECISIONS 262)", () => {
  it("is month/day/year for the USA site and day/month/year for every other, including a site it does not know", () => {
    expect(dateOrderOf("US")).toBe("mdy");
    expect(dateOrderOf("GB")).toBe("dmy");
    expect(dateOrderOf("NO")).toBe("dmy");
    expect(dateOrderOf("CANADA")).toBe("dmy");
    expect(dateOrderOf("")).toBe("dmy");
  });
});
