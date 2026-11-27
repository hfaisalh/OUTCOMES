/**
 * site-chip.ts
 *
 * What it does: the small country code chip (GB, US, NO) that shows where a gift came from (DECISIONS 261), so the flow of a gift can be followed by country. One look everywhere it is used.
 * Who calls it: the Gifts list and gift window (app/gifts-page.ts), and the other pages that show a gift. Depends on: nothing. Pure: it takes a code and returns HTML.
 * UX: the code is words (not colour alone); the title spells out what it is; a gift with no site shows a quiet dash, so a gap is visible without shouting.
 */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The names behind the codes, for the tooltip. A site not listed here shows its code only.
const NAMES: Record<string, string> = { GB: "United Kingdom", US: "United States", NO: "Norway" };

// The same chip, or nothing when the gift has no site, for pages where a gap would only be noise.
export const siteBadge = (code: string | undefined, currency?: string): string => (code ? `${siteChip(code, currency)} ` : "");

export function siteChip(code: string | undefined, currency?: string): string {
  if (!code) return `<span class="muted" title="No site given">-</span>`;
  const name = NAMES[code] ?? code;
  return `<span class="site" title="${esc(`${name}${currency ? `, paid in ${currency}` : ""}`)}">${esc(code)}</span>`;
}
