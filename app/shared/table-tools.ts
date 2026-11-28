/**
 * table-tools.ts
 *
 * What it does: gives every list in OUTCOMES the tools the Gifts list has (DECISIONS 222): click a heading to sort, a funnel in a heading to keep only some values, and a Columns button to hide columns.
 * The pages do not repeat any of this. After a page is drawn, enhanceTables() looks at each framed list and adds the tools to it, so a new list gets them with no code.
 * What is left alone: Gifts, Beneficiaries and Outcomes, which have their own (they carry sort buttons already), and any list that is not a plain grid (a row spanning columns, a list inside a list).
 * Who calls it: app/main.ts after every draw, and its click handlers. Depends on: app/shared/symbols.ts for the icons.
 * Business rules are the pure functions at the top (compare, tidy, view of the rows), so they can be tested and ported without a browser.
 */
import { SYM } from "./symbols";
import { popoverHtml } from "./popover";

export type TableToolsState = {
  sort: Record<string, { col: number; dir: "asc" | "desc" } | undefined>;
  filters: Record<string, Record<number, string[]>>;
  hidden: Record<string, number[]>;
  open: { key: string; kind: "filter" | "cols"; col: number } | null;
};
export const newTableTools = (): TableToolsState => ({ sort: {}, filters: {}, hidden: {}, open: null });

// Rule: the words of a cell are its text with the spaces tidied. Sorting and filtering both go by it.
export const tidy = (text: string): string => text.replace(/\s+/g, " ").trim();

