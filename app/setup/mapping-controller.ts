/**
 * mapping-controller.ts
 *
 * What it does: runs the Other sources page inside the OUTCOMES shell (DECISIONS 93). It reads the chosen CSV file or Google Sheet in the browser, keeps
 * the mapping state, handles taps, drags and form fields, and tells the shell to redraw. The matching rules are the Module 1 logic, unchanged.
 * Who calls it: app/main.ts. Depends on: the Module 1 logic (modules/01-data-mapping) and app/setup/mapping-page.ts.
 *
 * Rule: the setup (including the lookup lists) is configuration. It is saved in this browser, so each run only needs the file. Nothing is sent to a server.
 * Rule: a Google token is kept in memory only, and the permission is read only (DECISIONS 22).
 */

import flatSample from "../../samples/generic-flat-sample.csv?raw";
import sfMeta from "../../samples/sf-meta-sample.csv?raw";
import sfUpload from "../../samples/sf-upload-sample.csv?raw";
import { parseCsv, toRecords, type Table } from "../../modules/01-data-mapping/csv";
import { readLookups } from "../../modules/01-data-mapping/lookups";
import { suggestMapping } from "../../modules/01-data-mapping/mapping";
import { runImport } from "../../modules/01-data-mapping/pipeline";
import { getPreset } from "../../modules/01-data-mapping/presets";
import { parseSheetLink } from "../../modules/01-data-mapping/sheets";
import { fetchSheetTable, SheetsError } from "../../modules/01-data-mapping/sheets-api";
import { findUnmappedValues, loadSetup, newSetup, saveSetup, type Setup } from "../../modules/01-data-mapping/setup";
import { templateCsv } from "../../modules/01-data-mapping/template";
import { requestAccessToken, revokeToken, type AccessToken } from "../../modules/01-data-mapping/ui/google";
import { mappingPageHtml, type MappingState, type MappingStep } from "./mapping-page";

const STORAGE_KEY = "outcomes.module1.setup.v2";
const SHEET_KEY = "outcomes.module1.sheet";
const CLIENT_KEY = "outcomes.module1.gclient";
const STUB_NAME = "Data source"; // name of a setup made before any file was chosen

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* storage may be blocked, the page still works */ } };

function restore(): Setup {
  const text = read(STORAGE_KEY);
  return (text ? loadSetup(text).setup : null) ?? newSetup(STUB_NAME, []);
}

