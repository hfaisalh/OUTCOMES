/**
 * sheet-source.ts
 *
 * What it does: the "Load from Google Sheet" part of the page: the link and tab boxes, Google
 * sign-in (read-only), and reading the tab. When a tab has been read it hands the table back.
 * Who calls it: main.ts.
 * Depends on: google.ts, sheets.ts and sheets-api.ts.
 *
 * Rule: read-only, and the access token stays in memory only (DECISIONS 22).
 */

import type { Table } from "../csv";
import { parseSheetLink } from "../sheets";
import { fetchSheetTable, SheetsError } from "../sheets-api";
import { requestAccessToken, revokeToken, type AccessToken } from "./google";

const SHEET_KEY = "outcomes.module1.sheet"; // last sheet link and tab (not secret)
const CLIENT_KEY = "outcomes.module1.gclient"; // Google client ID (public, not a secret)

export interface SheetSourceDeps {
  status(text: string, bad?: boolean): void;
  openConfig(): void; // open the Configuration section, where the client ID is entered
  onTable(table: Table, tabTitle: string): void;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage may be blocked, the page still works */ } };

export function initSheetSource(deps: SheetSourceDeps): void {
  let token: AccessToken | null = null; // memory only, never stored

  const clientId = () => read(CLIENT_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  const showSignIn = () => { byId("gsign").textContent = token ? "Sign out of Google" : "Sign in with Google"; };

  async function ensureToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
    const id = clientId();
    if (!id) {
      deps.openConfig();
      throw new Error("Add your Google client ID in Configuration first (see docs/GOOGLE-SETUP.md).");
    }
    token = await requestAccessToken(id);
    showSignIn();
    return token.value;
  }

  async function load() {
    const link = byId<HTMLInputElement>("sheetlink").value;
    const tab = byId<HTMLInputElement>("sheettab").value;
    const ref = parseSheetLink(link);
    if (!ref) return deps.status("Paste the link of the Google Sheet first.", true);
    write(SHEET_KEY, JSON.stringify({ link, tab }));
    try {
      deps.status("Reading the sheet...");
      const accessToken = await ensureToken();
      const { table, tabTitle } = await fetchSheetTable({
        fetch: (url, init) => fetch(url, init),
        token: accessToken,
        spreadsheetId: ref.spreadsheetId,
        ...(tab.trim() !== "" ? { tabName: tab } : ref.gid !== undefined ? { gid: ref.gid } : {}),
      });
      deps.onTable(table, tabTitle);
    } catch (err) {
      if (err instanceof SheetsError && err.status === 401) token = null; // expired: the next click signs in again
      showSignIn();
      deps.status(err instanceof Error ? err.message : "Could not read the sheet.", true);
    }
  }

  byId("gload").addEventListener("click", () => void load());
  byId("gsign").addEventListener("click", () => {
    if (token) { revokeToken(token); token = null; showSignIn(); return deps.status("Signed out of Google."); }
    ensureToken().then(() => deps.status("Signed in to Google (read-only)."), (err: unknown) => deps.status(err instanceof Error ? err.message : "Sign-in failed.", true));
  });

  const clientBox = byId<HTMLInputElement>("gclient");
  clientBox.value = read(CLIENT_KEY) ?? "";
  clientBox.addEventListener("change", () => write(CLIENT_KEY, clientBox.value.trim()));
  try {
    const last = JSON.parse(read(SHEET_KEY) ?? "null") as { link?: string; tab?: string } | null;
    if (last) { byId<HTMLInputElement>("sheetlink").value = last.link ?? ""; byId<HTMLInputElement>("sheettab").value = last.tab ?? ""; }
  } catch { /* ignore a damaged saved value */ }
  showSignIn();
}
