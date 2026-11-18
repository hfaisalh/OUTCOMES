/**
 * sheets.ts
 *
 * What it does: pure helpers for reading a Google Sheet: understand a pasted sheet link, and
 * turn the values Google returns into the same table a CSV file gives.
 * Who calls it: sheets-api.ts and the mapping page.
 * Depends on: csv.ts types only (no network, no database, no screen).
 */

import type { Table } from "./csv";

export interface SheetRef {
  spreadsheetId: string;
  gid?: string; // the numeric id of a tab, when the link points at one
}

/**
 * Rule: accept a full Google Sheets link (with or without a tab) or just the sheet ID.
 * Anything else is not a sheet link.
 */
export function parseSheetLink(text: string): SheetRef | null {
  const t = text.trim();
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(t);
  if (m) {
    const gid = /[#?&]gid=(\d+)/.exec(t)?.[1];
    return gid ? { spreadsheetId: m[1]!, gid } : { spreadsheetId: m[1]! };
  }
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? { spreadsheetId: t } : null;
}

/**
 * Rule: Google leaves out empty cells at the end of a row, so every row is padded to the width
 * of the header row, and cells are turned into text. Fully empty rows are skipped, as for CSV.
 */
export function valuesToTable(values: unknown[][]): Table {
  const width = (values[0] ?? []).length;
  return values
    .map((row) => {
      const cells = row.map((c) => (c === null || c === undefined ? "" : String(c)));
      while (cells.length < width) cells.push("");
      return cells;
    })
    .filter((row) => row.some((c) => c.trim() !== ""));
}