// Rule: a cell that reads as a number (a pound sign, commas, a percent sign and a trailing unit are ignored) or a date (dd/mm/yy or dd/mm/yyyy) sorts as one, anything else sorts as words with numbers in natural order, and an empty cell is always last.
const asNumber = (s: string): number | null => {
  const m = /^[£$€]?\s*(-?[\d,]*\.?\d+)\s*%?$/.exec(s.replace(/\s+of\s+.*$/, "").replace(/\/.*$/, ""));
  return m ? Number(m[1]!.replace(/,/g, "")) : null;
};
const asDate = (s: string): number | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return y * 10000 + Number(m[2]) * 100 + Number(m[1]);
};
export function compareCells(a: string, b: string, dir: "asc" | "desc"): number {
  if (a === "" && b === "") return 0;
  if (a === "") return 1; // empty last, whichever way it is sorted
  if (b === "") return -1;
  const sign = dir === "asc" ? 1 : -1;
  const da = asDate(a), db = asDate(b);
  if (da !== null && db !== null) return sign * (da - db);
  const na = asNumber(a), nb = asNumber(b);
  if (na !== null && nb !== null) return sign * (na - nb);
  return sign * a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// The values a heading can be filtered by: its distinct cell texts with how many rows have each. A column with one value, or more than 25, gets no funnel (a name column is searched, not ticked).
export function valuesOf(cells: string[]): { value: string; count: number }[] | null {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  if (counts.size < 2 || counts.size > 25 || [...counts.keys()].some((k) => k.length > 40)) return null;
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((x, y) => compareCells(x.value, y.value, "asc"));
}

// The rows to show, in order: rows whose cell is in every ticked list, then sorted. Returns the row numbers.
export function viewRows(rows: string[][], filters: Record<number, string[]>, sort: { col: number; dir: "asc" | "desc" } | undefined): number[] {
  let keep = rows.map((_, i) => i).filter((i) => Object.entries(filters).every(([col, vals]) => vals.length === 0 || vals.includes(rows[i]![Number(col)] ?? "")));
  if (sort) keep = [...keep].sort((x, y) => compareCells(rows[x]![sort.col] ?? "", rows[y]![sort.col] ?? "", sort.dir) || x - y);
  return keep;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- The part that touches the page ----
export function enhanceTables(root: ParentNode, tt: TableToolsState, page: string): void {
  if (!root || typeof (root as { querySelectorAll?: unknown }).querySelectorAll !== "function") return; // the test page has no document to walk
  const frames = Array.from(root.querySelectorAll<HTMLElement>(".listframe"));
  frames.forEach((frame, n) => {
    const table = frame.tagName === "TABLE" ? (frame as HTMLTableElement) : frame.querySelector<HTMLTableElement>("table");
    if (!table) return;
    const key = `${page}:${n}`;
    const heads = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:last-child th"));
    const body = table.tBodies[0];
    if (!body || heads.length < 2) return;
    if (table.classList.contains("giftlist") || table.querySelector("[data-gsort],table,details,th[colspan]")) return;
    const trs = Array.from(body.rows);
    if (trs.length === 0) return;
    // A list that already sorts itself (Beneficiaries, Outcomes) keeps its own order and sort buttons and only gains the funnel and Columns.
    // A row that spans the columns (such as "Not enrolled in any benefit yet") has no value to filter by, so it is hidden while a filter is on.
    const ownSort = table.querySelector(".sortbtn") !== null;
    const plain = trs.map((r) => r.cells.length === heads.length);
    const cells = trs.map((r, i) => (plain[i] ? Array.from(r.cells).map((c) => tidy(c.textContent ?? "")) : []));
    const filters = tt.filters[key] ?? {};
    const sort = ownSort ? undefined : tt.sort[key];
    const hidden = tt.hidden[key] ?? [];
    const shown = viewRows(cells, filters, sort);
    const shownSet = new Set(shown);
    // Order and hide the rows.
    if (sort) shown.forEach((i) => body.appendChild(trs[i]!)); // only a sorted list is reordered, an unsorted one keeps the page's own order
    trs.forEach((r, i) => { r.hidden = !shownSet.has(i); });
    // Hide columns by their number.
    [...heads, ...trs.filter((_, i) => plain[i]).flatMap((r) => Array.from(r.cells))].forEach((c) => { c.hidden = hidden.includes(c.cellIndex); });
    // Headings: a sort button, and a funnel where the column has few values. A heading with a control in it (a tick-all box) is left as it is.
    heads.forEach((th, col) => {
      const label = tidy(th.textContent ?? "");
      if (label === "" || th.querySelector("input,select")) return;
      const dir = sort?.col === col ? sort.dir : undefined;
      const vals = valuesOf(cells.filter((r) => r.length > 0).map((r) => r[col] ?? ""));
      const on = (filters[col] ?? []).length > 0;
      const funnelBtn = vals ? `<button type="button" class="fbtn${on ? " on" : ""}" data-tt-filter="${key}|${col}" aria-pressed="${tt.open?.kind === "filter" && tt.open.key === key && tt.open.col === col ? "true" : "false"}" aria-label="Filter ${esc(label)} by value" title="Filter by value">${SYM.funnel}</button>` : "";
      if (th.querySelector("button")) { if (!th.querySelector(".fbtn")) th.insertAdjacentHTML("beforeend", funnelBtn); return; }
      th.setAttribute("aria-sort", dir ? (dir === "desc" ? "descending" : "ascending") : "none");
      th.innerHTML = `<button type="button" class="sortbtn" data-tt-sort="${key}|${col}">${esc(label)}${dir === "asc" ? SYM.sortUp : dir === "desc" ? SYM.sortDown : ""}</button>${funnelBtn}`;
    });
    // The bar above the list: how many are shown, the filters in force, the Columns button, and the open panel.
    const chips = Object.entries(filters).filter(([, v]) => v.length > 0).map(([col, v]) => `<button type="button" class="chip" data-tt-clearcol="${key}|${col}" title="Remove this filter">${esc(tidy(heads[Number(col)]?.textContent ?? ""))}: ${esc(v.length === 1 ? v[0]! : `${v.length} values`)} ${SYM.close}</button>`).join("");
    const labelOf = (i: number) => tidy(heads[i]?.textContent ?? "") || `Column ${i + 1}`;
    let panel = "";
    if (tt.open && tt.open.key === key && tt.open.kind === "filter") {
      const vals = valuesOf(cells.filter((r) => r.length > 0).map((r) => r[tt.open!.col] ?? "")) ?? [];
      const ticked = filters[tt.open.col] ?? [];
      panel = popoverHtml({ title: labelOf(tt.open.col), items: vals.map((x) => ({ label: x.value, count: x.count, attrs: `data-tt-val="${key}|${tt.open!.col}" value="${esc(x.value)}"`, checked: ticked.includes(x.value) })), clearAttrs: `data-tt-clearcol="${key}|${tt.open.col}"`, doneAttrs: `data-tt-done="1"` });
    } else if (tt.open && tt.open.key === key && tt.open.kind === "cols") {
      panel = popoverHtml({ title: "Columns", items: heads.map((_, i) => ({ label: labelOf(i), attrs: `data-tt-col="${key}|${i}"`, checked: !hidden.includes(i) })).filter((x) => !x.label.startsWith("Column ")), doneAttrs: `data-tt-done="1"` });
    }
    const count = shown.length === trs.length ? "" : `<span class="muted">${shown.length} of ${trs.length} shown</span> `;
    const any = Object.values(filters).some((v) => v.length > 0) || hidden.length > 0 || (!ownSort && sort);
    const bar = document.createElement("div");
    bar.className = "listtools tt";
    bar.innerHTML = `<div class="chips">${count}${chips}${any ? `<button type="button" class="chipbtn" data-tt-reset="${key}">Reset</button>` : ""}</div><div class="toolbtns"><button type="button" class="chipbtn" data-tt-cols="${key}" aria-expanded="${tt.open?.kind === "cols" && tt.open.key === key ? "true" : "false"}">${SYM.columns} Columns</button></div>${panel}`;
    // Rule: a one-line key to the symbols that sits just above the list joins the bar, left, beside Columns, so it takes no row of its own.
    const keyLine = [frame.previousElementSibling, frame.parentElement?.previousElementSibling].find((e) => e?.classList.contains("keyline"));
    if (keyLine) { bar.classList.add("withkey"); bar.querySelector(".toolbtns")?.appendChild(keyLine); }
    frame.parentElement?.insertBefore(bar, frame);
  });
}
