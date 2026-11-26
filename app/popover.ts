/**
 * popover.ts
 *
 * What it does: the one drop-down panel the lists use for "filter this column by its values" and "choose the columns" (DECISIONS 229). It opens under the button that was pressed, like a filter does in a spreadsheet: a title, a search box when there are many values, a scrolling list of ticks, and Show all and Done at the foot.
 * Who calls it: app/gifts-page.ts and app/table-tools.ts, which hand it their own tick attributes. app/main.ts places it under its button and closes it on a click outside or Escape. Depends on: nothing. Pure: text in, text out.
 */

export type PopItem = { label: string; count?: number; attrs: string; checked: boolean };

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rule: a list of more than seven values gets a search box, so a long list can be narrowed by typing.
export const SEARCH_FROM = 8;

export function popoverHtml(o: { title: string; items: PopItem[]; clearAttrs?: string; clearLabel?: string; doneAttrs: string }): string {
  const search = o.items.length >= SEARCH_FROM ? `<input type="search" class="vpop-search" data-vpop-search="1" placeholder="Search" aria-label="Search the values">` : "";
  const items = o.items.map((i) => `<label class="vpop-item"><input type="checkbox" ${i.attrs}${i.checked ? " checked" : ""}><span class="vpop-label">${esc(i.label)}</span>${i.count === undefined ? "" : `<span class="muted vpop-n">${i.count}</span>`}</label>`).join("");
  return `<div class="vpop" role="dialog" aria-label="${esc(o.title)}"><div class="vpop-h">${esc(o.title)}</div>${search}<div class="vpop-list">${items}</div><div class="vpop-f">${o.clearAttrs ? `<button type="button" class="linkish" ${o.clearAttrs}>${esc(o.clearLabel ?? "Show all")}</button>` : "<span></span>"}<button type="button" class="chipbtn" ${o.doneAttrs}>Done</button></div></div>`;
}
