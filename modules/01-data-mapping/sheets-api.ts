/**
 * sheets-api.ts
 *
 * What it does: reads one tab of a Google Sheet with the Google Sheets API, using a read-only
 * access token. The network call is passed in (fetch), so the logic can be tested with a fake
 * and moved to a server later.
 * Who calls it: the mapping page (ui/main.ts). The developers' scheduled job (DECISIONS 20)
 * would use the same logic with a server-side credential.
 * Depends on: sheets.ts and csv.ts types.
 *
 * Rule: read-only. This file only ever sends GET requests, and the token it is given has the
 * spreadsheets.readonly permission. It never writes to a sheet.
 */

import type { Table } from "./csv";
import { valuesToTable } from "./sheets";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// The part of fetch we use, so tests can pass a fake.
export type FetchLike = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// An error with a plain English message that is safe to show. It never contains the token.
export class SheetsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Rule: turn Google's status codes into one plain sentence, and never show the response body.
function friendly(status: number): string {
  if (status === 401) return "Your Google sign-in has expired. Sign in again.";
  if (status === 403) return "You don't have access to this sheet. Ask the owner to share it with you as Viewer.";
  if (status === 404) return "That sheet was not found. Check the link.";
  if (status === 429) return "Google is busy. Try again in a minute.";
  return `Google could not read the sheet (error ${status}).`;
}

async function get(f: FetchLike, url: string, token: string): Promise<unknown> {
  const res = await f(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new SheetsError(friendly(res.status), res.status);
  return res.json();
}

interface TabProps { sheetId: number; title: string }

/**
 * Reads one tab as a table (header row plus rows, same as a CSV).
 * Which tab: the name given, else the tab the link points at (gid), else the first tab.
 * Values arrive as shown in the sheet (formatted), so a date shows as it looks on screen.
 */
export async function fetchSheetTable(opts: {
  fetch: FetchLike;
  token: string;
  spreadsheetId: string;
  tabName?: string;
  gid?: string;
}): Promise<{ table: Table; tabTitle: string }> {
  const id = encodeURIComponent(opts.spreadsheetId);
  const meta = (await get(opts.fetch, `${BASE}/${id}?fields=sheets.properties(sheetId,title)`, opts.token)) as {
    sheets?: { properties?: TabProps }[];
  };
  const tabs = (meta.sheets ?? []).flatMap((s) => (s.properties ? [s.properties] : []));
  if (tabs.length === 0) throw new SheetsError("That sheet has no tabs.", 0);

  const wanted = opts.tabName?.trim();
  const tab = wanted
    ? tabs.find((t) => t.title.toLowerCase() === wanted.toLowerCase())
    : opts.gid !== undefined
      ? tabs.find((t) => String(t.sheetId) === opts.gid)
      : tabs[0];
  if (!tab) {
    throw new SheetsError(`The tab "${wanted ?? opts.gid}" was not found. Tabs in this sheet: ${tabs.map((t) => t.title).join(", ")}.`, 0);
  }

  // A tab name with spaces or quotes must be quoted in the range.
  const range = encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`);
  const data = (await get(
    opts.fetch,
    `${BASE}/${id}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    opts.token,
  )) as { values?: unknown[][] };
  return { table: valuesToTable(data.values ?? []), tabTitle: tab.title };
}
