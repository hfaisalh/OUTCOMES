/**
 * page-tabs.ts
 *
 * Purpose: tabs inside a page (Assignment, Allocate), so one table is on screen at a time and nobody scrolls past the others.
 * Data flow: a page calls pageTab() to learn which tab is open (from view.pageTab), tabsHtml() for the tab strip and panelAttrs() on each panel.
 * A click on a tab (data-ptab="page:id") is handled in list-events.ts, which stores the choice in state.pageTab and redraws.
 * Rule: every panel is drawn and the others are only hidden, so a list keeps its sort and filters when its tab is closed and opened again.
 */

import { esc } from "./pages";

export interface PageTab { id: string; label: string; count?: number }

// --- Which tab is open ---
// Rule: an unknown or missing choice falls back to the first tab.
export function pageTab(chosen: Record<string, string> | undefined, page: string, tabs: PageTab[]): string {
  const c = chosen?.[page];
  return tabs.some((t) => t.id === c) ? (c as string) : (tabs[0]?.id ?? "");
}

// --- The strip ---
export function tabsHtml(page: string, tabs: PageTab[], current: string): string {
  const btn = (t: PageTab): string => `<button type="button" role="tab" id="pt-${page}-${t.id}" aria-selected="${t.id === current}" aria-controls="pp-${page}-${t.id}" tabindex="${t.id === current ? 0 : -1}" class="${t.id === current ? "on" : ""}" data-ptab="${page}:${t.id}">${esc(t.label)}${t.count === undefined ? "" : ` <span class="muted">(${t.count})</span>`}</button>`;
  return `<nav class="pf-tabs page-tabs" role="tablist" aria-label="Sections of this page">${tabs.map(btn).join("")}</nav>`;
}

// --- A panel ---
export const panelAttrs = (page: string, id: string, current: string): string => `role="tabpanel" id="pp-${page}-${id}" aria-labelledby="pt-${page}-${id}"${id === current ? "" : " hidden"}`;
