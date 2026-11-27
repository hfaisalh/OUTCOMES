/**
 * site.ts
 *
 * What it does: turns the CRM's site (the website a gift was given on: UK, USA, Norway, and others to come) into a short country code, so every gift carries where it came from (DECISIONS 261). The code is shown on the Gifts list and the gift window, so the flow of a gift can be followed by country.
 * Who calls it: the CRM export adapter (export-adapter.ts) for the MWF CRM. Depends on: nothing. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: the site is only a label for where a gift came from. A gift from any site is itemised, assigned, confirmed and allocated in exactly the same way (Faisal: it is one global tool).
 * - Rule: the CRM's own site wins. A name that is known (UK, USA, Norway and their usual spellings) becomes its ISO country code (GB, US, NO). A two letter code is kept in capitals. A site this list does not know yet (a new website) is kept as written, in capitals, up to 12 characters, so it flows through without a code change.
 * - Rule: when the export has no site, it is worked out from the currency the gift was paid in (GBP, USD, NOK). A currency that is not known gives no site, shown as "No site".
 * - Source-specific names live here, in the MWF preset, never in the core (DECISIONS 26).
 */

// --- What the MWF CRM calls its sites, and the currencies they sell in ---
const SITE_NAMES: Record<string, string> = {
  uk: "GB", gb: "GB", "united kingdom": "GB", "great britain": "GB", britain: "GB", england: "GB",
  usa: "US", us: "US", "united states": "US", "united states of america": "US", america: "US",
  norway: "NO", no: "NO", norge: "NO",
};
const CURRENCY_SITES: Record<string, string> = { GBP: "GB", USD: "US", NOK: "NO" };

export function siteCode(site: string, currency: string): string {
  const s = site.trim();
  if (s !== "") {
    const known = SITE_NAMES[s.toLowerCase()];
    if (known) return known;
    return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : s.toUpperCase().slice(0, 12).trim();
  }
  return CURRENCY_SITES[currency.trim().toUpperCase()] ?? "";
}