export function createMapping(redraw: () => void) {
  let token: AccessToken | null = null; // memory only
  const last = (() => { try { return JSON.parse(read(SHEET_KEY) ?? "null") as { link?: string; tab?: string } | null; } catch { return null; } })();
  const ms: MappingState = {
    model: { headers: [], rows: [], setup: restore(), result: null, unmapped: [], sel: null, valueField: "frequency", issueFilter: "all" },
    step: 1, note: "", bad: false, demo: false, fileName: "", googleSignedIn: false,
    sheetLink: last?.link ?? "", sheetTab: last?.tab ?? "", googleClient: read(CLIENT_KEY) ?? "",
  };
  const m = ms.model;
  const say = (text: string, bad = false) => { ms.note = text; ms.bad = bad; };

  // Rule: a setup may not know every column of this file, so add suggestions for the new ones.
  function ensureHeaders(): void {
    const preset = getPreset(m.setup.presetId);
    for (const h of m.headers) if (!(h in m.setup.mapping)) m.setup.mapping[h] = suggestMapping([h], preset)[h] ?? { action: "unmapped" };
  }
  // Works out the result for the current setup and keeps the setup in this browser (not in the demo), then redraws.
  function refresh(): void {
    if (m.headers.length > 0) {
      m.result = runImport(m.rows, m.setup);
      m.unmapped = findUnmappedValues(m.result.transactions, m.setup);
    } else { m.result = null; m.unmapped = []; }
    if (!ms.demo) write(STORAGE_KEY, saveSetup(m.setup));
    redraw();
  }
  function useTable(table: Table, name: string, from: string): void {
    const { headers, records } = toRecords(table);
    m.headers = headers;
    m.rows = records;
    if (m.setup.sourceName === STUB_NAME) m.setup.sourceName = name;
    ms.fileName = name;
    ensureHeaders();
    ms.step = 2;
    say(`Loaded ${records.length} rows and ${headers.length} columns from ${from}.`);
    refresh();
  }
  function startDemo(kind: "salesforce" | "generic"): void {
    ms.demo = true;
    const table = parseCsv(kind === "salesforce" ? sfUpload : flatSample);
    const { headers } = toRecords(table);
    const setup = newSetup(kind === "salesforce" ? "Demo: Salesforce sample" : "Demo: another organisation's file", headers, kind === "salesforce" ? "salesforce" : null);
    if (kind === "salesforce") setup.lookups = readLookups(sfMeta, getPreset("salesforce")).lookups;
    else { setup.layout = "one-row-per-line"; setup.requiredFields = ["reference", "receivedDate", "supporterId", "lineOutcome"]; }
    m.setup = setup;
    m.valueField = "frequency";
    useTable(table, setup.sourceName, "the built-in demo sample (invented data)");
    say("Demo with invented sample data. Nothing is saved.");
    redraw();
  }

  // ---- moving columns and values ----
  function setColumn(column: string, target: string): void {
    const mapping = m.setup.mapping;
    if (target === "pool") mapping[column] = { action: "unmapped" };
    else if (target === "drop") mapping[column] = { action: "drop", reason: "Dropped by you" };
    else {
      // Rule: one column per field. A column already on this field goes back to "to decide".
      for (const [c, a] of Object.entries(mapping)) if (c !== column && a.action === "field" && a.field === target) mapping[c] = { action: "unmapped" };
      mapping[column] = { action: "field", field: target };
    }
  }
  function setValue(raw: string, master: string | null): void {
    const map = (m.setup.valueMaps[m.valueField] ??= {});
    for (const k of Object.keys(map)) if (k.trim().toLowerCase() === raw.trim().toLowerCase()) delete map[k];
    if (master !== null) map[raw] = master;
  }
  function dropOn(el: Element, area: string, value: string): boolean {
    const slot = el.closest<HTMLElement>("[data-slot]");
    const zone = el.closest<HTMLElement>("[data-zone]");
    const master = el.closest<HTMLElement>("[data-vm]");
    const valuePool = el.closest<HTMLElement>("[data-vpool]");
    if (area === "col") {
      if (slot) setColumn(value, slot.dataset["slot"]!);
      else if (zone) setColumn(value, zone.dataset["zone"]!);
      else return false;
    } else if (master) setValue(value, master.dataset["vm"]!);
    else if (valuePool) setValue(value, null);
    else return false;
    m.sel = null;
    refresh();
    return true;
  }
  function download(name: string, text: string, type: string): void {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ---- Google Sheet (read only) ----
  const clientId = (): string => ms.googleClient || (import.meta.env?.["VITE_GOOGLE_CLIENT_ID"] as string | undefined) || "";
  async function ensureToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
    if (!clientId()) throw new Error("Add your Google client ID first (see docs/GOOGLE-SETUP.md).");
    token = await requestAccessToken(clientId());
    ms.googleSignedIn = true;
    return token.value;
  }
  async function loadSheet(): Promise<void> {
    const ref = parseSheetLink(ms.sheetLink);
    if (!ref) { say("Paste the link of the Google Sheet first.", true); return redraw(); }
    write(SHEET_KEY, JSON.stringify({ link: ms.sheetLink, tab: ms.sheetTab }));
    try {
      say("Reading the sheet...");
      redraw();
      const accessToken = await ensureToken();
      const { table, tabTitle } = await fetchSheetTable({ fetch: (url, init) => fetch(url, init), token: accessToken, spreadsheetId: ref.spreadsheetId, ...(ms.sheetTab.trim() !== "" ? { tabName: ms.sheetTab } : ref.gid !== undefined ? { gid: ref.gid } : {}) });
      useTable(table, tabTitle, `the Google Sheet tab "${tabTitle}"`);
    } catch (err) {
      if (err instanceof SheetsError && err.status === 401) { token = null; ms.googleSignedIn = false; }
      say(err instanceof Error ? err.message : "Could not read the sheet.", true);
      redraw();
    }
  }

  // The text boxes are read when needed, so typing never redraws the page.
  const val = (id: string): string => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
  const files = async (el: HTMLInputElement, use: (text: string, name: string) => void): Promise<void> => {
    const file = el.files?.[0];
    if (!file) return;
    try { use(await file.text(), file.name); } catch (err) { say(`Could not read that file: ${String(err)}`, true); redraw(); }
  };

  // ---- events: the shell sends the ones inside the mapping page here ----
  const inside = (target: unknown): Element | null => (target as Element | null)?.closest?.(".mp") ?? null;

  function onClick(e: Event): boolean {
    const target = e.target as Element;
    if (!inside(target)) return false;
    const x = target.closest<HTMLElement>("[data-x]");
    if (x) { if (x.dataset["xa"] === "col") setColumn(x.dataset["x"]!, "pool"); else setValue(x.dataset["x"]!, null); m.sel = null; refresh(); return true; }
    const filter = target.closest<HTMLElement>("[data-ifilter]");
    if (filter) { m.issueFilter = filter.dataset["ifilter"]!; refresh(); return true; }
    const act = target.closest<HTMLElement>("[data-act]")?.dataset["act"];
    if (act === "addmaster") {
      const text = val("newmaster").trim();
      if (text === "") { say("Type a master value first.", true); redraw(); return true; }
      const list = (m.setup.masterValues[m.valueField] ??= []);
      if (!list.some((v) => v.toLowerCase() === text.toLowerCase())) list.push(text);
      refresh();
      return true;
    }
    const mp = target.closest<HTMLElement>("[data-mp]");
    if (mp) {
      const what = mp.dataset["mp"];
      if (what === "step") { ms.step = Number(mp.dataset["n"]) as MappingStep; m.sel = null; say(""); redraw(); }
      else if (what === "demo") startDemo(mp.dataset["kind"] as "salesforce" | "generic");
      else if (what === "template") download("upload-template.csv", templateCsv({ preset: getPreset(m.setup.presetId), layout: m.setup.layout, labels: m.setup.labels, required: m.setup.requiredFields }), "text/csv");
      else if (what === "save") download(`${m.setup.sourceName.trim().replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() || "setup"}.setup.json`, saveSetup(m.setup), "application/json");
      else if (what === "forget") {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        Object.assign(m, { headers: [], rows: [], setup: newSetup(STUB_NAME, []), result: null, unmapped: [], sel: null });
        Object.assign(ms, { step: 1, demo: false, fileName: "" });
        say("Saved setup forgotten.");
        redraw();
      } else if (what === "gload") { ms.sheetLink = val("mp-sheetlink"); ms.sheetTab = val("mp-sheettab"); void loadSheet(); }
      else if (what === "gsign") {
        if (token) { revokeToken(token); token = null; ms.googleSignedIn = false; say("Signed out of Google."); redraw(); }
        else { ms.googleClient = val("mp-gclient") || ms.googleClient; void ensureToken().then(() => { say("Signed in to Google (read only)."); redraw(); }, (err: unknown) => { say(err instanceof Error ? err.message : "Sign-in failed.", true); redraw(); }); }
      }
      return true;
    }
    const chip = target.closest<HTMLElement>(".chip");
    if (chip) {
      const area = chip.dataset["a"] as "col" | "raw";
      const value = chip.dataset["c"]!;
      m.sel = m.sel?.area === area && m.sel.value === value ? null : { area, value };
      refresh();
      return true;
    }
    if (m.sel) { dropOn(target, m.sel.area, m.sel.value); return true; } // tap a chip, then tap where it goes
    return false;
  }

  function onChange(e: Event): boolean {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (!inside(t)) return false;
    if (t.id === "srcname") { m.setup.sourceName = t.value; refresh(); return true; }
    if (t.id === "valuefield") { m.valueField = t.value; refresh(); return true; }
    if (t.id === "mp-file") { void files(t as HTMLInputElement, (text, name) => useTable(parseCsv(text), name.replace(/\.csv$/i, ""), "the file")); return true; }
    if (t.id === "mp-meta") {
      void files(t as HTMLInputElement, (text) => {
        const { lookups, problems } = readLookups(text, getPreset(m.setup.presetId));
        if (Object.keys(lookups.funds).length + Object.keys(lookups.outcomes).length === 0) { say(`That lookup list can't be used: ${problems.join("; ")}`, true); return redraw(); }
        m.setup.lookups = lookups;
        say(problems.length > 0 ? `Lookup lists loaded with problems: ${problems.join("; ")}` : "Lookup lists loaded and saved in this browser.", problems.length > 0);
        refresh();
      });
      return true;
    }
    if (t.id === "mp-setupfile") {
      void files(t as HTMLInputElement, (text) => {
        const { setup, problems } = loadSetup(text);
        if (!setup) { say(`That setup can't be used: ${problems.join("; ")}`, true); return redraw(); }
        m.setup = setup;
        ensureHeaders();
        say(`Setup "${setup.sourceName}" loaded.`);
        refresh();
      });
      return true;
    }
    if (t.id === "mp-preset") {
      // Choosing another source type starts the matching again from that source's suggestions. Lookup lists are kept.
      const fresh = newSetup(m.setup.sourceName, m.headers, t.value || null);
      fresh.lookups = m.setup.lookups;
      m.setup = fresh;
      refresh();
      return true;
    }
    if (t.id === "mp-layout") { m.setup.layout = t.value as Setup["layout"]; refresh(); return true; }
    if (t.id === "mp-feedback") { m.setup.feedbackItemsOnly = (t as HTMLInputElement).checked; refresh(); return true; }
    if (t.id === "mp-gclient") { ms.googleClient = t.value.trim(); write(CLIENT_KEY, ms.googleClient); return true; }
    if (t.id === "mp-sheetlink") { ms.sheetLink = t.value; return true; }
    if (t.id === "mp-sheettab") { ms.sheetTab = t.value; return true; }
    return false;
  }

  function onDragStart(e: DragEvent): void {
    const c = (e.target as Element | null)?.closest?.<HTMLElement>(".chip");
    if (c && inside(c)) e.dataTransfer?.setData("text/plain", `${c.dataset["a"]}|${c.dataset["c"]}`);
  }
  function onDragOver(e: DragEvent): boolean {
    const z = (e.target as Element | null)?.closest?.(".mp .slot,.mp .zone");
    if (z) { e.preventDefault(); z.classList.add("over"); return true; }
    return false;
  }
  function onDragLeave(e: DragEvent): void { (e.target as Element | null)?.closest?.(".slot,.zone")?.classList.remove("over"); }
  function onDrop(e: DragEvent): boolean {
    if (!inside(e.target)) return false;
    e.preventDefault();
    document.querySelectorAll(".mp .over").forEach((x) => x.classList.remove("over"));
    const text = e.dataTransfer?.getData("text/plain") ?? "";
    const at = text.indexOf("|");
    if (at > 0) dropOn(e.target as Element, text.slice(0, at), text.slice(at + 1));
    return true;
  }

  // Opening the page with ?demo=salesforce or ?demo=generic starts a demo.
  return { html: () => mappingPageHtml(ms), onClick, onChange, onDragStart, onDragOver, onDragLeave, onDrop, startDemo, state: ms };
}
